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
	...tseslint.configs.recommendedTypeChecked,
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
		files: ["tests-ui/**/*.ts", "tests-obsidian/**/*.ts", "tests-obsidian/**/*.mts"],
		rules: {
			// Browser globals only occur inside typed page.evaluate callbacks.
			"no-undef": "off",
		},
	},
	{
		files: ["tests-obsidian/**/*.mjs", "tests-obsidian/**/*.mts", "scripts/**/*.mjs", "tests-tools/**/*.mjs"],
		rules: {
			"obsidianmd/prefer-file-manager-trash-file": "off",
			"obsidianmd/no-plugin-as-component": "off",
			"no-restricted-globals": "off",
		},
	},
	{
		files: ["src/settings/settings-tab.ts"],
		rules: {
			// Obsidian deprecated display() and setWarning() in 1.13 in favour of the
			// declarative settings API; the supported floor here is 1.6.7, where the
			// replacements do not exist.
			"@typescript-eslint/no-deprecated": "off",
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
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
