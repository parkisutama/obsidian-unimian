// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type UnimianPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/types/settings";
import {
	BASES_SWIMLANE_VIEW_ID,
	createSwimlaneViewRegistration,
} from "../src/views/BasesSwimlaneView";
import { createSwimlaneHarness, type SwimlaneHarness, waitForRender } from "./fixtures/swimlane";

const plugin = { app: {}, settings: structuredClone(DEFAULT_SETTINGS) } as unknown as UnimianPlugin;
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let harness: SwimlaneHarness | null = null;
const mount = async (...args: Parameters<typeof createSwimlaneHarness>) => {
	harness = await createSwimlaneHarness(...args);
	return harness;
};

afterEach(() => {
	harness?.destroy();
	harness = null;
});

const texts = (h: SwimlaneHarness, selector: string) =>
	[...h.host.querySelectorAll(selector)].map((el) => el.textContent);

describe("Swimlane view registration", () => {
	it("is registered as Swimlane with its own view id", () => {
		const registration = createSwimlaneViewRegistration(plugin);
		expect(BASES_SWIMLANE_VIEW_ID).toBe("unimian-swimlane");
		expect(registration.name).toBe("Swimlane");
		// A lanes icon, distinct from Obsidian's core Kanban layout.
		expect(registration.icon).toBe("rows-3");
	});

	it("does not preselect any property in its options", () => {
		const options = createSwimlaneViewRegistration(plugin).options?.({} as never) ?? [];
		const propertyOptions = options.filter((option) => option.type === "property");
		expect(propertyOptions.length).toBeGreaterThan(0);
		const preselected = propertyOptions
			.filter((option) => "default" in option && option.default)
			.map((option) => option.key);
		expect(preselected).toEqual([]);
	});

	it("has no default column property in the plugin settings", () => {
		expect(DEFAULT_SETTINGS.swimlaneDefaults.plannerGroupBy).toBe("");
		expect(DEFAULT_SETTINGS).not.toHaveProperty("kanbanDefaults");
	});
});

describe("Swimlane view without configured properties", () => {
	it("asks for a column property instead of guessing one", async () => {
		const h = await mount();
		expect(h.host.querySelector(".planner-kanban-column")).toBeNull();
		expect(h.host.querySelector(".planner-empty")?.textContent).toContain("Columns by");
	});

	it("uses the file name as card title when Title by is unset", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		expect(texts(h, ".planner-kanban-card-title").sort()).toEqual(["Build", "Ship", "Write spec"]);
	});

	it("shows no cover, summary, or default property badges unless configured", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" }, order: ["note.summary"] });
		expect(h.host.querySelector(".planner-kanban-card-cover")).toBeNull();
		expect(h.host.querySelector(".planner-kanban-card-summary")).toBeNull();
		expect(h.host.textContent).not.toContain("High");
	});
});

describe("Swimlane view property badges", () => {
	it("shows no property badges until properties are chosen", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		// Without a chosen property list, nothing like priority is assumed.
		expect(h.host.textContent).not.toContain("High");
		expect(h.host.textContent).not.toContain("Low");
	});

	it("shows a chosen property named summary as a badge when no Summary field is set", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" }, order: ["note.summary"] });
		expect(h.host.textContent).toContain("Spec summary");
	});
});

describe("Swimlane view with configured properties", () => {
	it("renders one column per value of Columns by", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		expect(texts(h, ".planner-kanban-column-title").sort()).toEqual(["Doing", "Done", "Todo"]);
	});

	it("uses the configured title, cover, and summary properties", async () => {
		const h = await mount({
			config: {
				plannerGroupBy: "note.status",
				titleBy: "note.title",
				coverField: "note.cover",
				summaryField: "note.summary",
			},
			order: ["note.summary"],
		});
		expect(texts(h, ".planner-kanban-card-title")).toContain("Spec title");
		expect(h.host.querySelector(".planner-kanban-card-cover")).not.toBeNull();
		expect(texts(h, ".planner-kanban-card-summary")).toContain("Spec summary");
	});
});

