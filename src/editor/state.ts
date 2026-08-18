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
} from "../model";
import { normalizeHeader } from "../parse/table-scanner";

export type EditorPanel = null | "fields" | "block" | "card" | "reorder";

export interface EditorState {
	baseline: Deck;
	draft: Deck;
	past: Deck[];
	future: Deck[];
	selectedBlockId: string | null;
	previewRow: number;
	activePanel: EditorPanel;
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
	};
}

function sameDeck(left: Deck, right: Deck): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function withDraft(state: EditorState, draft: Deck): EditorState {
	if (sameDeck(state.draft, draft)) {
		return state;
	}
	const past = [...state.past, cloneJson(state.draft)].slice(-100);
	const selectedBlockId =
		state.selectedBlockId && draft.blocks.some((block) => block.id === state.selectedBlockId)
			? state.selectedBlockId
			: (draft.blocks[0]?.id ?? null);
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

function moveBlock(deck: Deck, blockId: string, toIndex: number): Deck {
	const fromIndex = deck.blocks.findIndex((block) => block.id === blockId);
	if (fromIndex < 0) {
		return deck;
	}
	const next = deck.blocks.slice();
	const [block] = next.splice(fromIndex, 1);
	if (!block) {
		return deck;
	}
	const target = Math.max(0, Math.min(toIndex, next.length));
	next.splice(target, 0, block);
	return { ...deck, blocks: next };
}

function blockKindFor(dataType: ColumnDataType | undefined): CardBlock["kind"] {
	if (dataType === "image") return "image";
	if (dataType === "tags") return "chips";
	if (dataType === "markdown") return "quote";
	return "text";
}

function setColumnEnabled(deck: Deck, header: string, enabled: boolean): Deck {
	const key = normalizeHeader(header);
	const contains = deck.blocks.some((block) =>
		block.columns.some((column) => normalizeHeader(column) === key),
	);
	if (enabled) {
		if (contains) return deck;
		const dataType = deck.columnTypes[key];
		return {
			...deck,
			blocks: [
				...deck.blocks,
				createBlock({ kind: blockKindFor(dataType), columns: [header], width: "full" }),
			],
		};
	}
	if (!contains) return deck;
	return {
		...deck,
		blocks: deck.blocks
			.map((block) => ({
				...block,
				columns: block.columns.filter((column) => normalizeHeader(column) !== key),
			}))
			.filter((block) => block.columns.length > 0),
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
			return withDraft(state, moveBlock(state.draft, action.blockId, action.toIndex));
		case "setBlockWidth":
			return reduceEditorState(state, {
				type: "patchBlock",
				blockId: action.blockId,
				patch: { width: action.width },
			});
		case "patchBlock":
			return withDraft(state, {
				...state.draft,
				blocks: state.draft.blocks.map((block) =>
					block.id === action.blockId ? patchBlock(block, action.patch) : block,
				),
			});
		case "addBlock": {
			const block = action.block ? cloneJson(action.block) : createBlock();
			const next = withDraft(state, { ...state.draft, blocks: [...state.draft.blocks, block] });
			return { ...next, selectedBlockId: block.id };
		}
		case "removeBlock":
			return withDraft(state, {
				...state.draft,
				blocks: state.draft.blocks.filter((block) => block.id !== action.blockId),
			});
		case "replaceBlocks":
			return withDraft(state, {
				...state.draft,
				blocks: action.blocks.map((block) => cloneJson(block)),
			});
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
		case "setColumnEnabled":
			return withDraft(state, setColumnEnabled(state.draft, action.header, action.enabled));
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
		selectedBlockId:
			state.selectedBlockId && previous.blocks.some((block) => block.id === state.selectedBlockId)
				? state.selectedBlockId
				: (previous.blocks[0]?.id ?? null),
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
		selectedBlockId:
			state.selectedBlockId && next.blocks.some((block) => block.id === state.selectedBlockId)
				? state.selectedBlockId
				: (next.blocks[0]?.id ?? null),
	};
}

export function isDirty(state: EditorState): boolean {
	return !sameDeck(state.baseline, state.draft);
}
