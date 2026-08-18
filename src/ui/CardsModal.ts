import { Component, Modal, Platform, setIcon, type App } from "obsidian";
import { newId, type Card, type Deck, type DeckProgress, type PluginSettings } from "../model";
import type { Translator } from "../i18n";
import { resolveCard } from "../layout/resolve";
import { applyAppearance, resolveDeckAppearance, shouldSplit } from "../settings/appearance";
import { clampCardIndex, loadDeckData, orderCards } from "../deck/load";
import { attachSwipe } from "./gestures";
import { renderCard } from "./CardView";
import { Listbox } from "./editor/controls/Listbox";

export interface CardsModalHost {
	settings: PluginSettings;
	saveSettings: () => Promise<void>;
	t: Translator;
}

export class CardsModal extends Modal {
	private readonly host: CardsModalHost;
	private cards: Card[] = [];
	private deck: Deck | null = null;
	private detachSwipe: (() => void) | null = null;
	private renderVersion = 0;
	private headerEl!: HTMLElement;
	private stageEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private counterEl!: HTMLElement;
	private progressEl!: HTMLElement;
	private deckPickerEl!: HTMLElement;
	private shuffleBtn!: HTMLButtonElement;
	private component: Component | null = null;
	private stageObserver: ResizeObserver | null = null;
	private loadVersion = 0;
	private readonly deckPickerId = newId("deck-picker");
	private deckPicker: Listbox<string> | null = null;

	constructor(app: App, host: CardsModalHost) {
		super(app);
		this.host = host;
	}

	async onOpen(): Promise<void> {
		this.component = new Component();
		this.component.load();
		this.modalEl.addClass("table-cards-modal");
		if (Platform.isMobile) this.modalEl.addClass("table-cards-modal-mobile");
		this.titleEl.setText("");
		this.contentEl.empty();
		this.contentEl.addClass("table-cards-shell");
		this.applyLook();
		this.buildChrome();
		this.registerKeys();
		this.detachSwipe = attachSwipe(this.stageEl, {
			onNext: () => void this.step(1),
			onPrev: () => void this.step(-1),
		});
		const enabled = this.enabledDecks();
		const preferred = enabled.find((deck) => deck.id === this.host.settings.lastDeckId) ?? enabled[0] ?? null;
		await this.selectDeck(preferred?.id ?? null);
	}

	onClose(): void {
		this.renderVersion += 1;
		this.loadVersion += 1;
		this.deckPicker?.destroy();
		this.deckPicker = null;
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

	private enabledDecks(): Deck[] {
		return this.host.settings.decks.filter((deck) => deck.enabled);
	}

	private progressFor(deckId: string): DeckProgress {
		const existing = this.host.settings.perDeck[deckId];
		if (existing) return existing;
		const deck = this.host.settings.decks.find((item) => item.id === deckId);
		const created: DeckProgress = {
			index: 0,
			shuffle: deck?.shuffleDefault ?? false,
			seed: Date.now(),
		};
		this.host.settings.perDeck[deckId] = created;
		return created;
	}

	private buildChrome(): void {
		this.headerEl = this.contentEl.createDiv({ cls: "table-cards-header" });
		const lead = this.headerEl.createDiv({ cls: "table-cards-header-lead" });
		lead.createDiv({ cls: "table-cards-kicker", text: this.host.t("modal.kicker") });
		this.deckPickerEl = lead.createDiv({ cls: "table-cards-deck-picker" });
		this.counterEl = this.headerEl.createDiv({
			cls: "table-cards-counter",
			attr: { "aria-live": "polite", "aria-label": this.host.t("modal.progress") },
		});
		const closeBtn = this.headerEl.createEl("button", {
			cls: "table-cards-icon-btn",
			attr: { "aria-label": this.host.t("modal.close") },
		});
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => this.close());

		const track = this.contentEl.createDiv({
			cls: "table-cards-progress",
			attr: { role: "progressbar", "aria-label": this.host.t("modal.progress") },
		});
		this.progressEl = track.createDiv({ cls: "table-cards-progress-bar" });
		this.stageEl = this.contentEl.createDiv({ cls: "table-cards-stage" });

		this.footerEl = this.contentEl.createDiv({ cls: "table-cards-footer" });
		const prev = this.footerEl.createEl("button", {
			cls: "table-cards-nav-btn",
			attr: { "aria-label": this.host.t("modal.prev") },
		});
		setIcon(prev, "chevron-left");
		prev.createSpan({ text: this.host.t("modal.prev") });
		prev.addEventListener("click", () => void this.step(-1));

		this.shuffleBtn = this.footerEl.createEl("button", {
			cls: "table-cards-shuffle-btn",
			attr: { "aria-label": this.host.t("modal.shuffle"), "aria-pressed": "false" },
		});
		setIcon(this.shuffleBtn, "shuffle");
		this.shuffleBtn.addEventListener("click", () => void this.toggleShuffle());

		const next = this.footerEl.createEl("button", {
			cls: "table-cards-nav-btn table-cards-nav-next",
			attr: { "aria-label": this.host.t("modal.next") },
		});
		next.createSpan({ text: this.host.t("modal.next") });
		setIcon(next, "chevron-right");
		next.addEventListener("click", () => void this.step(1));
	}

