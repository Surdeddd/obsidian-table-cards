import type { PluginSettings } from "../model";
import type { SettingsMutation } from "../settings/persistence";

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
	updateSettings: (mutate: SettingsMutation) => Promise<void>;
}

export async function commitSetupSettings(
	host: SetupSettingsHost,
	mutate: SettingsMutation,
	lifecycle: SetupSaveLifecycle,
): Promise<void> {
	await lifecycle.run(() => host.updateSettings(mutate));
}
