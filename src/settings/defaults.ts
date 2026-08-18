import {
	BLOCK_KINDS,
	RIBBON_ICONS,
	SCHEMA_VERSION,
	UI_LOCALES,
	cloneJson,
	createBlock,
	newId,
	type BlockHeight,
	type BlockKind,
	type BlockOverflow,
	type CardBlock,
	type ColumnDataType,
	type Deck,
	type DeckSource,
	type DeckRibbonSettings,
	type EmptyValuePolicy,
	type PluginSettings,
	type TableSelector,
} from "../model";
import { defaultAppearance, mergeAppearance } from "./appearance";

type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown): UnknownRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as UnknownRecord)
		: null;
}

function stringsOf(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
		: [];
}

function isBlockKind(value: unknown): value is BlockKind {
	return typeof value === "string" && (BLOCK_KINDS as readonly string[]).includes(value);
}

function isColumnType(value: unknown): value is ColumnDataType {
	return (
		value === "text" ||
		value === "number" ||
		value === "date" ||
		value === "boolean" ||
		value === "tags" ||
		value === "link" ||
		value === "markdown" ||
		value === "image" ||
		value === "mixed"
	);
}

function normalizeSelector(value: unknown): TableSelector | null {
	const input = recordOf(value);
	if (!input || typeof input.headerSignature !== "string") {
		return null;
	}
	return {
		headerSignature: input.headerSignature,
		occurrence:
			typeof input.occurrence === "number" && Number.isInteger(input.occurrence) && input.occurrence >= 0
				? input.occurrence
				: 0,
	};
}

function normalizeSelectors(value: unknown): TableSelector[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const seen = new Set<string>();
	const selectors: TableSelector[] = [];
	for (const item of value) {
		const selector = normalizeSelector(item);
		if (!selector) {
			continue;
		}
		const key = `${selector.headerSignature}\u0000${selector.occurrence}`;
		if (!seen.has(key)) {
			seen.add(key);
			selectors.push(selector);
		}
	}
	return selectors;
}

function migrateV2Source(value: unknown): DeckSource | null {
	const input = recordOf(value);
	if (!input || (input.kind !== "file" && input.kind !== "folder") || typeof input.path !== "string") {
		return null;
	}
	const rawTable = recordOf(input.table);
	const selector = normalizeSelector(rawTable?.selector);
	return {
		id: typeof input.id === "string" && input.id ? input.id : newId("source"),
		kind: input.kind,
		path: input.path,
		tables: rawTable?.mode === "single" && selector
			? { mode: "include", selectors: [selector] }
			: { mode: "all" },
	};
}

function normalizeV3Source(value: unknown): DeckSource | null {
	const input = recordOf(value);
	if (!input || (input.kind !== "file" && input.kind !== "folder") || typeof input.path !== "string") {
		return null;
	}
	const tables = recordOf(input.tables);
	return {
		id: typeof input.id === "string" && input.id ? input.id : newId("source"),
		kind: input.kind,
		path: input.path,
		tables:
			tables?.mode === "include"
				? { mode: "include", selectors: normalizeSelectors(tables.selectors) }
				: { mode: "all" },
	};
}

function normalizeRibbon(value: unknown, fallbackVisible = false): DeckRibbonSettings {
	const input = recordOf(value);
	return {
		visible: typeof input?.visible === "boolean" ? input.visible : fallbackVisible,
		icon:
			typeof input?.icon === "string" && (RIBBON_ICONS as readonly string[]).includes(input.icon)
				? input.icon as DeckRibbonSettings["icon"]
				: "layers-3",
	};
}

function normalizeEmpty(value: unknown): EmptyValuePolicy | undefined {
	const input = recordOf(value);
	if (!input) {
		return undefined;
	}
	const mode =
		input.mode === "hide" ||
		input.mode === "dash" ||
		input.mode === "custom" ||
		input.mode === "preserve" ||
		input.mode === "fallback"
			? input.mode
			: "hide";
	return {
		mode,
		customText: typeof input.customText === "string" ? input.customText : "",
		emptyTokens: Array.isArray(input.emptyTokens)
			? input.emptyTokens.filter((token): token is string => typeof token === "string")
			: ["", "-", "—", "n/a", "null"],
		required: input.required === true,
	};
}

function normalizeHeight(value: unknown): BlockHeight | undefined {
	const input = recordOf(value);
	if (!input) {
		return undefined;
	}
	return {
		mode: input.mode === "min" || input.mode === "fixed" ? input.mode : "auto",
		valuePx: typeof input.valuePx === "number" ? input.valuePx : 96,
	};
}

