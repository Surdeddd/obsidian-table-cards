import type { Translator } from "../../../i18n";

export type ContrastGrade = "aaa" | "aa" | "fail";

function rgb(hex: string): [number, number, number] | null {
	if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	];
}

function luminance(hex: string): number {
	const channels = rgb(hex);
	if (!channels) return 0;
	const linear = channels.map((channel) => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

export function contrastRatio(foreground: string, background: string): number {
	const first = luminance(foreground);
	const second = luminance(background);
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + 0.05) / (darker + 0.05);
}

export function contrastGrade(ratio: number, largeText: boolean): ContrastGrade {
	if (ratio >= 7) return "aaa";
	if (ratio >= (largeText ? 3 : 4.5)) return "aa";
	return "fail";
}

export interface ColorFieldOptions {
	id: string;
	label: string;
	value: string;
	against?: string;
	largeText?: boolean;
	t: Translator;
	onChange: (value: string) => void;
}

export class ColorField {
	constructor(parent: HTMLElement, options: ColorFieldOptions) {
		const root = parent.createDiv({ cls: "tc-color-field" });
		root.createEl("label", { text: options.label, attr: { for: `${options.id}-text` } });
		const controls = root.createDiv({ cls: "tc-color-controls" });
		const picker = controls.createEl("input", {
			type: "color",
			cls: "tc-color-picker",
			attr: { id: options.id, "aria-label": options.label },
		});
		picker.value = options.value;
		const text = controls.createEl("input", {
			type: "text",
			cls: "tc-color-text",
			attr: {
				id: `${options.id}-text`,
				value: options.value,
				spellcheck: "false",
				inputmode: "text",
			},
		});
		const validation = root.createDiv({ cls: "tc-color-validation", attr: { "aria-live": "polite" } });

		const renderValidation = (value: string): void => {
			validation.empty();
			root.toggleClass("is-invalid", !rgb(value));
			if (!rgb(value)) {
				validation.setText(options.t("editor.color.invalid"));
				return;
			}
			if (!options.against || !rgb(options.against)) return;
			const ratio = contrastRatio(value, options.against);
			const grade = contrastGrade(ratio, options.largeText ?? false);
			validation.dataset.grade = grade;
			validation.setText(
				`${options.t("editor.color.contrast")} ${ratio.toFixed(2)}:1 · ${options.t(`editor.color.${grade}`)}`,
			);
		};
		const commit = (value: string): void => {
			if (!rgb(value)) {
				renderValidation(value);
				return;
			}
			const normalized = value.toLowerCase();
			picker.value = normalized;
			text.value = normalized;
			renderValidation(normalized);
			options.onChange(normalized);
		};
		picker.addEventListener("change", () => commit(picker.value));
		text.addEventListener("input", () => renderValidation(text.value));
		text.addEventListener("change", () => commit(text.value));
		renderValidation(options.value);
	}
}
