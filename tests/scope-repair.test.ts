import { describe, expect, it } from "vitest";
import { tableKey } from "../src/deck/catalog";
import { repairScope } from "../src/deck/table-identity";
import type { StudyScope, TableCatalogItem } from "../src/model";

function catalogItem(path: string, headers: string[], occurrence = 0): TableCatalogItem {
	const selector = { headerSignature: headers.join("\u001f"), occurrence };
	return {
		key: tableKey(path, selector),
		selector,
		sourcePath: path,
		sourceIds: ["source"],
		label: headers[0] ?? "Table",
		tableNumber: occurrence + 1,
		headingPath: [],
		headers,
		rowCount: 3,
	};
}

const vocab = catalogItem("Vocab.md", ["word", "translation", "example", "level"]);
const grown = catalogItem("Vocab.md", ["word", "translation", "example", "level", "audio"]);
const phrases = catalogItem("Vocab.md", ["phrase", "meaning"]);

describe("repairing a saved study scope", () => {
	it("leaves an all-tables scope alone", () => {
		const scope: StudyScope = { mode: "all" };
		expect(repairScope(scope, [grown])).toEqual({ scope, missing: 0 });
	});

	it("keeps keys that still exist", () => {
		const scope: StudyScope = { mode: "tables", tableKeys: [vocab.key] };
		expect(repairScope(scope, [vocab, phrases])).toEqual({ scope, missing: 0 });
	});

	it("remaps a table that gained a column", () => {
		const scope: StudyScope = { mode: "tables", tableKeys: [vocab.key] };
		expect(repairScope(scope, [grown, phrases])).toEqual({
			scope: { mode: "tables", tableKeys: [grown.key] },
			missing: 0,
		});
	});

	it("reports a table it cannot recognise", () => {
		const scope: StudyScope = { mode: "tables", tableKeys: [vocab.key] };
		expect(repairScope(scope, [phrases])).toEqual({
			scope: { mode: "tables", tableKeys: [] },
			missing: 1,
		});
	});

	it("does not duplicate a key when two stale keys point at one table", () => {
		const scope: StudyScope = {
			mode: "tables",
			tableKeys: [vocab.key, catalogItem("Vocab.md", ["word", "translation", "example"]).key],
		};
		const repaired = repairScope(scope, [grown]);
		expect(repaired.scope).toEqual({ mode: "tables", tableKeys: [grown.key] });
		expect(repaired.missing).toBe(1);
	});
});
