import type { CellValue, ColumnDataType, ImageRef } from "../model";

const OBSIDIAN_IMAGE = /!\[\[([^\]]+)\]\]/g;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g;

function basename(path: string): string {
	const clean = path.split(/[?#]/, 1)[0] ?? path;
	const part = clean.split("/").pop() ?? clean;
	return decodeURIComponent(part || path);
}

function sizeOf(alias: string | undefined): Pick<ImageRef, "width" | "height"> {
	if (!alias) {
		return {};
	}
	const match = /^(\d+)(?:x(\d+))?$/.exec(alias.trim());
	if (!match) {
		return {};
	}
	return {
		width: Number(match[1]),
		height: match[2] ? Number(match[2]) : undefined,
	};
}

function isExternalSource(source: string): boolean {
	return /^(?:https?:)?\/\//i.test(source) || /^data:/i.test(source);
}

export function parseImageRefs(markdown: string): ImageRef[] {
	const images: ImageRef[] = [];
	for (const match of markdown.matchAll(OBSIDIAN_IMAGE)) {
		const payload = (match[1] ?? "").trim();
		const [rawSource = "", ...aliasParts] = payload.split("|");
		const source = rawSource.trim();
		if (!source) {
			continue;
		}
		const alias = aliasParts.join("|").trim();
		const size = sizeOf(alias);
		images.push({
			source,
			alt: alias && size.width === undefined ? alias : basename(source),
			...size,
			external: false,
		});
	}
	for (const match of markdown.matchAll(MARKDOWN_IMAGE)) {
		const source = (match[2] ?? "").replace(/^<|>$/g, "").trim();
		if (!source) {
			continue;
		}
		images.push({
			source,
			alt: (match[1] ?? "").trim() || basename(source),
			external: isExternalSource(source),
		});
	}
	return images;
}

export function stripImageSyntax(markdown: string): string {
	return markdown.replace(OBSIDIAN_IMAGE, "").replace(MARKDOWN_IMAGE, "");
}

export function stripMarkdownText(markdown: string): string {
	return markdown
		.replace(OBSIDIAN_IMAGE, (_match, payload: string) => {
			const [source = "", ...aliasParts] = payload.split("|");
			const alias = aliasParts.join("|").trim();
			return alias && sizeOf(alias).width === undefined ? alias : basename(source.trim());
		})
		.replace(MARKDOWN_IMAGE, (_match, alt: string, source: string) => alt.trim() || basename(source))
		.replace(/\[([^\]]+)\]\((?:<[^>]+>|[^)]+)\)/g, "$1")
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/<https?:\/\/[^>]+>/g, (value) => value.slice(1, -1))
		.replace(/<[^>]+>/g, "")
		.replace(/(?:\*\*|__|~~|`|\*|_)/g, "")
		.replace(/^\s{0,3}>\s?/gm, "")
		.replace(/\\([\\`*{}[\]()#+\-.!|_>])/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
}

export function detectCellType(raw: string, images = parseImageRefs(raw)): ColumnDataType {
	const trimmed = raw.trim();
	if (!trimmed) {
		return "text";
	}
	if (images.length > 0 && stripImageSyntax(trimmed).trim() === "") {
		return "image";
	}
	if (/^(?:true|false|yes|no|да|нет|\[[ xX]\])$/i.test(trimmed)) {
		return "boolean";
	}
	if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed) && Number.isFinite(Number(trimmed))) {
		return "number";
	}
	if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(trimmed)) {
		return "date";
	}
	if (/^(?:#[\p{L}\p{N}_-]+(?:\s*[,;]\s*|\s+))+#[\p{L}\p{N}_-]+$/u.test(trimmed)) {
		return "tags";
	}
	if (/\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)/.test(trimmed)) {
		return "link";
	}
	if (/(?:\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|^\s{0,3}>\s+)/m.test(trimmed)) {
		return "markdown";
	}
	return "text";
}

export function parseCell(input: string): CellValue {
	const raw = input.trim();
	const images = parseImageRefs(raw);
	return {
		raw,
		text: stripMarkdownText(raw),
		detectedType: detectCellType(raw, images),
		images,
	};
}
