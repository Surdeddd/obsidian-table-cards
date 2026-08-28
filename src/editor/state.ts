import {
	cloneJson,
	createBlock,
	type AppearanceSettings,
	type BlockAppearanceOverride,
	type BlockHeight,
	type BlockOverflow,
	type BlockWidth,
	type CardBlock,
	type ColumnDataType,
	type Deck,
	type DeckSource,
	type TableCatalogItem,
	type TableLayout,
} from "../model";
import { repairTableLayouts } from "../deck/layouts";
import { normalizeHeader } from "../parse/table-scanner";

export type EditorPanel = null | "fields" | "block" | "card" | "reorder";

export interface RetiredBlock {
	block: CardBlock;
	index: number;
}

export interface EditorState {
	baseline: Deck;
	draft: Deck;
	past: Deck[];
	future: Deck[];
	selectedBlockId: string | null;
	previewRow: number;
	activePanel: EditorPanel;
	activeTableKey: string | null;
	retired: Record<string, RetiredBlock>;
}

export function layoutBlocks(deck: Deck, tableKey: string | null): CardBlock[] {
	if (tableKey === null) return deck.blocks;
	return deck.tableLayouts.find((layout) => layout.tableKey === tableKey)?.blocks ?? deck.blocks;
}

export function activeBlocks(state: EditorState): CardBlock[] {
	return layoutBlocks(state.draft, state.activeTableKey);
}

export function hasOwnLayout(deck: Deck, tableKey: string | null): boolean {
	return tableKey !== null && deck.tableLayouts.some((layout) => layout.tableKey === tableKey);
}

function withLayoutBlocks(deck: Deck, tableKey: string | null, blocks: CardBlock[]): Deck {
	if (!hasOwnLayout(deck, tableKey)) return { ...deck, blocks };
	return {
		...deck,
		tableLayouts: deck.tableLayouts.map((layout) =>
			layout.tableKey === tableKey ? { ...layout, blocks } : layout,
		),
	};
}

export type BlockPatch = Omit<
	Partial<CardBlock>,
	"height" | "overflow" | "empty" | "image" | "appearance"
> & {
	height?: Partial<BlockHeight>;
	overflow?: Partial<BlockOverflow>;
	empty?: Partial<CardBlock["empty"]>;
	image?: Partial<CardBlock["image"]>;
	appearance?: Partial<BlockAppearanceOverride>;
};

export type EditorAction =
	| { type: "replaceDraft"; deck: Deck }
	| { type: "selectBlock"; blockId: string | null }
	| { type: "setPreviewRow"; index: number }
	| { type: "openPanel"; panel: EditorPanel }
	| { type: "moveBlock"; blockId: string; toIndex: number }
	| { type: "setBlockWidth"; blockId: string; width: BlockWidth }
	| { type: "patchBlock"; blockId: string; patch: BlockPatch }
	| { type: "addBlock"; block?: CardBlock }
	| { type: "removeBlock"; blockId: string }
	| { type: "replaceBlocks"; blocks: CardBlock[] }
	| { type: "patchAppearance"; patch: Partial<AppearanceSettings> }
	| { type: "replaceSources"; sources: DeckSource[] }
	| { type: "setColumnType"; header: string; dataType: ColumnDataType }
	| { type: "setColumnEnabled"; header: string; enabled: boolean }
	| { type: "selectLayout"; tableKey: string | null }
	| { type: "addTableLayout"; tableKey: string; label: string; blocks: CardBlock[] }
	| { type: "addTableLayouts"; layouts: TableLayout[] }
	| { type: "removeTableLayout"; tableKey: string }
	| { type: "removeAllTableLayouts" }
	| { type: "setDeckName"; name: string };

export function createEditorState(deck: Deck): EditorState {
	return {
		baseline: cloneJson(deck),
		draft: cloneJson(deck),
		past: [],
		future: [],
		selectedBlockId: deck.blocks[0]?.id ?? null,
		previewRow: 0,
		activePanel: null,
		activeTableKey: null,
		retired: {},
	};
}

function sameDeck(left: Deck, right: Deck): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function keepSelection(blocks: CardBlock[], selectedBlockId: string | null): string | null {
	return selectedBlockId && blocks.some((block) => block.id === selectedBlockId)
		? selectedBlockId
		: (blocks[0]?.id ?? null);
}

function withDraft(state: EditorState, draft: Deck): EditorState {
	if (sameDeck(state.draft, draft)) {
		return state;
	}
	const past = [...state.past, cloneJson(state.draft)].slice(-100);
	const selectedBlockId = keepSelection(layoutBlocks(draft, state.activeTableKey), state.selectedBlockId);
	return { ...state, draft, past, future: [], selectedBlockId };
}

