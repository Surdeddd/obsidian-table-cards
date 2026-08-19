import { Notice } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../src/i18n";
import { runSettingsUpdate } from "../src/settings/update-feedback";

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

const notices = Notice as typeof Notice & { messages: string[] };

describe("settings update feedback", () => {
	beforeEach(() => { notices.messages.length = 0; });

	it("contains persistence rejection, shows the active localized Notice, and refreshes reverted controls", async () => {
		const gate = deferred();
		const refresh = vi.fn();
		const onSuccess = vi.fn();
		const update = runSettingsUpdate({
			update: () => gate.promise,
			refresh,
			onSuccess,
			t: createTranslator("ru"),
		});

		gate.reject(new Error("disk full"));
		await expect(update).resolves.toBeUndefined();

		expect(notices.messages).toEqual(["Не удалось сохранить настройки Table Cards."]);
		expect(refresh).toHaveBeenCalledOnce();
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it("refreshes and runs the success effect without showing a Notice after persistence succeeds", async () => {
		const refresh = vi.fn();
		const onSuccess = vi.fn();

		await runSettingsUpdate({
			update: async () => undefined,
			refresh,
			onSuccess,
			t: createTranslator("en"),
		});

		expect(notices.messages).toEqual([]);
		expect(refresh).toHaveBeenCalledOnce();
		expect(onSuccess).toHaveBeenCalledOnce();
	});
});
