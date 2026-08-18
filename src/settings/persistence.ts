import { cloneJson, type PluginSettings } from "../model";

export type SettingsMutation = (settings: PluginSettings) => void;

export interface SettingsPersistenceOptions {
	persist: (settings: PluginSettings) => Promise<void>;
	publish: (settings: PluginSettings) => void;
}

export class SettingsPersistence {
	private committed: PluginSettings;
	private tail: Promise<void> = Promise.resolve();

	constructor(initial: PluginSettings, private readonly options: SettingsPersistenceOptions) {
		this.committed = cloneJson(initial);
	}

	update(mutate: SettingsMutation): Promise<void> {
		const operation = this.tail.then(async () => {
			const working = cloneJson(this.committed);
			mutate(working);
			const candidate = cloneJson(working);
			await this.options.persist(candidate);
			this.committed = cloneJson(candidate);
			this.options.publish(cloneJson(candidate));
		});
		this.tail = operation.then(
			() => undefined,
			() => undefined,
		);
		return operation;
	}
}