function normalizeOverflow(value: unknown): BlockOverflow | undefined {
	const input = recordOf(value);
	if (!input) {
		return undefined;
	}
	return {
		mode:
			input.mode === "shrink" || input.mode === "ellipsis" || input.mode === "scroll"
				? input.mode
				: "wrap",
		minFontPx: typeof input.minFontPx === "number" ? input.minFontPx : 18,
		maxLines: typeof input.maxLines === "number" ? input.maxLines : null,
	};
}

function normalizeV2Block(value: unknown): CardBlock | null {
	const input = recordOf(value);
	if (!input) {
		return null;
	}
	const image = recordOf(input.image);
	const appearance = recordOf(input.appearance);
	return createBlock({
		id: typeof input.id === "string" && input.id ? input.id : undefined,
		kind: isBlockKind(input.kind) ? input.kind : "text",
		columns: stringsOf(input.columns),
		visible: input.visible !== false,
		showLabel: typeof input.showLabel === "boolean" ? input.showLabel : undefined,
		label: typeof input.label === "string" ? input.label : "",
		combine: input.combine === "firstNonEmpty" ? "firstNonEmpty" : "all",
		width: input.width === "half" ? "half" : "full",
		mobile: input.mobile === "compact" ? "compact" : "stack",
		height: normalizeHeight(input.height),
		overflow: normalizeOverflow(input.overflow),
		empty: normalizeEmpty(input.empty),
		image: image
			? {
					fit: image.fit === "cover" ? "cover" : "contain",
					aspect:
						image.aspect === "1:1" || image.aspect === "4:3" || image.aspect === "16:9"
							? image.aspect
							: "auto",
					position: image.position === "top" || image.position === "bottom" ? image.position : "center",
					caption: image.caption === "column" || image.caption === "none" ? image.caption : "alt",
					zoom: image.zoom !== false,
				}
			: undefined,
		appearance: appearance
			? {
					inherit: appearance.inherit !== false,
					background: typeof appearance.background === "string" ? appearance.background : undefined,
					text: typeof appearance.text === "string" ? appearance.text : undefined,
					border: typeof appearance.border === "string" ? appearance.border : undefined,
					borderWidth: typeof appearance.borderWidth === "number" ? appearance.borderWidth : undefined,
					radius: typeof appearance.radius === "number" ? appearance.radius : undefined,
					align:
						appearance.align === "left" || appearance.align === "center" || appearance.align === "right"
							? appearance.align
							: undefined,
				}
			: undefined,
	});
}

function migrateV1Block(value: unknown): CardBlock | null {
	const input = recordOf(value);
	if (!input) {
		return null;
	}
	if (isBlockKind(input.kind)) {
		return normalizeV2Block(input);
	}
	const oldStyle = isBlockKind(input.style) ? input.style : "text";
	return createBlock({
		id: typeof input.id === "string" && input.id ? input.id : undefined,
		kind: oldStyle,
		columns: stringsOf(input.columns),
		visible: input.visible !== false,
		showLabel: typeof input.showLabel === "boolean" ? input.showLabel : undefined,
		width: input.column === "full" ? "full" : "half",
	});
}

function migrateLegacyFields(value: unknown): CardBlock[] | null {
	const fields = recordOf(value);
	if (!fields) {
		return null;
	}
	const kindByKey: Record<string, BlockKind> = {
		word: "title",
		ipa: "chips",
		rupron: "chips",
		translation: "text",
		example: "quote",
		exampleRu: "text",
		tip: "note",
	};
	const chips: string[] = [];
	const blocks: CardBlock[] = [];
	for (const [key, kind] of Object.entries(kindByKey)) {
		const field = recordOf(fields[key]);
		if (!field) {
			continue;
		}
		const columns = stringsOf(field.columns);
		if (columns.length === 0) {
			continue;
		}
		if (kind === "chips") {
			chips.push(...columns);
			continue;
		}
		blocks.push(createBlock({ kind, columns, visible: field.visible !== false, width: "half" }));
	}
	if (chips.length > 0) {
		blocks.splice(1, 0, createBlock({ kind: "chips", columns: chips, width: "half" }));
	}
	return blocks.length > 0 ? blocks : null;
}

export function dictionaryBlocks(): CardBlock[] {
	return [
		createBlock({
			kind: "title",
			width: "full",
			columns: ["Words", "Word", "Слово"],
			combine: "firstNonEmpty",
		}),
		createBlock({
			kind: "chips",
			width: "half",
			columns: ["Transcription", "IPA", "Транскрипция", "RuPron", "Ru Pron"],
			combine: "firstNonEmpty",
		}),
		createBlock({ kind: "text", width: "half", columns: ["Translation", "Перевод"], combine: "firstNonEmpty" }),
		createBlock({ kind: "quote", columns: ["Examples", "Example", "Пример"], combine: "firstNonEmpty" }),
		createBlock({ kind: "text", columns: ["Ex Translation", "Перевод примера"], combine: "firstNonEmpty" }),
		createBlock({
			kind: "note",
			columns: ["Memory Tip", "Mnemonic", "Мнемоника", "Подсказка"],
			combine: "firstNonEmpty",
		}),
	];
}

