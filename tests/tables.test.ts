import { describe, expect, it } from "vitest";
import { activeBlocks } from "../src/model";
import { guessStyle, placeRemaining, unusedHeaders } from "../src/layout";
import { defaultAppearance, shouldSplit } from "../src/settings/appearance";
import { dictionaryBlocks, phrasesBlocks } from "../src/settings/defaults";
import {
	cellValues,
	cleanCell,
	headerSignature,
	isCardEmpty,
	isSeparatorRow,
	listTableHeaders,
	parseCell,
	parseMarkdownTables,
	scanMarkdownTables,
	splitTableRow,
} from "../src/parse/tables";
import { shuffleItems, wrapIndex } from "../src/deck/shuffle";

const DICT = `---
tags:
  - English
---

| **Words** | **Transcription** | **RuPron** | **Translation** | **Examples** | **Ex Translation** | **Memory Tip** |
| --------- | ----------------- | ---------- | --------------- | ------------ | ------------------ | -------------- |
| remain | /rɪˈmeɪn/ | [римэ́йн] | оставаться | Remain **careful**. | Оставайся осторожным. | РЕ-МЕЙН — ремень. |
| designer | /dɪˈzaɪnə/ | [диза́йнэ] | дизайнер | She is a designer. | Она дизайнер. | дизайнер |
`;

const EIGHT = `| A | B | C | D | E | F | G | H |
| --- | --- | --- | --- | --- | --- | --- | --- |
| one | two | three | four | five | six | seven | eight |
`;

describe("table parsing", () => {
	it("strips markdown from cells", () => {
		expect(cleanCell("Remain **careful**.")).toBe("Remain careful.");
	});

	it("splits pipe rows and skips separators", () => {
		expect(splitTableRow("| a | b |")).toEqual(["a", "b"]);
		expect(isSeparatorRow(["---", ":---:"])).toBe(true);
	});

	it("does not split pipes inside embeds, links, or escaped text", () => {
		expect(splitTableRow("| ![[image.png|300]] | [docs](https://x.test/a|b) | a\\|b |")).toEqual([
			"![[image.png|300]]",
			"[docs](https://x.test/a|b)",
			"a|b",
		]);
	});

	it("respects matching backtick runs for inline code spans", () => {
		expect(splitTableRow("| `a|b` | c |")).toEqual(["`a|b`", "c"]);
		expect(splitTableRow("| ``a|b``| c |")).toEqual(["``a|b``", "c"]);
		expect(splitTableRow("| ``a`|b```|c`` | d |")).toEqual(["``a`|b```|c``", "d"]);
		expect(splitTableRow("| ``a|b`` | c |")).toEqual(["``a|b``", "c"]);
	});

	it("parses Obsidian and Markdown images without losing raw text", () => {
		expect(parseCell("![[assets/cat.png|300x200]]")).toMatchObject({
			raw: "![[assets/cat.png|300x200]]",
			detectedType: "image",
			images: [
				{
					source: "assets/cat.png",
					alt: "cat.png",
					width: 300,
					height: 200,
					external: false,
				},
			],
		});
		expect(parseCell("![Cat](https://example.com/cat.png)").images[0]).toMatchObject({
			source: "https://example.com/cat.png",
			alt: "Cat",
			external: true,
		});
	});

	it("returns stable selectors for repeated header signatures", () => {
		const tables = scanMarkdownTables(
			"| A | B |\n|---|---|\n|1|2|\n\n| A | B |\n|---|---|\n|3|4|",
			"x.md",
		);
		expect(tables.map((table) => table.selector.occurrence)).toEqual([0, 1]);
		expect(tables[0]?.selector.headerSignature).toBe(tables[1]?.selector.headerSignature);
		expect(tables[0]?.selector.headerSignature).toBe(headerSignature(["A", "B"]));
	});

	it("uses the nearest preceding heading as the table path", () => {
		const tables = scanMarkdownTables(
			"# English\n## Verbs\n\n| Term | RU |\n|---|---|\n|remain|оставаться|",
			"words.md",
		);
		expect(tables[0]?.headingPath).toEqual(["English", "Verbs"]);
	});

	it("ignores headings and tables inside fenced code", () => {
		const tables = scanMarkdownTables(
			"```md\n# Fake\n| A |\n|---|\n|x|\n```\n\n## Real\n| B |\n|---|\n|y|",
			"x.md",
		);
		expect(tables).toHaveLength(1);
		expect(tables[0]?.headingPath).toEqual(["Real"]);
	});

	it("does not open a backtick fence when its info string contains a backtick", () => {
		const tables = scanMarkdownTables(
			"```md `inline`\n## Real\n| B |\n|---|\n|y|",
			"x.md",
		);
		expect(tables).toHaveLength(1);
		expect(tables[0]?.headingPath).toEqual(["Real"]);
	});

	it("reads any number of headers", () => {
		expect(listTableHeaders(DICT)).toEqual([
			"Words",
			"Transcription",
			"RuPron",
			"Translation",
			"Examples",
			"Ex Translation",
			"Memory Tip",
		]);
		expect(listTableHeaders(EIGHT)).toHaveLength(8);
	});

	it("parses rows as generic cells", () => {
		const cards = parseMarkdownTables(DICT, "Dictionary.md");
		expect(cards).toHaveLength(2);
		expect(cards[0]?.cells.Words?.text).toBe("remain");
		expect(cards[0]?.cells.Examples?.text).toBe("Remain careful.");
		expect(cards[0]?.origin.sourcePath).toBe("Dictionary.md");
		expect(cellValues(cards[0]?.cells ?? {}, ["Words", "word"])).toEqual(["remain"]);
	});

	it("keeps an 8-column table intact", () => {
		const cards = parseMarkdownTables(EIGHT);
		expect(cards[0]?.headers).toHaveLength(8);
		expect(cards[0]?.cells.H?.text).toBe("eight");
		expect(isCardEmpty(cards[0]!, ["A"])).toBe(false);
	});

	it("does not merge unrelated table blocks", () => {
		const markdown = "| A |\n|---|\n|one|\n\ntext\n\n| B |\n|---|\n|two|";
		const tables = scanMarkdownTables(markdown, "separate.md");
		expect(tables).toHaveLength(2);
		expect(tables[0]?.headers).toEqual(["A"]);
		expect(tables[1]?.headers).toEqual(["B"]);
	});

	it("keeps one-column and 1,000-row fixtures stable", () => {
		const rows = Array.from({ length: 1000 }, (_, index) => `| value-${index} |`).join("\n");
		const [table] = scanMarkdownTables(`| Word |\n|---|\n${rows}`, "large.md");
		expect(table?.headers).toEqual(["Word"]);
		expect(table?.rows).toHaveLength(1000);
		expect(table?.rows[999]?.Word?.text).toBe("value-999");
	});
});

