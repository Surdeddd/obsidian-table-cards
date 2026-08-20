import type { App } from "obsidian";
import type { DeckScanResult } from "../../deck/catalog";
import type { EditorAction, EditorState } from "../../editor/state";
import type { Translator } from "../../i18n";
import type {
	ColumnProfile,
	DeckDiagnostic,
	ParsedTable,
	UiLocale,
} from "../../model";
import { renderProfilesSection } from "./ProfilesSection";
import { SourcesSection } from "./SourcesSection";

export interface FieldsSheetContext {
	app: App;
	state: EditorState;
	scan: DeckScanResult | null;
	profiles: ColumnProfile[];
	rowCount: number;
	diagnostics: DeckDiagnostic[];
	loading: boolean;
	locale: UiLocale;
	t: Translator;
	dispatch: (action: EditorAction) => void;
	onOpenTable: (table: ParsedTable) => void;
}

export class FieldsSheet {
	private parent: HTMLElement | null = null;
	private context: FieldsSheetContext | null = null;
	private readonly sources = new SourcesSection(() => this.renderCurrent());
	private readonly openColumns = new Set<string>();

	render(parent: HTMLElement, context: FieldsSheetContext): void {
		this.parent = parent;
		this.context = context;
		this.renderCurrent();
	}

	destroy(): void {
		this.sources.destroy();
		this.parent = null;
		this.context = null;
	}

	private renderCurrent(): void {
		const parent = this.parent;
		const context = this.context;
		if (!parent || !context) return;
		parent.empty();
		this.sources.render(parent, {
			...context,
			profileCount: context.profiles.length,
			profileWarnings: context.profiles.reduce(
				(total, profile) => total + profile.warnings.length,
				0,
			),
		});
		if (this.sources.showingTables) return;
		renderProfilesSection(parent, { ...context, openColumns: this.openColumns });
	}
}
