import { cloneJson, UI_LOCALES, type DeckSource, type ParsedTable, type TableCatalogItem, type UiLocale } from "../../model";
import { formatUiNumber, type Translator } from "../../i18n";
import { normalizeSearchText } from "../../deck/filter";
import { selectorMatchesTable, tableSelectedBySource, toggleSourceTable } from "../../deck/selectors";
import { disambiguateTableLabels } from "../ScopePicker";
import {
	reconcileTableSelectionInteraction,
	stableTableSelectionKey,
	type TableSelectionInteraction,
} from "./table-selection-state";

export interface TableSelectionViewOptions {
	source: DeckSource;
	tables: ParsedTable[];
	t: Translator;
	onChange: (source: DeckSource) => void;
	onOpenTable?: (table: ParsedTable) => void;
	onBack: () => void;
}

interface TableGroup {
	path: string;
	tables: ParsedTable[];
}

function localeAt(element: HTMLElement): UiLocale {
	const value = element.closest<HTMLElement>("[lang]")?.getAttr("lang") ?? "en";
	return (UI_LOCALES as readonly string[]).includes(value) ? value as UiLocale : "en";
}

function tablesForSource(source: DeckSource, tables: ParsedTable[]): ParsedTable[] {
	if (source.kind === "file") return tables.filter((table) => table.sourcePath === source.path);
	const prefix = source.path.endsWith("/") ? source.path : `${source.path}/`;
	return tables.filter((table) => table.sourcePath.startsWith(prefix));
}

function tableSearchText(table: ParsedTable): string {
	return normalizeSearchText([
		table.sourcePath,
		table.headingPath.join(" "),
		table.headers.join(" "),
	].join(" "));
}

function groupsFor(tables: ParsedTable[]): TableGroup[] {
	const groups = new Map<string, ParsedTable[]>();
	for (const table of tables) {
		const group = groups.get(table.sourcePath) ?? [];
		group.push(table);
		groups.set(table.sourcePath, group);
	}
	return Array.from(groups, ([path, grouped]) => ({ path, tables: grouped }));
}

export class TableSelectionView {
	private readonly root: HTMLElement;
	private readonly options: TableSelectionViewOptions;
	private readonly locale: UiLocale;
	private source: DeckSource;
	private tables: ParsedTable[];
	private query = "";
	private listEl: HTMLElement | null = null;
	private interaction: TableSelectionInteraction = {
		query: "",
		expandedKeys: [],
		scrollTop: 0,
		focusedCheckboxKey: null,
	};
	private tableLabels = new Map<string, string>();
	private focusTimer: number | null = null;

	constructor(parent: HTMLElement, options: TableSelectionViewOptions) {
		this.options = options;
		this.source = cloneJson(options.source);
		this.tables = options.tables.slice();
		this.locale = localeAt(parent);
		this.root = parent.createDiv({ cls: "tc-table-selection" });
		this.render();
	}

	destroy(): void {
		if (this.focusTimer !== null) window.clearTimeout(this.focusTimer);
		this.root.remove();
	}

	update(source: DeckSource, tables: ParsedTable[]): void {
		this.captureInteraction();
		this.source = cloneJson(source);
		this.tables = tables.slice();
		this.render();
	}

	setLoading(loading: boolean): void {
		this.root.setAttr("aria-busy", String(loading));
	}

