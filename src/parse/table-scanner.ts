import type { ParsedTable, TableSelector } from "../model";
import { parseCell, stripMarkdownText } from "./cells";

function isEscaped(source: string, index: number): boolean {
	let slashes = 0;
	for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
		slashes += 1;
	}
	return slashes % 2 === 1;
}

export function splitTableRow(line: string): string[] | null {
	const source = line.trim();
	if (!source) {
		return null;
	}
	const cells: string[] = [];
	let cell = "";
	let wikiDepth = 0;
	let destinationDepth = 0;
	let inCode = false;
	let delimiterCount = 0;

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index] ?? "";
		const next = source[index + 1] ?? "";
		if (char === "\\" && next === "|") {
			cell += "|";
			index += 1;
			continue;
		}
		if (char === "`" && !isEscaped(source, index)) {
			inCode = !inCode;
			cell += char;
			continue;
		}
		if (!inCode && char === "[" && next === "[") {
			wikiDepth += 1;
			cell += "[[";
			index += 1;
			continue;
		}
		if (!inCode && char === "]" && next === "]" && wikiDepth > 0) {
			wikiDepth -= 1;
			cell += "]]";
			index += 1;
			continue;
		}
		if (!inCode && wikiDepth === 0) {
			if (char === "(" && source[index - 1] === "]") {
				destinationDepth = 1;
			} else if (char === "(" && destinationDepth > 0) {
				destinationDepth += 1;
			} else if (char === ")" && destinationDepth > 0) {
				destinationDepth -= 1;
			}
		}
		if (char === "|" && !inCode && wikiDepth === 0 && destinationDepth === 0) {
			cells.push(cell.trim());
			cell = "";
			delimiterCount += 1;
			continue;
		}
		cell += char;
	}
	cells.push(cell.trim());
	if (delimiterCount === 0) {
		return null;
	}
	if (cells[0] === "") {
		cells.shift();
	}
	if (cells[cells.length - 1] === "") {
		cells.pop();
	}
	return cells;
}

export function isSeparatorRow(cells: string[]): boolean {
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

export function normalizeHeader(name: string): string {
	return stripMarkdownText(name).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function headerSignature(headers: string[]): string {
	return headers.map((header) => normalizeHeader(header)).join("\u001f");
}

export function tableSelector(headers: string[], occurrence: number): TableSelector {
	return { headerSignature: headerSignature(headers), occurrence };
}

function displayHeaders(rawHeaders: string[]): string[] {
	const counts = new Map<string, number>();
	return rawHeaders.map((rawHeader, index) => {
		const base = stripMarkdownText(rawHeader) || `Column ${index + 1}`;
		const key = normalizeHeader(base);
		const count = (counts.get(key) ?? 0) + 1;
		counts.set(key, count);
		return count === 1 ? base : `${base} (${count})`;
	});
}

export function scanMarkdownTables(markdown: string, sourcePath = ""): ParsedTable[] {
	const lines = markdown.split(/\r?\n/);
	const tables: ParsedTable[] = [];
	const occurrences = new Map<string, number>();
	const headingStack: string[] = [];
	let fence: { marker: "`" | "~"; length: number } | null = null;
	for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex += 1) {
		const line = lines[lineIndex] ?? "";
		if (fence) {
			const closing = /^ {0,3}(`+|~+)\s*$/.exec(line);
			if (closing?.[1]?.startsWith(fence.marker) && closing[1].length >= fence.length) {
				fence = null;
			}
			continue;
		}
		const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
		if (opening?.[1] && (opening[1][0] === "~" || !line.slice(opening[0].length).includes("`"))) {
			fence = { marker: opening[1][0] as "`" | "~", length: opening[1].length };
			continue;
		}
		const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (heading) {
			const level = heading[1]?.length ?? 1;
			headingStack[level - 1] = stripMarkdownText(heading[2] ?? "");
			headingStack.length = level;
			continue;
		}
		const rawHeaders = splitTableRow(line);
		const separator = splitTableRow(lines[lineIndex + 1] ?? "");
		if (!rawHeaders || !separator || rawHeaders.length !== separator.length || !isSeparatorRow(separator)) {
			continue;
		}
		const signature = headerSignature(rawHeaders);
		const occurrence = occurrences.get(signature) ?? 0;
		occurrences.set(signature, occurrence + 1);
		const headers = displayHeaders(rawHeaders);
		const rows: ParsedTable["rows"] = [];
		const rowNumbers: number[] = [];
		let cursor = lineIndex + 2;
		while (cursor < lines.length) {
			const row = splitTableRow(lines[cursor] ?? "");
			if (!row || isSeparatorRow(row)) {
				break;
			}
			const cells: Record<string, ReturnType<typeof parseCell>> = {};
			for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
				const header = headers[columnIndex];
				if (header) {
					cells[header] = parseCell(row[columnIndex] ?? "");
				}
			}
			rows.push(cells);
			rowNumbers.push(cursor + 1);
			cursor += 1;
		}
		tables.push({
			index: tables.length,
			selector: { headerSignature: signature, occurrence },
			headingPath: headingStack.filter(Boolean),
			headers,
			rawHeaders: rawHeaders.map((header) => stripMarkdownText(header)),
			rows,
			rowNumbers,
			sourcePath,
		});
		lineIndex = cursor - 1;
	}
	return tables;
}
