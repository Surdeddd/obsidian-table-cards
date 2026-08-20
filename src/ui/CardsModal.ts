import { Component, Modal, Platform, setIcon, type App } from "obsidian";
import {
	buildSearchIndex,
	normalizeScope,
	type SearchEntry,
} from "../deck/filter";
import { clampCardIndex, loadDeckData, resolveImageFile } from "../deck/load";
import { applyUiChromeDirection, formatUiNumber, type Translator } from "../i18n";
import { resolveCard } from "../layout/resolve";
import type {
	Card,
	Deck,
	DeckLoadResult,
	DeckProgress,
	PluginSettings,
	StudyScope,
	TableCatalogItem,
	UiLocale,
} from "../model";
import type { DeckOpenRequest } from "../session/launcher-state";
import { ProgressSaveQueue } from "../session/progress-save-queue";
import { requireEnabledDeck, saveDeckProgressIfEnabled } from "../session/settings-intents";
import { findExactCardIndex, selectStudyCards } from "../session/study-state";
import { applyAppearance, resolveDeckAppearance, shouldSplit } from "../settings/appearance";
import { CardBrowser } from "./CardBrowser";
import { closeOpenListbox } from "./editor/controls/Listbox";
import { renderCard } from "./CardView";
import { buildTableDisplayLabels } from "./card-browser-state";
import { buildCardImageCache, type CardImageCache } from "./card-image-cache";
import { attachSwipe } from "./gestures";
import { ScopeSheet } from "./ScopeSheet";
import { SessionLauncher } from "./SessionLauncher";
import type { SettingsMutation } from "../settings/persistence";

export interface CardsModalHost {
	settings: PluginSettings;
	updateSettings: (mutate: SettingsMutation) => Promise<void>;
	getTranslator: () => Translator;
	getLocale: () => UiLocale;
	openCards?: (request: DeckOpenRequest) => void;
}

interface SessionSelection {
	deck: Deck;
	result: DeckLoadResult;
	scope: StudyScope;
}

function cloneScope(scope: StudyScope): StudyScope {
	return scope.mode === "all" ? { mode: "all" } : { mode: "tables", tableKeys: scope.tableKeys.slice() };
}

function cloneProgress(progress: DeckProgress): DeckProgress {
	return {
		...progress,
		scope: cloneScope(progress.scope),
	};
}

export class CardsModal extends Modal {
	private readonly host: CardsModalHost;
	private readonly request: DeckOpenRequest;
	private allCards: Card[] = [];
	private cards: Card[] = [];
	private catalog: TableCatalogItem[] = [];
	private searchIndex: SearchEntry[] = [];
	private tableLabels = new Map<string, string>();
	private deck: Deck | null = null;
	private progress: DeckProgress | null = null;
	private t!: Translator;
	private locale!: UiLocale;
	private launcher: SessionLauncher | null = null;
	private browser: CardBrowser | null = null;
	private scopeSheet: ScopeSheet | null = null;
	private imageCache: CardImageCache | null = null;
	private progressSaves: ProgressSaveQueue<DeckProgress> | null = null;
	private detachSwipe: (() => void) | null = null;
	private renderVersion = 0;
	private headerEl!: HTMLElement;
	private stageEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private counterEl!: HTMLElement;
	private progressEl!: HTMLElement;
	private saveErrorEl!: HTMLElement;
	private shuffleBtn!: HTMLButtonElement;
	private scopeBtn!: HTMLButtonElement;
	private searchBtn!: HTMLButtonElement;
	private component: Component | null = null;
	private stageObserver: ResizeObserver | null = null;
	private studyKeysRegistered = false;

	constructor(app: App, host: CardsModalHost, request: DeckOpenRequest = { lockedDeck: false }) {
		super(app);
		this.host = host;
		this.request = request;
	}

	onOpen(): void {
		this.component = new Component();
		this.component.load();
		this.t = this.host.getTranslator();
		this.locale = this.host.getLocale();
		this.modalEl.addClass("table-cards-modal");
		if (Platform.isMobile) this.modalEl.addClass("table-cards-modal-mobile");
		applyUiChromeDirection(this.modalEl, this.locale);
		this.modalEl.setAttr("aria-label", this.t("launcher.title"));
		this.titleEl.setText("");
		this.contentEl.empty();
		this.contentEl.addClass("table-cards-shell");
		this.applyLook();
		this.launcher = new SessionLauncher(this.contentEl, {
			decks: this.host.settings.decks,
			request: this.request,
			settings: this.host.settings,
			t: this.t,
			locale: this.locale,
			loadDeck: (deck) => loadDeckData(this.app, deck, {
				untitledTableLabel: (number) => this.t("table.untitled", {
					number: formatUiNumber(number, this.locale),
				}),
			}),
			onStart: (selection) => this.startStudy(selection),
			onClose: () => this.close(),
		});
	}

