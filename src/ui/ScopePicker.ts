import { normalizeSearchText, materializeTableScope } from "../deck/filter";
import { formatUiNumber, type Translator } from "../i18n";
import { UI_LOCALES, type StudyScope, type TableCatalogItem, type UiLocale } from "../model";
import { Sheet } from "./editor/controls/Sheet";

export interface ScopePickerOptions {
	catalog: TableCatalogItem[];
	scope: StudyScope;
	t: Translator;
	mobile: boolean;
	embeddedActions?: boolean;
	onChange: (scope: StudyScope) => void;
	onClose: () => void;
}

interface TableGroup {
	path: string;
	tables: TableCatalogItem[];
}

function cloneScope(scope: StudyScope): StudyScope {
	return scope.mode === "all" ? { mode: "all" } : { mode: "tables", tableKeys: scope.tableKeys.slice() };
}

function localeAt(element: HTMLElement): UiLocale {
	const value = element.closest<HTMLElement>("[lang]")?.getAttr("lang") ?? "en";
	return (UI_LOCALES as readonly string[]).includes(value) ? value as UiLocale : "en";
}

function pathParts(path: string): { file: string; parent: string } {
	const parts = path.split("/").filter(Boolean);
	const file = parts.at(-1) ?? path;
	const parent = parts.slice(-3, -1).join("/");
	return { file, parent };
}

function pathSuffixes(paths: string[]): Map<string, string> {
	const distinctPaths = Array.from(new Set(paths));
	const parts = new Map(distinctPaths.map((path) => [path, path.split("/").filter(Boolean)]));
	const widths = new Map(distinctPaths.map((path) => [path, 1]));
	while (true) {
		const collisions = new Map<string, string[]>();
		for (const path of distinctPaths) {
			const pathParts = parts.get(path) ?? [path];
			const suffix = pathParts.slice(-(widths.get(path) ?? 1)).join("/") || path;
			const group = collisions.get(suffix) ?? [];
			group.push(path);
			collisions.set(suffix, group);
		}
		let changed = false;
		for (const group of collisions.values()) {
			if (group.length < 2) continue;
			for (const path of group) {
				const width = widths.get(path) ?? 1;
				const length = parts.get(path)?.length ?? 1;
				if (width >= length) continue;
				widths.set(path, width + 1);
				changed = true;
			}
		}
		if (!changed) break;
	}
	return new Map(distinctPaths.map((path) => {
		const pathParts = parts.get(path) ?? [path];
		return [path, pathParts.slice(-(widths.get(path) ?? 1)).join("/") || path];
	}));
}

export function disambiguateTableLabels(
	catalog: TableCatalogItem[],
	t: Translator,
	locale: UiLocale,
): Map<string, string> {
	const byLabel = new Map<string, TableCatalogItem[]>();
	for (const table of catalog) {
		const label = normalizeSearchText(table.label);
		const tables = byLabel.get(label) ?? [];
		tables.push(table);
		byLabel.set(label, tables);
	}
	const labels = new Map<string, string>();
	for (const tables of byLabel.values()) {
		if (tables.length === 1) {
			const only = tables[0];
			if (only) labels.set(only.key, only.label);
			continue;
		}
		const suffixes = pathSuffixes(tables.map((table) => table.sourcePath));
		const fileCounts = new Map<string, number>();
		for (const table of tables) {
			fileCounts.set(table.sourcePath, (fileCounts.get(table.sourcePath) ?? 0) + 1);
		}
		for (const table of tables) {
			const parts = [table.label, suffixes.get(table.sourcePath) ?? table.sourcePath];
			if ((fileCounts.get(table.sourcePath) ?? 0) > 1) {
				parts.push(t("table.untitled", { number: formatUiNumber(table.tableNumber, locale) }));
			}
			labels.set(table.key, parts.join(" · "));
		}
	}
	return labels;
}

function selectedKeys(scope: StudyScope, catalog: TableCatalogItem[]): Set<string> {
	const materialized = materializeTableScope(scope, catalog);
	return new Set(materialized.mode === "tables" ? materialized.tableKeys : []);
}

function groupedTables(catalog: TableCatalogItem[]): TableGroup[] {
	const groups = new Map<string, TableCatalogItem[]>();
	for (const table of catalog) {
		const tables = groups.get(table.sourcePath) ?? [];
		tables.push(table);
		groups.set(table.sourcePath, tables);
	}
	return Array.from(groups, ([path, tables]) => ({ path, tables }));
}

