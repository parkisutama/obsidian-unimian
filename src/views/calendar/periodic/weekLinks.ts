// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { PeriodicConfig } from "./config";
import { weekInfo } from "./resolver";

/**
 * A calendar row is one week. Its note is looked up from a mid-week day, not the row's first day:
 * with ISO numbering and a Sunday-first row, the first day belongs to the previous ISO week.
 */
export function weekAnchor(rowStart: Date): Date {
	return new Date(rowStart.getFullYear(), rowStart.getMonth(), rowStart.getDate() + 3);
}

/** The week number shown in the row, from the same rule that names the week's note file. */
export function weekLabel(rowStart: Date, config: PeriodicConfig): string {
	return String(weekInfo(weekAnchor(rowStart), config.weekRule).week);
}