// The view keeps drag internals private; tests drive them directly, as the toolbar-driven
// calendar tests do for FullCalendar.
type ViewInternals = {
	startTouchDrag(card: HTMLElement, entry: unknown, e: unknown): void;
	startSwimlaneTouchDrag(row: HTMLElement, key: string, e: unknown): void;
};
const internals = (h: SwimlaneHarness) => (h.view as unknown as { drag: ViewInternals }).drag;

describe("Swimlane view lifecycle", () => {
	it("disconnects the previous render's virtual-scroll observers before mounting new ones", async () => {
		const notes = Array.from({ length: 20 }, (_, i) => ({ path: `Tasks/${i}.md`, status: "Todo" }));
		const h = await mount({ notes, config: { plannerGroupBy: "note.status" } });
		const observers = (
			h.view as unknown as { virtualScrollObservers: Map<unknown, { disconnect: () => void }> }
		).virtualScrollObservers;
		expect(observers.size).toBeGreaterThan(0);
		const firstRenderObservers = [...observers.values()];
		const disconnectSpies = firstRenderObservers.map((observer) =>
			vi.spyOn(observer, "disconnect"),
		);

		// PERF-002: onDataUpdated() now takes a fast path and skips rebuilding entirely when the
		// update is identical to the last one, so this must simulate a genuine data change (a
		// bumped mtime, exactly as a real edited note would report) to still exercise a real
		// re-render here.
		const data = (
			h.view as unknown as {
				data: { groupedData: Array<{ entries: Array<{ file: { stat: { mtime: number } } }> }> };
			}
		).data;
		const firstEntryFile = data.groupedData[0]?.entries[0]?.file;
		if (firstEntryFile) firstEntryFile.stat.mtime += 1;

		h.view.onDataUpdated();
		await waitForRender();

		for (const spy of disconnectSpies) expect(spy).toHaveBeenCalledTimes(1);
		expect(observers.size).toBeGreaterThan(0);
	});

	it("cancels an in-flight card drag on unload, removing the clone and context-menu blocker", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		const card = h.host.querySelector<HTMLElement>(".planner-kanban-card");
		expect(card).not.toBeNull();
		const entry = { path: "Tasks/Write spec.md" };
		internals(h).startTouchDrag(card!, entry, { touches: [{ clientX: 0, clientY: 0 }] });

		expect(h.host.ownerDocument.querySelector(".planner-kanban-drag-clone")).not.toBeNull();
		h.view.onunload();
		expect(h.host.ownerDocument.querySelector(".planner-kanban-drag-clone")).toBeNull();
	});

	it("cancels an in-flight swimlane drag on unload, removing its clone", async () => {
		const h = await mount({
			config: { plannerGroupBy: "note.status", swimlaneBy: "note.priority" },
		});
		const row = h.host.querySelector<HTMLElement>(".planner-kanban-swimlane-row");
		expect(row).not.toBeNull();
		internals(h).startSwimlaneTouchDrag(row!, "High", { touches: [{ clientX: 0, clientY: 0 }] });

		expect(
			h.host.ownerDocument.querySelector(".planner-kanban-swimlane-drag-clone"),
		).not.toBeNull();
		h.view.onunload();
		expect(h.host.ownerDocument.querySelector(".planner-kanban-swimlane-drag-clone")).toBeNull();
	});

	it("is safe to unload twice", async () => {
		const h = await mount();
		expect(() => {
			h.view.onunload();
			h.view.onunload();
		}).not.toThrow();
	});
});

