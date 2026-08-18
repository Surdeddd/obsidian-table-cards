import { setIcon, type App, type Component } from "obsidian";
import type { Translator } from "../../i18n";
import { resolveCard } from "../../layout/resolve";
import type { AppearanceSettings, DeckLoadResult } from "../../model";
import { applyAppearance } from "../../settings/appearance";
import { PRESETS, blocksForPreset, rankPresets, type PresetId } from "../../setup/presets";
import { renderCard } from "../CardView";

export interface PresetChooserOptions {
	app: App;
	component: Component;
	result: DeckLoadResult;
	selectedId: PresetId | null;
	appearance: AppearanceSettings;
	t: Translator;
	isCurrent: () => boolean;
	onSelect: (presetId: PresetId, icon: (typeof PRESETS)[number]["icon"]) => void;
}

export function renderPresetChooser(parent: HTMLElement, options: PresetChooserOptions): void {
	const ranked = rankPresets(options.result.profiles);
	const list = parent.createDiv({ cls: "tc-setup-presets" });
	for (const [index, score] of ranked.entries()) {
		const preset = PRESETS.find((item) => item.id === score.id);
		if (!preset) continue;
		const option = list.createEl("button", {
			cls: "tc-setup-preset",
			attr: { type: "button", "aria-pressed": String(options.selectedId === preset.id) },
		});
		const icon = option.createSpan({ cls: "tc-setup-preset-icon", attr: { "aria-hidden": "true" } });
		setIcon(icon, preset.icon);
		const copy = option.createSpan({ cls: "tc-setup-preset-copy" });
		const name = copy.createSpan({ cls: "tc-setup-preset-name", text: options.t(preset.nameKey) });
		if (index === 0) name.createSpan({ cls: "tc-setup-recommended", text: options.t("setup.recommended") });
		copy.createSpan({ cls: "tc-setup-preset-description", text: options.t(preset.descriptionKey) });
		if (score.reasons.length > 0) {
			copy.createSpan({
				cls: "tc-setup-preset-reasons",
				text: score.reasons.map((key) => options.t(key)).join(" · "),
			});
		}
		option.addEventListener("click", () => options.onSelect(preset.id, preset.icon));
	}

	const presetId = options.selectedId ?? ranked[0]?.id;
	if (!presetId) return;
	const blocks = blocksForPreset(presetId, options.result.profiles, options.result.cards[0]);
	const card = options.result.cards.find((candidate) => resolveCard(candidate, blocks).skipReason === null);
	if (!card) return;
	const preview = parent.createDiv({ cls: "tc-setup-card-preview", attr: { dir: "auto" } });
	applyAppearance(preview, options.appearance, false);
	void renderCard(preview, resolveCard(card, blocks), {
		app: options.app,
		component: options.component,
		appearance: options.appearance,
		t: options.t,
		isCurrent: options.isCurrent,
		options: { interactiveImages: false },
	});
}
