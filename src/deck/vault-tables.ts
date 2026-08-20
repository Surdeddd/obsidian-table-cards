import type { App, TFile } from "obsidian";

export function tableNotesFirst<T>(files: readonly T[], hasTable: (file: T) => boolean): T[] {
	const withTables = files.filter((file) => hasTable(file));
	if (withTables.length === 0 || withTables.length === files.length) return files.slice();
	return [...withTables, ...files.filter((file) => !hasTable(file))];
}

export function noteHasTable(app: App, file: TFile): boolean {
	const sections = app.metadataCache.getFileCache(file)?.sections;
	return Array.isArray(sections) && sections.some((section) => section.type === "table");
}
