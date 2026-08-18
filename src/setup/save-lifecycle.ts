import type { PluginSettings } from "../model";

export class SetupSaveLifecycle {
	private active = false;

	get saving(): boolean {
		return this.active;
	}

	tryClose(close: () => void): boolean {
		if (this.active) return false;
		close();
		return true;
	}

	async run<T>(save: () => Promise<T>): Promise<T> {
		if (this.active) throw new Error("Setup save is already in progress");
		this.active = true;
		try {
			return await save();
		} finally {
			this.active = false;
		}
	}
}

export interface SetupSettingsHost {
	settings: PluginSettings;
	saveSettings: (settings?: PluginSettings) => Promise<void>;
}

export async function commitSetupSettings(
	host: SetupSettingsHost,
	next: PluginSettings,
	lifecycle: SetupSaveLifecycle,
): Promise<void> {
	await lifecycle.run(() => host.saveSettings(next));
	host.settings = next;
}
