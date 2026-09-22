import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Architecture guard (T005). Static, regex-based checks that protect boundaries the
// specification declares "Never"/"Ask first" for new-view code: no direct vault/frontmatter/
// editor mutation from a new view, no forbidden React/Sass dependency, and pure `core/`
// modules never importing `obsidian`. These are intentionally forward-looking: most of the
// directories they scan (src/core, src/views/timeline|grid|masonry|feed|keep,
// src/platform/mutations) do not exist yet and the checks pass vacuously until later phases
// add files there — the fixtures below prove the checks actually fail on a violation.

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(repoRoot, "src");
const fixturesDir = path.join(repoRoot, "tests", "fixtures", "architecture");

/** Direct mutation call patterns no new-view or shared renderer/core module may use. */
const FORBIDDEN_MUTATION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
	{ name: "processFrontMatter", pattern: /\.processFrontMatter\s*\(/ },
	{ name: "vault.modify", pattern: /\.vault\.modify\s*\(|vault\.modify\s*\(/ },
	{ name: "trashFile", pattern: /\.trashFile\s*\(/ },
	{ name: "editor.setValue", pattern: /editor\.setValue\s*\(/ },
];

/**
 * Existing view files that keep their current, spec-approved write behavior during
 * behavior-preserving refactoring (spec §7.10, §11 "Ask first"). Nothing else may match
 * `FORBIDDEN_MUTATION_PATTERNS`. Extend this list only through a task that declares a new
 * legacy mutation capability module (e.g. `src/platform/mutations/**`), never to permit a new
 * view to write.
 */
const ALLOWED_MUTATION_PATHS = [
	"src/views/BasesCalendarView.ts",
	"src/views/BasesSwimlaneView.ts",
	"src/platform/mutations/",
];

/** Directories where write access must never appear once files land there. */
const GUARDED_MUTATION_DIRS = [
	"src/views/timeline/",
	"src/views/swimlane/",
	"src/views/gantt/",
	"src/views/grid/",
	"src/views/masonry/",
	"src/views/feed/",
	"src/views/keep/",
	"src/views/sticky-note/",
	"src/core/",
	"src/platform/dom/",
	"src/platform/navigation/",
	"src/platform/colors/",
];

/**
 * Views that write only through scoped grants (docs/architecture/view-write-access.md). They must
 * not construct the full gateway themselves; they receive capabilities via ViewRegistry.mutationsFor.
 */
const SCOPED_GRANT_DIRS = ["src/views/gantt/"];

const GATEWAY_IMPORT_PATTERN = /LegacyMutationGateway/;

/** Build/runtime dependencies the specification forbids adding (spec §3.5, §6.2, §7.17). */
// "frappe-gantt" was removed with the Frappe Gantt view on 2026-09-20 (docs/specs/gantt-frappe-removal.md).
const FORBIDDEN_DEPENDENCIES = ["react", "react-dom", "sass", "node-sass", "tailwindcss", "@tanstack/react-virtual", "frappe-gantt"];

function toPosix(p: string): string {
	return p.split(path.sep).join("/");
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) out.push(...walk(full));
		else if (entry.endsWith(".ts")) out.push(full);
	}
	return out;
}

interface Violation {
	relativePath: string;
	name: string;
}

/** Scan a set of (relativePath, content) pairs for forbidden mutation calls outside the allowlist. */
function findMutationViolations(files: Array<{ relativePath: string; content: string }>): Violation[] {
	const violations: Violation[] = [];
	for (const { relativePath, content } of files) {
		const isAllowed = ALLOWED_MUTATION_PATHS.some((allowed) => relativePath === allowed || relativePath.startsWith(allowed));
		if (isAllowed) continue;
		for (const { name, pattern } of FORBIDDEN_MUTATION_PATTERNS) {
			if (pattern.test(content)) violations.push({ relativePath, name });
		}
	}
	return violations;
}

function readRepoFiles(dirs: string[]): Array<{ relativePath: string; content: string }> {
	const files: Array<{ relativePath: string; content: string }> = [];
	for (const dir of dirs) {
		for (const file of walk(path.join(repoRoot, dir))) {
			files.push({ relativePath: toPosix(path.relative(repoRoot, file)), content: readFileSync(file, "utf8") });
		}
	}
	return files;
}

describe("architecture guard: direct mutation ban", () => {
	it("fails on a fixture that reproduces every forbidden mutation call", () => {
		const content = readFileSync(path.join(fixturesDir, "forbidden.ts"), "utf8");
		const violations = findMutationViolations([{ relativePath: "src/views/keep/forbidden.ts", content }]);
		const names = violations.map((v) => v.name);
		expect(names).toEqual(
			expect.arrayContaining(["processFrontMatter", "vault.modify", "trashFile", "editor.setValue"]),
		);
	});

	it("passes on a fixture that only reads and navigates", () => {
		const content = readFileSync(path.join(fixturesDir, "allowed.ts"), "utf8");
		const violations = findMutationViolations([{ relativePath: "src/views/keep/allowed.ts", content }]);
		expect(violations).toEqual([]);
	});

	it("permits the explicitly listed legacy views to keep writing", () => {
		const content = readFileSync(path.join(fixturesDir, "forbidden.ts"), "utf8");
		const violations = findMutationViolations([{ relativePath: "src/views/BasesCalendarView.ts", content }]);
		expect(violations).toEqual([]);
	});

	it("finds no mutation calls in the guarded new-view/shared-platform directories today", () => {
		const violations = findMutationViolations(readRepoFiles(GUARDED_MUTATION_DIRS));
		expect(violations).toEqual([]);
	});
});

describe("architecture guard: scoped mutation grants", () => {
	it("fails when a scoped-grant view reaches for the full gateway", () => {
		const content = "import { LegacyMutationGateway } from '../../platform/mutations/LegacyMutationGateway';";
		expect(GATEWAY_IMPORT_PATTERN.test(content)).toBe(true);
	});

	it("treats a direct mutation call in a scoped-grant view as a violation", () => {
		const content = readFileSync(path.join(fixturesDir, "forbidden.ts"), "utf8");
		const violations = findMutationViolations([{ relativePath: "src/views/gantt/forbidden.ts", content }]);
		expect(violations.map((v) => v.name)).toEqual(
			expect.arrayContaining(["processFrontMatter", "vault.modify", "trashFile", "editor.setValue"]),
		);
	});

	it("finds no gateway construction or import in scoped-grant views today", () => {
		const offenders = readRepoFiles(SCOPED_GRANT_DIRS).filter(({ content }) => GATEWAY_IMPORT_PATTERN.test(content));
		expect(offenders.map((f) => f.relativePath)).toEqual([]);
	});
});

describe("architecture guard: core import direction", () => {
	it("fails when a pure core module imports obsidian", () => {
		const content = "import { TFile } from 'obsidian';\nexport const x = 1;\n";
		expect(/from\s+['"]obsidian['"]/.test(content)).toBe(true);
	});

	it("finds no obsidian import in src/core today", () => {
		const offenders = readRepoFiles(["src/core/"]).filter(({ content }) => /from\s+['"]obsidian['"]/.test(content));
		expect(offenders).toEqual([]);
	});
});

describe("architecture guard: forbidden dependencies", () => {
	it("fails when a forbidden dependency name is present", () => {
		const pkg = { dependencies: { react: "^18.0.0" }, devDependencies: {} };
		const present = FORBIDDEN_DEPENDENCIES.filter(
			(name) => name in pkg.dependencies || name in pkg.devDependencies,
		);
		expect(present).toContain("react");
	});

	it("has no forbidden React/Sass dependency in package.json", () => {
		const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
		const declared = { ...pkg.dependencies, ...pkg.devDependencies };
		const present = FORBIDDEN_DEPENDENCIES.filter((name) => name in declared);
		expect(present).toEqual([]);
	});
});

describe("architecture guard: stable view IDs", () => {
	const idPattern = /export const [A-Z_]+_VIEW_ID\s*=\s*'([^']+)'/g;

	function collectViewIds(): string[] {
		const ids: string[] = [];
		for (const { content } of readRepoFiles(["src/views/"])) {
			for (const match of content.matchAll(idPattern)) {
				const id = match[1];
				if (id) ids.push(id);
			}
		}
		return ids;
	}

	it("registers every current view under the wise-view- prefix", () => {
		const ids = collectViewIds();
		expect(ids.length).toBeGreaterThan(0);
		for (const id of ids) expect(id.startsWith("wise-view-")).toBe(true);
	});

	it("declares no duplicate view id", () => {
		const ids = collectViewIds();
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("does not reintroduce the retired wise-view-kanban id", () => {
		expect(collectViewIds()).not.toContain("wise-view-kanban");
	});
});
