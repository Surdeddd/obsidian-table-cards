import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const STYLES = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

function ruleBody(selector: string): string {
	const start = STYLES.indexOf(selector);
	expect(start, `selector not found: ${selector}`).toBeGreaterThan(-1);
	const open = STYLES.indexOf("{", start);
	const close = STYLES.indexOf("}", open);
	return STYLES.slice(open + 1, close);
}

describe("card stage layout", () => {
	it("sizes every card row by its own content", () => {
		const stage = ruleBody(".table-cards-stage {");

		expect(stage).toContain("grid-auto-rows: max-content");
		expect(stage).toContain("overflow: auto");
	});

	it("measures modal height against the dynamic viewport", () => {
		const modal = ruleBody(".modal.table-cards-modal {");

		expect(modal).toContain("100dvh");
		expect(modal).not.toContain("100vh -");
	});

	it("keeps a short viewport out of the bottom sheet layout", () => {
		expect(STYLES).toContain("@media (max-height: 540px)");
	});
});
