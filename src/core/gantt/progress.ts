// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/** Parses a numeric progress property for the chart, returning undefined when it is not usable. */
export function parseGanttProgress(value: unknown, showProgress = true): number | undefined {
	if (!showProgress || value === null || value === undefined || typeof value === "boolean")
		return undefined;
	if (typeof value === "string" && value.trim() === "") return undefined;
	if (typeof value !== "number" && typeof value !== "string") return undefined;
	const progress = Number(value);
	if (!Number.isFinite(progress)) return undefined;
	return Math.min(100, Math.max(0, progress));
}
