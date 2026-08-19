import { describe, expect, it } from "vitest";
import { onAccentColor } from "../src/settings/appearance";

describe("onAccentColor", () => {
	it("puts dark ink on a light accent", () => {
		expect(onAccentColor("#ffffff")).toBe("#101114");
		expect(onAccentColor("#f2e6c9")).toBe("#101114");
	});

	it("puts light ink on a dark accent", () => {
		expect(onAccentColor("#3b2fb8")).toBe("#ffffff");
		expect(onAccentColor("#000000")).toBe("#ffffff");
	});

	it("reads short hex values", () => {
		expect(onAccentColor("#fff")).toBe("#101114");
		expect(onAccentColor("#123")).toBe("#ffffff");
	});

	it("defers to the host theme token when the accent is not a hex colour", () => {
		expect(onAccentColor("var(--interactive-accent)")).toBe("var(--text-on-accent)");
		expect(onAccentColor("")).toBe("var(--text-on-accent)");
	});
});
