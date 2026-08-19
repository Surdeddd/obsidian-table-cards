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

describe("editor shell layout", () => {
	it("keeps the shell a four row grid", () => {
		const shell = ruleBody(".tc-editor-shell {");

		expect(shell).toContain("display: grid");
		expect(shell).toContain("grid-template-rows: auto auto minmax(0, 1fr) auto");
	});

	it("does not let the modal content rule override the shell display", () => {
		const body = ruleBody(".modal.table-cards-editor .modal-content,\n.table-cards-editor-body {");

		expect(body).not.toContain("display:");
	});
});