	private render(): void {
		this.captureInteraction();
		this.root.empty();
		const header = this.root.createDiv({ cls: "tc-table-selection-header" });
		const back = header.createEl("button", {
			cls: "tc-table-selection-back",
			text: this.options.t("editor.backAction"),
			attr: { type: "button" },
		});
		back.addEventListener("click", this.options.onBack);
		const identity = header.createDiv({ cls: "tc-table-selection-identity" });
		identity.createDiv({
			cls: "tc-source-kind",
			text: this.options.t(this.source.kind === "file" ? "editor.source.file" : "editor.source.folder"),
		});
		identity.createDiv({ cls: "tc-source-path", text: this.source.path, attr: { dir: "auto" } });

		const controls = this.root.createDiv({ cls: "tc-table-selection-controls" });
		const all = controls.createEl("button", {
			text: this.options.t("editor.table.all"),
			attr: { type: "button", "aria-pressed": String(this.source.tables.mode === "all") },
		});
		all.addEventListener("click", () => this.replaceSelection({ mode: "all" }));
		const none = controls.createEl("button", {
			text: this.options.t("scope.clear"),
			attr: {
				type: "button",
				"aria-pressed": String(this.source.tables.mode === "include" && this.source.tables.selectors.length === 0),
			},
		});
		none.addEventListener("click", () => this.replaceSelection({ mode: "include", selectors: [] }));

		const search = this.root.createEl("input", {
			type: "search",
			cls: "tc-table-selection-search",
			attr: {
				placeholder: this.options.t("scope.search"),
				"aria-label": this.options.t("scope.search"),
			},
		});
		search.value = this.query;
		search.addEventListener("input", () => {
			this.query = normalizeSearchText(search.value);
			this.interaction.query = this.query;
			this.renderList();
		});
		this.listEl = this.root.createDiv({ cls: "tc-table-selection-list" });
		this.renderList(false);
		this.restoreInteraction();
	}

	private renderList(capture = true): void {
		if (!this.listEl) return;
		if (capture) this.captureInteraction();
		this.listEl.empty();
		const available = tablesForSource(this.source, this.tables);
		this.tableLabels = disambiguateTableLabels(
			available.map((table) => this.catalogItem(table)),
			this.options.t,
			this.locale,
		);
		const filtered = available.filter((table) => !this.query || tableSearchText(table).includes(this.query));
		if (
			this.source.tables.mode === "include" &&
			this.source.tables.selectors.some((selector) => !available.some((table) => selectorMatchesTable(selector, table)))
		) {
			const warning = this.listEl.createDiv({ cls: "tc-field-warning" });
			warning.createSpan({ text: this.options.t("editor.table.missing") });
			const repair = warning.createEl("button", {
				text: this.options.t("editor.table.repair"),
				attr: { type: "button" },
			});
			repair.addEventListener("click", () => this.replaceSelection({ mode: "all" }));
		}
		if (filtered.length === 0) {
			this.listEl.createDiv({
				cls: "tc-field-empty",
				text: available.length === 0 ? this.options.t("editor.table.none") : this.options.t("scope.noMatches"),
			});
			this.restoreInteraction();
			return;
		}
		for (const group of groupsFor(filtered)) this.renderGroup(group);
		this.restoreInteraction();
	}

	private renderGroup(group: TableGroup): void {
		if (!this.listEl) return;
		const section = this.listEl.createEl("section", { cls: "tc-table-selection-group" });
		if (this.source.kind === "folder") {
			section.createEl("h3", { text: group.path, attr: { dir: "auto" } });
		}
		for (const table of group.tables) this.renderTable(section, table);
	}

	private renderTable(parent: HTMLElement, table: ParsedTable): void {
		const key = stableTableSelectionKey(table.sourcePath, table.selector);
		const row = parent.createDiv({ cls: "tc-table-selection-row" });
		const select = row.createEl("label", { cls: "tc-table-selection-check" });
		const checkbox = select.createEl("input", { type: "checkbox" });
		checkbox.checked = this.isSelected(table);
		checkbox.setAttr("data-table-key", key);
		checkbox.setAttr("aria-label", this.tableLabel(table));
		checkbox.addEventListener("change", () => this.toggleTable(table));

		const details = row.createEl("details", {
			cls: "tc-table-selection-details",
			attr: { "data-table-key": key },
		});
		details.open = this.interaction.expandedKeys.includes(key);
		const summary = details.createEl("summary");
		const title = summary.createDiv({ cls: "tc-table-selection-title", text: this.tableLabel(table), attr: { dir: "auto" } });
		title.setAttr("title", this.tableLabel(table));
		const meta = summary.createDiv({ cls: "tc-table-selection-meta" });
		meta.createSpan({ text: this.options.t("scope.rows", { count: formatUiNumber(table.rows.length, this.locale) }) });
		meta.createSpan({ text: this.options.t("scope.columns", { count: formatUiNumber(table.headers.length, this.locale) }) });
		meta.createSpan({ text: this.options.t("table.preview") });

		const preview = details.createDiv({ cls: "tc-table-selection-preview", attr: { dir: "auto" } });
		const firstRow = table.rows[0];
		if (!firstRow) {
			preview.createDiv({ cls: "tc-field-empty", text: this.options.t("editor.column.noSamples") });
		} else {
			const entries = Object.entries(firstRow).slice(0, 4);
			for (const [label, cell] of entries) {
				const item = preview.createDiv({ cls: "tc-table-selection-preview-item" });
				item.createDiv({ cls: "tc-table-selection-preview-label", text: label, attr: { dir: "auto" } });
				item.createDiv({ cls: "tc-table-selection-preview-value", text: cell.text || "—", attr: { dir: "auto" } });
			}
		}
		if (this.options.onOpenTable) {
			const open = preview.createEl("button", {
				text: this.options.t("table.open"),
				attr: { type: "button" },
			});
			open.addEventListener("click", () => this.options.onOpenTable?.(table));
		}
	}

