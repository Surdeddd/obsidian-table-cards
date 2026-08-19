import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export const VAULT_ID = "tablecardsharness";

const VOCAB = [
	"# Vocabulary",
	"",
	"| Word | Translation | Example | Level |",
	"| --- | --- | --- | --- |",
	"| abandon | покидать | They had to abandon the car. | B1 |",
	"| brisk | бодрый | A brisk walk before breakfast. | B2 |",
	"| candid | откровенный | She gave a candid answer. | C1 |",
	"",
	"## Phrases",
	"",
	"| Phrase | Meaning | Note |",
	"| --- | --- | --- |",
	"| break the ice | начать разговор |  |",
	"| hit the sack | лечь спать | informal |",
	"",
].join("\n");

const FACTS = [
	"| Question | Answer |",
	"| --- | --- |",
	"| Capital of Norway | Oslo |",
	"| Largest ocean | Pacific |",
	"",
].join("\n");

export async function createFixtureVault(harnessRoot) {
	const vaultPath = join(harnessRoot, "vault");
	const userDataPath = join(harnessRoot, "user-data");
	await rm(harnessRoot, { recursive: true, force: true });
	await mkdir(join(vaultPath, ".obsidian", "plugins", "table-cards"), { recursive: true });
	await mkdir(userDataPath, { recursive: true });
	await writeFile(join(vaultPath, "Vocab.md"), VOCAB, "utf8");
	await writeFile(join(vaultPath, "Facts.md"), FACTS, "utf8");
	await writeFile(join(vaultPath, ".obsidian", "community-plugins.json"), '["table-cards"]\n', "utf8");
	for (const artifact of ["main.js", "manifest.json", "styles.css"]) {
		await cp(join(root, artifact), join(vaultPath, ".obsidian", "plugins", "table-cards", artifact));
	}
	const registry = {
		vaults: { [VAULT_ID]: { path: vaultPath, ts: 1700000000000, open: true } },
		frame: "custom",
	};
	await writeFile(join(userDataPath, "obsidian.json"), `${JSON.stringify(registry)}\n`, "utf8");
	return { vaultPath, userDataPath };
}
