import { describe, expect, it } from "vitest";
import { cloneJson, type DeckProgress, type PluginSettings } from "../src/model";
import {
	DeckUnavailableError,
	requireEnabledDeck,
	saveDeckProgressIfEnabled,
} from "../src/session/settings-intents";
import { ProgressSaveQueue } from "../src/session/progress-save-queue";
import { createDeck, mergeSettings } from "../src/settings/defaults";
import { SettingsPersistence } from "../src/settings/persistence";

interface Deferred {
	promise: Promise<void>;
	resolve: () => void;
}

function deferred(): Deferred {
	let resolve!: () => void;
	const promise = new Promise<void>((yes) => { resolve = yes; });
	return { promise, resolve };
}

async function nextTurn(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function progress(index: number): DeckProgress {
	return { index, shuffle: false, seed: 7, scope: { mode: "all" }, cardKey: null };
}

function settingsWithTwoDecks(): PluginSettings {
	return {
		...mergeSettings({ schemaVersion: 3, setupVersion: 1 }),
		lastDeckId: "words",
		decks: [createDeck({ id: "words" }), createDeck({ id: "fallback" })],
		perDeck: { words: progress(1), fallback: progress(2) },
	};
}

function deleteDeck(settings: PluginSettings, deckId: string): void {
	settings.decks = settings.decks.filter((deck) => deck.id !== deckId);
	delete settings.perDeck[deckId];
	if (settings.lastDeckId === deckId) settings.lastDeckId = settings.decks[0]?.id ?? null;
}

function expectValidDeckReferences(settings: PluginSettings): void {
	const deckIds = new Set(settings.decks.map((deck) => deck.id));
	expect(settings.lastDeckId === null || deckIds.has(settings.lastDeckId)).toBe(true);
	expect(Object.keys(settings.perDeck).every((deckId) => deckIds.has(deckId))).toBe(true);
}

describe("study settings intents", () => {
	it("rejects a confirmed start queued after deck deletion without restoring orphan state", async () => {
		const initial = settingsWithTwoDecks();
		let memory = initial;
		let disk = initial;
		const gates: Deferred[] = [];
		const attempts: PluginSettings[] = [];
		const persistence = new SettingsPersistence(initial, {
			persist: (candidate) => {
				attempts.push(cloneJson(candidate));
				const gate = deferred();
				gates.push(gate);
				return gate.promise.then(() => { disk = cloneJson(candidate); });
			},
			publish: (candidate) => { memory = candidate; },
		});

		const deletion = persistence.update((settings) => { deleteDeck(settings, "words"); });
		const start = persistence.update((settings) => {
			const deck = requireEnabledDeck(settings, "words");
			settings.lastDeckId = deck.id;
			settings.perDeck[deck.id] = progress(3);
		});

		await nextTurn();
		gates[0]!.resolve();
		await deletion;
		await expect(start).rejects.toBeInstanceOf(DeckUnavailableError);
		expect(attempts).toHaveLength(1);
		expect(memory).toEqual(disk);
		expect(memory.decks.map((deck) => deck.id)).toEqual(["fallback"]);
		expect(memory.lastDeckId).toBe("fallback");
		expect(memory.perDeck.words).toBeUndefined();
		expectValidDeckReferences(memory);
	});

	it("treats a disabled latest deck as unavailable", () => {
		const settings = settingsWithTwoDecks();
		settings.decks[0]!.enabled = false;
		expect(() => requireEnabledDeck(settings, "words")).toThrow(DeckUnavailableError);
	});

	it("drops a queued progress snapshot after deck deletion instead of creating an orphan", async () => {
		const initial = settingsWithTwoDecks();
		let memory = initial;
		let disk = initial;
		const gates: Deferred[] = [];
		const attempts: PluginSettings[] = [];
		const persistence = new SettingsPersistence(initial, {
			persist: (candidate) => {
				attempts.push(cloneJson(candidate));
				const gate = deferred();
				gates.push(gate);
				return gate.promise.then(() => { disk = cloneJson(candidate); });
			},
			publish: (candidate) => { memory = candidate; },
		});
		const queue = new ProgressSaveQueue<DeckProgress>({
			clone: cloneJson,
			save: (snapshot) => persistence.update((settings) => {
				saveDeckProgressIfEnabled(settings, "words", snapshot);
			}),
			onErrorChange: () => undefined,
		});

		const deletion = persistence.update((settings) => { deleteDeck(settings, "words"); });
		queue.enqueue(progress(99));
		await nextTurn();
		gates[0]!.resolve();
		await deletion;
		await nextTurn();
		expect(attempts).toHaveLength(2);
		expect(attempts[1]!.perDeck.words).toBeUndefined();
		gates[1]!.resolve();
		await queue.whenIdle();

		expect(memory).toEqual(disk);
		expect(memory.perDeck.words).toBeUndefined();
		expectValidDeckReferences(memory);
	});

	it("does not save progress for a disabled deck", () => {
		const settings = settingsWithTwoDecks();
		settings.decks[0]!.enabled = false;
		delete settings.perDeck.words;
		expect(saveDeckProgressIfEnabled(settings, "words", progress(9))).toBe(false);
		expect(settings.perDeck.words).toBeUndefined();
	});
});
