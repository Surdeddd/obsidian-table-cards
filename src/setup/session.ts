export class SetupSavedCallbacks {
	private readonly callbacks = new Set<() => void>();

	add(callback?: () => void): void {
		if (callback) this.callbacks.add(callback);
	}

	notifySaved(): void {
		for (const callback of this.callbacks) callback();
		this.clear();
	}

	clear(): void {
		this.callbacks.clear();
	}
}