export function phrasesBlocks(): CardBlock[] {
	return [
		createBlock({
			kind: "title",
			columns: ["Phrase", "Phrases", "Фраза"],
			combine: "firstNonEmpty",
		}),
		createBlock({ kind: "chips", width: "half", columns: ["Transcription"], combine: "firstNonEmpty" }),
		createBlock({ kind: "text", width: "half", columns: ["Translation", "Перевод"], combine: "firstNonEmpty" }),
		createBlock({ kind: "note", columns: ["Что буквально"], combine: "firstNonEmpty" }),
		createBlock({ kind: "quote", columns: ["Example", "Examples"], combine: "firstNonEmpty" }),
	];
}

export function createDeck(partial: Partial<Deck> = {}): Deck {
	return {
		id: partial.id ?? newId("deck"),
		name: partial.name ?? "New deck",
		enabled: partial.enabled ?? true,
		sources: partial.sources?.map(cloneJson) ?? [],
		blocks: partial.blocks?.map((block) => createBlock(block)) ?? [],
		columnTypes: { ...partial.columnTypes },
		appearance: partial.appearance ? { ...partial.appearance } : undefined,
		shuffleDefault: partial.shuffleDefault ?? false,
		ribbon: { visible: partial.ribbon?.visible ?? false, icon: partial.ribbon?.icon ?? "layers-3" },
	};
}

function freshSettings(): PluginSettings {
	return {
		schemaVersion: SCHEMA_VERSION,
		setupVersion: 0,
		locale: "auto",
		lastDeckId: null,
		perDeck: {},
		appearance: defaultAppearance(),
		decks: [],
	};
}

export const DEFAULT_SETTINGS: PluginSettings = freshSettings();

function columnTypesOf(value: unknown): Record<string, ColumnDataType> {
	const input = recordOf(value);
	if (!input) {
		return {};
	}
	const result: Record<string, ColumnDataType> = {};
	for (const [header, dataType] of Object.entries(input)) {
		if (isColumnType(dataType)) {
			result[header] = dataType;
		}
	}
	return result;
}

function partialAppearanceOf(value: unknown): Deck["appearance"] {
	const input = recordOf(value);
	return input ? (cloneJson(input) as Deck["appearance"]) : undefined;
}

function normalizeDeck(value: unknown, sourceNormalizer: (source: unknown) => DeckSource | null): Deck {
	const input = recordOf(value);
	const fallback = createDeck();
	if (!input) {
		return fallback;
	}
	const sources = Array.isArray(input.sources)
		? input.sources.map(sourceNormalizer).filter((source): source is DeckSource => source !== null)
		: [];
	const blocks = Array.isArray(input.blocks)
		? input.blocks.map(normalizeV2Block).filter((block): block is CardBlock => block !== null)
		: fallback.blocks;
	return createDeck({
		id: typeof input.id === "string" && input.id ? input.id : fallback.id,
		name: typeof input.name === "string" && input.name ? input.name : fallback.name,
		enabled: typeof input.enabled === "boolean" ? input.enabled : true,
		sources,
		blocks,
		columnTypes: columnTypesOf(input.columnTypes),
		appearance: partialAppearanceOf(input.appearance),
		shuffleDefault: input.shuffleDefault === true,
		ribbon: normalizeRibbon(input.ribbon),
	});
}

function migrateV1Deck(value: unknown): Deck {
	const input = recordOf(value);
	const fallback = createDeck();
	if (!input) {
		return fallback;
	}
	const sources: DeckSource[] = [];
	for (const path of stringsOf(input.files)) {
		sources.push({ id: newId("source"), kind: "file", path, tables: { mode: "all" } });
	}
	for (const path of stringsOf(input.folders)) {
		sources.push({ id: newId("source"), kind: "folder", path, tables: { mode: "all" } });
	}
	const migratedBlocks = Array.isArray(input.blocks)
		? input.blocks.map(migrateV1Block).filter((block): block is CardBlock => block !== null)
		: [];
	const blocks = migratedBlocks.length > 0 ? migratedBlocks : (migrateLegacyFields(input.fields) ?? fallback.blocks);
	return createDeck({
		id: typeof input.id === "string" && input.id ? input.id : fallback.id,
		name: typeof input.name === "string" && input.name ? input.name : fallback.name,
		enabled: typeof input.enabled === "boolean" ? input.enabled : true,
		sources,
		blocks,
		columnTypes: columnTypesOf(input.columnTypes),
		appearance: partialAppearanceOf(input.appearance),
		shuffleDefault: input.shuffleDefault === true,
		ribbon: normalizeRibbon(input.ribbon),
	});
}

