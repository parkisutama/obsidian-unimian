import { describe, expect, it } from "vitest";
import { calculateLinearVirtualRange } from "../src/core/layouts/linearVirtualRange";

describe("linear virtual range", () => {
	it("returns an overscanned exclusive range and spacer sizes", () => {
		expect(
			calculateLinearVirtualRange({
				itemCount: 100,
				rowHeight: 20,
				scrollTop: 200,
				viewportHeight: 100,
				overscan: 2,
			}),
		).toEqual({
			startIndex: 8,
			endIndex: 17,
			paddingTop: 160,
			paddingBottom: 1660,
			totalHeight: 2000,
		});
	});

	it("clamps empty, invalid, and end-of-list inputs", () => {
		expect(
			calculateLinearVirtualRange({
				itemCount: 0,
				rowHeight: 0,
				scrollTop: Number.NaN,
				viewportHeight: -1,
			}),
		).toMatchObject({ startIndex: 0, endIndex: 0, totalHeight: 0 });
		expect(
			calculateLinearVirtualRange({
				itemCount: 3,
				rowHeight: 10,
				scrollTop: 999,
				viewportHeight: 20,
				overscan: 1,
			}),
		).toMatchObject({ startIndex: 2, endIndex: 3 });
	});
});
