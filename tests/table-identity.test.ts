import { describe, expect, it } from "vitest";
import { matchStaleTables, type TableIdentity } from "../src/deck/table-identity";

function identity(path: string, headers: string[], occurrence = 0): TableIdentity {
	return { path, signature: headers.join("\u001f"), occurrence };
}

describe("re-identifying tables whose columns changed", () => {
	it("keeps an exact match", () => {
		const live = [identity("Vocab.md", ["word", "translation"])];
		expect(matchStaleTables([identity("Vocab.md", ["word", "translation"])], live)).toEqual([0]);
	});

	it("follows a table that gained a column", () => {
		const live = [
			identity("Vocab.md", ["word", "translation", "example", "level", "audio"]),
			identity("Vocab.md", ["phrase", "meaning"]),
		];
		const stale = [identity("Vocab.md", ["word", "translation", "example", "level"])];
		expect(matchStaleTables(stale, live)).toEqual([0]);
	});

	it("follows a table that renamed one column", () => {
		const live = [identity("Vocab.md", ["word", "translation", "example", "note"])];
		expect(matchStaleTables([identity("Vocab.md", ["word", "translation", "example", "level"])], live)).toEqual([0]);
	});

	it("never steals a table that another selection already owns", () => {
		const live = [
			identity("Vocab.md", ["word", "translation"], 0),
			identity("Vocab.md", ["word", "translation", "level"], 0),
		];
		const stale = [
			identity("Vocab.md", ["word", "translation"], 0),
			identity("Vocab.md", ["word", "translation"], 1),
		];
		expect(matchStaleTables(stale, live)).toEqual([0, 1]);
	});

	it("stays in the same note", () => {
		const live = [identity("Other.md", ["word", "translation", "example"])];
		expect(matchStaleTables([identity("Vocab.md", ["word", "translation", "example"])], live)).toEqual([null]);
	});

	it("refuses a table that shares too little", () => {
		const live = [identity("Vocab.md", ["date", "amount", "category"])];
		expect(matchStaleTables([identity("Vocab.md", ["word", "translation", "example"])], live)).toEqual([null]);
	});

	it("refuses to guess between two equally similar tables", () => {
		const live = [
			identity("Vocab.md", ["word", "translation", "a"]),
			identity("Vocab.md", ["word", "translation", "b"]),
		];
		expect(matchStaleTables([identity("Vocab.md", ["word", "translation", "c"])], live)).toEqual([null]);
	});
});