	private tableLabel(table: ParsedTable): string {
		return this.tableLabels.get(stableTableSelectionKey(table.sourcePath, table.selector)) ??
			(table.headingPath.at(-1) || this.options.t("table.untitled", {
				number: formatUiNumber(table.index + 1, this.locale),
			}));
	}

	private isSelected(table: ParsedTable): boolean {
		return tableSelectedBySource(this.source, table);
	}

	private toggleTable(table: ParsedTable): void {
		const available = tablesForSource(this.source, this.tables);
		this.replaceSelection(toggleSourceTable(this.source, available, table).tables);
	}

	private replaceSelection(tables: DeckSource["tables"]): void {
		this.source = cloneJson({ ...this.source, tables });
		this.options.onChange(cloneJson(this.source));
		this.render();
	}

	private catalogItem(table: ParsedTable): TableCatalogItem {
		return {
			key: stableTableSelectionKey(table.sourcePath, table.selector),
			selector: table.selector,
			sourcePath: table.sourcePath,
			sourceIds: [this.source.id],
			label: table.headingPath.at(-1) || this.options.t("table.untitled", {
				number: formatUiNumber(table.index + 1, this.locale),
			}),
			tableNumber: table.index + 1,
			headingPath: table.headingPath.slice(),
			headers: table.headers.slice(),
			rowCount: table.rows.length,
		};
	}

	private captureInteraction(): void {
		if (!this.listEl?.isConnected) return;
		const expandedKeys = Array.from(
			this.listEl.querySelectorAll<HTMLDetailsElement>("details[data-table-key][open]"),
			(details) => details.dataset.tableKey ?? "",
		).filter(Boolean);
		const activeElement = document.activeElement;
		const active = activeElement instanceof HTMLInputElement
			? activeElement.closest<HTMLInputElement>('input[type="checkbox"][data-table-key]')
			: null;
		this.interaction = {
			query: this.query,
			expandedKeys,
			scrollTop: this.listEl.scrollTop,
			focusedCheckboxKey: active?.dataset.tableKey ?? (
				activeElement instanceof Node && this.root.contains(activeElement)
					? null
					: this.interaction.focusedCheckboxKey
			),
		};
	}

	private restoreInteraction(): void {
		if (!this.listEl) return;
		const liveKeys = new Set(
			Array.from(this.listEl.querySelectorAll<HTMLElement>("[data-table-key]"), (item) => item.dataset.tableKey ?? "")
				.filter(Boolean),
		);
		this.interaction = reconcileTableSelectionInteraction(this.interaction, liveKeys);
		this.query = this.interaction.query;
		this.listEl.scrollTop = this.interaction.scrollTop;
		for (const details of Array.from(this.listEl.querySelectorAll<HTMLDetailsElement>("details[data-table-key]"))) {
			details.open = this.interaction.expandedKeys.includes(details.dataset.tableKey ?? "");
		}
		if (this.focusTimer !== null) window.clearTimeout(this.focusTimer);
		const focusKey = this.interaction.focusedCheckboxKey;
		if (!focusKey) return;
		this.focusTimer = window.setTimeout(() => {
			this.root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-table-key]')
				.forEach((input) => {
					if (input.dataset.tableKey === focusKey) input.focus();
				});
			this.focusTimer = null;
		}, 0);
	}
}