function patchBlock(block: CardBlock, patch: BlockPatch): CardBlock {
	return {
		...block,
		...patch,
		columns: patch.columns?.slice() ?? block.columns.slice(),
		height: { ...block.height, ...patch.height },
		overflow: { ...block.overflow, ...patch.overflow },
		empty: {
			...block.empty,
			...patch.empty,
			emptyTokens: patch.empty?.emptyTokens?.slice() ?? block.empty.emptyTokens.slice(),
		},
		image: { ...block.image, ...patch.image },
		appearance: { ...block.appearance, ...patch.appearance },
	};
}

function moveBlock(deck: Deck, tableKey: string | null, blockId: string, toIndex: number): Deck {
	const blocks = layoutBlocks(deck, tableKey);
	const fromIndex = blocks.findIndex((block) => block.id === blockId);
	if (fromIndex < 0) {
		return deck;
	}
	const next = blocks.slice();
	const [block] = next.splice(fromIndex, 1);
	if (!block) {
		return deck;
	}
	const target = Math.max(0, Math.min(toIndex, next.length));
	next.splice(target, 0, block);
	return withLayoutBlocks(deck, tableKey, next);
}

function blockKindFor(dataType: ColumnDataType | undefined): CardBlock["kind"] {
	if (dataType === "image") return "image";
	if (dataType === "tags") return "chips";
	if (dataType === "markdown") return "quote";
	return "text";
}

interface ColumnToggle {
	deck: Deck;
	retired: Record<string, RetiredBlock>;
}

function retiredKey(tableKey: string | null, header: string): string {
	return `${tableKey ?? ""}\u001e${normalizeHeader(header)}`;
}

function setColumnEnabled(
	deck: Deck,
	tableKey: string | null,
	retired: Record<string, RetiredBlock>,
	header: string,
	enabled: boolean,
): ColumnToggle {
	const key = normalizeHeader(header);
	const slot = retiredKey(tableKey, header);
	const blocks = layoutBlocks(deck, tableKey);
	const contains = blocks.some((block) =>
		block.columns.some((column) => normalizeHeader(column) === key),
	);
	if (enabled) {
		if (contains) return { deck, retired };
		const saved = retired[slot];
		const rest: Record<string, RetiredBlock> = {};
		for (const [entry, value] of Object.entries(retired)) {
			if (entry !== slot) rest[entry] = value;
		}
		if (saved) {
			const next = blocks.slice();
			next.splice(Math.min(saved.index, next.length), 0, cloneJson(saved.block));
			return { deck: withLayoutBlocks(deck, tableKey, next), retired: rest };
		}
		const dataType = deck.columnTypes[key];
		return {
			deck: withLayoutBlocks(deck, tableKey, [
				...blocks,
				createBlock({ kind: blockKindFor(dataType), columns: [header], width: "full" }),
			]),
			retired: rest,
		};
	}
	if (!contains) return { deck, retired };
	const emptied = blocks.findIndex((block) =>
		block.columns.every((column) => normalizeHeader(column) === key),
	);
	const removed = emptied >= 0 ? blocks[emptied] : undefined;
	return {
		deck: withLayoutBlocks(
			deck,
			tableKey,
			blocks
				.map((block) => ({
					...block,
					columns: block.columns.filter((column) => normalizeHeader(column) !== key),
				}))
				.filter((block) => block.columns.length > 0),
		),
		retired: removed
			? { ...retired, [slot]: { block: cloneJson(removed), index: emptied } }
			: retired,
	};
}

