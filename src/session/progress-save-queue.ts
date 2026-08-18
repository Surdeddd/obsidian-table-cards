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
		this.tail = this.tail.then(() => this.save(snapshot));
	}

	close(): void {
		this.closed = true;
	}

	whenIdle(): Promise<void> {
		return this.tail;
	}

	private async save(snapshot: T): Promise<void> {
		try {
			await this.options.save(snapshot);
			this.setFailed(false);
		} catch {
			this.setFailed(true);
		}
	}

	private setFailed(failed: boolean): void {
		if (this.closed || this.failed === failed) return;
		this.failed = failed;
		this.options.onErrorChange(failed);
	}
}
