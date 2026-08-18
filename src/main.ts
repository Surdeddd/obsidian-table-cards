import { Plugin, getLanguage } from "obsidian";
import { createTranslator, resolveUiLocale, type Translator } from "./i18n";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings/defaults";
import { TableCardsSettingTab } from "./settings/settings-tab";
import type { PluginSettings } from "./model";
import { CardsModal } from "./ui/CardsModal";
import { DeckEditorModal } from "./ui/DeckEditorModal";

export default class TableCardsPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

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

		this.addRibbonIcon("gallery-horizontal", this.getTranslator()("ribbon.open"), () => {
			this.openCards();
		});

		this.addSettingTab(new TableCardsSettingTab(this.app, this));
	}

	openCards(): void {
		new CardsModal(this.app, {
			settings: this.settings,
			saveSettings: () => this.saveSettings(),
			t: this.getTranslator(),
		}).open();
	}

	openEditor(): void {
		const deck =
			this.settings.decks.find((item) => item.id === this.settings.lastDeckId) ??
			this.settings.decks[0];
		if (!deck) {
			return;
		}
		new DeckEditorModal(this.app, this, deck).open();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	getTranslator(): Translator {
		const locale = resolveUiLocale(this.settings.locale, getLanguage() || "en");
		return createTranslator(locale);
	}
}