	close(): void {
		if (closeOpenListbox()) return;
		if (this.browser?.closeNestedLayer()) return;
		if (this.scopeSheet) {
			this.closeScopePicker(true);
			return;
		}
		if (this.browser) {
			this.closeBrowser(true);
			return;
		}
		super.close();
	}

	onClose(): void {
		this.renderVersion += 1;
		this.progressSaves?.close();
		this.progressSaves = null;
		this.imageCache = null;
		this.closeBrowser(false);
		this.closeScopePicker(false);
		this.launcher?.destroy();
		this.launcher = null;
		this.stageObserver?.disconnect();
		this.stageObserver = null;
		this.component?.unload();
		this.component = null;
		this.detachSwipe?.();
		this.detachSwipe = null;
		this.contentEl.empty();
	}

	private applyLook(): void {
		applyAppearance(
			this.modalEl,
			resolveDeckAppearance(this.host.settings.appearance, this.deck?.appearance),
			Platform.isMobile,
		);
	}

	private defaultProgress(deck: Deck): DeckProgress {
		return {
			index: 0,
			shuffle: deck.shuffleDefault,
			seed: Date.now(),
			scope: { mode: "all" },
			cardKey: null,
		};
	}

	private prepareSession(
		selection: SessionSelection,
		settings: PluginSettings,
		defaultsDeck: Deck = selection.deck,
	): { cards: Card[]; progress: DeckProgress } {
		const saved = settings.perDeck[selection.deck.id];
		const progress = saved ? cloneProgress(saved) : this.defaultProgress(defaultsDeck);
		progress.scope = cloneScope(selection.scope);
		const selected = selectStudyCards({
			allCards: selection.result.cards,
			scope: progress.scope,
			shuffle: progress.shuffle,
			seed: progress.seed,
			cardKey: progress.cardKey,
			fallbackIndex: progress.index,
		});
		progress.index = selected.index;
		progress.cardKey = selected.cardKey;
		return { cards: selected.cards, progress };
	}

	private async startStudy(selection: SessionSelection): Promise<void> {
		let prepared: { cards: Card[]; progress: DeckProgress } | null = null;
		if (this.request.persistProgress !== false) {
			await this.host.updateSettings((settings) => {
				const latestDeck = requireEnabledDeck(settings, selection.deck.id);
				prepared = this.prepareSession(selection, settings, latestDeck);
				settings.lastDeckId = selection.deck.id;
				settings.perDeck[selection.deck.id] = cloneProgress(prepared.progress);
			});
		} else {
			prepared = this.prepareSession(selection, this.host.settings);
		}
		if (!this.component || !prepared) return;
		this.deck = selection.deck;
		this.allCards = selection.result.cards.slice();
		this.cards = prepared.cards;
		this.catalog = selection.result.catalog.slice();
		this.searchIndex = buildSearchIndex(this.allCards);
		this.imageCache = buildCardImageCache(this.allCards, selection.deck.blocks, (sourcePath, image) => {
			const file = resolveImageFile(this.app, sourcePath, image);
			return file ? this.app.vault.getResourcePath(file) : null;
		});
		this.tableLabels = buildTableDisplayLabels(this.catalog, (number) => this.t("table.untitled", {
			number: formatUiNumber(number, this.locale),
		}));
		this.progress = prepared.progress;
		this.progressSaves = this.request.persistProgress === false
			? null
			: new ProgressSaveQueue<DeckProgress>({
				clone: cloneProgress,
				save: (snapshot) => this.host.updateSettings((settings) => {
					saveDeckProgressIfEnabled(settings, selection.deck.id, snapshot);
				}),
				onErrorChange: (failed) => this.setSaveFailed(failed),
			});
		this.launcher?.destroy();
		this.launcher = null;
		this.contentEl.empty();
		this.modalEl.setAttr("aria-label", `${this.t("modal.kicker")}: ${selection.deck.name}`);
		this.applyLook();
		this.buildChrome();
		this.registerKeys();
		this.detachSwipe = attachSwipe(this.stageEl, {
			onNext: () => void this.step(1),
			onPrev: () => void this.step(-1),
		});
		this.render();
		if (!Platform.isMobile) {
			window.setTimeout(() => this.footerEl?.querySelector<HTMLElement>(".table-cards-nav-next")?.focus(), 0);
		}
	}

