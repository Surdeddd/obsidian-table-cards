import { Plugin } from "obsidian";
import { appLanguage, createTranslator, resolveUiLocale, type Translator } from "./i18n";
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
import { renamedDeckSources } from "./deck/paths";
import {
	SettingsPersistence,
	type SettingsMutation,
} from "./settings/persistence";

export default class TableCardsPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private setupWizard: SetupWizard | null = null;
	private readonly setupSavedCallbacks = new SetupSavedCallbacks();
	private ribbonDecks: RibbonDecks | null = null;
	private settingsPersistence: SettingsPersistence | null = null;

	async onload(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
		this.settingsPersistence = new SettingsPersistence(this.settings, {
			persist: (candidate) => this.saveData(candidate),
			publish: (candidate) => { this.settings = candidate; },
			reconcile: (candidate) => this.ribbonDecks?.sync(candidate.decks),
		});
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

		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			void this.followVaultRename(oldPath, file.path);
		}));

		if (shouldAutoOpenSetup(this.settings)) {
			this.app.workspace.onLayoutReady(() => this.openSetup());
		}
	}

	onunload(): void {
		this.ribbonDecks?.destroy();
		this.ribbonDecks = null;
	}

	private async followVaultRename(oldPath: string, newPath: string): Promise<void> {
		const affected = this.settings.decks.some((deck) => renamedDeckSources(deck.sources, oldPath, newPath));
		if (!affected) return;
		await this.updateSettings((settings) => {
			for (const deck of settings.decks) {
				const moved = renamedDeckSources(deck.sources, oldPath, newPath);
				if (moved) deck.sources = moved;
			}
		}).catch(() => undefined);
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

	updateSettings(mutate: SettingsMutation): Promise<void> {
		if (!this.settingsPersistence) return Promise.reject(new Error("Settings persistence is not ready"));
		return this.settingsPersistence.update(mutate);
	}

	getTranslator(): Translator {
		return createTranslator(this.getLocale());
	}

	getLocale(): UiLocale {
		return resolveUiLocale(this.settings.locale, appLanguage());
	}
}
