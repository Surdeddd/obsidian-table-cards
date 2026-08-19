import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const COMPATIBILITY_SHIM = "i18n/app-language.ts";

function productionTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return productionTypeScriptFiles(path);
		return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
	});
}

describe("obsidian API floor", () => {
	it("calls getLanguage only through the compatibility shim", () => {
		const offenders = productionTypeScriptFiles(SOURCE_ROOT)
			.filter((path) => readFileSync(path, "utf8").includes("getLanguage"))
			.map((path) => relative(SOURCE_ROOT, path))
			.filter((path) => path !== COMPATIBILITY_SHIM);

		expect(offenders).toEqual([]);
	});

	it("guards the shim call so older apps do not throw", () => {
		const shim = readFileSync(resolve(SOURCE_ROOT, COMPATIBILITY_SHIM), "utf8");

		expect(shim).toContain('typeof languageApi === "function"');
	});
});
