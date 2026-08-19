import { describe, expect, it } from "vitest";
import { rangePercent } from "../src/ui/editor/range";

describe("rangePercent", () => {
	it("maps the value onto a 0–100 fill", () => {
		expect(rangePercent(22, 8, 56)).toBeCloseTo(29.166, 2);
		expect(rangePercent(8, 8, 56)).toBe(0);
		expect(rangePercent(56, 8, 56)).toBe(100);
	});

	it("clamps and rejects inverted bounds", () => {
		expect(rangePercent(-4, 0, 10)).toBe(0);
		expect(rangePercent(40, 0, 10)).toBe(100);
		expect(rangePercent(5, 10, 10)).toBe(0);
		expect(rangePercent(Number.NaN, 0, 10)).toBe(0);
	});
});
