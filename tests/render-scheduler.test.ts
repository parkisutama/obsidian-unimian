// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import { computeRenderSignature } from "../src/platform/bases/changeDetection";
import { createViewOptionSchema } from "../src/platform/bases/viewOptionTypes";
import { RenderScheduler } from "../src/platform/dom/RenderScheduler";

const baseInput = {
	entries: [{ path: "A.md", mtime: 1 }],
	order: ["note.title"],
	groupKeys: [],
	config: { titleField: "note.title", cardWidth: 200 },
};

describe("RenderScheduler.decide", () => {
	it("requires a full render on the first signature", () => {
		const scheduler = new RenderScheduler();
		expect(scheduler.decide(computeRenderSignature(baseInput))).toBe("full");
	});

	it("skips an identical update without needing the caller to retain any query object", () => {
		const scheduler = new RenderScheduler();
		scheduler.decide(computeRenderSignature(baseInput));
		expect(scheduler.decide(computeRenderSignature(baseInput))).toBe("skip");
	});

	it("takes the CSS-only fast path when only CSS-only config keys changed", () => {
		const scheduler = new RenderScheduler();
		const schema = createViewOptionSchema(["cardWidth"]);
		scheduler.decide(computeRenderSignature(baseInput));
		const next = computeRenderSignature({
			...baseInput,
			config: { ...baseInput.config, cardWidth: 260 },
		});
		expect(scheduler.decide(next, schema, ["cardWidth"])).toBe("css-only");
	});

	it("requires a full render when a data-affecting config key changed, even alongside CSS-only ones", () => {
		const scheduler = new RenderScheduler();
		const schema = createViewOptionSchema(["cardWidth"]);
		scheduler.decide(computeRenderSignature(baseInput));
		const next = computeRenderSignature({
			...baseInput,
			config: { titleField: "note.name", cardWidth: 260 },
		});
		expect(scheduler.decide(next, schema, ["cardWidth", "titleField"])).toBe("full");
	});

	it("requires a full render when entries changed, regardless of the schema", () => {
		const scheduler = new RenderScheduler();
		const schema = createViewOptionSchema(["cardWidth"]);
		scheduler.decide(computeRenderSignature(baseInput));
		const next = computeRenderSignature({ ...baseInput, entries: [{ path: "A.md", mtime: 2 }] });
		expect(scheduler.decide(next, schema, [])).toBe("full");
	});
});

describe("RenderScheduler epochs", () => {
	it("aborts the previous epoch's signal when a new one begins", () => {
		const scheduler = new RenderScheduler();
		const first = scheduler.beginEpoch();
		expect(first.signal.aborted).toBe(false);
		const second = scheduler.beginEpoch();
		expect(first.signal.aborted).toBe(true);
		expect(second.signal.aborted).toBe(false);
	});

	it("marks only the most recently begun epoch as current", () => {
		const scheduler = new RenderScheduler();
		const first = scheduler.beginEpoch();
		const second = scheduler.beginEpoch();
		expect(scheduler.isCurrentEpoch(first.epoch)).toBe(false);
		expect(scheduler.isCurrentEpoch(second.epoch)).toBe(true);
	});

	it("prevents superseded async work from committing a result", async () => {
		const scheduler = new RenderScheduler();
		const committed: string[] = [];

		async function renderAsync(epoch: number, label: string, delayMs: number) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			if (!scheduler.isCurrentEpoch(epoch)) return; // superseded — refuse to commit
			committed.push(label);
		}

		const slow = scheduler.beginEpoch();
		const slowRender = renderAsync(slow.epoch, "slow (stale)", 20);
		const fast = scheduler.beginEpoch();
		const fastRender = renderAsync(fast.epoch, "fast (current)", 5);

		await Promise.all([slowRender, fastRender]);
		expect(committed).toEqual(["fast (current)"]);
	});
});
