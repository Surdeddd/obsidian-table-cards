import { setIcon, type App } from "obsidian";
import { formatUiNumber, type Translator } from "../../i18n";
import {
	newId,
	type DeckDiagnostic,
	type DeckSource,
	type ParsedTable,
	type UiLocale,
} from "../../model";
import type { DeckScanResult } from "../../deck/catalog";
import {
	normalizeVaultPath,
	selectorMatchesTable,
} from "../../deck/selectors";
import type { EditorAction, EditorState } from "../../editor/state";
import {
	canonicalTablesForSource,
	sourceTableSummary,
} from "../../editor/source-tables";
import { FolderPicker, MarkdownFilePicker } from "../sources/SourcePickers";
import { TableSelectionView } from "../sources/TableSelectionView";

type SourcesRoute = { view: "list" } | { view: "tables"; sourceId: string };

export interface SourcesSectionContext {
	app: App;
	state: EditorState;
	scan: DeckScanResult | null;
	profileCount: number;
	profileWarnings: number;
	rowCount: number;
	diagnostics: DeckDiagnostic[];
	loading: boolean;
	locale: UiLocale;
	t: Translator;
	dispatch: (action: EditorAction) => void;
	onOpenTable: (table: ParsedTable) => void;
}

function metric(parent: HTMLElement, value: number, label: string, locale: UiLocale): void {
	const item = parent.createDiv({ cls: "tc-fields-metric" });
	item.createDiv({ cls: "tc-fields-metric-value", text: formatUiNumber(value, locale) });
	item.createDiv({ cls: "tc-fields-metric-label", text: label });
}

function iconButton(
	parent: HTMLElement,
	label: string,
	icon: string,
	onClick: () => void,
): HTMLButtonElement {
	const button = parent.createEl("button", {
		cls: "tc-field-icon-button",
		attr: { type: "button", "aria-label": label },
	});
	setIcon(button, icon);
	button.addEventListener("click", onClick);
	return button;
}

export class SourcesSection {
	private route: SourcesRoute = { view: "list" };
	private parent: HTMLElement | null = null;
	private context: SourcesSectionContext | null = null;
	private tableSelection: TableSelectionView | null = null;
	private tableSelectionSourceId: string | null = null;

	constructor(private readonly invalidate: () => void) {}

	get showingTables(): boolean {
		return this.route.view === "tables";
	}

	render(parent: HTMLElement, context: SourcesSectionContext): void {
		this.parent = parent;
		this.context = context;
		if (this.route.view === "tables") {
			const sourceId = this.route.sourceId;
			const source = context.state.draft.sources.find((item) => item.id === sourceId);
			if (source) {
				this.renderTableRoute(parent, source);
				return;
			}
			this.route = { view: "list" };
		}
		this.destroyTableSelection();
		this.renderList(parent);
	}

	destroy(): void {
		this.destroyTableSelection();
		this.parent = null;
		this.context = null;
	}

	private renderList(parent: HTMLElement): void {
		const context = this.context;
		if (!context) return;
		const warningCount = context.diagnostics.length + context.profileWarnings;
		const summary = parent.createDiv({ cls: "tc-fields-summary" });
		metric(summary, context.profileCount, context.t("editor.summary.columns"), context.locale);
		metric(summary, context.rowCount, context.t("editor.summary.rows"), context.locale);
		metric(summary, warningCount, context.t("editor.summary.warnings"), context.locale);

		const sourceHeader = parent.createDiv({ cls: "tc-field-section-header" });
		sourceHeader.createEl("h3", { text: context.t("editor.source.heading") });
		const sourceActions = sourceHeader.createDiv({ cls: "tc-field-actions" });
		const addFile = sourceActions.createEl("button", {
			text: context.t("editor.source.addFile"),
			attr: { type: "button" },
		});
		addFile.addEventListener("click", () => this.pickFile());
		const addFolder = sourceActions.createEl("button", {
			text: context.t("editor.source.addFolder"),
			attr: { type: "button" },
		});
		addFolder.addEventListener("click", () => this.pickFolder());

		if (context.state.draft.sources.length === 0) {
			parent.createDiv({ cls: "tc-field-empty", text: context.t("editor.source.empty") });
			return;
		}
		const list = parent.createDiv({ cls: "tc-source-list" });
		for (const source of context.state.draft.sources) this.renderSource(list, source);
	}

