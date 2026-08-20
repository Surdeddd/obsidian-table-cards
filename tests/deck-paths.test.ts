import { describe, expect, it } from "vitest";
import { renamedDeckSources } from "../src/deck/paths";
import type { DeckSource } from "../src/model";

function source(id: string, path: string, kind: DeckSource["kind"] = "file"): DeckSource {
	return { id, kind, path, tables: { mode: "all" } };
}

describe("vault renames", () => {
	it("follows a note that moved", () => {
		const sources = [source("a", "Vocab.md"), source("b", "Phrases.md")];
		expect(renamedDeckSources(sources, "Vocab.md", "English/Vocab.md")).toEqual([
			source("a", "English/Vocab.md"),
			source("b", "Phrases.md"),
		]);
	});

	it("follows every note inside a renamed folder", () => {
		const sources = [source("a", "Study", "folder"), source("b", "Study/Vocab.md"), source("c", "Other.md")];
		expect(renamedDeckSources(sources, "Study", "English")).toEqual([
			source("a", "English", "folder"),
			source("b", "English/Vocab.md"),
			source("c", "Other.md"),
		]);
	});

	it("leaves a deck alone when nothing it uses moved", () => {
		expect(renamedDeckSources([source("a", "Vocab.md")], "Notes/Diary.md", "Diary.md")).toBeNull();
	});

	it("does not treat a shared prefix as a folder move", () => {
		expect(renamedDeckSources([source("a", "Studying.md")], "Study", "English")).toBeNull();
	});
});