function searchText(table: TableCatalogItem): string {
	return normalizeSearchText([
		table.label,
		table.headingPath.join(" "),
		table.sourcePath,
		table.headers.join(" "),
	].join(" "));
}

export class ScopePicker {
	private readonly parent: HTMLElement;
	private readonly options: ScopePickerOptions;
	private readonly locale: UiLocale;
	private readonly tableLabels: Map<string, string>;
	private scope: StudyScope;
	private query = "";
	private root: HTMLElement | null = null;
	private groupsEl: HTMLElement | null = null;
	private searchEl: HTMLInputElement | null = null;
	private bulkButton: HTMLButtonElement | null = null;
	private sheet: Sheet | null = null;

	constructor(parent: HTMLElement, options: ScopePickerOptions) {
		this.parent = parent;
		this.options = options;
		this.locale = localeAt(parent);
		this.scope = cloneScope(options.scope);
		this.tableLabels = disambiguateTableLabels(options.catalog, options.t, this.locale);
		this.open();
	}

	destroy(): void {
		this.sheet?.destroy(false);
		this.sheet = null;
		this.root?.removeEventListener("keydown", this.onKeyDown);
		this.root?.remove();
		this.root = null;
		this.groupsEl = null;
		this.searchEl = null;
		this.bulkButton = null;
	}

	private open(): void {
		if (!this.options.mobile) {
			this.root = this.parent.createDiv({ cls: "tc-scope-picker" });
			this.root.addEventListener("keydown", this.onKeyDown);
			this.renderPicker(this.root, !this.options.embeddedActions);
			return;
		}
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		this.sheet = new Sheet(this.parent, {
			id: "tc-scope-picker",
			title: this.options.t("scope.label"),
			mode: "bottom",
			variant: "full",
			opener,
			closeLabel: this.options.t("modal.close"),
			onClose: this.options.onClose,
			renderBody: (body) => {
				this.root = body.createDiv({ cls: "tc-scope-picker is-mobile" });
				this.renderPicker(this.root, false);
			},
			renderFooter: (footer) => this.renderActions(footer, true),
		});
		this.sheet.open();
	}

	renderEmbeddedActions(parent: HTMLElement): void {
		this.renderActions(parent, false);
	}

	searchField(): HTMLInputElement | null {
		return this.searchEl;
	}

	private renderPicker(root: HTMLElement, withActions = true): void {
		const searchBar = root.createDiv({ cls: "tc-scope-searchbar" });
		const search = searchBar.createEl("input", {
			type: "search",
			cls: "tc-scope-search",
			attr: {
				placeholder: this.options.t("scope.search"),
				"aria-label": this.options.t("scope.search"),
			},
		});
		this.searchEl = search;
		search.addEventListener("input", () => {
			this.query = normalizeSearchText(search.value);
			this.renderGroups();
		});
		this.groupsEl = root.createDiv({ cls: "tc-scope-groups" });
		this.renderGroups();
		if (withActions) this.renderActions(root.createDiv({ cls: "tc-scope-actions" }), false);
	}

	private renderActions(parent: HTMLElement, mobile: boolean): void {
		this.bulkButton = parent.createEl("button", { attr: { type: "button" } });
		this.bulkButton.addEventListener("click", () => this.toggleAll());
		this.updateBulkButton();
		const apply = parent.createEl("button", {
			cls: "mod-cta",
			text: this.options.t("scope.apply"),
			attr: { type: "button" },
		});
		apply.addEventListener("click", () => {
			if (mobile) this.sheet?.close();
			else this.options.onClose();
		});
	}

	private toggleAll(): void {
		const selected = selectedKeys(this.scope, this.options.catalog);
		this.setScope(this.options.catalog.length > 0 && selected.size === this.options.catalog.length
			? { mode: "tables", tableKeys: [] }
			: { mode: "all" });
	}

	private setScope(scope: StudyScope): void {
		this.scope = cloneScope(scope);
		this.options.onChange(cloneScope(scope));
		this.renderGroups();
		this.updateBulkButton();
	}

	private updateBulkButton(): void {
		if (!this.bulkButton) return;
		const selected = selectedKeys(this.scope, this.options.catalog);
		this.bulkButton.setText(this.options.catalog.length > 0 && selected.size === this.options.catalog.length
			? this.options.t("scope.clear")
			: this.options.t("scope.selectAll"));
	}

