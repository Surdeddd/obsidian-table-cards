import { expect, test } from "@playwright/test";
import { obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test("registers every command and the ribbon icon on the supported app floor", async () => {
	const page = await obsidianPage();

	const state = await page.evaluate(async () => {
		await window.app.plugins.disablePlugin("table-cards");
		await window.app.plugins.enablePlugin("table-cards");
		return {
			commands: Object.keys(window.app.commands.commands)
				.filter((id) => id.startsWith("table-cards:"))
				.sort(),
			ribbon: Array.from(document.querySelectorAll(".side-dock-ribbon-action")).map((element) =>
				element.getAttribute("aria-label"),
			),
		};
	});

	expect(state.commands).toEqual([
		"table-cards:create-with-setup",
		"table-cards:edit-layout",
		"table-cards:open",
	]);
	expect(state.ribbon).toContain("Open cards");
});
