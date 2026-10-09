import { describe, expect, it } from "vitest";
import {
	DEFAULT_TARGET_CARD_WIDTH,
	getColumnCount,
	MASONRY_GAP,
} from "../src/views/sticky-note/masonry";

describe("sticky-note masonry getColumnCount", () => {
	it("fits more columns as the container widens", () => {
		expect(getColumnCount(200)).toBe(1);
		expect(getColumnCount(500)).toBeGreaterThanOrEqual(2);
		expect(getColumnCount(1200)).toBeGreaterThan(getColumnCount(500));
	});

	it("never returns fewer than one column, even at zero/negative width", () => {
		expect(getColumnCount(0)).toBe(1);
		expect(getColumnCount(-100)).toBe(1);
	});

	it("respects a custom target card width — narrower target fits more columns", () => {
		const wide = getColumnCount(1000, 400);
		const narrow = getColumnCount(1000, 150);
		expect(narrow).toBeGreaterThan(wide);
	});

	it("exactly fits N columns of the target width plus gaps, not N+1", () => {
		const columns = 3;
		const width = columns * DEFAULT_TARGET_CARD_WIDTH + (columns - 1) * MASONRY_GAP;
		expect(getColumnCount(width)).toBe(columns);
		expect(getColumnCount(width - 1)).toBe(columns - 1);
	});
});
