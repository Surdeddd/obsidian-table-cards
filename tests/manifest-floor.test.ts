import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface Manifest {
	version: string;
	minAppVersion: string;
}

const manifest = JSON.parse(
	readFileSync(fileURLToPath(new URL("../manifest.json", import.meta.url)), "utf8"),
) as Manifest;
const versions = JSON.parse(
	readFileSync(fileURLToPath(new URL("../versions.json", import.meta.url)), "utf8"),
) as Record<string, string>;

describe("compatibility floor", () => {
	it("declares the Obsidian version the harness actually verifies", () => {
		expect(manifest.minAppVersion).toBe("1.6.7");
	});

	it("maps the current plugin version to the same floor", () => {
		expect(versions[manifest.version]).toBe(manifest.minAppVersion);
	});
});
