import { describe, expect, it } from "vitest";
import { mergeEditorDeck } from "../src/editor/settings-save";
import { cloneJson, createBlock, type Deck, type PluginSettings } from "../src/model";
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

describe("editor settings save", () => {
	it("merges captured editor fields into the latest deck without reverting concurrent settings changes", async () => {
		type ExtendedDeck = Deck & { settingsOwnedFlag: string };
		const originalDeck = Object.assign(createDeck({
			id: "words",
			name: "Original",
			enabled: true,
			shuffleDefault: false,
			ribbon: { visible: false, icon: "layers-3" },
		}), { settingsOwnedFlag: "keep-latest" }) satisfies ExtendedDeck;
		const initial: PluginSettings = {
			...mergeSettings({ schemaVersion: 3, setupVersion: 1 }),
			decks: [originalDeck],
		};
		const capturedDraft = cloneJson(originalDeck);
		capturedDraft.id = "stale-id";
		capturedDraft.name = "Edited";
		capturedDraft.enabled = true;
		capturedDraft.shuffleDefault = false;
		capturedDraft.ribbon = { visible: false, icon: "layers-3" };
		capturedDraft.sources = [{
			id: "source-edited",
			kind: "file",
			path: "Edited.md",
			tables: { mode: "all" },
		}];
		capturedDraft.blocks = [createBlock({ id: "block-edited", columns: ["Term"] })];
		capturedDraft.columnTypes = { Term: "text" };
		capturedDraft.appearance = { radius: 22 };

		let memory = initial;
		let disk = initial;
		const attempts: PluginSettings[] = [];
		const gates: Deferred[] = [];
		const persistence = new SettingsPersistence(initial, {
			persist: (candidate) => {
				attempts.push(cloneJson(candidate));
				const gate = deferred();
				gates.push(gate);
				return gate.promise.then(() => { disk = cloneJson(candidate); });
			},
			publish: (candidate) => { memory = candidate; },
		});

		const settingsChange = persistence.update((settings) => {
			const current = settings.decks[0]! as ExtendedDeck;
			current.enabled = false;
			current.shuffleDefault = true;
			current.ribbon = { visible: true, icon: "languages" };
			current.settingsOwnedFlag = "newest";
		});
		const editorSave = persistence.update((settings) => {
			const index = settings.decks.findIndex((deck) => deck.id === "words");
			settings.decks[index] = mergeEditorDeck(settings.decks[index]!, capturedDraft);
		});

		await nextTurn();
		expect(attempts).toHaveLength(1);
		gates[0]!.resolve();
		await settingsChange;
		await nextTurn();
		expect(attempts).toHaveLength(2);
		gates[1]!.resolve();
		await editorSave;

		const saved = memory.decks[0]! as ExtendedDeck;
		expect(saved).toMatchObject({
			id: "words",
			name: "Edited",
			enabled: false,
			shuffleDefault: true,
			ribbon: { visible: true, icon: "languages" },
			settingsOwnedFlag: "newest",
			columnTypes: { Term: "text" },
			appearance: { radius: 22 },
		});
		expect(saved.sources).toEqual(capturedDraft.sources);
		expect(saved.blocks).toEqual(capturedDraft.blocks);
		expect(disk).toEqual(memory);
	});
});
