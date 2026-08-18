import { describe, expect, it, vi } from "vitest";
import { commitSetupSettings, SetupSaveLifecycle } from "../src/setup/save-lifecycle";
import { cloneJson, type PluginSettings } from "../src/model";
import { mergeSettings } from "../src/settings/defaults";
import { SettingsPersistence, type SettingsMutation } from "../src/settings/persistence";

function deferred(): {
	promise: Promise<void>;
	resolve: () => void;
	reject: (error: Error) => void;
} {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

describe("setup save lifecycle", () => {
	it("blocks every close/discard attempt until a successful save settles", async () => {
		const lifecycle = new SetupSaveLifecycle();
		const gate = deferred();
		const discard = vi.fn();
		const saving = lifecycle.run(() => gate.promise);

		expect(lifecycle.saving).toBe(true);
		expect(lifecycle.tryClose(discard)).toBe(false);
		expect(discard).not.toHaveBeenCalled();
		gate.resolve();
		await saving;
		expect(lifecycle.saving).toBe(false);
		expect(lifecycle.tryClose(discard)).toBe(true);
		expect(discard).toHaveBeenCalledOnce();
	});

	it("restores close eligibility after a rejected save without swallowing the error", async () => {
		const lifecycle = new SetupSaveLifecycle();
		const gate = deferred();
		const saving = lifecycle.run(() => gate.promise);
		gate.reject(new Error("disk full"));
		await expect(saving).rejects.toThrow("disk full");
		expect(lifecycle.saving).toBe(false);
		const close = vi.fn();
		expect(lifecycle.tryClose(close)).toBe(true);
		expect(close).toHaveBeenCalledOnce();
	});

	it("publishes setupVersion and the new deck only after persistence succeeds", async () => {
		const lifecycle = new SetupSaveLifecycle();
		const gate = deferred();
		const original = mergeSettings(null);
		const next = mergeSettings({ schemaVersion: 3, setupVersion: 1, decks: [{ id: "new", name: "New" }] });
		const persist = vi.fn(() => gate.promise);
		const host: { settings: PluginSettings; updateSettings: (mutate: SettingsMutation) => Promise<void> } = {
			settings: original,
			updateSettings: async () => undefined,
		};
		const persistence = new SettingsPersistence(original, {
			persist,
			publish: (candidate) => { host.settings = candidate; },
		});
		host.updateSettings = vi.fn((mutate) => persistence.update(mutate));
		const saving = commitSetupSettings(host, (settings) => {
			settings.setupVersion = next.setupVersion;
			settings.decks = cloneJson(next.decks);
		}, lifecycle);

		expect(host.settings).toBe(original);
		expect(host.settings.setupVersion).toBe(0);
		expect(host.updateSettings).toHaveBeenCalledOnce();
		gate.resolve();
		await saving;
		expect(host.settings).toEqual(next);
		expect(host.settings.setupVersion).toBe(1);
	});

	it("keeps the original settings and draft-close eligibility after persistence fails", async () => {
		const lifecycle = new SetupSaveLifecycle();
		const original = mergeSettings(null);
		const host = {
			settings: original,
			updateSettings: vi.fn(async (_mutate: SettingsMutation) => { throw new Error("disk full"); }),
		};

		await expect(commitSetupSettings(host, (settings) => { settings.setupVersion = 1; }, lifecycle))
			.rejects.toThrow("disk full");
		expect(host.settings).toBe(original);
		expect(lifecycle.saving).toBe(false);
	});
});