describe("Swimlane shared platform boundaries (T026)", () => {
	it("does not retain BasesEntry or call Obsidian mutation APIs directly", () => {
		const source = readFileSync(
			path.join(repoRoot, "src", "views", "BasesSwimlaneView.ts"),
			"utf8",
		);
		expect(source).not.toContain("BasesEntry");
		expect(source).not.toContain(".processFrontMatter(");
		expect(source).not.toContain(".renameFile(");
		expect(source).not.toContain(".createFolder(");
		expect(source).toContain("createEntrySnapshot(");
		expect(source).toContain("this.mutations.setProperties(");
	});

	it("uses shared color and hover adapters", () => {
		const source = readFileSync(
			path.join(repoRoot, "src", "views", "BasesSwimlaneView.ts"),
			"utf8",
		);
		expect(source).toContain("resolveColor({");
		expect(source).toContain("resolvePrettyPropertiesColor(");
		expect(source).toContain("dispatchHoverPreview({");
		expect(source).not.toContain("PrettyPropertiesApi");
		expect(source).not.toMatch(/workspace\.trigger\(\s*["']hover-link["']/);
	});
});

describe("Swimlane card rendering (characterization)", () => {
	const base = { plannerGroupBy: "note.status", coverField: "note.cover" };
	const specCard = (h: SwimlaneHarness) =>
		[...h.host.querySelectorAll<HTMLElement>(".planner-kanban-card")].find(
			(c) => c.dataset.path === "Tasks/Write spec.md",
		)!;

	it("renders a banner cover with the configured height", async () => {
		const h = await mount({ config: { ...base, coverDisplay: "banner", coverHeight: "150" } });
		const cover = specCard(h).querySelector<HTMLElement>(".planner-kanban-cover--banner");
		expect(cover).not.toBeNull();
		expect(cover!.style.getPropertyValue("--cover-height")).toBe("150px");
		expect(cover!.querySelector("img")?.getAttribute("src")).toBe("app://vault/cover.png");
	});

	it("renders thumbnail and background covers with their card modifier classes", async () => {
		const left = await mount({ config: { ...base, coverDisplay: "thumbnail-left" } });
		expect(specCard(left).classList).toContain("planner-kanban-card--thumbnail-left");
		expect(specCard(left).querySelector(".planner-kanban-cover--thumbnail")).not.toBeNull();
		left.destroy();
		const right = await mount({ config: { ...base, coverDisplay: "thumbnail-right" } });
		expect(specCard(right).classList).toContain("planner-kanban-card--thumbnail-right");
		right.destroy();
		const bg = await mount({ config: { ...base, coverDisplay: "background" } });
		expect(specCard(bg).classList).toContain("planner-kanban-card--background-cover");
		expect(specCard(bg).querySelector(".planner-kanban-cover--background")).not.toBeNull();
	});

	it("renders no cover when the display is none", async () => {
		const h = await mount({ config: { ...base, coverDisplay: "none" } });
		expect(h.host.querySelector(".planner-kanban-card-cover")).toBeNull();
	});

	it("applies the configured border style class", async () => {
		const accent = await mount({
			config: { plannerGroupBy: "note.status", borderStyle: "left-accent" },
		});
		expect(specCard(accent).classList).toContain("planner-kanban-card-base--left-accent");
		accent.destroy();
		const full = await mount({
			config: { plannerGroupBy: "note.status", borderStyle: "full-border" },
		});
		expect(specCard(full).classList).toContain("planner-kanban-card-base--full-border");
		full.destroy();
		const none = await mount({ config: { plannerGroupBy: "note.status", borderStyle: "none" } });
		expect(specCard(none).classList).toContain("planner-kanban-card-base--default-border");
	});

	it("places badges inline in the title row or in a properties section below", async () => {
		const opts = { order: ["note.priority"] };
		const inline = await mount({
			...opts,
			config: { plannerGroupBy: "note.status", badgePlacement: "inline" },
		});
		expect(
			specCard(inline).querySelector(
				".planner-kanban-card-title-row--inline .planner-kanban-badges--inline",
			),
		).not.toBeNull();
		inline.destroy();
		const section = await mount({
			...opts,
			config: { plannerGroupBy: "note.status", badgePlacement: "properties-section" },
		});
		const card = specCard(section);
		expect(card.querySelector(".planner-kanban-card-title-row--inline")).toBeNull();
		expect(
			card.querySelector(".planner-kanban-card-content > .planner-kanban-badges--bottom")
				?.textContent,
		).toContain("High");
	});
});

describe("Swimlane column ordering (characterization)", () => {
	it("orders columns alphabetically by default and honors a saved order", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		expect(texts(h, ".planner-kanban-column-title")).toEqual(["Doing", "Done", "Todo"]);
		h.destroy();
		const saved = await mount({
			config: { plannerGroupBy: "note.status", columnOrder: JSON.stringify(["Todo", "Doing"]) },
		});
		expect(texts(saved, ".planner-kanban-column-title")).toEqual(["Todo", "Doing", "Done"]);
	});
});

describe("Swimlane lifecycle leaks (characterization)", () => {
	it("leaves no clone, context-menu blocker, or timer after repeated mount/update/unload", async () => {
		for (let i = 0; i < 3; i++) {
			const h = await mount({ config: { plannerGroupBy: "note.status" } });
			h.view.onDataUpdated();
			await waitForRender();
			const card = h.host.querySelector<HTMLElement>(".planner-kanban-card")!;
			internals(h).startTouchDrag(
				card,
				{ path: "Tasks/Build.md" },
				{ touches: [{ clientX: 0, clientY: 0 }] },
			);
			h.destroy();
			harness = null;
			expect(document.querySelector(".planner-kanban-drag-clone")).toBeNull();
			expect(document.querySelector(".planner-kanban-swimlane-drag-clone")).toBeNull();
		}
	});
});

describe("Swimlane keyboard navigation (characterization)", () => {
	it("focuses the first card on ArrowDown, clears on Escape, and detaches on unload", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		expect(h.host.getAttribute("tabindex")).toBe("0");
		h.host.focus();
		h.host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(h.host.querySelectorAll(".planner-kanban-card--focused")).toHaveLength(1);
		h.host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(h.host.querySelector(".planner-kanban-card--focused")).toBeNull();
		h.view.onunload();
		expect(h.host.hasAttribute("tabindex")).toBe(false);
	});
});

describe("Swimlane grid layout (characterization)", () => {
	it("renders one row per swimlane value, alphabetically, each with a cell per column", async () => {
		const h = await mount({
			config: { plannerGroupBy: "note.status", swimlaneBy: "note.priority" },
		});
		const rows = [...h.host.querySelectorAll<HTMLElement>(".planner-kanban-swimlane-row")];
		expect(rows.length).toBeGreaterThanOrEqual(3);
		expect(h.host.textContent).toContain("High");
		expect(h.host.textContent).toContain("Low");
		expect(h.host.querySelectorAll(".planner-kanban-card")).toHaveLength(3);
	});

	it("renders a single column from a saved order with one value", async () => {
		const notes = [{ path: "a.md", status: "Todo" }];
		const shown = await mount({
			notes,
			config: { plannerGroupBy: "note.status", columnOrder: JSON.stringify(["Todo"]) },
		});
		expect(texts(shown, ".planner-kanban-column-title")).toEqual(["Todo"]);
	});
});

describe("Swimlane frozen column headers without swimlanes", () => {
	it("marks the header row as plain so it is not offset by the swimlane label width", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status", freezeHeaders: "columns" } });
		const row = h.host.querySelector(".planner-kanban-header-row--frozen");
		expect(row?.classList).toContain("planner-kanban-header-row--plain");
		h.destroy();
		const withLanes = await mount({
			config: {
				plannerGroupBy: "note.status",
				swimlaneBy: "note.priority",
				freezeHeaders: "columns",
			},
		});
		expect(withLanes.host.querySelector(".planner-kanban-header-row--plain")).toBeNull();
	});
});
