import { setIcon } from "obsidian";
import { formatUiNumber, type Translator } from "../../i18n";
import { RIBBON_ICONS, type RibbonIcon, type UiLocale } from "../../model";
import type { SetupState } from "../../setup/state";

export interface FinishFormOptions {
	state: SetupState;
	t: Translator;
	locale: UiLocale;
	error: string | null;
	summary: string;
	onName: (name: string) => void;
	onIcon: (icon: RibbonIcon) => void;
	onRibbon: (visible: boolean) => void;
}

export function renderFinishForm(parent: HTMLElement, options: FinishFormOptions): void {
	const form = parent.createDiv({ cls: "tc-setup-finish-form" });
	const nameLabel = form.createEl("label", { cls: "tc-setup-field" });
	nameLabel.createSpan({ text: options.t("setup.deckName") });
	const name = nameLabel.createEl("input", {
		type: "text",
		attr: { value: options.state.deckName, autocomplete: "off" },
	});
	name.addEventListener("input", () => options.onName(name.value));

	form.createDiv({ cls: "tc-setup-field-label", text: options.t("ribbon.icon") });
	const icons = form.createDiv({
		cls: "tc-setup-icons",
		attr: { role: "group", "aria-label": options.t("ribbon.icon") },
	});
	for (const [index, iconName] of RIBBON_ICONS.entries()) {
		const icon = icons.createEl("button", {
			attr: {
				type: "button",
				"aria-label": `${options.t("ribbon.icon")} ${formatUiNumber(index + 1, options.locale)}`,
				"aria-pressed": String(options.state.ribbonIcon === iconName),
			},
		});
		setIcon(icon, iconName);
		icon.addEventListener("click", () => options.onIcon(iconName));
	}

	const ribbon = form.createEl("label", { cls: "tc-setup-ribbon" });
	const checkbox = ribbon.createEl("input", { type: "checkbox" });
	checkbox.checked = options.state.ribbonVisible;
	checkbox.addEventListener("change", () => options.onRibbon(checkbox.checked));
	ribbon.createSpan({ text: options.t("ribbon.show") });
	form.createDiv({ cls: "tc-setup-hint", text: options.t("setup.ribbonHint") });
	form.createDiv({ cls: "tc-setup-final-summary", text: options.summary });
	if (options.error) {
		form.createDiv({ cls: "tc-setup-save-error", text: options.error, attr: { role: "alert" } });
	}
}
