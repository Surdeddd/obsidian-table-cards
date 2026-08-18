export interface ProgressSaveQueueOptions<T> {
	clone: (value: T) => T;
	save: (snapshot: T) => Promise<void>;
	onErrorChange: (failed: boolean) => void;
}

export class ProgressSaveQueue<T> {
	private readonly options: ProgressSaveQueueOptions<T>;
	private tail: Promise<void> = Promise.resolve();
	private failed = false;
	private closed = false;

	constructor(options: ProgressSaveQueueOptions<T>) {
		this.options = options;
	}

	enqueue(value: T): void {
		if (this.closed) return;
		const snapshot = this.options.clone(value);
		const scheduled = this.options.save(snapshot).then(
			() => true,
			() => false,
		);
		this.tail = this.tail.then(async () => {
			this.setFailed(!(await scheduled));
		});
	}

	close(): void {
		this.closed = true;
	}

	whenIdle(): Promise<void> {
		return this.tail;
	}

	private setFailed(failed: boolean): void {
		if (this.closed || this.failed === failed) return;
		this.failed = failed;
		this.options.onErrorChange(failed);
	}
}
