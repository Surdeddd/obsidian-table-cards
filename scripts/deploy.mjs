import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const root = dirname(dirname(fileURLToPath(import.meta.url)));

const target =
	process.env.OBSIDIAN_PLUGIN_DIR ??
	join(process.env.HOME ?? "", "Obsidian/.obsidian/plugins/table-cards");

for (const name of ARTIFACTS) {
	const source = join(root, name);
	try {
		await access(source);
	} catch {
		console.error(`Missing ${name}. Run \`npm run build\` first.`);
		process.exit(1);
	}
}

await mkdir(target, { recursive: true });
for (const name of ARTIFACTS) {
	await copyFile(join(root, name), join(target, name));
}
console.log(`Deployed ${ARTIFACTS.join(", ")} to ${target}`);
