export const SCHEMA_VERSION = 3 as const;

export const UI_LOCALES = ["en", "ru", "uk", "es", "de", "fr", "pt-BR", "it", "pl", "tr", "zh-CN", "zh-TW", "ja", "ko", "ar", "hi"] as const;
export const RIBBON_ICONS = ["gallery-horizontal", "languages", "message-square-quote", "circle-help", "image", "book-open", "layers-3", "graduation-cap", "brain", "library", "notebook-tabs", "rows-3"] as const;

export const BLOCK_KINDS = ["title", "text", "chips", "quote", "note", "image"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export type BlockStyle = BlockKind;
export type UiLocale = (typeof UI_LOCALES)[number];
export type LocaleMode = "auto" | UiLocale;
export type RibbonIcon = (typeof RIBBON_ICONS)[number];
export type OverlayMode = "auto" | "center" | "full";
export type SizePreset = "compact" | "comfort" | "large";
export type BorderStyle = "none" | "thin" | "solid";
export type AppearancePreset = "obsidian" | "monochrome" | "custom";
export type ColumnDataType =
	| "text"
	| "number"
	| "date"
	| "boolean"
	| "tags"
	| "link"
	| "markdown"
	| "image"
	| "mixed";
export type BlockWidth = "half" | "full";
export type MobilePresentation = "stack" | "compact";
export type OverflowMode = "wrap" | "shrink" | "ellipsis" | "scroll";
export type EmptyValueMode = "hide" | "dash" | "custom" | "preserve" | "fallback";

export interface TableSelector {
	headerSignature: string;
	occurrence: number;
	/** Present for folder sources; absent selectors retain legacy match-all semantics. */
	sourcePath?: string;
}

export type TableSelection = { mode: "all" } | { mode: "include"; selectors: TableSelector[] };
export type StudyScope = { mode: "all" } | { mode: "tables"; tableKeys: string[] };

export interface DeckRibbonSettings {
	visible: boolean;
	icon: RibbonIcon;
}

export interface DeckSource {
	id: string;
	kind: "file" | "folder";
	path: string;
	tables: TableSelection;
}

export interface EmptyValuePolicy {
	mode: EmptyValueMode;
	customText: string;
	emptyTokens: string[];
	required: boolean;
}

export interface BlockOverflow {
	mode: OverflowMode;
	minFontPx: number;
	maxLines: number | null;
}

export interface BlockHeight {
	mode: "auto" | "min" | "fixed";
	valuePx: number;
}

export interface BlockAppearanceOverride {
	inherit: boolean;
	background?: string;
	text?: string;
	border?: string;
	borderWidth?: number;
	radius?: number;
	align?: "left" | "center" | "right";
}

export interface CardBlock {
	id: string;
	kind: BlockKind;
	columns: string[];
	visible: boolean;
	showLabel: boolean;
	label: string;
	combine: "all" | "firstNonEmpty";
	width: BlockWidth;
	mobile: MobilePresentation;
	height: BlockHeight;
	overflow: BlockOverflow;
	empty: EmptyValuePolicy;
	image: {
		fit: "contain" | "cover";
		aspect: "auto" | "1:1" | "4:3" | "16:9";
		position: "top" | "center" | "bottom";
		caption: "alt" | "column" | "none";
		zoom: boolean;
	};
	appearance: BlockAppearanceOverride;
}

export interface AppearanceSettings {
	preset: AppearancePreset;
	overlay: OverlayMode;
	size: SizePreset;
	windowBackground: string;
	cardBackground: string;
	primaryText: string;
	secondaryText: string;
	labelText: string;
	accent: string;
	borderColor: string;
	radius: number;
	border: BorderStyle;
	borderWidth: number;
	padding: number;
	gap: number;
	wordScale: number;
	cardShadow: boolean;
	twoColumn: boolean;
	twoColumnFrom: number;
	maxWidth: number;
}

export interface Deck {
	id: string;
	name: string;
	enabled: boolean;
	sources: DeckSource[];
	blocks: CardBlock[];
	columnTypes: Record<string, ColumnDataType>;
	appearance?: Partial<AppearanceSettings>;
	shuffleDefault: boolean;
	ribbon: DeckRibbonSettings;
}

export interface DeckProgress {
	index: number;
	shuffle: boolean;
	seed: number;
	scope: StudyScope;
	cardKey: string | null;
}

export interface PluginSettings {
	schemaVersion: typeof SCHEMA_VERSION;
	setupVersion: number;
	locale: LocaleMode;
	lastDeckId: string | null;
	decks: Deck[];
	perDeck: Record<string, DeckProgress>;
	appearance: AppearanceSettings;
}

export interface ImageRef {
	source: string;
	alt: string;
	width?: number;
	height?: number;
	external: boolean;
}

export interface CellValue {
	raw: string;
	text: string;
	detectedType: ColumnDataType;
	images: ImageRef[];
}

export interface ParsedTable {
	index: number;
	selector: TableSelector;
	headingPath: string[];
	headers: string[];
	rawHeaders: string[];
	rows: Array<Record<string, CellValue>>;
	rowNumbers: number[];
	sourcePath: string;
}

export interface TableCatalogItem {
	key: string;
	selector: TableSelector;
	sourcePath: string;
	sourceIds: string[];
	label: string;
	tableNumber: number;
	headingPath: string[];
	headers: string[];
	rowCount: number;
}

export interface CardOrigin {
	tableKey: string;
	tableLabel: string;
	tableNumber: number;
	sourcePath: string;
	rowNumber: number;
	rowKey: string;
}

export type ColumnProfileWarning = "mixed" | "mostlyEmpty" | "brokenImage";

export interface ColumnProfile {
	header: string;
	inferredType: ColumnDataType;
	confidence: number;
	total: number;
	nonEmpty: number;
	unique: number;
	samples: string[];
	warnings: ColumnProfileWarning[];
}

export interface Card {
	cells: Record<string, CellValue>;
	headers: string[];
	origin: CardOrigin;
}

export type DeckDiagnosticCode =
	| "sourceMissing"
	| "tableMissing"
	| "duplicateHeader"
	| "emptyHeader"
	| "requiredEmpty"
	| "brokenImage";

export interface DeckDiagnostic {
	code: DeckDiagnosticCode;
	sourcePath: string;
	tableIndex?: number;
	rowIndex?: number;
	detail: string;
}

export interface DeckLoadResult {
	cards: Card[];
	tables: ParsedTable[];
	catalog: TableCatalogItem[];
	profiles: ColumnProfile[];
	diagnostics: DeckDiagnostic[];
}

const DEFAULT_EMPTY: EmptyValuePolicy = {
	mode: "hide",
	customText: "",
	emptyTokens: ["", "-", "—", "n/a", "null"],
	required: false,
};

export function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export function newId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

export function createBlock(partial: Partial<CardBlock> = {}): CardBlock {
	const kind = partial.kind ?? "text";
	return {
		id: partial.id ?? newId("block"),
		kind,
		columns: partial.columns?.slice() ?? [],
		visible: partial.visible ?? true,
		showLabel: partial.showLabel ?? (kind !== "title" && kind !== "chips"),
		label: partial.label ?? "",
		combine: partial.combine ?? "all",
		width: partial.width ?? "full",
		mobile: partial.mobile ?? "stack",
		height: { mode: partial.height?.mode ?? "auto", valuePx: partial.height?.valuePx ?? 96 },
		overflow: {
			mode: partial.overflow?.mode ?? (kind === "title" ? "shrink" : "wrap"),
			minFontPx: partial.overflow?.minFontPx ?? 18,
			maxLines: partial.overflow?.maxLines ?? null,
		},
		empty: {
			...DEFAULT_EMPTY,
			...partial.empty,
			emptyTokens: partial.empty?.emptyTokens?.slice() ?? DEFAULT_EMPTY.emptyTokens.slice(),
		},
		image: {
			fit: partial.image?.fit ?? "contain",
			aspect: partial.image?.aspect ?? "auto",
			position: partial.image?.position ?? "center",
			caption: partial.image?.caption ?? "alt",
			zoom: partial.image?.zoom ?? true,
		},
		appearance: { ...partial.appearance, inherit: partial.appearance?.inherit ?? true },
	};
}

export function activeBlocks(blocks: CardBlock[]): CardBlock[] {
	return blocks.filter((block) => block.visible);
}
