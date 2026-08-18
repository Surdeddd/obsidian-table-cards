import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MUTATION_CALLSITES = [
	"../src/main.ts",
	"../src/settings/settings-tab.ts",
	"../src/setup/save-lifecycle.ts",
	"../src/ui/SetupWizard.ts",
	"../src/ui/editor/DeckEditorModal.ts",
	"../src/ui/CardsModal.ts",
] as const;

describe("production settings mutation boundary", () => {
	it("routes every settings write through updateSettings intents", () => {
		const source = MUTATION_CALLSITES
			.map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
			.join("\n");

		expect(source).not.toContain("saveSettings");
		expect(source).not.toMatch(/(?:host|plugin)\.settings(?:\.[\w[\].]+)?\s*=/);
	});
});
