import type { Card, CardBlock, CellValue } from "../model";
import { parseCell } from "../parse/cells";
import { normalizeHeader } from "../parse/table-scanner";

export interface ResolvedBlock {
	block: CardBlock;
	visible: boolean;
	values: CellValue[];
	placeholder: boolean;
}

export interface ResolvedCard {
	card: Card;
	blocks: ResolvedBlock[];
	skipReason: null | { code: "requiredEmpty"; blockId: string };
}

export function isConfiguredEmpty(value: CellValue | string | null | undefined, tokens: string[]): boolean {
	const raw = typeof value === "string" ? value : (value?.raw ?? "");
	const normalized = raw.normalize("NFKC").trim().toLocaleLowerCase();
	return tokens.some((token) => token.normalize("NFKC").trim().toLocaleLowerCase() === normalized);
}

function valuesFor(card: Card, block: CardBlock): CellValue[] {
	const byHeader = new Map<string, CellValue>();
	for (const [header, value] of Object.entries(card.cells)) {
		byHeader.set(normalizeHeader(header), value);
	}
	const values: CellValue[] = [];
	const seen = new Set<string>();
	for (const column of block.columns) {
		const key = normalizeHeader(column);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		const value = byHeader.get(key);
		if (value && !isConfiguredEmpty(value, block.empty.emptyTokens)) {
			values.push(value);
		}
	}
	return block.combine === "firstNonEmpty" || block.empty.mode === "fallback" ? values.slice(0, 1) : values;
}

export function resolveBlock(card: Card, block: CardBlock): ResolvedBlock {
	if (!block.visible) {
		return { block, visible: false, values: [], placeholder: false };
	}
	const values = valuesFor(card, block);
	if (values.length > 0) {
		return { block, visible: true, values, placeholder: false };
	}
	switch (block.empty.mode) {
		case "dash":
			return { block, visible: true, values: [parseCell("—")], placeholder: true };
		case "custom":
			return { block, visible: true, values: [parseCell(block.empty.customText)], placeholder: true };
		case "preserve":
			return { block, visible: true, values: [parseCell("")], placeholder: true };
		case "fallback":
		case "hide":
			return { block, visible: false, values: [], placeholder: false };
	}
}

export function resolveCard(card: Card, blocks: CardBlock[]): ResolvedCard {
	const resolved = blocks.map((block) => resolveBlock(card, block));
	const requiredMissing = resolved.find(
		(item) => item.block.visible && item.block.empty.required && (item.placeholder || item.values.length === 0),
	);
	return {
		card,
		blocks: resolved,
		skipReason: requiredMissing ? { code: "requiredEmpty", blockId: requiredMissing.block.id } : null,
	};
}