	private buildChrome(): void {
		this.headerEl = this.contentEl.createDiv({ cls: "table-cards-header" });
		const lead = this.headerEl.createDiv({ cls: "table-cards-header-lead" });
		const identity = lead.createDiv({ cls: "table-cards-study-identity" });
		identity.createDiv({ cls: "table-cards-kicker", text: this.t("modal.kicker") });
		const otherDecks = this.host.settings.decks.filter((deck) => deck.enabled && deck.id !== this.deck?.id);
		if (otherDecks.length > 0 && this.host.openCards) {
			const switcher = identity.createEl("button", {
				cls: "table-cards-study-deck is-switch",
				text: this.deck?.name ?? "",
				attr: {
					type: "button",
					dir: "auto",
					"aria-haspopup": "dialog",
					"aria-label": `${this.t("modal.deck")}: ${this.deck?.name ?? ""}`,
				},
			});
			setIcon(switcher.createSpan({ cls: "table-cards-deck-caret" }), "chevron-down");
			switcher.addEventListener("click", () => this.chooseAnotherDeck());
		} else {
			identity.createDiv({ cls: "table-cards-study-deck", text: this.deck?.name ?? "", attr: { dir: "auto" } });
		}
		const tools = lead.createDiv({ cls: "table-cards-study-tools" });
		this.scopeBtn = tools.createEl("button", {
			cls: "table-cards-scope-btn",
			attr: { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false" },
		});
		this.scopeBtn.addEventListener("click", () => this.toggleScopePicker());
		this.searchBtn = tools.createEl("button", {
			cls: "table-cards-icon-btn table-cards-search-btn",
			attr: {
				type: "button",
				"aria-label": this.t("study.search"),
				"aria-haspopup": "dialog",
				"aria-expanded": "false",
			},
		});
		setIcon(this.searchBtn, "search");
		this.searchBtn.addEventListener("click", () => this.toggleBrowser());
		this.updateScopeButton();
		this.counterEl = this.headerEl
			.createDiv({
				cls: "table-cards-counter",
				attr: { "aria-live": "polite", "aria-label": this.t("modal.progress") },
			})
			.createSpan({ cls: "tc-figure-pair" });
		const closeBtn = this.headerEl.createEl("button", {
			cls: "table-cards-icon-btn",
			attr: { "aria-label": this.t("modal.close") },
		});
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => this.close());

		const track = this.contentEl.createDiv({
			cls: "table-cards-progress",
			attr: { role: "progressbar", "aria-label": this.t("modal.progress") },
		});
		this.progressEl = track.createDiv({ cls: "table-cards-progress-bar" });
		this.saveErrorEl = this.contentEl.createDiv({
			cls: "table-cards-save-error",
			attr: { role: "status", "aria-live": "polite" },
		});
		this.stageEl = this.contentEl.createDiv({ cls: "table-cards-stage", attr: { dir: "auto" } });

		this.footerEl = this.contentEl.createDiv({ cls: "table-cards-footer" });
		const prev = this.footerEl.createEl("button", {
			cls: "table-cards-nav-btn",
			attr: { "aria-label": this.t("modal.prev"), "aria-keyshortcuts": "ArrowLeft" },
		});
		setIcon(prev, "chevron-left");
		prev.createSpan({ text: this.t("modal.prev") });
		prev.addEventListener("click", () => void this.step(-1));

		this.shuffleBtn = this.footerEl.createEl("button", {
			cls: "table-cards-shuffle-btn",
			attr: { "aria-label": this.t("modal.shuffle"), "aria-pressed": "false", "aria-keyshortcuts": "S" },
		});
		setIcon(this.shuffleBtn, "shuffle");
		this.shuffleBtn.addEventListener("click", () => void this.toggleShuffle());

		const next = this.footerEl.createEl("button", {
			cls: "table-cards-nav-btn table-cards-nav-next",
			attr: { "aria-label": this.t("modal.next"), "aria-keyshortcuts": "ArrowRight" },
		});
		next.createSpan({ text: this.t("modal.next") });
		setIcon(next.createSpan({ cls: "table-cards-nav-icon" }), "chevron-right");
		next.addEventListener("click", () => void this.step(1));
		if (Platform.isMobile) this.shuffleBtn.after(this.searchBtn);
	}

	private chooseAnotherDeck(): void {
		if (!this.host.openCards) return;
		super.close();
		this.host.openCards({ lockedDeck: false, chooseDeck: true });
	}

