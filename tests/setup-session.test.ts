import { describe, expect, it, vi } from "vitest";
import { SetupSavedCallbacks } from "../src/setup/session";

describe("setup saved callbacks", () => {
	it("refreshes every launcher after save and clears callbacks for the next session", () => {
		const callbacks = new SetupSavedCallbacks();
		const first = vi.fn();
		const second = vi.fn();
		callbacks.add(first);
		callbacks.add(second);

		callbacks.notifySaved();
		callbacks.notifySaved();

		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
	});

	it("drops pending refreshes when setup closes without saving", () => {
		const callbacks = new SetupSavedCallbacks();
		const refresh = vi.fn();
		callbacks.add(refresh);
		callbacks.clear();
		callbacks.notifySaved();
		expect(refresh).not.toHaveBeenCalled();
	});
});