	private renderGroups(): void {
		if (!this.groupsEl) return;
		this.groupsEl.empty();
		const selected = selectedKeys(this.scope, this.options.catalog);
		const groups = groupedTables(this.options.catalog)
			.map((group) => ({
				...group,
				tables: group.tables.filter((table) => !this.query || searchText(table).includes(this.query)),
			}))
			.filter((group) => group.tables.length > 0);
		if (groups.length === 0) {
			this.groupsEl.createDiv({ cls: "tc-scope-empty", text: this.options.t("scope.noMatches") });
			return;
		}
		for (const group of groups) this.renderGroup(this.groupsEl, group, selected);
	}

	private focusTable(key: string): void {
		const inputs = this.groupsEl?.querySelectorAll<HTMLElement>("input[data-table-key]") ?? [];
		for (const input of Array.from(inputs)) {
			if (input.dataset["tableKey"] === key) {
				input.focus({ preventScroll: true });
				return;
			}
		}
	}

	private renderGroup(parent: HTMLElement, group: TableGroup, selected: Set<string>): void {
		const allGroupTables = this.options.catalog.filter((table) => table.sourcePath === group.path);
		const selectedCount = allGroupTables.filter((table) => selected.has(table.key)).length;
		const section = parent.createDiv({ cls: "tc-scope-group" });
		const header = section.createDiv({ cls: "tc-scope-group-header" });
		const path = pathParts(group.path);
		const identity = header.createDiv({ cls: "tc-scope-source", attr: { dir: "auto" } });
		identity.createDiv({ cls: "tc-scope-source-name", text: path.file, attr: { dir: "auto" } });
		if (path.parent) identity.createDiv({ cls: "tc-scope-source-path", text: path.parent, attr: { dir: "auto" } });
		const controls = header.createDiv({ cls: "tc-scope-group-controls" });
		controls.createSpan({
			cls: "tc-scope-group-count",
			text: this.options.t("scope.groupSummary", {
				selected: formatUiNumber(selectedCount, this.locale),
				total: formatUiNumber(allGroupTables.length, this.locale),
			}),
		});
		const groupLabel = selectedCount === allGroupTables.length
			? this.options.t("scope.clear")
			: this.options.t("scope.selectAll");
		const groupToggle = controls.createEl("button", {
			cls: "tc-scope-group-toggle",
			text: groupLabel,
			attr: { type: "button", "aria-label": `${groupLabel}: ${path.file}` },
		});
		groupToggle.addEventListener("click", () => this.toggleGroup(allGroupTables, selected));
		for (const table of group.tables) this.renderTable(section, table, selected.has(table.key));
	}

	private toggleGroup(tables: TableCatalogItem[], selected: Set<string>): void {
		const next = new Set(selected);
		const allSelected = tables.every((table) => next.has(table.key));
		for (const table of tables) {
			if (allSelected) next.delete(table.key);
			else next.add(table.key);
		}
		this.setScope({
			mode: "tables",
			tableKeys: this.options.catalog.flatMap((table) => next.has(table.key) ? [table.key] : []),
		});
	}

	private renderTable(parent: HTMLElement, table: TableCatalogItem, checked: boolean): void {
		const row = parent.createEl("label", { cls: "tc-scope-row" });
		const input = row.createEl("input", { type: "checkbox", attr: { "data-table-key": table.key } });
		input.checked = checked;
		const content = row.createDiv({ cls: "tc-scope-row-content" });
		content.createDiv({ cls: "tc-scope-row-title", text: this.tableLabel(table), attr: { dir: "auto" } });
		const meta = content.createDiv({ cls: "tc-scope-row-meta" });
		meta.createSpan({ text: this.options.t("scope.rows", { count: formatUiNumber(table.rowCount, this.locale) }) });
		meta.createSpan({ text: this.options.t("scope.columns", { count: formatUiNumber(table.headers.length, this.locale) }) });
		if (table.headers.length > 0) {
			meta.createSpan({
				cls: "tc-scope-columns",
				text: `${table.headers.slice(0, 3).join(" · ")}${table.headers.length > 3 ? "…" : ""}`,
				attr: { dir: "auto" },
			});
		}
		input.addEventListener("change", () => this.toggleTable(table.key));
	}

	private tableLabel(table: TableCatalogItem): string {
		return this.tableLabels.get(table.key) ?? table.label;
	}

	private toggleTable(key: string): void {
		const selected = selectedKeys(this.scope, this.options.catalog);
		if (selected.has(key)) selected.delete(key);
		else selected.add(key);
		this.setScope({
			mode: "tables",
			tableKeys: this.options.catalog.flatMap((table) => selected.has(table.key) ? [table.key] : []),
		});
		this.focusTable(key);
	}

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		this.options.onClose();
	};
}
