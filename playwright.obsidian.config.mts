import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests-obsidian",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "line",
	timeout: 60_000,
	globalSetup: "./tests-obsidian/global-setup.mts",
	globalTeardown: "./tests-obsidian/global-teardown.mts",
});
