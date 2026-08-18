import { cloneJson, UI_LOCALES, type DeckSource, type ParsedTable, type TableSelector, type UiLocale } from "../../model";
import { formatUiNumber, type Translator } from "../../i18n";
import { normalizeSearchText } from "../../deck/filter";

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

function sameSelector(left: TableSelector, right: TableSelector): boolean {
	return left.headerSignature === right.headerSignature && left.occurrence === right.occurrence;
}

function uniqueSelectors(tables: ParsedTable[]): TableSelector[] {
	const selectors: TableSelector[] = [];
	for (const table of tables) {
		if (!selectors.some((selector) => sameSelector(selector, table.selector))) {
			selectors.push({ ...table.selector });
		}
	}
	return selectors;
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
	private query = "";
	private listEl: HTMLElement | null = null;

	constructor(parent: HTMLElement, options: TableSelectionViewOptions) {
		this.options = options;
		this.source = cloneJson(options.source);
		this.locale = localeAt(parent);
		this.root = parent.createDiv({ cls: "tc-table-selection" });
		this.render();
	}

	destroy(): void {
		this.root.remove();
	}

	private render(): void {
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
			this.renderList();
		});
		this.listEl = this.root.createDiv({ cls: "tc-table-selection-list" });
		this.renderList();
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		const available = tablesForSource(this.source, this.options.tables);
		const filtered = available.filter((table) => !this.query || tableSearchText(table).includes(this.query));
		if (filtered.length === 0) {
			this.listEl.createDiv({
				cls: "tc-field-empty",
				text: available.length === 0 ? this.options.t("editor.table.none") : this.options.t("scope.noMatches"),
			});
			return;
		}
		for (const group of groupsFor(filtered)) this.renderGroup(group);

		if (
			this.source.tables.mode === "include" &&
			this.source.tables.selectors.some((selector) => !available.some((table) => sameSelector(selector, table.selector)))
		) {
			const warning = this.listEl.createDiv({ cls: "tc-field-warning" });
			warning.createSpan({ text: this.options.t("editor.table.missing") });
			const repair = warning.createEl("button", {
				text: this.options.t("editor.table.repair"),
				attr: { type: "button" },
			});
			repair.addEventListener("click", () => this.replaceSelection({ mode: "all" }));
		}
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
		const row = parent.createDiv({ cls: "tc-table-selection-row" });
		const select = row.createEl("label", { cls: "tc-table-selection-check" });
		const checkbox = select.createEl("input", { type: "checkbox" });
		checkbox.checked = this.isSelected(table.selector);
		checkbox.setAttr("aria-label", this.tableLabel(table));
		checkbox.addEventListener("change", () => this.toggleTable(table));

		const details = row.createEl("details", { cls: "tc-table-selection-details" });
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
		return table.headingPath.at(-1) || this.options.t("table.untitled", {
			number: formatUiNumber(table.index + 1, this.locale),
		});
	}

	private isSelected(selector: TableSelector): boolean {
		return this.source.tables.mode === "all" || this.source.tables.selectors.some((item) => sameSelector(item, selector));
	}

	private toggleTable(table: ParsedTable): void {
		const available = tablesForSource(this.source, this.options.tables);
		const selectors = this.source.tables.mode === "all"
			? uniqueSelectors(available)
			: this.source.tables.selectors.map((selector) => ({ ...selector }));
		const selected = selectors.some((selector) => sameSelector(selector, table.selector));
		this.replaceSelection({
			mode: "include",
			selectors: selected
				? selectors.filter((selector) => !sameSelector(selector, table.selector))
				: [...selectors, { ...table.selector }],
		});
	}

	private replaceSelection(tables: DeckSource["tables"]): void {
		this.source = cloneJson({ ...this.source, tables });
		this.options.onChange(cloneJson(this.source));
		this.render();
	}
}
