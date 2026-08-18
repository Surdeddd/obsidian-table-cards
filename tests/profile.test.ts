import { describe, expect, it } from "vitest";
import { parseCell, scanMarkdownTables } from "../src/parse/tables";
import { inferColumnType, profileColumn, profileColumns } from "../src/parse/profile";

describe("column profiling", () => {
	it.each([
		[["42", "-3.5", "1000"], "number"],
		[["2026-08-18", "2025-01-02"], "date"],
		[["true", "нет", "yes"], "boolean"],
		[["#english, #verb", "#study, #daily"], "tags"],
		[["[[Note]]", "[Docs](docs.md)"], "link"],
		[["![[cat.png]]", "![Dog](dog.png)"], "image"],
		[["**bold**", "`code`"], "markdown"],
	])("infers %j as %s", (values, expected) => {
		expect(inferColumnType(values).type).toBe(expected);
	});

	it("keeps ambiguous dates as text", () => {
		expect(inferColumnType(["01/02/03", "04/05/06"]).type).toBe("text");
	});

	it("marks an undominated column as mixed", () => {
		expect(inferColumnType(["42", "hello", "2026-08-18"]).type).toBe("mixed");
	});

	it("reports fill, unique values, samples, and image warnings", () => {
		const profile = profileColumn(
			"Picture",
			[parseCell("![[ok.png]]"), parseCell(""), parseCell("![[missing.png]]")],
			{ isImageResolvable: (source) => source === "ok.png" },
		);
		expect(profile).toMatchObject({
			total: 3,
			nonEmpty: 2,
			unique: 2,
			warnings: ["brokenImage"],
		});
		expect(profile.samples).toEqual(["ok.png", "missing.png"]);
	});

	it("marks columns below fifty percent fill as mostly empty", () => {
		const profile = profileColumn("Note", [parseCell("one"), parseCell(""), parseCell(""), parseCell("")]);
		expect(profile.warnings).toContain("mostlyEmpty");
	});

	it("applies stored overrides without changing measured confidence", () => {
		const tables = scanMarkdownTables("| Value |\n|---|\n|42|\n|43|", "values.md");
		const measured = profileColumns(tables, {})[0];
		const overridden = profileColumns(tables, { value: "text" })[0];
		expect(measured?.inferredType).toBe("number");
		expect(overridden?.inferredType).toBe("text");
		expect(overridden?.confidence).toBe(measured?.confidence);
	});
});
