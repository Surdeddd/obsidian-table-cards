import { Component, Modal, Platform, setIcon, type App } from "obsidian";
import { filterCardsByScope, restoreCardIndex } from "../deck/filter";
import { clampCardIndex, loadDeckData, orderCards } from "../deck/load";
import { applyUiChromeDirection, formatUiNumber, type Translator } from "../i18n";
import { resolveCard } from "../layout/resolve";
import type {
	Card,
	Deck,
	DeckLoadResult,
	DeckProgress,
	PluginSettings,
	StudyScope,
	UiLocale,
} from "../model";
import type { DeckOpenRequest } from "../session/launcher-state";
import { applyAppearance, resolveDeckAppearance, shouldSplit } from "../settings/appearance";
import { renderCard } from "./CardView";
import { attachSwipe } from "./gestures";
import { SessionLauncher } from "./SessionLauncher";

export interface CardsModalHost {
	settings: PluginSettings;
	saveSettings: () => Promise<void>;
	getTranslator: () => Translator;
	getLocale: () => UiLocale;
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
	private cards: Card[] = [];
	private deck: Deck | null = null;
	private result: DeckLoadResult | null = null;
	private progress: DeckProgress | null = null;
	private t!: Translator;
	private locale!: UiLocale;
	private launcher: SessionLauncher | null = null;
	private detachSwipe: (() => void) | null = null;
	private renderVersion = 0;
	private headerEl!: HTMLElement;
	private stageEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private counterEl!: HTMLElement;
	private progressEl!: HTMLElement;
	private shuffleBtn!: HTMLButtonElement;
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

