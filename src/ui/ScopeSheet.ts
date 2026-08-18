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

export type ScopeSheetPresentation = {
	variant: "full";
	pickerMobile: false;
	embeddedActions: true;
	actionClass: "tc-scope-sheet-actions";
} | {
	variant: "default";
	pickerMobile: false;
	embeddedActions: false;
	actionClass: null;
};

export function scopeSheetPresentation(mobile: boolean): ScopeSheetPresentation {
	return mobile ? {
		variant: "full",
		pickerMobile: false,
		embeddedActions: true,
		actionClass: "tc-scope-sheet-actions",
	} : {
		variant: "default",
		pickerMobile: false,
		embeddedActions: false,
		actionClass: null,
	};
}

export class ScopeSheet {
	private readonly options: ScopeSheetOptions;
	private sheet: Sheet | null = null;
	private picker: ScopePicker | null = null;
	private dismissed = false;

	constructor(parent: HTMLElement, options: ScopeSheetOptions) {
		this.options = options;
		const presentation = scopeSheetPresentation(Platform.isMobile);
		this.sheet = new Sheet(parent, {
			id: "tc-scope-sheet",
			title: options.t("scope.label"),
			mode: "side",
			variant: presentation.variant,
			opener: options.opener,
			closeLabel: options.t("modal.close"),
			onClose: () => this.dismiss(false),
			renderBody: (body) => {
				this.picker = new ScopePicker(body, {
					catalog: options.catalog,
					scope: options.scope,
					t: options.t,
					mobile: presentation.pickerMobile,
					embeddedActions: presentation.embeddedActions,
					onChange: options.onChange,
					onClose: () => this.dismiss(true),
				});
			},
			renderFooter: presentation.embeddedActions
				? (footer) => {
					footer.addClass(presentation.actionClass);
					this.picker?.renderEmbeddedActions(footer);
				}
				: undefined,
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
