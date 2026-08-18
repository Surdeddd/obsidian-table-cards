export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;

	constructor(path = "", extension?: string) {
		this.path = path;
		this.name = path.split("/").pop() ?? path;
		const dot = this.name.lastIndexOf(".");
		this.extension = extension ?? (dot >= 0 ? this.name.slice(dot + 1) : "");
		this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
	}
}

export class TFolder {
	path: string;
	name: string;

	constructor(
		path = "",
		public children: Array<TFile | TFolder> = [],
	) {
		this.path = path;
		this.name = path.split("/").pop() ?? path;
	}
}
export class Workspace {
	onLayoutReady(callback: () => void): void {
		callback();
	}
}

export class Plugin {
	addCommand(_command: { id: string; name: string; callback: () => void }): void {}
}

export class Modal {
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class FuzzySuggestModal<T> extends Modal {
	app: unknown;

	constructor(app: unknown) {
		super();
		this.app = app;
	}

	setPlaceholder(_placeholder: string): this {
		return this;
	}

	getItems(): T[] {
		return [];
	}

	getItemText(_item: T): string {
		return "";
	}

	onChooseItem(_item: T): void {}
}
export class PluginSettingTab {}
export class Setting {}
export function getLanguage(): string {
	return "en";
}
export const Platform = { isMobile: false };
export function setIcon(_el: unknown, _id: string): void {}
