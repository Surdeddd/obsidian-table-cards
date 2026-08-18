import { describe, expect, it, vi } from "vitest";
import { commitSetupSettings, SetupSaveLifecycle } from "../src/setup/save-lifecycle";
import { mergeSettings } from "../src/settings/defaults";

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
		const host = { settings: original, saveSettings: vi.fn(() => gate.promise) };
		const saving = commitSetupSettings(host, next, lifecycle);

		expect(host.settings).toBe(original);
		expect(host.settings.setupVersion).toBe(0);
		expect(host.saveSettings).toHaveBeenCalledOnce();
		expect(host.saveSettings).toHaveBeenCalledWith(next);
		gate.resolve();
		await saving;
		expect(host.settings).toBe(next);
		expect(host.settings.setupVersion).toBe(1);
	});

	it("keeps the original settings and draft-close eligibility after persistence fails", async () => {
		const lifecycle = new SetupSaveLifecycle();
		const original = mergeSettings(null);
		const next = { ...original, setupVersion: 1 as const };
		const host = { settings: original, saveSettings: vi.fn(async () => { throw new Error("disk full"); }) };

		await expect(commitSetupSettings(host, next, lifecycle)).rejects.toThrow("disk full");
		expect(host.settings).toBe(original);
		expect(lifecycle.saving).toBe(false);
	});
});
