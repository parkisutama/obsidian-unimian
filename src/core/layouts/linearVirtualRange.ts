// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

export interface LinearVirtualRangeInput {
	itemCount: number;
	rowHeight: number;
	scrollTop: number;
	viewportHeight: number;
	overscan?: number;
}

export interface LinearVirtualRange {
	startIndex: number;
	endIndex: number;
	paddingTop: number;
	paddingBottom: number;
	totalHeight: number;
}

/** Pure fixed-height visible-range calculation. `endIndex` is exclusive. */
export function calculateLinearVirtualRange(input: LinearVirtualRangeInput): LinearVirtualRange {
	const count = Math.max(0, Math.trunc(input.itemCount));
	const rowHeight = Number.isFinite(input.rowHeight) && input.rowHeight > 0 ? input.rowHeight : 1;
	const scrollTop = Math.max(0, Number.isFinite(input.scrollTop) ? input.scrollTop : 0);
	const viewportHeight = Math.max(
		0,
		Number.isFinite(input.viewportHeight) ? input.viewportHeight : 0,
	);
	const overscan = Math.max(0, Math.trunc(input.overscan ?? 0));
	const firstVisible = Math.min(count, Math.floor(scrollTop / rowHeight));
	const visibleCount = viewportHeight > 0 ? Math.ceil(viewportHeight / rowHeight) : 0;
	const startIndex = Math.max(0, firstVisible - overscan);
	const endIndex = Math.min(count, firstVisible + visibleCount + overscan);
	const totalHeight = count * rowHeight;
	return {
		startIndex,
		endIndex,
		paddingTop: startIndex * rowHeight,
		paddingBottom: Math.max(0, totalHeight - endIndex * rowHeight),
		totalHeight,
	};
}