function mergeProgress(value: unknown): PluginSettings["perDeck"] {
	const input = recordOf(value);
	if (!input) {
		return {};
	}
	const result: PluginSettings["perDeck"] = {};
	for (const [id, valueAtId] of Object.entries(input)) {
		const progress = recordOf(valueAtId);
		if (!progress) {
			continue;
		}
		result[id] = {
			index: typeof progress.index === "number" ? progress.index : 0,
			shuffle: progress.shuffle === true,
			seed: typeof progress.seed === "number" ? progress.seed : 0,
			scope:
				recordOf(progress.scope)?.mode === "tables"
					? { mode: "tables", tableKeys: stringsOf(recordOf(progress.scope)?.tableKeys) }
					: { mode: "all" },
			cardKey: typeof progress.cardKey === "string" ? progress.cardKey : null,
		};
	}
	return result;
}

function localeOf(value: unknown): PluginSettings["locale"] {
	return typeof value === "string" && (UI_LOCALES as readonly string[]).includes(value)
		? value as PluginSettings["locale"]
		: "auto";
}

function selectedDeckId(raw: UnknownRecord, decks: Deck[], pinEnabledDeck: boolean): string | null {
	if (typeof raw.lastDeckId === "string" && decks.some((deck) => deck.id === raw.lastDeckId && deck.enabled)) {
		return raw.lastDeckId;
	}
	return pinEnabledDeck ? decks.find((deck) => deck.enabled)?.id ?? null : null;
}

function sharedSettings(raw: UnknownRecord, decks: Deck[], setupVersion: number, pinEnabledDeck: boolean): PluginSettings {
	return {
		schemaVersion: SCHEMA_VERSION,
		setupVersion,
		locale: localeOf(raw.locale),
		lastDeckId: selectedDeckId(raw, decks, pinEnabledDeck),
		decks,
		perDeck: mergeProgress(raw.perDeck),
		appearance: mergeAppearance(raw.appearance),
	};
}

function migrateV1Settings(raw: unknown): PluginSettings {
	const input = recordOf(raw);
	if (!input) {
		return freshSettings();
	}
	const decks = Array.isArray(input.decks)
		? input.decks.map(migrateV1Deck)
		: [];
	const selectedId = selectedDeckId(input, decks, true);
	return sharedSettings(
		input,
		decks.map((deck) => createDeck({ ...deck, ribbon: { visible: deck.id === selectedId, icon: deck.ribbon.icon } })),
		1,
		true,
	);
}

function migrateV2Settings(raw: unknown): PluginSettings {
	const input = recordOf(raw);
	if (!input) {
		return freshSettings();
	}
	const provisionalDecks = Array.isArray(input.decks)
		? input.decks.map((deck) => normalizeDeck(deck, migrateV2Source))
		: [];
	const selectedId = selectedDeckId(input, provisionalDecks, true);
	const decks = provisionalDecks.map((deck) =>
		createDeck({ ...deck, ribbon: { visible: deck.id === selectedId, icon: deck.ribbon.icon } }),
	);
	return sharedSettings(input, decks, 1, true);
}

function normalizeV3Settings(raw: unknown): PluginSettings {
	const input = recordOf(raw);
	if (!input) {
		return freshSettings();
	}
	const decks = Array.isArray(input.decks)
		? input.decks.map((deck) => normalizeDeck(deck, normalizeV3Source))
		: [];
	return sharedSettings(
		input,
		decks,
		typeof input.setupVersion === "number" ? input.setupVersion : 1,
		false,
	);
}

export function mergeDeck(raw: unknown): Deck {
	const input = recordOf(raw);
	if (input && Array.isArray(input.sources)) {
		return normalizeDeck(input, (source) =>
			recordOf(source)?.tables ? normalizeV3Source(source) : migrateV2Source(source),
		);
	}
	return migrateV1Deck(input);
}

export function mergeSettings(raw: unknown): PluginSettings {
	if (raw === null || raw === undefined) {
		return freshSettings();
	}
	const version = recordOf(raw)?.schemaVersion;
	if (version === 3) {
		return normalizeV3Settings(raw);
	}
	if (version === 2) {
		return migrateV2Settings(raw);
	}
	return migrateV1Settings(raw);
}
