import json from "@eslint/json";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import { PlainTextParser } from "eslint-plugin-obsidianmd/dist/lib/plainTextParser.js";

const obsidianRules = Object.fromEntries(
	Object.entries(obsidianmd.configs.recommended).filter(([ruleId]) =>
		ruleId.startsWith("obsidianmd/")
	),
);

export default defineConfig([
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"main.js",
			"styles.css",
			"lint-output.json",
			"versions.json",
		],
	},
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			obsidianmd,
		},
		rules: obsidianRules,
	},
	{
		files: ["manifest.json"],
		language: "json/json",
		plugins: {
			json,
			obsidianmd,
		},
		rules: {
			"obsidianmd/validate-manifest": "error",
		},
	},
	{
		files: ["LICENSE"],
		languageOptions: {
			parser: PlainTextParser,
			parserOptions: {
				extraFileExtensions: [""],
			},
		},
		plugins: {
			obsidianmd,
		},
		rules: {
			"obsidianmd/validate-license": "error",
		},
	},
]);
