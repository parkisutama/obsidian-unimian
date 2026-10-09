import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { UI_RUNTIME_ALIASES } from "./scripts/ui-runtime-aliases.mjs";

export default defineConfig({
	resolve: {
		alias: [
			// The obsidian package ships types only; tests run against a test double.
			{
				find: "obsidian",
				replacement: fileURLToPath(new URL("./tests/fixtures/obsidian.ts", import.meta.url)),
			},
			// React-targeting libraries (Gantt Beta) run on Preact, as in the production build. Exact
			// matches only, so `react` never rewrites `react/jsx-runtime` as a path prefix.
			...Object.entries(UI_RUNTIME_ALIASES).map(([find, replacement]) => ({
				find: new RegExp(`^${find}$`),
				replacement,
			})),
		],
	},
	test: {
		include: ["tests/**/*.test.{ts,mjs}"],
		setupFiles: ["tests/setup.ts"],
		// The Gantt library is externalized by default for SSR, which lets Node resolve its
		// internal `react` import directly (bypassing the alias above and pulling in real React
		// instead of Preact). Inlining it routes that import through Vite's resolver instead.
		server: { deps: { inline: ["@jaeungkim/gantt-chart"] } },
		// Fail instead of passing silently when a filter or glob matches nothing.
		passWithNoTests: false,
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts", "scripts/**/*.mjs"],
			reporter: ["text-summary", "lcov"],
			// Ratchet: the floor sits just below current coverage (the Gantt view has no tests yet).
			// Raise it as coverage grows; CI fails if coverage drops below it.
			thresholds: {
				statements: 22,
				branches: 18,
				functions: 26,
				lines: 23,
			},
		},
	},
});
