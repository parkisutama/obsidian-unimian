// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import { isOngoing, ONGOING_KEYWORD, resolveOngoingDate } from "../src/utils/dateUtils";

describe("dateUtils", () => {
	it("detects ongoing values case-insensitively", () => {
		expect(isOngoing(ONGOING_KEYWORD)).toBe(true);
		expect(isOngoing("ONGOING")).toBe(true);
		expect(isOngoing({ data: "Ongoing" })).toBe(true);
		expect(isOngoing("done")).toBe(false);
	});

	it("resolves ongoing to a Date and leaves other values unresolved", () => {
		expect(resolveOngoingDate("ongoing")).toBeInstanceOf(Date);
		expect(resolveOngoingDate("2026-05-13")).toBeNull();
	});
});
