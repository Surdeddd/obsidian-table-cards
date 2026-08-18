import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
				activeDocument: "readonly",
				activeWindow: "readonly",
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mts", "manifest.json"],
				},
				tsconfigRootDir: path.dirname(fileURLToPath(import.meta.url)),
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ["eslint.config.mts"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
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
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"playwright.config.mts",
		"preview/preview.js",
		"scripts",
		"tests",
		"tests-ui",
		"vitest.config.mts",
	]),
);
