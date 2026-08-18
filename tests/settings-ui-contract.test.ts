import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings UI contracts", () => {
	it("keeps native settings selects at least 44px tall for coarse pointers", () => {
		const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
		const coarse = css.match(/@media \(pointer: coarse\)\s*\{(?<body>[\s\S]+?)\n\}/)?.groups?.body ?? "";
		const rule = coarse.match(/[^{}]*\.table-cards-settings select[^{}]*\{[^}]+\}/s)?.[0] ?? "";

		expect(rule).toContain("min-height: 44px");
	});
});
