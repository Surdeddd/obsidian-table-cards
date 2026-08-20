import { Platform, setIcon } from "obsidian";
import { normalizeScope, type SearchEntry } from "../deck/filter";
import { formatUiNumber, type Translator } from "../i18n";
import { UI_LOCALES, type StudyScope, type TableCatalogItem, type UiLocale } from "../model";
import {
	browserResults,
	buildTableDisplayLabels,
	openForRender,
	type BrowserGroup,
} from "./card-browser-state";
import { Sheet } from "./editor/controls/Sheet";
import { metaSeparator } from "./meta-separator";
import { ScopeSheet } from "./ScopeSheet";

export interface CardBrowserOptions {
	index: SearchEntry[];
	catalog: TableCatalogItem[];
	scope: StudyScope;
	t: Translator;
	onScopeChange: (scope: StudyScope) => void;
	onOpenCard: (rowKey: string) => void;
	onClose: () => void;
}

function cloneScope(scope: StudyScope): StudyScope {
	return scope.mode === "all" ? { mode: "all" } : { mode: "tables", tableKeys: scope.tableKeys.slice() };
}

function localeAt(element: HTMLElement): UiLocale {
	const value = element.closest<HTMLElement>("[lang]")?.getAttr("lang") ?? "en";
	return (UI_LOCALES as readonly string[]).includes(value) ? value as UiLocale : "en";
}

