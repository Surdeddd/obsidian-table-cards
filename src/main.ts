import { Plugin, getLanguage } from "obsidian";
import { createTranslator, resolveUiLocale, type Translator } from "./i18n";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings/defaults";
import { TableCardsSettingTab } from "./settings/settings-tab";
import type { Deck, ParsedTable, PluginSettings, UiLocale } from "./model";
import { CardsModal } from "./ui/CardsModal";
import { DeckEditorModal } from "./ui/DeckEditorModal";
import { SetupWizard } from "./ui/SetupWizard";
import { RibbonDecks } from "./ui/RibbonDecks";
import { shouldAutoOpenSetup, shouldOpenSetupForCards } from "./setup/state";
import { SetupSavedCallbacks } from "./setup/session";
import type { DeckOpenRequest } from "./session/launcher-state";
import { exactTableOpenRequest } from "./editor/draft-session";

export default class TableCardsPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private setupWizard: SetupWizard | null = null;
	private readonly setupSavedCallbacks = new SetupSavedCallbacks();
	private ribbonDecks: RibbonDecks | null = null;

	async onload(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
		this.ribbonDecks = new RibbonDecks({
			add: this.addRibbonIcon.bind(this),
			openDeck: (deckId) => this.openCards({ deckId, lockedDeck: true }),
		});

		this.addCommand({
			id: "open",
			name: this.getTranslator()("command.open"),
			callback: () => this.openCards({ lockedDeck: false }),
		});

		this.addCommand({
			id: "edit-layout",
			name: this.getTranslator()("settings.deck.edit"),
			callback: () => this.openEditor(),
		});

		this.addCommand({
			id: "create-with-setup",
			name: this.getTranslator()("command.createWithSetup"),
			callback: () => this.openSetup(),
		});

		this.addRibbonIcon("gallery-horizontal", this.getTranslator()("ribbon.open"), () => {
			this.openCards({ lockedDeck: false });
		});
		this.ribbonDecks.sync(this.settings.decks);

		this.addSettingTab(new TableCardsSettingTab(this.app, this));

		if (shouldAutoOpenSetup(this.settings)) {
			this.app.workspace.onLayoutReady(() => this.openSetup());
		}
	}

	onunload(): void {
		this.ribbonDecks?.destroy();
		this.ribbonDecks = null;
	}

	openCards(request: DeckOpenRequest = { lockedDeck: false }): void {
		if (shouldOpenSetupForCards(this.settings)) {
			this.openSetup();
			return;
		}
		new CardsModal(this.app, this, request).open();
	}

	openDraftSession(deck: Deck, table: ParsedTable): void {
		new CardsModal(this.app, this, exactTableOpenRequest(deck, table)).open();
	}

	openSetup(onSaved?: () => void): void {
		this.setupSavedCallbacks.add(onSaved);
		if (this.setupWizard) return;
		this.setupWizard = new SetupWizard(this.app, this);
		this.setupWizard.open();
	}

	onSetupClosed(): void {
		this.setupWizard = null;
		this.setupSavedCallbacks.clear();
	}

	onSetupSaved(): void {
		this.setupSavedCallbacks.notifySaved();
	}

	openEditor(): void {
		const deck =
			this.settings.decks.find((item) => item.id === this.settings.lastDeckId) ??
			this.settings.decks[0];
		if (!deck) {
			this.openSetup();
			return;
		}
		new DeckEditorModal(this.app, this, deck).open();
	}

	async saveSettings(settings: PluginSettings = this.settings): Promise<void> {
		await this.saveData(settings);
		this.settings = settings;
		this.ribbonDecks?.sync(settings.decks);
	}

	getTranslator(): Translator {
		return createTranslator(this.getLocale());
	}

	getLocale(): UiLocale {
		return resolveUiLocale(this.settings.locale, getLanguage() || "en");
	}
}
