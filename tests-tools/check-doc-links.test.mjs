import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const checker = resolve("scripts/check-doc-links.mjs");

/**
 * @param {string} cwd
 * @returns {Promise<{ code: number | null, output: string }>}
 */
function runChecker(cwd) {
	return new Promise((resolveRun, reject) => {
		const child = spawn(process.execPath, [checker], { cwd });
		let output = "";
		child.stdout.on("data", (chunk) => { output += chunk; });
		child.stderr.on("data", (chunk) => { output += chunk; });
		child.on("error", reject);
		child.on("close", (code) => resolveRun({ code, output }));
	});
}

/** @param {string} markdown @param {Record<string, string>} [docs] */
async function fixture(markdown, docs = {}) {
	const root = await mkdtemp(join(tmpdir(), "table-cards-links-"));
	await mkdir(join(root, "docs"));
	await writeFile(join(root, "README.md"), markdown);
	await writeFile(join(root, "README.ru.md"), "# Русский\n");
	await writeFile(join(root, "CHANGELOG.md"), "# Changelog\n");
	for (const [path, content] of Object.entries(docs)) await writeFile(join(root, "docs", path), content);
	return root;
}

void test("rejects a missing same-document anchor", async () => {
	const root = await fixture("# Home\n\n[Jump](#missing)\n");
	try {
		const result = await runChecker(root);
		assert.equal(result.code, 1);
		assert.match(result.output, /FAIL anchor README\.md -> #missing/);
	} finally {
		await rm(root, { recursive: true });
	}
});

void test("resolves reference links and rejects a missing target anchor", async () => {
	const root = await fixture(
		"# Home\n\n[Guide][guide]\n\n[guide]: docs/guide.md#details\n",
		{ "guide.md": "# Other heading\n" },
	);
	try {
		const result = await runChecker(root);
		assert.equal(result.code, 1);
		assert.match(result.output, /FAIL anchor README\.md -> docs\/guide\.md#details/);
	} finally {
		await rm(root, { recursive: true });
	}
});

void test("accepts inline, reference, angled-space, and duplicate-heading anchors", async () => {
	const root = await fixture(
		[
			"# Home",
			"",
			"[First](docs/guide.md#details)",
			"[Second][guide]",
			"[Spaced](<docs/file name.md#local-heading>)",
			"",
			"[guide]: docs/guide.md#details-1",
		].join("\n"),
		{
			"guide.md": "# Details\n\n# Details\n",
			"file name.md": "# Local heading\n",
		},
	);
	try {
		const result = await runChecker(root);
		assert.equal(result.code, 0, result.output);
	} finally {
		await rm(root, { recursive: true });
	}
});