	private registerKeys(): void {
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

	private async selectDeck(deckId: string | null): Promise<void> {
		const loadVersion = ++this.loadVersion;
		const decks = this.enabledDecks();
		const selectedDeck = decks.find((deck) => deck.id === deckId) ?? decks[0] ?? null;
		this.deck = selectedDeck;
		this.renderDeckPicker(decks);
		if (!selectedDeck) {
			this.cards = [];
			this.render();
			return;
		}
		this.host.settings.lastDeckId = selectedDeck.id;
		const result = await loadDeckData(this.app, selectedDeck);
		if (loadVersion !== this.loadVersion || this.deck?.id !== selectedDeck.id) return;
		const progress = this.progressFor(selectedDeck.id);
		this.cards = orderCards(result.cards, progress.shuffle, progress.seed);
		progress.index = clampCardIndex(progress.index, this.cards.length);
		await this.host.saveSettings();
		if (loadVersion !== this.loadVersion || this.deck?.id !== selectedDeck.id) return;
		this.render();
	}

	private renderDeckPicker(decks: Deck[]): void {
		this.deckPicker?.destroy();
		this.deckPicker = null;
		this.deckPickerEl.empty();
		if (!this.deck) return;
		this.deckPicker = new Listbox(this.deckPickerEl, {
			id: this.deckPickerId,
			label: this.host.t("modal.deck"),
			value: this.deck.id,
			options: decks.map((deck) => ({ value: deck.id, label: deck.name })),
			onChange: (id) => void this.selectDeck(id),
		});
	}

	private currentCard(): Card | null {
		if (!this.deck || this.cards.length === 0) return null;
		return this.cards[clampCardIndex(this.progressFor(this.deck.id).index, this.cards.length)] ?? null;
	}

	private render(): void {
		this.applyLook();
		const version = ++this.renderVersion;
		const total = this.cards.length;
		const progress = this.deck ? this.progressFor(this.deck.id) : null;
		const index = !progress || total === 0 ? 0 : clampCardIndex(progress.index, total) + 1;
		this.counterEl.setText(`${index} / ${total}`);
		const ratio = total === 0 ? 0 : index / total;
		this.progressEl.setCssProps({ width: `${Math.round(ratio * 100)}%` });
		this.progressEl.parentElement?.setAttr("aria-valuemin", "0");
		this.progressEl.parentElement?.setAttr("aria-valuemax", String(total));
		this.progressEl.parentElement?.setAttr("aria-valuenow", String(index));
		this.shuffleBtn.toggleClass("is-active", progress?.shuffle ?? false);
		this.shuffleBtn.setAttr("aria-pressed", String(progress?.shuffle ?? false));
		this.updateStageColumns();
		const current = this.currentCard();
		const resolved = current && this.deck ? resolveCard(current, this.deck.blocks) : null;
		if (!this.component) return;
		void renderCard(this.stageEl, resolved, {
			app: this.app,
			component: this.component,
			appearance: resolveDeckAppearance(this.host.settings.appearance, this.deck?.appearance),
			t: this.host.t,
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
		if (!this.deck || this.cards.length === 0) return;
		const progress = this.progressFor(this.deck.id);
		progress.index = clampCardIndex(progress.index + delta, this.cards.length);
		this.render();
		await this.host.saveSettings();
	}

	private async toggleShuffle(): Promise<void> {
		const deck = this.deck;
		if (!deck) return;
		const loadVersion = ++this.loadVersion;
		const progress = this.progressFor(deck.id);
		progress.shuffle = !progress.shuffle;
		progress.seed = Date.now();
		const shuffle = progress.shuffle;
		const seed = progress.seed;
		const result = await loadDeckData(this.app, deck);
		if (loadVersion !== this.loadVersion || this.deck?.id !== deck.id) return;
		this.cards = orderCards(result.cards, shuffle, seed);
		progress.index = 0;
		this.render();
		await this.host.saveSettings();
	}
}
