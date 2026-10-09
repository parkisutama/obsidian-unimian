// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import { getContrastColor, SOLARIZED_ACCENT_COLORS, stringToColor } from "../src/utils/colorUtils";

describe("colorUtils", () => {
	it("maps strings to deterministic palette colors", () => {
		const first = stringToColor("In progress");
		const second = stringToColor("In progress");

		expect(first).toBe(second);
		expect(SOLARIZED_ACCENT_COLORS).toContain(first);
	});

	it("falls back to neutral color for empty values", () => {
		expect(stringToColor("")).toBe("#6b7280");
		expect(stringToColor("None")).toBe("#6b7280");
	});

	it("chooses readable black or white contrast", () => {
		expect(getContrastColor("#ffffff")).toBe("#000000");
		expect(getContrastColor("#000000")).toBe("#ffffff");
	});
});
