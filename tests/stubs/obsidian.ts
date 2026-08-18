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
export class Plugin {}
export class Modal {}
export class PluginSettingTab {}
export class Setting {}
export function getLanguage(): string {
	return "en";
}
export const Platform = { isMobile: false };
export function setIcon(_el: unknown, _id: string): void {}
