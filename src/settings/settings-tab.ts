import { Modal, Plugin, PluginSettingTab, Setting, getLanguage, type App } from "obsidian";
import {
	cloneJson,
	createBlock,
	newId,
	RIBBON_ICONS,
	UI_LOCALES,
	type Deck,
	type LocaleMode,
	type ParsedTable,
	type PluginSettings,
	type RibbonIcon,
	type UiLocale,
} from "../model";
import {
	applyUiChromeDirection,
	applyUserDataDirection,
	formatUiNumber,
	ribbonIconLabel,
	resolveUiLocale,
	type TranslationKey,
	type Translator,
} from "../i18n";
import { DeckEditorModal } from "../ui/DeckEditorModal";
import { applySizePreset } from "./appearance";
import { createDeck } from "./defaults";
import { loadDeckData } from "../deck/load";
import { Listbox } from "../ui/editor/controls/Listbox";
import type { SettingsMutation } from "./persistence";

const LANGUAGE_KEYS: Record<UiLocale, TranslationKey> = {
	en: "settings.language.en",
	ru: "settings.language.ru",
	uk: "settings.language.uk",
	es: "settings.language.es",
	de: "settings.language.de",
	fr: "settings.language.fr",
	"pt-BR": "settings.language.pt-BR",
	it: "settings.language.it",
	pl: "settings.language.pl",
	tr: "settings.language.tr",
	"zh-CN": "settings.language.zh-CN",
	"zh-TW": "settings.language.zh-TW",
	ja: "settings.language.ja",
	ko: "settings.language.ko",
	ar: "settings.language.ar",
	hi: "settings.language.hi",
};

export interface SettingsHost {
	settings: PluginSettings;
	updateSettings: (mutate: SettingsMutation) => Promise<void>;
	getTranslator: () => Translator;
	getLocale: () => UiLocale;
	openSetup: (onSaved?: () => void) => void;
	openDraftSession: (deck: Deck, table: ParsedTable) => void;
}

export function moveDeck(decks: Deck[], deckId: string, offset: -1 | 1): boolean {
	const from = decks.findIndex((deck) => deck.id === deckId);
	const to = from + offset;
	if (from < 0 || to < 0 || to >= decks.length) return false;
	const [deck] = decks.splice(from, 1);
	if (!deck) return false;
	decks.splice(to, 0, deck);
	return true;
}

export function mutateDeckRibbon(
	settings: PluginSettings,
	deckId: string,
	patch: Partial<Deck["ribbon"]>,
): boolean {
	const deck = settings.decks.find((item) => item.id === deckId);
	if (!deck) return false;
	deck.ribbon = { ...deck.ribbon, ...patch };
	return true;
}

export function mutateDeckOrder(
	settings: PluginSettings,
	deckId: string,
	offset: -1 | 1,
): boolean {
	return moveDeck(settings.decks, deckId, offset);
}

