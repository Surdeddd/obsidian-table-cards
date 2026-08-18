import { Plugin, getLanguage } from "obsidian";
import { createTranslator, resolveUiLocale, type Translator } from "./i18n";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings/defaults";
import { TableCardsSettingTab } from "./settings/settings-tab";
import type { PluginSettings, UiLocale } from "./model";
import { CardsModal } from "./ui/CardsModal";
import { DeckEditorModal } from "./ui/DeckEditorModal";
import { SetupWizard } from "./ui/SetupWizard";
import { shouldAutoOpenSetup, shouldOpenSetupForCards } from "./setup/state";

export default class TableCardsPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private setupWizard: SetupWizard | null = null;

	async onload(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());

		this.addCommand({
			id: "open",
			name: this.getTranslator()("command.open"),
			callback: () => this.openCards(),
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
			this.openCards();
		});

		this.addSettingTab(new TableCardsSettingTab(this.app, this));

		if (shouldAutoOpenSetup(this.settings)) {
			this.app.workspace.onLayoutReady(() => this.openSetup());
		}
	}

	openCards(): void {
		if (shouldOpenSetupForCards(this.settings)) {
			this.openSetup();
			return;
		}
		new CardsModal(this.app, this).open();
	}

	openSetup(): void {
		if (this.setupWizard) return;
		this.setupWizard = new SetupWizard(this.app, this);
		this.setupWizard.open();
	}

	onSetupClosed(): void {
		this.setupWizard = null;
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

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	getTranslator(): Translator {
		return createTranslator(this.getLocale());
	}

	getLocale(): UiLocale {
		return resolveUiLocale(this.settings.locale, getLanguage() || "en");
	}
}
