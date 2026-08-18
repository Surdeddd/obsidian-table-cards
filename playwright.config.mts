import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests-ui",
	fullyParallel: false,
	retries: 0,
	reporter: "line",
	timeout: 30_000,
	use: {
		baseURL: "http://127.0.0.1:4173",
		headless: true,
		trace: "retain-on-failure",
	},
	webServer: {
		command: "node scripts/serve-preview.mjs",
		url: "http://127.0.0.1:4173/preview/launcher.html",
		reuseExistingServer: true,
		timeout: 15_000,
	},
});
