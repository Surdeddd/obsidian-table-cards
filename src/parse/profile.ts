import type { CellValue, ColumnDataType, ColumnProfile, ParsedTable } from "../model";
import { parseCell } from "./cells";
import { normalizeHeader } from "./table-scanner";

const DEFAULT_EMPTY_TOKENS = ["", "-", "—", "n/a", "null"];
const TYPE_ORDER: ColumnDataType[] = ["image", "boolean", "number", "date", "tags", "link", "markdown", "text"];

export interface TypeInference {
	type: ColumnDataType;
	confidence: number;
}

export interface ProfileOptions {
	emptyTokens?: string[];
	isImageResolvable?: (source: string) => boolean;
}

function normalizedTokens(tokens: string[]): Set<string> {
	return new Set(tokens.map((token) => token.normalize("NFKC").trim().toLocaleLowerCase()));
}

function isEmptyValue(value: string, tokens: Set<string>): boolean {
	return tokens.has(value.normalize("NFKC").trim().toLocaleLowerCase());
}

export function inferColumnType(
	values: string[],
	emptyTokens: string[] = DEFAULT_EMPTY_TOKENS,
): TypeInference {
	const tokens = normalizedTokens(emptyTokens);
	const parsed = values
		.filter((value) => !isEmptyValue(value, tokens))
		.map((value) => parseCell(value).detectedType);
	if (parsed.length === 0) {
		return { type: "text", confidence: 0 };
	}
	let strongest = 0;
	for (const type of TYPE_ORDER) {
		const confidence = parsed.filter((detected) => detected === type).length / parsed.length;
		strongest = Math.max(strongest, confidence);
		const threshold = type === "image" ? 1 : 0.8;
		if (confidence >= threshold) {
			return { type, confidence };
		}
	}
	return { type: "mixed", confidence: strongest };
}

export function profileColumn(
	header: string,
	cells: CellValue[],
	options: ProfileOptions = {},
): ColumnProfile {
	const tokens = normalizedTokens(options.emptyTokens ?? DEFAULT_EMPTY_TOKENS);
	const nonEmpty = cells.filter((cell) => !isEmptyValue(cell.raw, tokens));
	const inference = inferColumnType(
		nonEmpty.map((cell) => cell.raw),
		options.emptyTokens,
	);
	const unique = new Set<string>();
	const samples: string[] = [];
	for (const cell of nonEmpty) {
		const sample = cell.text || cell.raw;
		const key = sample.normalize("NFKC").toLocaleLowerCase();
		if (unique.has(key)) {
			continue;
		}
		unique.add(key);
		if (samples.length < 3) {
			samples.push(sample);
		}
	}
	const warnings: ColumnProfile["warnings"] = [];
	if (inference.type === "mixed") {
		warnings.push("mixed");
	}
	if (cells.length > 0 && nonEmpty.length / cells.length < 0.5) {
		warnings.push("mostlyEmpty");
	}
	if (
		options.isImageResolvable &&
		nonEmpty.some((cell) =>
			cell.images.some((image) => !image.external && !options.isImageResolvable?.(image.source)),
		)
	) {
		warnings.push("brokenImage");
	}
	return {
		header,
		inferredType: inference.type,
		confidence: inference.confidence,
		total: cells.length,
		nonEmpty: nonEmpty.length,
		unique: unique.size,
		samples,
		warnings,
	};
}

export function profileColumns(
	tables: ParsedTable[],
	overrides: Record<string, ColumnDataType> = {},
	options: ProfileOptions = {},
): ColumnProfile[] {
	const columns = new Map<string, { header: string; cells: CellValue[] }>();
	for (const table of tables) {
		for (const header of table.headers) {
			const key = normalizeHeader(header);
			const entry = columns.get(key) ?? { header, cells: [] };
			for (const row of table.rows) {
				const cell = row[header];
				if (cell) {
					entry.cells.push(cell);
				}
			}
			columns.set(key, entry);
		}
	}
	const normalizedOverrides = new Map(
		Object.entries(overrides).map(([header, dataType]) => [normalizeHeader(header), dataType]),
	);
	return Array.from(columns.entries(), ([key, column]) => {
		const profile = profileColumn(column.header, column.cells, options);
		return { ...profile, inferredType: normalizedOverrides.get(key) ?? profile.inferredType };
	});
}
