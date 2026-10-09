// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * JS-driven shortest-column-first masonry layout (spec docs/specs/sticky-note.md §6).
 *
 * CSS `column-width`/`column-count` multi-column was tried first and failed native testing: it
 * balances column *height*, not column *count* — a single card much taller than the rest made
 * the browser collapse the whole grid to one narrow column instead of spreading across the pane
 * (`tasks/sticky-note/spike-report.md`, STICKY-001). This module instead computes column count
 * from container width via a breakpoint table, then places each card into whichever column is
 * currently shortest, absolutely positioned — so column count depends only on width and card
 * count, never on any one card's height.
 *
 * Design evidence, no code copied (see docs/architecture/upstream-provenance.md's "Mini Notes
 * (masonry layout)" entry): `rknastenka/obsidian-mini-notes` (MIT) documents the identical CSS
 * multi-column failure in its own `masonry.ts` and fixes it with the same approach.
 */

export const MASONRY_GAP = 16;
export const DEFAULT_TARGET_CARD_WIDTH = 240;

/**
 * Column count derived from available width divided by the user's desired card width (the
 * `Card width` view option) — not a fixed breakpoint table. A wider pane naturally gets more
 * columns of roughly `targetCardWidth`; a narrower one gets fewer. This is a deliberate
 * simplification versus some reference plugins' separate desktop/tablet/mobile width sliders:
 * one target width already adapts continuously to the container, so three fixed tiers would be
 * redundant (see docs/specs/sticky-note.md §2.5's `cardWidth` option).
 */
export function getColumnCount(
	containerWidth: number,
	targetCardWidth: number = DEFAULT_TARGET_CARD_WIDTH,
	gap = MASONRY_GAP,
): number {
	if (containerWidth <= 0 || targetCardWidth <= 0) return 1;
	return Math.max(1, Math.floor((containerWidth + gap) / (targetCardWidth + gap)));
}

/**
 * Lays out `section`'s direct children into shortest-column-first masonry columns. Card DOM
 * order is left untouched (only `top`/`left`/`width` styles change), so keyboard/reading order
 * stays independent of visual placement.
 */
export function layoutMasonrySection(
	section: HTMLElement,
	targetCardWidth: number = DEFAULT_TARGET_CARD_WIDTH,
	gap = MASONRY_GAP,
): void {
	const cards = Array.from(section.children).filter(
		(el): el is HTMLElement => el instanceof HTMLElement,
	);
	if (cards.length === 0) {
		section.style.height = "0px";
		return;
	}

	const containerWidth = section.clientWidth;
	const columnCount = getColumnCount(containerWidth, targetCardWidth, gap);
	const colWidth = (containerWidth - gap * (columnCount - 1)) / columnCount;

	// Batched write/read/write, not interleaved per card: writing a card's geometry then
	// immediately reading another card's height forces a synchronous reflow on every iteration
	// (layout thrashing) — expensive enough at large card counts to read as visible jank
	// (maintainer report, native testing 2026-09-23). Every card gets the same `colWidth`
	// regardless of which column it lands in, so height never depends on column assignment —
	// width can be written for all cards, then every height read once, before any position is
	// decided or written.
	for (const card of cards) {
		card.style.position = "absolute";
		card.style.width = `${colWidth}px`;
	}

	const heights = cards.map((card) => card.getBoundingClientRect().height);

	const columnHeights: number[] = new Array<number>(columnCount).fill(0);
	const placements: { card: HTMLElement; left: number; top: number }[] = [];

	cards.forEach((card, i) => {
		let target = 0;
		let shortest = columnHeights[0] ?? 0;
		for (let c = 1; c < columnCount; c++) {
			const height = columnHeights[c] ?? 0;
			if (height < shortest) {
				shortest = height;
				target = c;
			}
		}

		const top = shortest;
		placements.push({ card, left: target * (colWidth + gap), top });
		columnHeights[target] = top + (heights[i] ?? 0) + gap;
	});

	for (const { card, left, top } of placements) {
		card.style.left = `${left}px`;
		card.style.top = `${top}px`;
	}

	section.style.position = "relative";
	section.style.height = `${Math.max(...columnHeights) - gap}px`;
}
