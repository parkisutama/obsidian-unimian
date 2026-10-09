// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { TooltipGuard } from "../src/views/gantt/tooltipGuard";

function chart(): HTMLElement {
	const root = document.createElement("div");
	root.innerHTML = `
		<section class="gantt-container">
			<div role="treegrid" aria-label="Gantt chart"></div>
			<button aria-label="Delete FS dependency"></button>
		</section>`;
	document.body.appendChild(root);
	return root;
}

afterEach(() => document.body.replaceChildren());

describe("Gantt tooltip guard", () => {
	it('moves the treegrid name off aria-label so Obsidian shows no "Gantt chart" bubble', () => {
		const root = chart();
		const guard = new TooltipGuard(root, window);
		guard.sweep();

		const grid = root.querySelector('[role="treegrid"]')!;
		expect(grid.hasAttribute("aria-label")).toBe(false);
		const label = document.getElementById(grid.getAttribute("aria-labelledby")!);
		expect(label?.textContent).toBe("Gantt chart");
		expect(label?.className).toContain("gantt-sr-only");
		guard.dispose();
	});

	it("drops the bar and progress-handle tooltips that duplicate the chart hover card", () => {
		const root = chart();
		root.querySelector(".gantt-container")!.insertAdjacentHTML(
			"beforeend",
			`
			<div class="gantt-task-bar" role="gridcell" aria-label="New note, 2026-09-23 to 2026-09-26, 25% complete">
				<div role="slider" aria-label="New note progress"></div>
				<span role="button" aria-label="Link from the start of New note"></span>
			</div>`,
		);
		const guard = new TooltipGuard(root, window);
		guard.sweep();

		const bar = root.querySelector('[role="gridcell"]')!;
		expect(bar.hasAttribute("aria-label")).toBe(false);
		expect(document.getElementById(bar.getAttribute("aria-labelledby")!)?.textContent).toBe(
			"New note, 2026-09-23 to 2026-09-26, 25% complete",
		);
		expect(root.querySelector('[role="slider"]')?.hasAttribute("aria-label")).toBe(false);
		// Link handles keep theirs: a tooltip helps discovery there.
		expect(root.querySelector('[role="button"]')?.getAttribute("aria-label")).toBe(
			"Link from the start of New note",
		);
		guard.dispose();
	});

	it("follows a label the library rewrites while a bar is dragged", () => {
		const root = chart();
		root
			.querySelector(".gantt-container")!
			.insertAdjacentHTML("beforeend", '<div role="gridcell" aria-label="A, day 1"></div>');
		const guard = new TooltipGuard(root, window);
		guard.sweep();
		const bar = root.querySelector('[role="gridcell"]')!;
		const labelId = bar.getAttribute("aria-labelledby")!;

		bar.setAttribute("aria-label", "A, day 2");
		guard.sweep();

		expect(bar.hasAttribute("aria-label")).toBe(false);
		expect(bar.getAttribute("aria-labelledby")).toBe(labelId);
		expect(document.getElementById(labelId)?.textContent).toBe("A, day 2");
		guard.dispose();
	});

	it("removes the hidden label of a bar that scrolls out of the virtualized view", () => {
		const root = chart();
		root
			.querySelector(".gantt-container")!
			.insertAdjacentHTML("beforeend", '<div role="gridcell" aria-label="A"></div>');
		const guard = new TooltipGuard(root, window);
		guard.sweep();
		expect(root.querySelectorAll(".gantt-sr-only")).toHaveLength(2);

		root.querySelector('[role="gridcell"]')!.remove();
		guard.sweep();
		expect(root.querySelectorAll(".gantt-sr-only")).toHaveLength(1);
		guard.dispose();
	});

	it("keeps tooltips on small controls, where they help", () => {
		const root = chart();
		const guard = new TooltipGuard(root, window);
		guard.sweep();

		expect(root.querySelector("button")?.getAttribute("aria-label")).toBe("Delete FS dependency");
		guard.dispose();
	});

	it("is idempotent and re-applies when the chart is rebuilt", () => {
		const root = chart();
		const guard = new TooltipGuard(root, window);
		guard.sweep();
		guard.sweep();
		expect(root.querySelectorAll(".gantt-sr-only")).toHaveLength(1);

		root.querySelector(".gantt-container")!.innerHTML =
			'<div role="treegrid" aria-label="Gantt chart"></div>';
		guard.sweep();
		const grid = root.querySelector('[role="treegrid"]')!;
		expect(grid.hasAttribute("aria-label")).toBe(false);
		expect(root.querySelectorAll(".gantt-sr-only")).toHaveLength(1);
		guard.dispose();
	});

	it("removes its hidden label on dispose", () => {
		const root = chart();
		const guard = new TooltipGuard(root, window);
		guard.sweep();
		guard.dispose();

		expect(root.querySelector(".gantt-sr-only")).toBeNull();
	});
});
