import { describe, expect, it } from "vitest";
import type { ColumnDataType, ColumnProfile } from "../src/model";
import { blocksForPreset, rankPresets, type PresetId } from "../src/setup/presets";

function profile(header: string, inferredType: ColumnDataType): ColumnProfile {
	return {
		header,
		inferredType,
		confidence: 1,
		total: 10,
		nonEmpty: 10,
		unique: 10,
		samples: [header],
		warnings: [],
	};
}

describe("smart presets", () => {
	it("recommends vocabulary for term, translation, example, and image", () => {
		const ranked = rankPresets([
			profile("Word", "text"),
			profile("Translation", "text"),
			profile("Example", "text"),
			profile("Picture", "image"),
		]);
		expect(ranked[0]?.id).toBe("vocabulary");
	});

	it("recommends gallery when image evidence dominates", () => {
		expect(rankPresets([profile("Image", "image"), profile("Caption", "text")])[0]?.id).toBe("gallery");
	});

	it.each([
		["phrases", [profile("Phrase", "text"), profile("Translation", "text"), profile("Context", "text")]],
		["qa", [profile("Question", "text"), profile("Answer", "markdown")]],
		["reference", [profile("Title", "text"), profile("Year", "number"), profile("Author", "text"), profile("Status", "tags")]],
		["universal", [profile("Unknown", "mixed")]],
	] as const)("recommends %s for its canonical shape", (expected, profiles) => {
		expect(rankPresets(profiles)[0]?.id).toBe(expected);
	});

	it("always returns all six presets in deterministic order", () => {
		expect(rankPresets([profile("Unknown", "mixed")]).map((item) => item.id)).toEqual([
			"universal", "reference", "vocabulary", "phrases", "qa", "gallery",
		]);
	});

	it("emits normal editable blocks and never loses a column", () => {
		const profiles = [profile("Question", "text"), profile("Answer", "markdown"), profile("Notes", "text")];
		const blocks = blocksForPreset("qa", profiles);
		expect(blocks[0]).toMatchObject({ kind: "title", columns: ["Question"] });
		expect(new Set(blocks.flatMap((block) => block.columns))).toEqual(new Set(profiles.map((item) => item.header)));
		expect(blocks.every((block) => block.id.startsWith("block-"))).toBe(true);
	});

	it("uses an image-named column even before its type inference is corrected", () => {
		expect(blocksForPreset("gallery", [profile("Picture", "text")])[0]).toMatchObject({
			kind: "image",
			columns: ["Picture"],
		});
	});

	it.each([
		["vocabulary", [profile("Word", "text"), profile("Translation", "text"), profile("IPA", "text"), profile("Tags", "tags"), profile("Example", "text"), profile("Note", "text"), profile("Picture", "image"), profile("Level", "number")]],
		["phrases", [profile("Phrase", "text"), profile("Translation", "text"), profile("Context", "text"), profile("Note", "text"), profile("Level", "number")]],
		["qa", [profile("Question", "text"), profile("Answer", "markdown"), profile("Explanation", "text"), profile("Picture", "image"), profile("Level", "number")]],
		["gallery", [profile("Picture", "image"), profile("Title", "text"), profile("Tags", "tags"), profile("Description", "text"), profile("Year", "number")]],
		["reference", [profile("Title", "text"), profile("Year", "number"), profile("Author", "text"), profile("Status", "tags")]],
		["universal", [profile("Question", "text"), profile("Picture", "image"), profile("Tags", "tags"), profile("Body", "markdown")]],
	] as const)("maps every input header exactly once for %s", (presetId, profiles) => {
		const headers = blocksForPreset(presetId as PresetId, profiles).flatMap((block) => block.columns);
		expect(headers).toHaveLength(profiles.length);
		expect([...headers].sort()).toEqual(profiles.map((profile) => profile.header).sort());
	});
});
