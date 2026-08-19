import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

const toolFiles = [
	"eslint.config.mts",
	"playwright.config.mts",
	"playwright.obsidian.config.mts",
	"tests-obsidian/**/*.ts",
	"tests-obsidian/**/*.mts",
	"tests-obsidian/**/*.mjs",
	"preview/**/*.js",
	"scripts/**/*.mjs",
	"tests-tools/**/*.mjs",
	"tests-ui/**/*.ts",
];
const nodeToolFiles = [
	"eslint.config.mts",
	"playwright.config.mts",
	"playwright.obsidian.config.mts",
	"tests-obsidian/**/*.ts",
	"tests-obsidian/**/*.mts",
	"tests-obsidian/**/*.mjs",
	"scripts/**/*.mjs",
	"tests-tools/**/*.mjs",
	"tests-ui/**/*.ts",
];
const toolObsidianRules = Object.fromEntries(
	Object.keys(obsidianmd.rules).map((rule) => [`obsidianmd/${rule}`, "off" as const]),
);
const disabledBrowserGlobals = Object.fromEntries(
	Object.keys(globals.browser).map((name) => [name, "off" as const]),
);

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
				activeDocument: "readonly",
				activeWindow: "readonly",
			},
			parserOptions: {
				project: ["./tsconfig.json", "./tsconfig.tools.json"],
				tsconfigRootDir: path.dirname(fileURLToPath(import.meta.url)),
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: toolFiles,
		rules: {
			...toolObsidianRules,
			"obsidianmd/no-nodejs-modules": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"import/no-extraneous-dependencies": "off",
		},
	},
	{
		files: ["preview/**/*.js"],
		languageOptions: { globals: globals.browser },
	},
	{
		files: nodeToolFiles,
		languageOptions: {
			globals: {
				...disabledBrowserGlobals,
				...globals.node,
			},
		},
	},
	{
		files: ["tests-ui/**/*.ts"],
		rules: {
			// Browser globals only occur inside typed page.evaluate callbacks.
			"no-undef": "off",
		},
	},
	{
		files: ["src/**/*.ts"],
		rules: {
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
			"@typescript-eslint/no-deprecated": "off",
		},
	},
	globalIgnores([
		"node_modules",
		".obsidian-harness",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"tests",
		"vitest.config.mts",
	]),
);
