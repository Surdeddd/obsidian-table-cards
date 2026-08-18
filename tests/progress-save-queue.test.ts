import { describe, expect, it } from "vitest";
import { ProgressSaveQueue } from "../src/session/progress-save-queue";
import { mergeSettings } from "../src/settings/defaults";
import { SettingsPersistence } from "../src/settings/persistence";

interface Snapshot {
	index: number;
}

interface Gate {
	resolve: () => void;
	reject: () => void;
}

function deferred(): { promise: Promise<void>; gate: Gate } {
	let resolve = (): void => undefined;
	let reject = (): void => undefined;
	const promise = new Promise<void>((pass, fail) => {
		resolve = pass;
		reject = () => fail(new Error("save failed"));
	});
	return { promise, gate: { resolve, reject } };
}

async function nextTurn(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("progress save queue", () => {
	it("submits snapshots immediately to the shared serialized scheduler", () => {
		const scheduled: number[] = [];
		const queue = new ProgressSaveQueue<Snapshot>({
			clone: (value) => ({ ...value }),
			save: async (value) => { scheduled.push(value.index); },
			onErrorChange: () => undefined,
		});

		queue.enqueue({ index: 1 });
		queue.enqueue({ index: 2 });

		expect(scheduled).toEqual([1, 2]);
	});

	it("serializes immutable snapshots so the latest action is written last", async () => {
		const saves: number[] = [];
		const gates: Gate[] = [];
		let memory = mergeSettings({ schemaVersion: 3, setupVersion: 1 });
		const persistence = new SettingsPersistence(memory, {
			persist: (settings) => {
				saves.push(settings.appearance.maxWidth);
				const pending = deferred();
				gates.push(pending.gate);
				return pending.promise;
			},
			publish: (settings) => { memory = settings; },
		});
		const queue = new ProgressSaveQueue<Snapshot>({
			clone: (value) => ({ ...value }),
			save: (value) => persistence.update((settings) => {
				settings.appearance.maxWidth = value.index;
			}),
			onErrorChange: () => undefined,
		});
		const first = { index: 1 };
		queue.enqueue(first);
		first.index = 99;
		queue.enqueue({ index: 2 });

		await nextTurn();
		expect(saves).toEqual([1]);
		gates[0]!.resolve();
		await nextTurn();
		await nextTurn();
		expect(saves).toEqual([1, 2]);
		gates[1]!.resolve();
		await queue.whenIdle();
		expect(saves.at(-1)).toBe(2);
		expect(memory.appearance.maxWidth).toBe(2);
	});

	it("contains rejection, reports failure, and clears it after a later success", async () => {
		const states: boolean[] = [];
		const gates: Gate[] = [];
		const queue = new ProgressSaveQueue<Snapshot>({
			clone: (value) => ({ ...value }),
			save: () => {
				const pending = deferred();
				gates.push(pending.gate);
				return pending.promise;
			},
			onErrorChange: (failed) => states.push(failed),
		});
		queue.enqueue({ index: 1 });
		await nextTurn();
		gates[0]!.reject();
		await queue.whenIdle();
		expect(states).toEqual([true]);

		queue.enqueue({ index: 2 });
		await nextTurn();
		gates[1]!.resolve();
		await queue.whenIdle();
		expect(states).toEqual([true, false]);
	});

	it("suppresses callbacks and new work after close while containing queued rejection", async () => {
		const states: boolean[] = [];
		const gates: Gate[] = [];
		const queue = new ProgressSaveQueue<Snapshot>({
			clone: (value) => ({ ...value }),
			save: () => {
				const pending = deferred();
				gates.push(pending.gate);
				return pending.promise;
			},
			onErrorChange: (failed) => states.push(failed),
		});
		queue.enqueue({ index: 1 });
		await nextTurn();
		queue.close();
		queue.enqueue({ index: 2 });
		gates[0]!.reject();

		await queue.whenIdle();
		expect(gates).toHaveLength(1);
		expect(states).toEqual([]);
	});
});
