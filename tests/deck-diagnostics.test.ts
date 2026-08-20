import { describe, expect, it } from "vitest";
import type { DeckDiagnostic } from "../src/model";
import { describeDiagnostics } from "../src/deck/diagnostics";

const t = (key: string, values?: Record<string, string>): string =>
	values ? `${key}(${Object.values(values).join(",")})` : key;

function diagnostic(partial: Partial<DeckDiagnostic> & { code: DeckDiagnostic["code"] }): DeckDiagnostic {
	return { sourcePath: "Vocab.md", detail: "", ...partial };
}

describe("deck diagnostics", () => {
	it("says nothing when the deck is clean", () => {
		expect(describeDiagnostics([], t, "en")).toEqual({ messages: [], unexplained: 0 });
	});

	it("names every missing source once", () => {
		const report = describeDiagnostics(
			[
				diagnostic({ code: "sourceMissing", sourcePath: "Vocab.md" }),
				diagnostic({ code: "sourceMissing", sourcePath: "Vocab.md" }),
				diagnostic({ code: "sourceMissing", sourcePath: "Phrases.md" }),
			],
			t,
			"en",
		);
		expect(report.messages).toEqual([
			"diagnostic.sourceMissing(Vocab.md)",
			"diagnostic.sourceMissing(Phrases.md)",
		]);
		expect(report.unexplained).toBe(0);
	});

	it("collapses repeated row problems into one counted sentence", () => {
		const report = describeDiagnostics(
			[
				diagnostic({ code: "requiredEmpty" }),
				diagnostic({ code: "requiredEmpty" }),
				diagnostic({ code: "brokenImage" }),
				diagnostic({ code: "tableMissing" }),
				diagnostic({ code: "tableMissing" }),
			],
			t,
			"en",
		);
		expect(report.messages).toEqual([
			"diagnostic.tableMissing",
			"diagnostic.requiredEmpty(2)",
			"diagnostic.brokenImage(1)",
		]);
	});

	it("counts the header problems it has no sentence for", () => {
		const report = describeDiagnostics(
			[
				diagnostic({ code: "duplicateHeader", detail: "Word" }),
				diagnostic({ code: "emptyHeader", detail: "3" }),
				diagnostic({ code: "sourceMissing" }),
			],
			t,
			"en",
		);
		expect(report.messages).toEqual(["diagnostic.sourceMissing(Vocab.md)"]);
		expect(report.unexplained).toBe(2);
	});
});
