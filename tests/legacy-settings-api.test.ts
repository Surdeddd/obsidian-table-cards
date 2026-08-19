import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = fileURLToPath(new URL("../src/", import.meta.url));

function productionTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return productionTypeScriptFiles(path);
		return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
	});
}

describe("legacy settings persistence API", () => {
	it("has no saveSettings references in production TypeScript", () => {
		const offenders = productionTypeScriptFiles(SOURCE_ROOT)
			.filter((path) => readFileSync(path, "utf8").includes("saveSettings"))
			.map((path) => relative(SOURCE_ROOT, path));

		expect(offenders).toEqual([]);
	});
});
