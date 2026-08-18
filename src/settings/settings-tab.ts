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
	saveSettings: (settings?: PluginSettings) => Promise<void>;
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

export function updateDeckRibbon(
	settings: PluginSettings,
	deckId: string,
	patch: Partial<Deck["ribbon"]>,
): PluginSettings | null {
	const next = cloneJson(settings);
	const deck = next.decks.find((item) => item.id === deckId);
	if (!deck) return null;
	deck.ribbon = { ...deck.ribbon, ...patch };
	return next;
}

export function reorderDeckSettings(
	settings: PluginSettings,
	deckId: string,
	offset: -1 | 1,
): PluginSettings | null {
	const next = cloneJson(settings);
	return moveDeck(next.decks, deckId, offset) ? next : null;
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
				this.plugin.settings.locale = value;
				void this.plugin.saveSettings().then(() => this.display());
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
					const deck = createDeck({ name: t("deck.new"), blocks: [] });
					this.plugin.settings.decks.push(deck);
					void this.plugin.saveSettings().then(() => {
						this.display();
						this.openEditor(deck);
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
			getLocale: () => this.plugin.getLocale(),
			onDeckSaved: () => this.display(),
			onOpenDraftSession: (draft, table) => this.plugin.openDraftSession(draft, table),
		}, deck).open();
	}

	private saveDeckCandidate(candidate: PluginSettings): void {
		void this.plugin.saveSettings(candidate).then(
			() => this.display(),
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
					new DeleteDeckModal(this.app, deck, t, locale, () => {
						this.plugin.settings.decks = this.plugin.settings.decks.filter((item) => item.id !== deck.id);
						delete this.plugin.settings.perDeck[deck.id];
						if (this.plugin.settings.lastDeckId === deck.id) {
							this.plugin.settings.lastDeckId = this.plugin.settings.decks[0]?.id ?? null;
						}
						void this.plugin.saveSettings().then(() => this.display());
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
						const candidate = reorderDeckSettings(this.plugin.settings, deck.id, -1);
						if (candidate) this.saveDeckCandidate(candidate);
					});
			})
			.addExtraButton((button) => {
				const index = this.plugin.settings.decks.indexOf(deck);
				button
					.setIcon("arrow-down")
					.setTooltip(t("ribbon.moveDown"))
					.setDisabled(index < 0 || index >= this.plugin.settings.decks.length - 1)
					.onClick(() => {
						const candidate = reorderDeckSettings(this.plugin.settings, deck.id, 1);
						if (candidate) this.saveDeckCandidate(candidate);
					});
			});
		new Setting(wrap)
			.setName(t("ribbon.show"))
			.setDesc(t("ribbon.pinHint"))
			.addToggle((toggle) => {
				toggle.setValue(deck.ribbon.visible).setDisabled(!deck.enabled).onChange((value) => {
					const candidate = updateDeckRibbon(this.plugin.settings, deck.id, { visible: value });
					if (candidate) this.saveDeckCandidate(candidate);
				});
			});
		const iconSetting = new Setting(wrap).setName(t("ribbon.icon"));
		new Listbox<RibbonIcon>(iconSetting.controlEl, {
			id: `table-cards-ribbon-icon-${deck.id}`,
			label: t("ribbon.icon"),
			value: deck.ribbon.icon,
			options: RIBBON_ICONS.map((icon) => ({ value: icon, label: ribbonIconLabel(t, icon) })),
			onChange: (icon) => {
				const candidate = updateDeckRibbon(this.plugin.settings, deck.id, { icon });
				if (candidate) this.saveDeckCandidate(candidate);
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
