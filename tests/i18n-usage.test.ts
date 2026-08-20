import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EN, type TranslationKey } from "../src/i18n";

const SOURCE_ROOT = fileURLToPath(new URL("../src/", import.meta.url));

function productionSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "catalogs" ? [] : productionSources(path);
		return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
	});
}

function referenced(key: TranslationKey, code: string): boolean {
	if (code.includes(`"${key}"`) || code.includes(`'${key}'`) || code.includes(`\`${key}\``)) return true;
	const prefix = key.slice(0, key.lastIndexOf("."));
	const suffix = key.slice(key.lastIndexOf(".") + 1);
	if (prefix && code.includes(`\`${prefix}.\${`)) return true;
	return new RegExp(`\\$\\{[^}]*\\}\\.${suffix}\``).test(code);
}

describe("translation catalogs", () => {
	it("ships no key that nothing renders", () => {
		const code = productionSources(SOURCE_ROOT)
			.map((path) => readFileSync(path, "utf8"))
			.join("\n");
		const orphans = (Object.keys(EN) as TranslationKey[]).filter((key) => !referenced(key, code));

		expect(orphans).toEqual([]);
	});
});
