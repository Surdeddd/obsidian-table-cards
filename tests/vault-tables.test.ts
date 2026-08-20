import { describe, expect, it } from "vitest";
import { tableNotesFirst } from "../src/deck/vault-tables";

describe("markdown file ordering", () => {
	it("lists notes that contain a table before the rest", () => {
		const files = ["Diary.md", "Vocab.md", "Notes.md", "Phrases.md"];
		const hasTable = (path: string): boolean => path === "Vocab.md" || path === "Phrases.md";
		expect(tableNotesFirst(files, hasTable)).toEqual(["Vocab.md", "Phrases.md", "Diary.md", "Notes.md"]);
	});

	it("keeps the vault order when nothing has a table", () => {
		const files = ["a.md", "b.md"];
		expect(tableNotesFirst(files, () => false)).toEqual(files);
	});

	it("keeps the vault order when everything has a table", () => {
		const files = ["a.md", "b.md"];
		expect(tableNotesFirst(files, () => true)).toEqual(files);
	});
});
