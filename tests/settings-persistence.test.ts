import { describe, expect, it, vi } from "vitest";
import { cloneJson, type PluginSettings } from "../src/model";
import { createDeck, mergeSettings } from "../src/settings/defaults";
import { SettingsPersistence } from "../src/settings/persistence";

interface Deferred {
	promise: Promise<void>;
	resolve: () => void;
	reject: (error: Error) => void;
}

function deferred(): Deferred {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

async function nextTurn(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("settings persistence", () => {
	it("serializes scoped mutations against the latest committed settings", async () => {
		const initial = mergeSettings({
			schemaVersion: 3,
			setupVersion: 1,
			decks: [createDeck({ id: "words", name: "Words", ribbon: { visible: true, icon: "layers-3" } })],
		});
		let memory = initial;
		let disk = initial;
		const attempts: PluginSettings[] = [];
		const gates: Deferred[] = [];
		const ribbonSync = vi.fn();
		const persistence = new SettingsPersistence(initial, {
			persist: (candidate) => {
				attempts.push(cloneJson(candidate));
				const gate = deferred();
				gates.push(gate);
				return gate.promise.then(() => { disk = cloneJson(candidate); });
			},
			publish: (candidate) => {
				memory = candidate;
				ribbonSync(candidate.decks);
			},
		});

		const locale = persistence.update((settings) => { settings.locale = "ru"; });
		const ribbon = persistence.update((settings) => {
			settings.decks[0]!.ribbon.icon = "languages";
		});

		await nextTurn();
		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({ locale: "ru" });
		expect(attempts[0]!.decks[0]!.ribbon.icon).toBe("layers-3");
		expect(memory).toBe(initial);
		expect(disk).toBe(initial);
		expect(ribbonSync).not.toHaveBeenCalled();

		gates[0]!.resolve();
		await locale;
		await nextTurn();
		expect(attempts).toHaveLength(2);
		expect(attempts[1]).toMatchObject({ locale: "ru" });
		expect(attempts[1]!.decks[0]!.ribbon.icon).toBe("languages");
		expect(memory.locale).toBe("ru");
		expect(memory.decks[0]!.ribbon.icon).toBe("layers-3");
		expect(ribbonSync).toHaveBeenCalledTimes(1);

		gates[1]!.resolve();
		await ribbon;
		expect(disk.locale).toBe("ru");
		expect(disk.decks[0]!.ribbon.icon).toBe("languages");
		expect(memory).toEqual(disk);
		expect(ribbonSync).toHaveBeenCalledTimes(2);
	});

	it("continues after rejection without publishing or leaking the failed draft", async () => {
		const initial = mergeSettings({ schemaVersion: 3, setupVersion: 1, locale: "en" });
		let memory = initial;
		let disk = initial;
		const attempts: PluginSettings[] = [];
		const gates: Deferred[] = [];
		const publish = vi.fn((candidate: PluginSettings) => { memory = candidate; });
		const persistence = new SettingsPersistence(initial, {
			persist: (candidate) => {
				attempts.push(cloneJson(candidate));
				const gate = deferred();
				gates.push(gate);
				return gate.promise.then(() => { disk = cloneJson(candidate); });
			},
			publish,
		});

		const failed = persistence.update((settings) => {
			settings.locale = "ar";
			settings.appearance.overlay = "full";
		});
		const recovered = persistence.update((settings) => {
			settings.appearance.size = "large";
		});

		await nextTurn();
		gates[0]!.reject(new Error("disk full"));
		await expect(failed).rejects.toThrow("disk full");
		await nextTurn();
		expect(attempts).toHaveLength(2);
		expect(attempts[1]).toMatchObject({
			locale: "en",
			appearance: { overlay: initial.appearance.overlay, size: "large" },
		});
		expect(memory).toBe(initial);
		expect(publish).not.toHaveBeenCalled();

		gates[1]!.resolve();
		await recovered;
		expect(memory.locale).toBe("en");
		expect(memory.appearance.overlay).toBe(initial.appearance.overlay);
		expect(memory.appearance.size).toBe("large");
		expect(memory).toEqual(disk);
		expect(publish).toHaveBeenCalledOnce();
	});

	it("persists a detached snapshot even when a mutator retains its working draft", async () => {
		const initial = mergeSettings({ schemaVersion: 3, setupVersion: 1 });
		let retained: PluginSettings | null = null;
		let saved: PluginSettings | null = null;
		const persistence = new SettingsPersistence(initial, {
			persist: async (candidate) => {
				saved = candidate;
				retained!.locale = "ar";
			},
			publish: () => undefined,
		});

		await persistence.update((settings) => {
			settings.locale = "ru";
			retained = settings;
		});

		expect(saved?.locale).toBe("ru");
	});

	it("keeps its committed baseline isolated from the published live object", async () => {
		const initial = mergeSettings({ schemaVersion: 3, setupVersion: 1, locale: "en" });
		let memory = initial;
		const attempts: PluginSettings[] = [];
		const persistence = new SettingsPersistence(initial, {
			persist: async (candidate) => { attempts.push(cloneJson(candidate)); },
			publish: (candidate) => { memory = candidate; },
		});

		await persistence.update((settings) => { settings.locale = "ru"; });
		memory.locale = "ar";
		await persistence.update((settings) => { settings.appearance.size = "large"; });

		expect(attempts[1]).toMatchObject({ locale: "ru", appearance: { size: "large" } });
	});
});
