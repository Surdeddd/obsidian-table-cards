import { describe, expect, it } from "vitest";
import { consumeSheetEscape } from "../src/ui/editor/controls/Sheet";

describe("sheet keyboard handling", () => {
	it("consumes Escape before a parent modal can handle the same key", () => {
		const effects: string[] = [];
		const handled = consumeSheetEscape({
			key: "Escape",
			preventDefault: () => effects.push("default"),
			stopPropagation: () => effects.push("propagation"),
		}, () => effects.push("close"));

		expect(handled).toBe(true);
		expect(effects).toEqual(["default", "propagation", "close"]);
	});
});