function fileBasename(path: string): string {
	return (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");
}

export class CardBrowser {
	private readonly parent: HTMLElement;
	private readonly options: CardBrowserOptions;
	private readonly locale: UiLocale;
	private readonly tableLabels: Map<string, string>;
	private scope: StudyScope;
	private query = "";
	private renderVersion = 0;
	private sheet: Sheet | null = null;
	private scopeSheet: ScopeSheet | null = null;
	private root: HTMLElement | null = null;
	private resultsEl: HTMLElement | null = null;
	private searchEl: HTMLInputElement | null = null;
	private statusEl: HTMLElement | null = null;
	private scopeButton: HTMLButtonElement | null = null;

	constructor(parent: HTMLElement, options: CardBrowserOptions) {
		this.parent = parent;
		this.options = options;
		this.locale = localeAt(parent);
		this.scope = normalizeScope(options.scope, options.catalog);
		this.tableLabels = buildTableDisplayLabels(options.catalog, (number) => options.t("table.untitled", {
			number: formatUiNumber(number, this.locale),
		}));
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		this.sheet = new Sheet(parent, {
			id: "tc-card-browser",
			title: options.t("browser.title"),
			mode: "side",
			variant: Platform.isMobile ? "full" : "default",
			opener,
			initialFocus: () => (Platform.isMobile ? null : this.searchEl),
			closeLabel: options.t("modal.close"),
			onClose: options.onClose,
			renderBody: (body) => this.renderBrowser(body),
		});
		this.sheet.open();
	}

	destroy(): void {
		this.renderVersion += 1;
		this.closeScopePicker(false);
		this.sheet?.destroy(false);
		this.sheet = null;
		this.root?.remove();
		this.root = null;
		this.resultsEl = null;
		this.searchEl = null;
		this.statusEl = null;
		this.scopeButton = null;
	}

	refresh(): void {
		this.renderResults();
	}

	closeNestedLayer(): boolean {
		if (!this.scopeSheet) return false;
		this.closeScopePicker(true);
		return true;
	}

	private renderBrowser(parent: HTMLElement): void {
		this.root = parent.createDiv({ cls: "tc-card-browser" });
		const controls = this.root.createDiv({ cls: "tc-card-browser-controls" });
		this.scopeButton = controls.createEl("button", {
			cls: "tc-card-browser-scope",
			attr: { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false" },
		});
		this.scopeButton.addEventListener("click", () => this.toggleScopePicker());
		this.updateScopeButton();
		const searchWrap = controls.createDiv({ cls: "tc-card-browser-search-wrap" });
		const icon = searchWrap.createSpan({ cls: "tc-card-browser-search-icon", attr: { "aria-hidden": "true" } });
		setIcon(icon, "search");
		const search = searchWrap.createEl("input", {
			type: "search",
			cls: "tc-card-browser-search",
			attr: {
				placeholder: this.options.t("browser.search"),
				"aria-label": this.options.t("browser.search"),
				dir: "auto",
			},
		});
		this.searchEl = search;
		search.addEventListener("input", () => {
			this.query = search.value;
			this.renderResults();
		});
		search.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || event.isComposing) return;
			if (!this.query.trim()) return;
			const first = this.resultsEl?.querySelector<HTMLButtonElement>(".tc-card-browser-result");
			if (!first) return;
			event.preventDefault();
			first.click();
		});
		this.statusEl = this.root.createDiv({ cls: "tc-card-browser-status", attr: { "aria-live": "polite" } });
		this.resultsEl = this.root.createDiv({ cls: "tc-card-browser-results" });
		this.renderResults();
	}

	private scopeSummary(): string {
		if (this.scope.mode === "all") return this.options.t("scope.all");
		const tables = this.options.catalog.filter((table) => this.scope.mode === "tables" && this.scope.tableKeys.includes(table.key));
		if (tables.length === 1) return this.tableLabels.get(tables[0]!.key) ?? tables[0]!.label;
		return this.options.t("scope.count", { count: formatUiNumber(tables.length, this.locale) });
	}

	private updateScopeButton(): void {
		if (!this.scopeButton) return;
		const summary = this.scopeSummary();
		this.scopeButton.empty();
		this.scopeButton.createSpan({ text: summary, attr: { dir: "auto" } });
		this.scopeButton.createSpan({ cls: "tc-card-browser-scope-mark", text: "⌄", attr: { "aria-hidden": "true" } });
		this.scopeButton.setAttr("aria-label", `${this.options.t("scope.label")}: ${summary}`);
	}

	private toggleScopePicker(): void {
		if (this.scopeSheet) {
			this.closeScopePicker(true);
			return;
		}
		const opener = this.scopeButton;
		this.scopeButton?.setAttr("aria-expanded", "true");
		this.scopeSheet = new ScopeSheet(this.parent, {
			catalog: this.options.catalog,
			scope: this.scope,
			t: this.options.t,
			opener,
			onChange: (scope) => this.changeScope(scope),
			onClose: () => {
				this.scopeSheet = null;
				this.scopeButton?.setAttr("aria-expanded", "false");
			},
		});
	}

	private closeScopePicker(restoreFocus: boolean): void {
		this.scopeSheet?.destroy(restoreFocus);
		this.scopeSheet = null;
		this.scopeButton?.setAttr("aria-expanded", "false");
	}

	private changeScope(scope: StudyScope): void {
		this.scope = normalizeScope(scope, this.options.catalog);
		this.updateScopeButton();
		this.renderResults();
		this.options.onScopeChange(cloneScope(this.scope));
	}

	private renderResults(): void {
		if (!this.resultsEl || !this.statusEl) return;
		const version = ++this.renderVersion;
		const result = browserResults(this.options.index, this.options.catalog, this.scope, this.query);
		this.resultsEl.empty();
		const searching = this.query.trim().length > 0;
		if (!searching) {
			this.resultsEl.createDiv({ cls: "tc-card-browser-hint", text: this.options.t("browser.empty") });
		}
		this.statusEl.setText(!searching
			? ""
			: result.shown < result.total
				? this.options.t("browser.showing", {
					shown: formatUiNumber(result.shown, this.locale),
					total: formatUiNumber(result.total, this.locale),
				})
				: this.options.t("browser.results", { count: formatUiNumber(result.total, this.locale) }));
		if (result.total === 0) {
			this.resultsEl.createDiv({ cls: "tc-card-browser-empty", text: this.options.t("browser.noMatches") });
			return;
		}
		for (const group of result.groups) this.renderGroup(group, version);
	}

	private renderGroup(group: BrowserGroup, version: number): void {
		if (!this.resultsEl) return;
		const section = this.resultsEl.createEl("section", { cls: "tc-card-browser-group" });
		const header = section.createDiv({ cls: "tc-card-browser-group-header" });
		const label = this.tableLabels.get(group.tableKey) ?? group.table?.label ?? group.matches[0]?.entry.card.origin.tableLabel ?? "";
		const path = group.table?.sourcePath ?? group.matches[0]?.entry.card.origin.sourcePath ?? "";
		header.createDiv({ cls: "tc-card-browser-group-title", text: label, attr: { dir: "auto" } });
		header.createDiv({ cls: "tc-card-browser-group-file", text: fileBasename(path), attr: { dir: "auto" } });
		for (const match of group.matches) {
			const card = match.entry.card;
			const button = section.createEl("button", {
				cls: "tc-card-browser-result",
				attr: { type: "button" },
			});
			button.createDiv({
				cls: "tc-card-browser-primary",
				text: match.entry.primary || match.snippet,
				attr: { dir: "auto" },
			});
			if (match.snippet && (this.query.trim() || match.snippet !== match.entry.primary)) {
				button.createDiv({ cls: "tc-card-browser-snippet", text: match.snippet, attr: { dir: "auto" } });
			}
			const metadata = button.createDiv({ cls: "tc-card-browser-meta" });
			metadata.createSpan({ text: label, attr: { dir: "auto" } });
			metaSeparator(metadata);
			metadata.createSpan({ text: fileBasename(card.origin.sourcePath), attr: { dir: "auto" } });
			metaSeparator(metadata);
			metadata.createSpan({
				text: this.options.t("browser.row", {
					number: formatUiNumber(card.origin.rowNumber, this.locale),
				}),
			});
			button.addEventListener("click", () => {
				openForRender(version, this.renderVersion, card.origin.rowKey, this.options.onOpenCard);
			});
		}
	}
}
