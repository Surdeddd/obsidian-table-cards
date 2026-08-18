import { Platform } from "obsidian";
import type { Translator } from "../i18n";
import type { StudyScope, TableCatalogItem } from "../model";
import { Sheet } from "./editor/controls/Sheet";
import { ScopePicker } from "./ScopePicker";

export interface ScopeSheetOptions {
	catalog: TableCatalogItem[];
	scope: StudyScope;
	t: Translator;
	opener: HTMLElement | null;
	onChange: (scope: StudyScope) => void;
	onClose: () => void;
}

export class ScopeSheet {
	private readonly options: ScopeSheetOptions;
	private sheet: Sheet | null = null;
	private picker: ScopePicker | null = null;
	private dismissed = false;

	constructor(parent: HTMLElement, options: ScopeSheetOptions) {
		this.options = options;
		this.sheet = new Sheet(parent, {
			id: "tc-scope-sheet",
			title: options.t("scope.label"),
			mode: "side",
			variant: Platform.isMobile ? "full" : "default",
			opener: options.opener,
			closeLabel: options.t("modal.close"),
			onClose: () => this.dismiss(false),
			renderBody: (body) => {
				this.picker = new ScopePicker(body, {
					catalog: options.catalog,
					scope: options.scope,
					t: options.t,
					mobile: false,
					onChange: options.onChange,
					onClose: () => this.dismiss(true),
				});
			},
		});
		this.sheet.open();
	}

	destroy(restoreFocus = false): void {
		if (this.dismissed) return;
		this.dismissed = true;
		this.picker?.destroy();
		this.picker = null;
		this.sheet?.destroy(restoreFocus);
		this.sheet = null;
	}

	private dismiss(restoreFocus: boolean): void {
		if (this.dismissed) return;
		this.destroy(restoreFocus);
		this.options.onClose();
	}
}