	private renderSource(parent: HTMLElement, source: DeckSource): void {
		const context = this.context;
		if (!context) return;
		const card = parent.createDiv({ cls: "tc-source-card" });
		const header = card.createDiv({ cls: "tc-source-card-header" });
		const identity = header.createDiv({ cls: "tc-source-identity" });
		identity.createDiv({
			cls: "tc-source-kind",
			text: context.t(source.kind === "file" ? "editor.source.file" : "editor.source.folder"),
		});
		identity.createDiv({ cls: "tc-source-path", text: source.path, attr: { dir: "auto" } });
		identity.createDiv({ cls: "tc-source-summary", text: this.sourceSummary(source) });
		iconButton(header, context.t("editor.source.remove"), "trash-2", () => {
			context.dispatch({
				type: "replaceSources",
				sources: context.state.draft.sources.filter((item) => item.id !== source.id),
			});
		});

		const missing = this.missingSelectorCount(source);
		const sourceMissing = context.diagnostics.some(
			(diagnostic) => diagnostic.code === "sourceMissing" &&
				normalizeVaultPath(diagnostic.sourcePath) === normalizeVaultPath(source.path),
		);
		if (sourceMissing) {
			card.createDiv({
				cls: "tc-source-inline-warning",
				text: context.t("diagnostic.sourceMissing", { path: source.path }),
				attr: { dir: "auto" },
			});
		}
		if (missing > 0) {
			card.createDiv({ cls: "tc-source-inline-warning", text: context.t("editor.table.missing") });
		}
		const actions = card.createDiv({ cls: "tc-source-card-actions" });
		const choose = actions.createEl("button", {
			text: context.t("editor.source.chooseTables"),
			attr: { type: "button", "data-source-id": source.id },
		});
		choose.disabled = context.loading && this.sourceTables(source).length === 0;
		choose.addEventListener("click", () => this.openTables(source.id));
	}

	private renderTableRoute(parent: HTMLElement, source: DeckSource): void {
		const context = this.context;
		if (!context) return;
		const tables = this.sourceTables(source);
		if (!this.tableSelection || this.tableSelectionSourceId !== source.id) {
			this.destroyTableSelection();
			this.tableSelectionSourceId = source.id;
			this.tableSelection = new TableSelectionView(parent, {
				source,
				tables,
				t: context.t,
				onChange: (next) => this.replaceSource(next),
				onOpenTable: (table) => this.context?.onOpenTable(table),
				onBack: () => this.backToList(source.id),
			});
		} else {
			this.tableSelection.mount(parent);
			this.tableSelection.update(source, tables);
		}
		this.tableSelection.setLoading(context.loading);
	}

	private openTables(sourceId: string): void {
		this.route = { view: "tables", sourceId };
		this.invalidate();
		window.setTimeout(() => {
			this.parent?.querySelector<HTMLButtonElement>(".tc-table-selection-back")?.focus();
		}, 0);
	}

	private backToList(sourceId: string): void {
		this.route = { view: "list" };
		this.invalidate();
		window.setTimeout(() => {
			const buttons = this.parent?.querySelectorAll<HTMLButtonElement>("[data-source-id]") ?? [];
			Array.from(buttons).find((button) => button.dataset.sourceId === sourceId)?.focus();
		}, 0);
	}

	private replaceSource(next: DeckSource): void {
		const context = this.context;
		if (!context) return;
		context.dispatch({
			type: "replaceSources",
			sources: context.state.draft.sources.map((source) => source.id === next.id ? next : source),
		});
	}

	private pickFile(): void {
		const context = this.context;
		if (!context) return;
		new MarkdownFilePicker(context.app, context.t("editor.source.pickFile"), (file) => {
			const live = this.context;
			if (!live || live.state.draft.sources.some((source) => source.kind === "file" && source.path === file.path)) return;
			live.dispatch({
				type: "replaceSources",
				sources: [
					...live.state.draft.sources,
					{ id: newId("source"), kind: "file", path: file.path, tables: { mode: "all" } },
				],
			});
		}).open();
	}

	private pickFolder(): void {
		const context = this.context;
		if (!context) return;
		new FolderPicker(context.app, context.t("editor.source.pickFolder"), (folder) => {
			const live = this.context;
			if (!live || live.state.draft.sources.some((source) => source.kind === "folder" && source.path === folder.path)) return;
			live.dispatch({
				type: "replaceSources",
				sources: [
					...live.state.draft.sources,
					{ id: newId("source"), kind: "folder", path: folder.path, tables: { mode: "all" } },
				],
			});
		}).open();
	}

	private sourceTables(source: DeckSource): ParsedTable[] {
		return canonicalTablesForSource(this.context?.scan ?? null, source.id);
	}

	private sourceSummary(source: DeckSource): string {
		const context = this.context;
		if (!context) return "";
		return sourceTableSummary(source, this.sourceTables(source), context.t, context.locale);
	}

	private missingSelectorCount(source: DeckSource): number {
		if (source.tables.mode !== "include") return 0;
		const tables = this.sourceTables(source);
		return source.tables.selectors.filter(
			(selector) => !tables.some((table) => selectorMatchesTable(selector, table)),
		).length;
	}

	private destroyTableSelection(): void {
		this.tableSelection?.destroy();
		this.tableSelection = null;
		this.tableSelectionSourceId = null;
	}
}
