/** @param {string} markdown */
function withoutFencedCode(markdown) {
	/** @type {string | null} */
	let fence = null;
	return markdown.split("\n").map((line) => {
		const marker = /^\s*(`{3,}|~{3,})/u.exec(line)?.[1] ?? null;
		if (marker && (!fence || marker[0] === fence[0])) {
			fence = fence ? null : marker;
			return "";
		}
		return fence ? "" : line;
	}).join("\n");
}

/** @param {string} value */
function referenceId(value) {
	return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

/** Return destinations from inline, reference, and autolink Markdown syntax. */
/** @param {string} markdown */
export function markdownLinks(markdown) {
	const source = withoutFencedCode(markdown);
	/** @type {Map<string, string>} */
	const definitions = new Map();
	const definitionPattern = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+.*)?$/gmu;
	for (const match of source.matchAll(definitionPattern)) {
		definitions.set(referenceId(match[1] ?? ""), match[2] ?? match[3] ?? "");
	}

	/** @type {string[]} */
	const links = [];
	const inlinePattern = /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|((?:\\.|[^()\s]|\([^()]*\))+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu;
	for (const match of source.matchAll(inlinePattern)) links.push(match[1] ?? match[2] ?? "");

	const body = source.replace(definitionPattern, "");
	const referencePattern = /!?\[([^\]]+)\]\[([^\]]*)\]/gu;
	for (const match of body.matchAll(referencePattern)) {
		const id = referenceId(match[2] || match[1] || "");
		const destination = definitions.get(id);
		if (destination) links.push(destination);
	}

	const shortcutPattern = /!?\[([^\]]+)\](?!\s*[([])/gu;
	for (const match of body.matchAll(shortcutPattern)) {
		const destination = definitions.get(referenceId(match[1] ?? ""));
		if (destination) links.push(destination);
	}

	for (const match of body.matchAll(/<(https?:\/\/[^>]+)>/gu)) links.push(match[1] ?? "");
	return [...new Set(links.filter(Boolean))];
}

/** @param {string} heading */
function headingSlug(heading) {
	return heading
		.replace(/<[^>]*>/gu, "")
		.replace(/!?(?:\[([^\]]+)\]\([^)]*\)|\[([^\]]+)\])/gu, "$1$2")
		.replace(/[`*_~]/gu, "")
		.toLocaleLowerCase("en-US")
		.replace(/[^\p{L}\p{N}\s_-]/gu, "")
		.trim()
		.replace(/\s/gu, "-");
}

/** Return GitHub-style anchors for ATX and setext headings. */
/** @param {string} markdown */
export function markdownAnchors(markdown) {
	const source = withoutFencedCode(markdown);
	const headings = [];
	const lines = source.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const atx = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u.exec(lines[index] ?? "");
		if (atx) headings.push(atx[1] ?? "");
		else if (index > 0 && /^\s{0,3}(?:=+|-+)\s*$/u.test(lines[index] ?? "")) {
			headings.push((lines[index - 1] ?? "").trim());
		}
	}

	/** @type {Map<string, number>} */
	const counts = new Map();
	return new Set(headings.map((heading) => {
		const slug = headingSlug(heading);
		const count = counts.get(slug) ?? 0;
		counts.set(slug, count + 1);
		return count ? `${slug}-${count}` : slug;
	}));
}