	onClose(): void {
		this.renderVersion += 1;
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

	private prepareSession(selection: SessionSelection): { cards: Card[]; progress: DeckProgress } {
		const saved = this.host.settings.perDeck[selection.deck.id];
		const progress = saved ? cloneProgress(saved) : this.defaultProgress(selection.deck);
		progress.scope = cloneScope(selection.scope);
		const scopedCards = filterCardsByScope(selection.result.cards, selection.scope);
		const cards = orderCards(scopedCards, progress.shuffle, progress.seed);
		progress.index = restoreCardIndex(cards, progress.cardKey, progress.index);
		progress.cardKey = cards[progress.index]?.origin.rowKey ?? null;
		return { cards, progress };
	}

	private async startStudy(selection: SessionSelection): Promise<void> {
		const prepared = this.prepareSession(selection);
		if (this.request.persistProgress !== false) {
			await this.persistConfirmedSession(selection.deck.id, prepared.progress);
		}
		if (!this.component) return;
		this.deck = selection.deck;
		this.result = selection.result;
		this.cards = prepared.cards;
		this.progress = prepared.progress;
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
	}

	private async persistConfirmedSession(deckId: string, progress: DeckProgress): Promise<void> {
		const previousDeckId = this.host.settings.lastDeckId;
		const hadProgress = Object.prototype.hasOwnProperty.call(this.host.settings.perDeck, deckId);
		const previousProgress = this.host.settings.perDeck[deckId];
		this.host.settings.lastDeckId = deckId;
		this.host.settings.perDeck[deckId] = progress;
		try {
			await this.host.saveSettings();
		} catch (error) {
			this.host.settings.lastDeckId = previousDeckId;
			if (hadProgress && previousProgress) this.host.settings.perDeck[deckId] = previousProgress;
			else delete this.host.settings.perDeck[deckId];
			throw error;
		}
	}

	private buildChrome(): void {
		this.headerEl = this.contentEl.createDiv({ cls: "table-cards-header" });
		const lead = this.headerEl.createDiv({ cls: "table-cards-header-lead" });
		lead.createDiv({ cls: "table-cards-kicker", text: this.t("modal.kicker") });
		lead.createDiv({ cls: "table-cards-study-deck", text: this.deck?.name ?? "", attr: { dir: "auto" } });
		this.counterEl = this.headerEl.createDiv({
			cls: "table-cards-counter",
			attr: { "aria-live": "polite", "aria-label": this.t("modal.progress") },
		});
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
		this.stageEl = this.contentEl.createDiv({ cls: "table-cards-stage", attr: { dir: "auto" } });

		this.footerEl = this.contentEl.createDiv({ cls: "table-cards-footer" });
		const prev = this.footerEl.createEl("button", {
			cls: "table-cards-nav-btn",
			attr: { "aria-label": this.t("modal.prev") },
		});
		setIcon(prev, "chevron-left");
		prev.createSpan({ text: this.t("modal.prev") });
		prev.addEventListener("click", () => void this.step(-1));

		this.shuffleBtn = this.footerEl.createEl("button", {
			cls: "table-cards-shuffle-btn",
			attr: { "aria-label": this.t("modal.shuffle"), "aria-pressed": "false" },
		});
		setIcon(this.shuffleBtn, "shuffle");
		this.shuffleBtn.addEventListener("click", () => void this.toggleShuffle());

		const next = this.footerEl.createEl("button", {
			cls: "table-cards-nav-btn table-cards-nav-next",
			attr: { "aria-label": this.t("modal.next") },
		});
		next.createSpan({ text: this.t("modal.next") });
		setIcon(next, "chevron-right");
		next.addEventListener("click", () => void this.step(1));
	}

	private registerKeys(): void {
		if (this.studyKeysRegistered) return;
		this.studyKeysRegistered = true;
		this.scope.register([], "ArrowRight", () => {
			void this.step(1);
			return false;
		});
		this.scope.register([], "ArrowLeft", () => {
			void this.step(-1);
			return false;
		});
		this.scope.register([], "s", () => {
			void this.toggleShuffle();
			return false;
		});
	}

	private currentCard(): Card | null {
		if (!this.progress || this.cards.length === 0) return null;
		return this.cards[clampCardIndex(this.progress.index, this.cards.length)] ?? null;
	}

	private render(): void {
		this.applyLook();
		const version = ++this.renderVersion;
		const total = this.cards.length;
		const index = !this.progress || total === 0 ? 0 : clampCardIndex(this.progress.index, total) + 1;
		this.counterEl.setText(`${formatUiNumber(index, this.locale)} / ${formatUiNumber(total, this.locale)}`);
		const ratio = total === 0 ? 0 : index / total;
		this.progressEl.setCssProps({ width: `${Math.round(ratio * 100)}%` });
		this.progressEl.parentElement?.setAttr("aria-valuemin", "0");
		this.progressEl.parentElement?.setAttr("aria-valuemax", String(total));
		this.progressEl.parentElement?.setAttr("aria-valuenow", String(index));
		this.shuffleBtn.toggleClass("is-active", this.progress?.shuffle ?? false);
		this.shuffleBtn.setAttr("aria-pressed", String(this.progress?.shuffle ?? false));
		this.updateStageColumns();
		const current = this.currentCard();
		const resolved = current && this.deck ? resolveCard(current, this.deck.blocks) : null;
		if (!this.component) return;
		void renderCard(this.stageEl, resolved, {
			app: this.app,
			component: this.component,
			appearance: resolveDeckAppearance(this.host.settings.appearance, this.deck?.appearance),
			t: this.t,
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

	private async step(delta: number): Promise<void> {
		if (!this.progress || this.cards.length === 0) return;
		this.progress.index = clampCardIndex(this.progress.index + delta, this.cards.length);
		this.progress.cardKey = this.cards[this.progress.index]?.origin.rowKey ?? null;
		this.render();
		await this.saveProgress();
	}

	private async toggleShuffle(): Promise<void> {
		if (!this.progress || !this.result) return;
		this.progress.shuffle = !this.progress.shuffle;
		this.progress.seed = Date.now();
		this.cards = orderCards(
			filterCardsByScope(this.result.cards, this.progress.scope),
			this.progress.shuffle,
			this.progress.seed,
		);
		this.progress.index = 0;
		this.progress.cardKey = this.cards[0]?.origin.rowKey ?? null;
		this.render();
		await this.saveProgress();
	}

	private async saveProgress(): Promise<void> {
		if (this.request.persistProgress === false || !this.deck || !this.progress) return;
		this.host.settings.perDeck[this.deck.id] = this.progress;
		await this.host.saveSettings();
	}
}