export function reduceEditorState(state: EditorState, action: EditorAction): EditorState {
	switch (action.type) {
		case "selectBlock":
			return { ...state, selectedBlockId: action.blockId };
		case "setPreviewRow":
			return { ...state, previewRow: Math.max(0, action.index) };
		case "openPanel":
			return { ...state, activePanel: action.panel };
		case "replaceDraft":
			return withDraft(state, cloneJson(action.deck));
		case "moveBlock":
			return withDraft(state, moveBlock(state.draft, state.activeTableKey, action.blockId, action.toIndex));
		case "setBlockWidth":
			return reduceEditorState(state, {
				type: "patchBlock",
				blockId: action.blockId,
				patch: { width: action.width },
			});
		case "patchBlock":
			return withDraft(
				state,
				withLayoutBlocks(
					state.draft,
					state.activeTableKey,
					activeBlocks(state).map((block) =>
						block.id === action.blockId ? patchBlock(block, action.patch) : block,
					),
				),
			);
		case "addBlock": {
			const block = action.block ? cloneJson(action.block) : createBlock();
			const next = withDraft(
				state,
				withLayoutBlocks(state.draft, state.activeTableKey, [...activeBlocks(state), block]),
			);
			return { ...next, selectedBlockId: block.id };
		}
		case "removeBlock":
			return withDraft(
				state,
				withLayoutBlocks(
					state.draft,
					state.activeTableKey,
					activeBlocks(state).filter((block) => block.id !== action.blockId),
				),
			);
		case "replaceBlocks":
			return withDraft(
				state,
				withLayoutBlocks(
					state.draft,
					state.activeTableKey,
					action.blocks.map((block) => cloneJson(block)),
				),
			);
		case "patchAppearance":
			return withDraft(state, {
				...state.draft,
				appearance: { ...state.draft.appearance, ...action.patch },
			});
		case "replaceSources":
			return withDraft(state, { ...state.draft, sources: cloneJson(action.sources) });
		case "setColumnType": {
			const key = normalizeHeader(action.header);
			return withDraft(state, {
				...state.draft,
				columnTypes: { ...state.draft.columnTypes, [key]: action.dataType },
			});
		}
		case "setColumnEnabled": {
			const toggled = setColumnEnabled(
				state.draft,
				state.activeTableKey,
				state.retired,
				action.header,
				action.enabled,
			);
			return { ...withDraft(state, toggled.deck), retired: toggled.retired };
		}
		case "selectLayout": {
			if (action.tableKey === state.activeTableKey) return state;
			const blocks = layoutBlocks(state.draft, action.tableKey);
			return {
				...state,
				activeTableKey: action.tableKey,
				selectedBlockId: blocks[0]?.id ?? null,
				previewRow: 0,
			};
		}
		case "addTableLayout": {
			if (hasOwnLayout(state.draft, action.tableKey)) return state;
			const layout = {
				tableKey: action.tableKey,
				label: action.label,
				blocks: action.blocks.map((block) => cloneJson(block)),
			};
			const next = withDraft(state, {
				...state.draft,
				tableLayouts: [...state.draft.tableLayouts, layout],
			});
			return {
				...next,
				activeTableKey: action.tableKey,
				selectedBlockId: layout.blocks[0]?.id ?? null,
			};
		}
		case "addTableLayouts": {
			const fresh = action.layouts.filter(
				(layout) => layout.blocks.length > 0 && !hasOwnLayout(state.draft, layout.tableKey),
			);
			if (fresh.length === 0) return state;
			return withDraft(state, {
				...state.draft,
				tableLayouts: [...state.draft.tableLayouts, ...fresh.map((layout) => cloneJson(layout))],
			});
		}
		case "removeAllTableLayouts": {
			if (state.draft.tableLayouts.length === 0) return state;
			const next = withDraft(state, { ...state.draft, tableLayouts: [] });
			return {
				...next,
				selectedBlockId: keepSelection(layoutBlocks(next.draft, next.activeTableKey), null),
			};
		}
		case "removeTableLayout": {
			const next = withDraft(state, {
				...state.draft,
				tableLayouts: state.draft.tableLayouts.filter((layout) => layout.tableKey !== action.tableKey),
			});
			return {
				...next,
				selectedBlockId: keepSelection(layoutBlocks(next.draft, next.activeTableKey), null),
			};
		}
		case "setDeckName":
			return withDraft(state, { ...state.draft, name: action.name });
	}
}

export function undo(state: EditorState): EditorState {
	const previous = state.past[state.past.length - 1];
	if (!previous) {
		return state;
	}
	const past = state.past.slice(0, -1);
	return {
		...state,
		draft: cloneJson(previous),
		past,
		future: [cloneJson(state.draft), ...state.future].slice(0, 100),
		selectedBlockId: keepSelection(layoutBlocks(previous, state.activeTableKey), state.selectedBlockId),
	};
}

export function redo(state: EditorState): EditorState {
	const next = state.future[0];
	if (!next) {
		return state;
	}
	return {
		...state,
		draft: cloneJson(next),
		past: [...state.past, cloneJson(state.draft)].slice(-100),
		future: state.future.slice(1),
		selectedBlockId: keepSelection(layoutBlocks(next, state.activeTableKey), state.selectedBlockId),
	};
}

export function repairLayoutKeys(state: EditorState, catalog: readonly TableCatalogItem[]): EditorState {
	let changed = false;
	const retarget = (deck: Deck): Deck => {
		const repaired = repairTableLayouts(deck, catalog);
		if (!repaired.changed) return deck;
		changed = true;
		return { ...deck, tableLayouts: repaired.layouts };
	};
	const next: EditorState = {
		...state,
		baseline: retarget(state.baseline),
		draft: retarget(state.draft),
		past: state.past.map(retarget),
		future: state.future.map(retarget),
	};
	return changed ? next : state;
}

export function isDirty(state: EditorState): boolean {
	return !sameDeck(state.baseline, state.draft);
}

export function markSaved(state: EditorState, saved: Deck): EditorState {
	return { ...state, baseline: cloneJson(saved) };
}