	private scopeSummary(): string {
		if (!this.progress || this.progress.scope.mode === "all") return this.t("scope.all");
		const tables = this.catalog.filter((table) =>
			this.progress?.scope.mode === "tables" && this.progress.scope.tableKeys.includes(table.key));
		if (tables.length === 1) return this.tableLabels.get(tables[0]!.key) ?? tables[0]!.label;
		return this.t("scope.count", { count: formatUiNumber(tables.length, this.locale) });
	}

	private updateScopeButton(): void {
		if (!this.scopeBtn) return;
		const summary = this.scopeSummary();
		this.scopeBtn.empty();
		this.scopeBtn.createSpan({ text: summary, attr: { dir: "auto" } });
		this.scopeBtn.createSpan({ cls: "table-cards-scope-mark", text: "⌄", attr: { "aria-hidden": "true" } });
		this.scopeBtn.setAttr("aria-label", `${this.t("scope.label")}: ${summary}`);
	}

	private toggleScopePicker(): void {
		if (this.scopeSheet) {
			this.closeScopePicker(true);
			return;
		}
		if (!this.progress) return;
		this.closeBrowser(false);
		const opener = this.scopeBtn;
		this.scopeBtn.setAttr("aria-expanded", "true");
		this.scopeSheet = new ScopeSheet(this.contentEl, {
			catalog: this.catalog,
			scope: this.progress.scope,
			t: this.t,
			opener,
			onChange: (scope) => void this.applyScope(scope),
			onClose: () => {
				this.scopeSheet = null;
				this.scopeBtn.setAttr("aria-expanded", "false");
			},
		});
	}

	private closeScopePicker(restoreFocus: boolean): void {
		this.scopeSheet?.destroy(restoreFocus);
		this.scopeSheet = null;
		if (this.scopeBtn) this.scopeBtn.setAttr("aria-expanded", "false");
	}

	private toggleBrowser(): void {
		if (this.browser) {
			this.closeBrowser(true);
			return;
		}
		if (!this.progress) return;
		this.closeScopePicker(false);
		this.searchBtn.setAttr("aria-expanded", "true");
		this.browser = new CardBrowser(this.contentEl, {
			index: this.searchIndex,
			catalog: this.catalog,
			scope: this.progress.scope,
			t: this.t,
			onScopeChange: (scope) => void this.applyScope(scope),
			onOpenCard: (rowKey) => void this.openCard(rowKey),
			onClose: () => this.closeBrowser(false),
		});
	}

	private closeBrowser(restoreFocus: boolean): void {
		const browser = this.browser;
		this.browser = null;
		browser?.destroy();
		if (this.searchBtn) this.searchBtn.setAttr("aria-expanded", "false");
		if (restoreFocus && this.searchBtn) this.searchBtn.focus();
	}

	private applyScope(nextScope: StudyScope): void {
		if (!this.progress) return;
		const currentKey = this.currentCard()?.origin.rowKey ?? this.progress.cardKey;
		const previousIndex = this.progress.index;
		this.progress.scope = normalizeScope(nextScope, this.catalog);
		const selected = selectStudyCards({
			allCards: this.allCards,
			scope: this.progress.scope,
			shuffle: this.progress.shuffle,
			seed: this.progress.seed,
			cardKey: currentKey,
			fallbackIndex: previousIndex,
		});
		this.cards = selected.cards;
		this.progress.index = selected.index;
		this.progress.cardKey = selected.cardKey;
		this.updateScopeButton();
		this.render();
		this.saveProgress();
	}

	private openCard(rowKey: string): void {
		if (!this.progress) return;
		const index = findExactCardIndex(this.cards, rowKey);
		if (index < 0) {
			this.browser?.refresh();
			return;
		}
		this.progress.index = index;
		this.progress.cardKey = rowKey;
		this.render();
		this.closeBrowser(true);
		this.saveProgress();
	}

	private registerKeys(): void {
		if (this.studyKeysRegistered) return;
		this.studyKeysRegistered = true;
		this.scope.register([], "ArrowRight", () => {
			if (this.browser || this.scopeSheet) return true;
			void this.step(1);
			return false;
		});
		this.scope.register([], "ArrowLeft", () => {
			if (this.browser || this.scopeSheet) return true;
			void this.step(-1);
			return false;
		});
		this.scope.register([], "s", () => {
			if (this.browser || this.scopeSheet) return true;
			void this.toggleShuffle();
			return false;
		});
		this.scope.register([], "Escape", () => {
			if (this.browser?.closeNestedLayer()) return false;
			if (this.scopeSheet) this.closeScopePicker(true);
			else if (this.browser) this.closeBrowser(true);
			else this.close();
			return false;
		});
	}

