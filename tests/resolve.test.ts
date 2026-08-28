import { describe, expect, it } from "vitest";
import { createBlock, type Card, type ColumnProfile } from "../src/model";
import { autoLayout } from "../src/layout";
import { isConfiguredEmpty, resolveBlock, resolveCard } from "../src/layout/resolve";
import { headerSignature, parseCell } from "../src/parse/tables";

function card(values: Record<string, string>): Card {
	return {
		cells: Object.fromEntries(Object.entries(values).map(([header, value]) => [header, parseCell(value)])),
		headers: Object.keys(values),
		origin: {
			tableKey: `fixture.md\u0000${headerSignature(Object.keys(values))}\u00000`,
			tableLabel: "Table 1",
			tableNumber: 1,
			sourcePath: "fixture.md",
			rowNumber: 3,
			rowKey: "fixture-row",
		},
	};
}

describe("block resolution", () => {
	it.each([
		["hide", false, ""],
		["dash", true, "—"],
		["custom", true, "Нет данных"],
		["preserve", true, ""],
	] as const)("resolves %s empty policy", (mode, visible, text) => {
		const block = createBlock({
			columns: ["A"],
			empty: { mode, customText: "Нет данных", emptyTokens: ["", "-"], required: false },
		});
		const resolved = resolveBlock(card({ A: "-" }), block);
		expect(resolved.visible).toBe(visible);
		expect(resolved.values[0]?.text ?? "").toBe(text);
	});

	it("uses the first non-empty fallback column", () => {
		const block = createBlock({
			columns: ["A", "B"],
			combine: "firstNonEmpty",
			empty: { mode: "fallback", customText: "", emptyTokens: [""], required: false },
		});
		expect(resolveBlock(card({ A: "", B: "second" }), block).values[0]?.text).toBe("second");
	});

	it("keeps all non-empty configured values in order", () => {
		const block = createBlock({ columns: ["B", "A"], combine: "all" });
		expect(resolveBlock(card({ A: "first", B: "second" }), block).values.map((value) => value.text)).toEqual([
			"second",
			"first",
		]);
	});

	it("matches configured columns by normalized header", () => {
		const block = createBlock({ columns: [" word "] });
		expect(resolveBlock(card({ "**Word**": "remain" }), block).values[0]?.text).toBe("remain");
	});

	it("skips a card when a required visible block is empty", () => {
		const block = createBlock({
			columns: ["Term"],
			empty: { mode: "hide", customText: "", emptyTokens: [""], required: true },
		});
		expect(resolveCard(card({ Term: "" }), [block]).skipReason).toEqual({
			code: "requiredEmpty",
			blockId: block.id,
		});
	});

	it("does not let a hidden required block skip the card", () => {
		const block = createBlock({
			visible: false,
			columns: ["Term"],
			empty: { mode: "hide", customText: "", emptyTokens: [""], required: true },
		});
		expect(resolveCard(card({ Term: "" }), [block]).skipReason).toBeNull();
	});

	it("normalizes configured empty tokens", () => {
		expect(isConfiguredEmpty(" N/A ", ["n/a"])).toBe(true);
		expect(isConfiguredEmpty("word", ["n/a"])).toBe(false);
	});
});

function profile(
	header: string,
	inferredType: ColumnProfile["inferredType"],
	nonEmpty = 10,
	total = 10,
): ColumnProfile {
	return {
		header,
		inferredType,
		confidence: 1,
		total,
		nonEmpty,
		unique: nonEmpty,
		samples: [],
		warnings: [],
	};
}

describe("automatic layout", () => {
	it("maps profiled columns into an ordered responsive layout", () => {
		const blocks = autoLayout([
			profile("Words", "text"),
			profile("Photo", "image"),
			profile("Tags", "tags"),
			profile("Example", "markdown"),
			profile("Memory tip", "text"),
			profile("Translation", "text"),
		]);

		expect(blocks.map((block) => [block.columns[0], block.kind, block.width])).toEqual([
			["Words", "title", "half"],
			["Photo", "image", "full"],
			["Tags", "chips", "full"],
			["Example", "quote", "full"],
			["Memory tip", "note", "full"],
			["Translation", "text", "full"],
		]);
		expect(blocks[0]?.empty.required).toBe(true);
	});

	it("does not require a sparse title-like column", () => {
		const [block] = autoLayout([profile("Term", "text", 3, 10)]);
		expect(block?.kind).toBe("text");
		expect(block?.empty.required).toBe(false);
	});

	it("titles a table by its first column when no header says so", () => {
		const blocks = autoLayout([
			profile("Idiom", "text"),
			profile("Literal", "text"),
			profile("Sense", "text"),
		]);

		expect(blocks.map((block) => [block.columns[0], block.kind])).toEqual([
			["Idiom", "title"],
			["Literal", "text"],
			["Sense", "text"],
		]);
	});

	it("leaves a repeating first column as an ordinary field", () => {
		const repeating = { ...profile("Register", "text"), unique: 2 };
		const blocks = autoLayout([repeating, profile("Sense", "text")]);

		expect(blocks.map((block) => block.kind)).toEqual(["text", "text"]);
	});

	it("still prefers a column the header names over the first one", () => {
		const blocks = autoLayout([profile("Sense", "text"), profile("Word", "text")]);

		expect(blocks.map((block) => [block.columns[0], block.kind])).toEqual([
			["Sense", "text"],
			["Word", "title"],
		]);
	});

	it("skips a block whose columns the table does not have", () => {
		const block = createBlock({
			columns: ["Word"],
			empty: { mode: "dash", customText: "", emptyTokens: [""], required: false },
		});

		const resolved = resolveBlock(card({ Phrase: "break the ice" }), block);

		expect(resolved.applicable).toBe(false);
		expect(resolved.visible).toBe(false);
	});

	it("keeps a row a table cannot fill a required foreign column for", () => {
		const title = createBlock({
			kind: "title",
			columns: ["Word"],
			empty: { mode: "hide", customText: "", emptyTokens: [""], required: true },
		});
		const meaning = createBlock({ columns: ["Meaning"] });

		const foreign = resolveCard(card({ Phrase: "break the ice", Meaning: "начать разговор" }), [title, meaning]);
		const own = resolveCard(card({ Word: "", Meaning: "" }), [title, meaning]);

		expect(foreign.skipReason).toBeNull();
		expect(own.skipReason?.blockId).toBe(title.id);
	});
});