describe("shuffle", () => {
	it("is deterministic for a seed", () => {
		const items = [1, 2, 3, 4, 5, 6];
		expect(shuffleItems(items, 42)).toEqual(shuffleItems(items, 42));
		expect(shuffleItems(items, 42)).not.toEqual(items);
	});

	it("wraps indexes", () => {
		expect(wrapIndex(-1, 5)).toBe(4);
		expect(wrapIndex(5, 5)).toBe(0);
	});
});

describe("layout", () => {
	it("makes every enabled block visible immediately", () => {
		const blocks = dictionaryBlocks();
		expect(activeBlocks(blocks)).toHaveLength(blocks.length);
		expect(activeBlocks(blocks).every((block) => !("face" in block))).toBe(true);
		expect(activeBlocks(phrasesBlocks()).length).toBeGreaterThan(2);
	});

	it("splits only when wide enough", () => {
		const look = defaultAppearance();
		expect(shouldSplit(500, look)).toBe(false);
		expect(shouldSplit(900, look)).toBe(true);
		look.twoColumn = false;
		expect(shouldSplit(900, look)).toBe(false);
	});

	it("keeps ordered full and half-width blocks", () => {
		const blocks = dictionaryBlocks();
		expect(blocks[0]?.kind).toBe("title");
		expect(blocks[0]?.width).toBe("full");
		expect(blocks.some((block) => block.width === "half")).toBe(true);
	});

	it("appends leftover columns to the visible layout", () => {
		const headers = ["Words", "Extra", "Also"];
		const next = placeRemaining(headers, dictionaryBlocks());
		expect(unusedHeaders(headers, next)).toEqual([]);
		expect(next.some((block) => block.columns.includes("Extra"))).toBe(true);
		expect(guessStyle("Memory Tip")).toBe("note");
		expect(guessStyle("Examples")).toBe("quote");
	});
});
