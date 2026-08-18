import type {
	AppearancePreset,
	AppearanceSettings,
	BorderStyle,
	OverlayMode,
	SizePreset,
} from "../model";

export const SIZE_PRESETS: Record<
	SizePreset,
	Pick<AppearanceSettings, "padding" | "gap" | "wordScale" | "radius">
> = {
	compact: { padding: 14, gap: 8, wordScale: 0.88, radius: 14 },
	comfort: { padding: 22, gap: 14, wordScale: 1, radius: 20 },
	large: { padding: 28, gap: 18, wordScale: 1.22, radius: 24 },
};

export const SIZE_MAX_WIDTH: Record<SizePreset, number> = {
	compact: 720,
	comfort: 920,
	large: 1100,
};

export function defaultAppearance(): AppearanceSettings {
	return {
		preset: "obsidian",
		overlay: "auto",
		size: "comfort",
		windowBackground: "#101114",
		cardBackground: "#17181c",
		primaryText: "#f1f1f1",
		secondaryText: "#b5b7bd",
		labelText: "#898c94",
		accent: "#a7a9ae",
		borderColor: "#34363d",
		radius: 20,
		border: "thin",
		borderWidth: 1,
		padding: 22,
		gap: 14,
		wordScale: 1,
		cardShadow: true,
		twoColumn: true,
		twoColumnFrom: 840,
		maxWidth: 920,
	};
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, value));
}

function color(value: unknown, fallback: string): string {
	return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function mergeAppearance(raw: unknown): AppearanceSettings {
	const base = defaultAppearance();
	if (!raw || typeof raw !== "object") {
		return base;
	}
	const input = raw as Partial<AppearanceSettings>;
	const preset: AppearancePreset =
		input.preset === "monochrome" || input.preset === "custom" ? input.preset : "obsidian";
	const overlay: OverlayMode =
		input.overlay === "center" || input.overlay === "full" ? input.overlay : "auto";
	const size: SizePreset =
		input.size === "compact" || input.size === "large" ? input.size : "comfort";
	const border: BorderStyle =
		input.border === "none" || input.border === "solid" ? input.border : "thin";
	return {
		preset,
		overlay,
		size,
		windowBackground: color(input.windowBackground, base.windowBackground),
		cardBackground: color(input.cardBackground, base.cardBackground),
		primaryText: color(input.primaryText, base.primaryText),
		secondaryText: color(input.secondaryText, base.secondaryText),
		labelText: color(input.labelText, base.labelText),
		accent: color(input.accent, base.accent),
		borderColor: color(input.borderColor, base.borderColor),
		radius: clamp(input.radius, 0, 48, base.radius),
		border,
		borderWidth: clamp(input.borderWidth, 0, 8, base.borderWidth),
		padding: clamp(input.padding, 8, 56, base.padding),
		gap: clamp(input.gap, 4, 40, base.gap),
		wordScale: clamp(input.wordScale, 0.7, 1.8, base.wordScale),
		cardShadow: typeof input.cardShadow === "boolean" ? input.cardShadow : base.cardShadow,
		twoColumn: typeof input.twoColumn === "boolean" ? input.twoColumn : base.twoColumn,
		twoColumnFrom: clamp(input.twoColumnFrom, 520, 1400, base.twoColumnFrom),
		maxWidth: clamp(input.maxWidth, 320, 1400, base.maxWidth),
	};
}

export function resolveDeckAppearance(
	defaults: AppearanceSettings,
	override?: Partial<AppearanceSettings>,
): AppearanceSettings {
	return mergeAppearance({ ...defaults, ...override });
}

export function applySizePreset(appearance: AppearanceSettings, size: SizePreset): void {
	const preset = SIZE_PRESETS[size];
	appearance.size = size;
	appearance.padding = preset.padding;
	appearance.gap = preset.gap;
	appearance.wordScale = preset.wordScale;
	appearance.radius = preset.radius;
	appearance.maxWidth = SIZE_MAX_WIDTH[size];
}

interface ColorTokens {
	window: string;
	card: string;
	primary: string;
	secondary: string;
	label: string;
	accent: string;
	border: string;
}

function colorTokens(appearance: AppearanceSettings): ColorTokens {
	if (appearance.preset === "obsidian") {
		return {
			window: "var(--background-primary)",
			card: "var(--background-primary)",
			primary: "var(--text-normal)",
			secondary: "var(--text-muted)",
			label: "var(--text-faint)",
			accent: "var(--interactive-accent)",
			border: "var(--background-modifier-border)",
		};
	}
	if (appearance.preset === "monochrome") {
		return {
			window: "#0d0d0d",
			card: "#151515",
			primary: "#f4f4f4",
			secondary: "#b8b8b8",
			label: "#8d8d8d",
			accent: "#ffffff",
			border: "#343434",
		};
	}
	return {
		window: appearance.windowBackground,
		card: appearance.cardBackground,
		primary: appearance.primaryText,
		secondary: appearance.secondaryText,
		label: appearance.labelText,
		accent: appearance.accent,
		border: appearance.borderColor,
	};
}

export function applyAppearance(
	el: HTMLElement,
	appearance: AppearanceSettings,
	isMobile: boolean,
): void {
	const full = appearance.overlay === "full" || (appearance.overlay === "auto" && isMobile);
	el.toggleClass("is-full", full);
	el.toggleClass("is-center", !full);
	el.toggleClass("has-shadow", appearance.cardShadow);
	el.toggleClass("border-none", appearance.border === "none");
	el.toggleClass("border-thin", appearance.border === "thin");
	el.toggleClass("border-solid", appearance.border === "solid");
	el.dataset.preset = appearance.preset;
	const colors = colorTokens(appearance);
	el.setCssProps({
		"--tc-window-bg": colors.window,
		"--tc-card-bg": colors.card,
		"--tc-text": colors.primary,
		"--tc-text-muted": colors.secondary,
		"--tc-label": colors.label,
		"--tc-accent": colors.accent,
		"--tc-border": colors.border,
		"--tc-radius": `${appearance.radius}px`,
		"--tc-pad": `${appearance.padding}px`,
		"--tc-gap": `${appearance.gap}px`,
		"--tc-border-w": `${appearance.borderWidth}px`,
		"--tc-word": String(appearance.wordScale),
		"--tc-max-w": `${appearance.maxWidth}px`,
	});
}

export function shouldSplit(width: number, appearance: AppearanceSettings): boolean {
	return appearance.twoColumn && width >= appearance.twoColumnFrom;
}