class DeleteDeckModal extends Modal {
	constructor(
		app: App,
		private readonly deck: Deck,
		private readonly t: Translator,
		private readonly locale: UiLocale,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		applyUiChromeDirection(this.modalEl, this.locale);
		this.titleEl.setText(this.t("settings.deck.deleteTitle"));
		this.contentEl.empty();
		const description = this.contentEl.createEl("p");
		description.createSpan({ text: `${this.t("settings.deck.deleteDesc")} “` });
		const deckName = description.createSpan({ text: this.deck.name });
		applyUserDataDirection(deckName);
		description.createSpan({ text: "”" });
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
		const locale = resolveUiLocale(this.plugin.settings.locale, getLanguage() || "en");
		containerEl.empty();
		containerEl.addClass("table-cards-settings");
		applyUiChromeDirection(containerEl, locale);

		const languageSetting = new Setting(containerEl)
			.setName(t("settings.language.name"))
			.setDesc(t("settings.language.desc"));
		new Listbox<LocaleMode>(languageSetting.controlEl, {
			id: "table-cards-language",
			label: t("settings.language.name"),
			value: this.plugin.settings.locale,
			options: [
				{ value: "auto", label: t("settings.language.auto") },
				...UI_LOCALES.map((value) => ({ value, label: t(LANGUAGE_KEYS[value]) })),
			],
			searchable: true,
			onChange: (value) => {
				this.updateAndDisplay((settings) => { settings.locale = value; });
			},
		});
		languageSetting.controlEl.querySelector<HTMLElement>(".tc-listbox > label")?.addClass("tc-visually-hidden");

		this.renderDefaults(containerEl, t);

		new Setting(containerEl)
			.setName(t("settings.decks.heading"))
			.setHeading()
			.addButton((button) => {
				button.setButtonText(t("command.createWithSetup")).setCta().onClick(() => {
					this.plugin.openSetup(() => this.display());
				});
			})
			.addButton((button) => {
				button.setButtonText(t("settings.decks.add")).onClick(() => {
					let createdId: string | null = null;
					this.updateAndDisplay((settings) => {
						const deck = createDeck({ name: t("deck.new"), blocks: [] });
						createdId = deck.id;
						settings.decks.push(deck);
					}, () => {
						const deck = this.plugin.settings.decks.find((item) => item.id === createdId);
						if (deck) this.openEditor(deck);
					});
				});
			});

		for (const deck of this.plugin.settings.decks) this.renderDeck(containerEl, deck, t, locale);
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
					this.updateAndDisplay((settings) => { settings.appearance.preset = value; });
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
					this.updateAndDisplay((settings) => applySizePreset(settings.appearance, value));
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
					this.updateAndDisplay((settings) => { settings.appearance.overlay = value; });
				});
		});
	}

	private openEditor(deck: Deck): void {
		new DeckEditorModal(this.app, {
			settings: this.plugin.settings,
			updateSettings: (mutate) => this.plugin.updateSettings(mutate),
			getTranslator: () => this.plugin.getTranslator(),
			getLocale: () => this.plugin.getLocale(),
			onDeckSaved: () => this.display(),
			onOpenDraftSession: (draft, table) => this.plugin.openDraftSession(draft, table),
		}, deck).open();
	}

	private updateAndDisplay(mutate: SettingsMutation, onSuccess?: () => void): void {
		void this.plugin.updateSettings(mutate).then(
			() => {
				this.display();
				onSuccess?.();
			},
			() => this.display(),
		);
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

	private renderDeck(containerEl: HTMLElement, deck: Deck, t: Translator, locale: UiLocale): void {
		const wrap = containerEl.createDiv({ cls: "table-cards-deck-settings" });
		const description = `${formatUiNumber(deck.sources.length, locale)} ${t("settings.deck.sources")} · ${formatUiNumber(deck.blocks.length, locale)} ${t("settings.deck.blocks")}`;
		const setting = new Setting(wrap)
			.setName(deck.name)
			.setDesc(description)
			.addToggle((toggle) => {
				toggle.setValue(deck.enabled).onChange((value) => {
					this.updateAndDisplay((settings) => {
						const current = settings.decks.find((item) => item.id === deck.id);
						if (current) current.enabled = value;
					});
				});
			})
			.addButton((button) => {
				button.setButtonText(t("settings.deck.edit")).setCta().onClick(() => this.openEditor(deck));
			})
			.addButton((button) => {
				button.setButtonText(t("settings.deck.duplicate")).onClick(() => {
					this.updateAndDisplay((settings) => {
						const current = settings.decks.find((item) => item.id === deck.id);
						if (current) settings.decks.push(this.duplicate(current));
					});
				});
			})
			.addButton((button) => {
				button.setIcon("trash-2").setTooltip(t("settings.deck.delete")).setWarning().onClick(() => {
					new DeleteDeckModal(this.app, deck, t, locale, () => {
						this.updateAndDisplay((settings) => {
							settings.decks = settings.decks.filter((item) => item.id !== deck.id);
							delete settings.perDeck[deck.id];
							if (settings.lastDeckId === deck.id) {
								settings.lastDeckId = settings.decks[0]?.id ?? null;
							}
						});
					}).open();
				});
			})
			.addExtraButton((button) => {
				const index = this.plugin.settings.decks.indexOf(deck);
				button
					.setIcon("arrow-up")
					.setTooltip(t("ribbon.moveUp"))
					.setDisabled(index <= 0)
					.onClick(() => {
						this.updateAndDisplay((settings) => { mutateDeckOrder(settings, deck.id, -1); });
					});
			})
			.addExtraButton((button) => {
				const index = this.plugin.settings.decks.indexOf(deck);
				button
					.setIcon("arrow-down")
					.setTooltip(t("ribbon.moveDown"))
					.setDisabled(index < 0 || index >= this.plugin.settings.decks.length - 1)
					.onClick(() => {
						this.updateAndDisplay((settings) => { mutateDeckOrder(settings, deck.id, 1); });
					});
			});
		new Setting(wrap)
			.setName(t("ribbon.show"))
			.setDesc(t("ribbon.pinHint"))
			.addToggle((toggle) => {
				toggle.setValue(deck.ribbon.visible).setDisabled(!deck.enabled).onChange((value) => {
					this.updateAndDisplay((settings) => { mutateDeckRibbon(settings, deck.id, { visible: value }); });
				});
			});
		const iconSetting = new Setting(wrap).setName(t("ribbon.icon"));
		new Listbox<RibbonIcon>(iconSetting.controlEl, {
			id: `table-cards-ribbon-icon-${deck.id}`,
			label: t("ribbon.icon"),
			value: deck.ribbon.icon,
			options: RIBBON_ICONS.map((icon) => ({ value: icon, label: ribbonIconLabel(t, icon) })),
			onChange: (icon) => {
				this.updateAndDisplay((settings) => { mutateDeckRibbon(settings, deck.id, { icon }); });
			},
		});
		iconSetting.controlEl.querySelector<HTMLElement>(".tc-listbox > label")?.addClass("tc-visually-hidden");
		applyUserDataDirection(setting.nameEl);
		void loadDeckData(this.app, deck, {
			untitledTableLabel: (number) => t("table.untitled", {
				number: formatUiNumber(number, locale),
			}),
		})
			.then((result) => {
				if (!wrap.isConnected) return;
				const warnings =
					result.diagnostics.length +
					result.profiles.reduce((total, profile) => total + profile.warnings.length, 0);
				setting.setDesc(
					warnings > 0
						? `${description} · ${formatUiNumber(warnings, locale)} ${t("settings.deck.warnings")}`
						: description,
				);
			})
			.catch(() => {
				if (wrap.isConnected) setting.setDesc(`${description} · ${t("editor.loadError")}`);
			});
	}
}
