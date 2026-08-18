import { Modal, Plugin, PluginSettingTab, Setting, type App } from "obsidian";
import { cloneJson, createBlock, newId, type Deck, type PluginSettings } from "../model";
import type { Translator } from "../i18n";
import { DeckEditorModal } from "../ui/DeckEditorModal";
import { applySizePreset } from "./appearance";
import { createDeck } from "./defaults";
import { loadDeckData } from "../deck/load";

export interface SettingsHost {
	settings: PluginSettings;
	saveSettings: () => Promise<void>;
	getTranslator: () => Translator;
}

class DeleteDeckModal extends Modal {
	constructor(
		app: App,
		private readonly deck: Deck,
		private readonly t: Translator,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.t("settings.deck.deleteTitle"));
		this.contentEl.empty();
		this.contentEl.createEl("p", {
			text: `${this.t("settings.deck.deleteDesc")} “${this.deck.name}”`,
		});
		const actions = this.contentEl.createDiv({ cls: "tc-confirm-actions" });
		const cancel = actions.createEl("button", { text: this.t("settings.deck.cancel"), attr: { type: "button" } });
		cancel.addEventListener("click", () => this.close());
		const remove = actions.createEl("button", {
			text: this.t("settings.deck.delete"),
			cls: "mod-warning",
			attr: { type: "button" },
		});
		remove.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});
	}
}

export class TableCardsSettingTab extends PluginSettingTab {
	plugin: SettingsHost;

	constructor(app: App, plugin: Plugin & SettingsHost) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const t = this.plugin.getTranslator();
		containerEl.empty();
		containerEl.addClass("table-cards-settings");

		new Setting(containerEl)
			.setName(t("settings.language.name"))
			.setDesc(t("settings.language.desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("auto", t("settings.language.auto"))
					.addOption("en", t("settings.language.en"))
					.addOption("ru", t("settings.language.ru"))
					.setValue(this.plugin.settings.locale)
					.onChange((value) => {
						if (value !== "auto" && value !== "en" && value !== "ru") return;
						this.plugin.settings.locale = value;
						void this.plugin.saveSettings().then(() => this.display());
					});
			});

		this.renderDefaults(containerEl, t);

		new Setting(containerEl)
			.setName(t("settings.decks.heading"))
			.setHeading()
			.addButton((button) => {
				button.setButtonText(t("settings.decks.add")).setCta().onClick(() => {
					const deck = createDeck({ name: t("deck.new"), blocks: [] });
					this.plugin.settings.decks.push(deck);
					void this.plugin.saveSettings().then(() => {
						this.display();
						this.openEditor(deck);
					});
				});
			});

		for (const deck of this.plugin.settings.decks) this.renderDeck(containerEl, deck, t);
	}

	private renderDefaults(containerEl: HTMLElement, t: Translator): void {
		const details = containerEl.createEl("details", { cls: "tc-settings-defaults" });
		details.createEl("summary", { text: t("settings.defaults") });
		const body = details.createDiv({ cls: "tc-settings-defaults-body" });
		const look = this.plugin.settings.appearance;
		new Setting(body).setName(t("settings.appearance.preset")).addDropdown((dropdown) => {
			dropdown
				.addOption("obsidian", t("settings.appearance.preset.obsidian"))
				.addOption("monochrome", t("settings.appearance.preset.monochrome"))
				.addOption("custom", t("settings.appearance.preset.custom"))
				.setValue(look.preset)
				.onChange((value) => {
					if (value !== "obsidian" && value !== "monochrome" && value !== "custom") return;
					look.preset = value;
					void this.plugin.saveSettings();
				});
		});
		new Setting(body).setName(t("settings.appearance.size")).addDropdown((dropdown) => {
			dropdown
				.addOption("compact", t("settings.appearance.size.compact"))
				.addOption("comfort", t("settings.appearance.size.comfort"))
				.addOption("large", t("settings.appearance.size.large"))
				.setValue(look.size)
				.onChange((value) => {
					if (value !== "compact" && value !== "comfort" && value !== "large") return;
					applySizePreset(look, value);
					void this.plugin.saveSettings();
				});
		});
		new Setting(body).setName(t("settings.appearance.overlay")).addDropdown((dropdown) => {
			dropdown
				.addOption("auto", t("settings.appearance.overlay.auto"))
				.addOption("center", t("settings.appearance.overlay.center"))
				.addOption("full", t("settings.appearance.overlay.full"))
				.setValue(look.overlay)
				.onChange((value) => {
					if (value !== "auto" && value !== "center" && value !== "full") return;
					look.overlay = value;
					void this.plugin.saveSettings();
				});
		});
	}

	private openEditor(deck: Deck): void {
		new DeckEditorModal(this.app, {
			settings: this.plugin.settings,
			saveSettings: () => this.plugin.saveSettings(),
			getTranslator: () => this.plugin.getTranslator(),
			onDeckSaved: () => this.display(),
		}, deck).open();
	}

	private duplicate(deck: Deck): Deck {
		const copy = cloneJson(deck);
		return createDeck({
			...copy,
			id: newId("deck"),
			name: `${deck.name} ${this.plugin.getTranslator()("settings.deck.copySuffix")}`,
			sources: copy.sources.map((source) => ({ ...source, id: newId("source") })),
			blocks: copy.blocks.map((block) => createBlock({ ...block, id: newId("block") })),
		});
	}

	private renderDeck(containerEl: HTMLElement, deck: Deck, t: Translator): void {
		const wrap = containerEl.createDiv({ cls: "table-cards-deck-settings" });
		const description = `${deck.sources.length} ${t("settings.deck.sources")} · ${deck.blocks.length} ${t("settings.deck.blocks")}`;
		const setting = new Setting(wrap)
			.setName(deck.name)
			.setDesc(description)
			.addToggle((toggle) => {
				toggle.setValue(deck.enabled).onChange((value) => {
					deck.enabled = value;
					void this.plugin.saveSettings();
				});
			})
			.addButton((button) => {
				button.setButtonText(t("settings.deck.edit")).setCta().onClick(() => this.openEditor(deck));
			})
			.addButton((button) => {
				button.setButtonText(t("settings.deck.duplicate")).onClick(() => {
					this.plugin.settings.decks.push(this.duplicate(deck));
					void this.plugin.saveSettings().then(() => this.display());
				});
			})
			.addButton((button) => {
				button.setIcon("trash-2").setTooltip(t("settings.deck.delete")).setWarning().onClick(() => {
					new DeleteDeckModal(this.app, deck, t, () => {
						this.plugin.settings.decks = this.plugin.settings.decks.filter((item) => item.id !== deck.id);
						delete this.plugin.settings.perDeck[deck.id];
						if (this.plugin.settings.lastDeckId === deck.id) {
							this.plugin.settings.lastDeckId = this.plugin.settings.decks[0]?.id ?? null;
						}
						void this.plugin.saveSettings().then(() => this.display());
					}).open();
				});
			});
		void loadDeckData(this.app, deck)
			.then((result) => {
				if (!wrap.isConnected) return;
				const warnings =
					result.diagnostics.length +
					result.profiles.reduce((total, profile) => total + profile.warnings.length, 0);
				setting.setDesc(
					warnings > 0
						? `${description} · ${warnings} ${t("settings.deck.warnings")}`
						: description,
				);
			})
			.catch(() => {
				if (wrap.isConnected) setting.setDesc(`${description} · ${t("editor.loadError")}`);
			});
	}
}
