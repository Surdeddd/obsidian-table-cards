import {
	createBlock,
	type BlockKind,
	type CardBlock,
	type ColumnProfile,
} from "./model";
import { normalizeHeader } from "./parse/tables";

export function guessStyle(header: string): BlockKind {
	const name = header.toLowerCase();
	if (/(word|phrase|term|слова|слово|фраза|^v1$)/.test(name)) {
		return "title";
	}
	if (/(ipa|transcrip|pron|rupron|чтени|произн)/.test(name)) {
		return "chips";
	}
	if (/(example|пример)/.test(name)) {
		return "quote";
	}
	if (/(tip|memory|мнемон|буквальн|hint|note|подсказ)/.test(name)) {
		return "note";
	}
	return "text";
}

export function blockFromHeader(header: string): CardBlock {
	const kind = guessStyle(header);
	return createBlock({
		kind,
		width: kind === "title" || kind === "chips" ? "half" : "full",
		columns: [header],
	});
}

export function unusedHeaders(headers: string[], blocks: CardBlock[]): string[] {
	const used = new Set<string>();
	for (const block of blocks) {
		for (const column of block.columns) {
			used.add(normalizeHeader(column));
		}
	}
	return headers.filter((header) => !used.has(normalizeHeader(header)));
}

export function placeRemaining(headers: string[], blocks: CardBlock[]): CardBlock[] {
	const extra = unusedHeaders(headers, blocks).map((header) => blockFromHeader(header));
	return [...blocks, ...extra];
}

const TITLE_HEADER = /(^|\s)(word|words|phrase|term|title|слово|слова|фраза|термин|название)(\s|$)/i;
const EXAMPLE_HEADER = /(example|sentence|пример|предложение)/i;
const NOTE_HEADER = /(tip|memory|hint|note|мнемон|буквальн|подсказ|заметк)/i;

export function autoLayout(profiles: ColumnProfile[]): CardBlock[] {
	const titleIndex = profiles.findIndex(
		(profile) =>
			profile.inferredType === "text" &&
			profile.total > 0 &&
			profile.nonEmpty / profile.total >= 0.8 &&
			TITLE_HEADER.test(profile.header),
	);

	return profiles.map((profile, index) => {
		let kind: BlockKind = "text";
		if (profile.inferredType === "image") kind = "image";
		else if (profile.inferredType === "tags") kind = "chips";
		else if (index === titleIndex) kind = "title";
		else if (EXAMPLE_HEADER.test(profile.header)) kind = "quote";
		else if (NOTE_HEADER.test(profile.header)) kind = "note";

		return createBlock({
			kind,
			columns: [profile.header],
			label: profile.header,
			showLabel: kind !== "title" && kind !== "chips",
			width: kind === "title" ? "half" : "full",
			empty: {
				mode: "hide",
				customText: "",
				emptyTokens: ["", "-", "—", "n/a", "null"],
				required: kind === "title",
			},
		});
	});
}
