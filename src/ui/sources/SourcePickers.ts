import { FuzzySuggestModal, TFile, TFolder, type App } from "obsidian";

export class MarkdownFilePicker extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		placeholder: string,
		private readonly choose: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.choose(file);
	}
}

export class FolderPicker extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		placeholder: string,
		private readonly choose: (folder: TFolder) => void,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): TFolder[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter((entry): entry is TFolder => entry instanceof TFolder && entry.path.length > 0);
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.choose(folder);
	}
}
