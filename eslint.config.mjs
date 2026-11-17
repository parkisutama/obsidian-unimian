import json from "@eslint/json";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

const obsidianRules = Object.fromEntries(
	Object.entries(obsidianmd.configs.recommended).filter(([ruleId]) =>
		ruleId.startsWith("obsidianmd/"),
	),
);

export default defineConfig([
	{
		ignores: ["node_modules/**", "dist/**", "lint-output.json", "versions.json"],
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
		language: "obsidianmd/plain-text",
		plugins: {
			obsidianmd,
		},
		rules: {
			"obsidianmd/validate-license": "error",
		},
	},
]);
