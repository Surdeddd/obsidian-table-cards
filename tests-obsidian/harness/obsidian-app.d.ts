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

interface ObsidianApp {
	commands: ObsidianCommands;
	plugins: ObsidianPlugins;
	vault: { getName(): string };
	setting?: { close(): void };
}

declare global {
	interface Window {
		app: ObsidianApp;
	}
}
