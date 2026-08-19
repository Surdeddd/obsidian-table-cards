import { join } from "node:path";
import { chromium } from "@playwright/test";
import { createFixtureVault, VAULT_ID } from "./harness/vault.mjs";
import { CDP_PORT, launchObsidian, obsidianAvailable } from "./harness/launch.mjs";

async function trustVaultAndLoadPlugin(port: number): Promise<void> {
	const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
	const context = browser.contexts()[0];
	const page = context?.pages()[0];
	if (!page) throw new Error("Obsidian exposed no page");
	const alreadyLoaded = await page.evaluate(
		() => Boolean(window.app?.plugins?.plugins?.["table-cards"]),
	);
	if (!alreadyLoaded) {
		await page.evaluate((id) => {
			window.localStorage.setItem(`enable-plugin-${id}`, "true");
			window.location.reload();
		}, VAULT_ID);
		await page.waitForFunction(() => Boolean(window.app?.plugins?.plugins?.["table-cards"]), null, {
			timeout: 60_000,
		});
	}
	await browser.close();
}

export default async function globalSetup(): Promise<void> {
	if (!(await obsidianAvailable())) {
		process.env["TABLE_CARDS_OBSIDIAN"] = "missing";
		return;
	}
	const harnessRoot = join(process.cwd(), ".obsidian-harness");
	const paths = await createFixtureVault(harnessRoot);
	const { pid } = await launchObsidian(paths, CDP_PORT);
	await trustVaultAndLoadPlugin(CDP_PORT);
	process.env["TABLE_CARDS_OBSIDIAN"] = "ready";
	process.env["TABLE_CARDS_OBSIDIAN_PID"] = String(pid ?? "");
	process.env["OBSIDIAN_CDP_PORT"] = String(CDP_PORT);
}