	private currentCard(): Card | null {
		if (!this.progress || this.cards.length === 0) return null;
		return this.cards[clampCardIndex(this.progress.index, this.cards.length)] ?? null;
	}

	private render(): void {
		this.applyLook();
		this.updateScopeButton();
		const version = ++this.renderVersion;
		const total = this.cards.length;
		const index = !this.progress || total === 0 ? 0 : clampCardIndex(this.progress.index, total) + 1;
		this.counterEl.setText(`${formatUiNumber(index, this.locale)} / ${formatUiNumber(total, this.locale)}`);
		const ratio = total === 0 ? 0 : index / total;
		this.progressEl.setCssProps({ width: `${Math.round(ratio * 100)}%` });
		this.progressEl.parentElement?.setAttr("aria-valuemin", "0");
		this.progressEl.parentElement?.setAttr("aria-valuemax", String(total));
		this.progressEl.parentElement?.setAttr("aria-valuenow", String(index));
		const shuffled = this.progress?.shuffle ?? false;
		this.shuffleBtn.toggleClass("is-active", shuffled);
		this.shuffleBtn.setAttr("aria-pressed", String(shuffled));
		this.shuffleBtn.setAttr("aria-label", this.t(shuffled ? "modal.shuffleOn" : "modal.shuffle"));
		this.updateStageColumns();
		const current = this.currentCard();
		const resolved = current && this.deck ? resolveCard(current, this.deck.blocks) : null;
		if (!this.component) return;
		const emptyScope = this.progress?.scope.mode === "tables" && this.progress.scope.tableKeys.length === 0;
		void renderCard(this.stageEl, resolved, {
			app: this.app,
			component: this.component,
			appearance: resolveDeckAppearance(this.host.settings.appearance, this.deck?.appearance),
			t: this.t,
			emptyMessage: emptyScope ? this.t("launcher.selectAtLeastOne") : undefined,
			sourceLabel: current ? this.tableLabels.get(current.origin.tableKey) ?? current.origin.tableLabel : undefined,
			resolveImageSource: (sourcePath, image) => this.imageCache?.resolve(sourcePath, image) ?? null,
			isCurrent: () => version === this.renderVersion,
			options: { interactiveImages: true },
		}).then(() => {
			if (version !== this.renderVersion) return;
			this.stageEl.scrollTop = 0;
			const scrollingBlocks: NodeListOf<HTMLElement> = this.stageEl.querySelectorAll('[data-overflow="scroll"]');
			scrollingBlocks.forEach((block) => {
				block.scrollTop = 0;
				block.scrollLeft = 0;
			});
		});
	}

	private updateStageColumns(): void {
		const update = (): void => {
			const appearance = resolveDeckAppearance(this.host.settings.appearance, this.deck?.appearance);
			this.stageEl.toggleClass("is-single-column", !shouldSplit(this.stageEl.clientWidth, appearance));
		};
		update();
		if (!this.stageObserver) {
			this.stageObserver = new ResizeObserver(update);
			this.stageObserver.observe(this.stageEl);
		}
	}

	private step(delta: number): void {
		if (!this.progress || this.cards.length === 0) return;
		this.progress.index = clampCardIndex(this.progress.index + delta, this.cards.length);
		this.progress.cardKey = this.cards[this.progress.index]?.origin.rowKey ?? null;
		this.render();
		this.saveProgress();
	}

	private toggleShuffle(): void {
		if (!this.progress) return;
		const currentKey = this.currentCard()?.origin.rowKey ?? this.progress.cardKey;
		const previousIndex = this.progress.index;
		this.progress.shuffle = !this.progress.shuffle;
		this.progress.seed = Date.now();
		const selected = selectStudyCards({
			allCards: this.allCards,
			scope: this.progress.scope,
			shuffle: this.progress.shuffle,
			seed: this.progress.seed,
			cardKey: currentKey,
			fallbackIndex: previousIndex,
		});
		this.cards = selected.cards;
		this.progress.index = selected.index;
		this.progress.cardKey = selected.cardKey;
		this.render();
		this.saveProgress();
	}

	private saveProgress(): void {
		if (!this.progress) return;
		this.progressSaves?.enqueue(this.progress);
	}

	private setSaveFailed(failed: boolean): void {
		if (!this.saveErrorEl) return;
		this.saveErrorEl.setText(failed ? this.t("launcher.saveFailed") : "");
	}
}
