export {};

interface ObsidianCommands {
	commands: Record<string, unknown>;
	executeCommandById(id: string): boolean;
}

interface ObsidianPlugins {
	plugins: Record<string, { settings: Record<string, unknown> }>;
	enabledPlugins: Set<string>;
	manifests: Record<string, unknown>;
	enablePlugin(id: string): Promise<void>;
	disablePlugin(id: string): Promise<void>;
}

interface ObsidianVaultFile {
	path: string;
	name: string;
}

interface ObsidianApp {
	commands: ObsidianCommands;
	plugins: ObsidianPlugins;
	vault: {
		getName(): string;
		getAbstractFileByPath(path: string): ObsidianVaultFile | null;
		rename(file: ObsidianVaultFile, path: string): Promise<void>;
		read(file: ObsidianVaultFile): Promise<string>;
		modify(file: ObsidianVaultFile, data: string): Promise<void>;
	};
	workspace: {
		getLeaf(newLeaf?: boolean): { openFile(file: ObsidianVaultFile): Promise<void> };
	};
	setting?: { close(): void };
}

declare global {
	interface Window {
		app: ObsidianApp;
	}
}
