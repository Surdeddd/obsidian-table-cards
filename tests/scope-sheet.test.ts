import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scopeSheetPresentation } from "../src/ui/ScopeSheet";

describe("scope sheet presentation", () => {
	it("uses one full mobile sheet with embedded sticky actions", () => {
		expect(scopeSheetPresentation(true)).toEqual({
			variant: "full",
			pickerMobile: false,
			embeddedActions: true,
			actionClass: "tc-scope-sheet-actions",
		});
		expect(scopeSheetPresentation(false)).toEqual({
			variant: "default",
			pickerMobile: false,
			embeddedActions: false,
			actionClass: null,
		});
	});

	it("keeps embedded actions outside the scrolling body and above the bottom safe area", () => {
		const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
		const rule = css.match(/\.tc-scope-sheet-actions\s*\{[^}]+\}/s)?.[0] ?? "";

		expect(rule).toContain("position: sticky");
		expect(rule).toContain("env(safe-area-inset-bottom)");
	});
});
