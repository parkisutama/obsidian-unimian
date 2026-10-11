// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesKanbanView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import { setIcon } from "obsidian";
import type { EntrySnapshot } from "../../core/entries/EntrySnapshot";
import type { DragController } from "./dragAndDrop";
import { type FreezeHeaders, type SwimHeaderDisplay, VIRTUAL_SCROLL_THRESHOLD } from "./types";
import { getEntryValue, valueToString } from "./values";

/** What the board layout needs from its view: resolved options, grouping, and card rendering. */
export interface BoardHost {
	readonly containerEl: HTMLElement;
	readonly drag: DragController;
	getBoardEl(): HTMLElement | null;
	getGroupBy(): string;
	getSwimlaneBy(): string | null;
	getHideEmptyColumns(): boolean;
	getFreezeHeaders(): FreezeHeaders;
	getColumnWidth(): number;
	getSwimHeaderDisplay(): SwimHeaderDisplay;
	getFieldValueColor(fieldId: string, value: string, solid?: boolean): string;
	getColumnKeys(groups: Map<string, EntrySnapshot[]>): string[];
	getOrderedSwimlaneKeys(swimlaneKeys: string[], swimlaneBy: string): string[];
	setCustomColumnOrder(order: string[]): void;
	setCustomSwimlaneOrder(order: string[]): void;
	createSnapshots(): EntrySnapshot[];
	groupEntriesByField(entries: readonly EntrySnapshot[]): Map<string, EntrySnapshot[]>;
	createCard(entry: EntrySnapshot): HTMLElement;
	renderCards(container: HTMLElement, entries: EntrySnapshot[]): void;
	renderVirtualCards(container: HTMLElement, entries: EntrySnapshot[]): void;
	render(): void;
}

/** Lays out the board: plain columns, or the swimlane x column grid, with headers and cells. */
export class BoardRenderer {
	constructor(private readonly host: BoardHost) {}

	private get board(): HTMLElement | null {
		return this.host.getBoardEl();
	}

	/**
	 * Compute the optimal horizontal swimlane label width based on the longest
	 * swimlane key text.  Uses an off-screen canvas for fast measurement without
	 * triggering DOM reflow.
	 *
	 * Layout budget per label (horizontal):
	 *   padding(8×2) + grabHandle(14) + gap(6) + dot(10) + gap(6) + text + gap(6) + countBadge(~32)
	 *   ≈ 90px fixed overhead
	 */
	private computeSwimlaneHorizontalWidth(swimlaneKeys: string[]): number {
		const MIN_WIDTH = 100;
		const MAX_WIDTH = 260;
		const FIXED_OVERHEAD = 90; // grab + dot + gaps + padding + count badge

		if (swimlaneKeys.length === 0) return MIN_WIDTH;

		// Measure longest text using an off-screen canvas
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) return MIN_WIDTH;

		// Match the swimlane label font (13px, 600 weight, Obsidian's default font stack)
		const computedFont = getComputedStyle(this.host.containerEl).fontFamily || "sans-serif";
		ctx.font = `600 13px ${computedFont}`;

		let maxTextWidth = 0;
		for (const key of swimlaneKeys) {
			const w = ctx.measureText(key).width;
			if (w > maxTextWidth) maxTextWidth = w;
		}

		const idealWidth = Math.ceil(maxTextWidth + FIXED_OVERHEAD);
		return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, idealWidth));
	}

	/**
	 * Render with swimlanes (2D grid layout)
	 */
	renderWithSwimlanes(swimlaneBy: string, entries: readonly EntrySnapshot[]): void {
		if (!this.board) return;

		const columnWidth = this.host.getColumnWidth();
		const hideEmpty = this.host.getHideEmptyColumns();
		const groupByField = this.host.getGroupBy();
		const freezeHeaders = this.host.getFreezeHeaders();
		const freezeColumns = freezeHeaders === "columns" || freezeHeaders === "both";
		const freezeSwimlanes = freezeHeaders === "swimlanes" || freezeHeaders === "both";
		const swimHeaderDisplay = this.host.getSwimHeaderDisplay();
		const isVerticalSwimHeader = swimHeaderDisplay === "vertical";

		// First, collect all entries and group by swimlane then by column
		const swimlaneGroups = new Map<string, Map<string, EntrySnapshot[]>>();
		const allColumnKeys = new Set<string>();

		for (const entry of entries) {
			const swimlaneValue = getEntryValue(entry, swimlaneBy);
			const swimlaneKey = valueToString(swimlaneValue);

			const columnValue = getEntryValue(entry, groupByField);
			const columnKey = valueToString(columnValue);

			allColumnKeys.add(columnKey);

			if (!swimlaneGroups.has(swimlaneKey)) {
				swimlaneGroups.set(swimlaneKey, new Map());
			}
			const swimlane = swimlaneGroups.get(swimlaneKey)!;

			if (!swimlane.has(columnKey)) {
				swimlane.set(columnKey, []);
			}
			swimlane.get(columnKey)!.push(entry);
		}

		// Get sorted column keys
		const columnKeys = this.host.getColumnKeys(new Map([...allColumnKeys].map((k) => [k, []])));
		const swimlaneKeys = Array.from(swimlaneGroups.keys()).sort();

		// Calculate dynamic swimlane label width based on longest text
		const swimLabelWidth = isVerticalSwimHeader
			? 48
			: this.computeSwimlaneHorizontalWidth(swimlaneKeys);

		// Create swimlane container
		const swimlaneContainer = document.createElement("div");
		swimlaneContainer.className = "planner-kanban-swimlanes";
		swimlaneContainer.setCssProps({ "--swim-label-width": `${swimLabelWidth}px` });

		// Calculate column totals across all swimlanes
		const columnCounts = new Map<string, number>();
		for (const columnKey of columnKeys) {
			let total = 0;
			for (const swimlane of swimlaneGroups.values()) {
				total += (swimlane.get(columnKey) || []).length;
			}
			columnCounts.set(columnKey, total);
		}

		// Render column headers row first
		const headerRow = document.createElement("div");
		headerRow.className = "planner-kanban-header-row";
		if (freezeColumns) {
			headerRow.classList.add("planner-kanban-header-row--frozen");
		}

		for (const columnKey of columnKeys) {
			const headerCell = document.createElement("div");
			headerCell.className = "planner-kanban-swimlane-header-cell";
			headerCell.setAttribute("data-group", columnKey);
			headerCell.setCssProps({ "--column-width": `${columnWidth}px` });

			// Grab handle for column reordering (CSS handles styles and hover states)
			const grabHandle = document.createElement("span");
			grabHandle.className = "planner-kanban-column-grab";
			setIcon(grabHandle, "grip-vertical");
			grabHandle.setAttribute("draggable", "true");
			this.host.drag.setupSwimlaneColumnDragHandlers(grabHandle, headerCell, columnKey);
			headerCell.appendChild(grabHandle);

			// Color dot for column (uses Pretty Properties / valueStyles / hash)
			{
				const dotEl = document.createElement("span");
				dotEl.className = "planner-kanban-column-dot";
				dotEl.style.backgroundColor = this.host.getFieldValueColor(groupByField, columnKey, true);
				headerCell.appendChild(dotEl);
			}

			// Title (CSS class handles flex: 1)
			const titleSpan = document.createElement("span");
			titleSpan.className = "planner-kanban-column-title";
			titleSpan.textContent = columnKey;
			headerCell.appendChild(titleSpan);

			// Count badge (CSS class handles all styles)
			const count = columnCounts.get(columnKey) || 0;
			const countBadge = document.createElement("span");
			countBadge.className = "planner-kanban-column-count";
			countBadge.textContent = String(count);
			headerCell.appendChild(countBadge);

			headerRow.appendChild(headerCell);
		}
		swimlaneContainer.appendChild(headerRow);

		// Calculate swimlane counts
		const swimlaneCounts = new Map<string, number>();
		for (const [swimlaneKey, swimlane] of swimlaneGroups) {
			let total = 0;
			for (const entries of swimlane.values()) {
				total += entries.length;
			}
			swimlaneCounts.set(swimlaneKey, total);
		}

		// Get ordered swimlane keys
		const orderedSwimlaneKeys = this.host.getOrderedSwimlaneKeys(swimlaneKeys, swimlaneBy);

		// Render each swimlane row
		for (const swimlaneKey of orderedSwimlaneKeys) {
			const swimlaneRow = document.createElement("div");
			swimlaneRow.className = "planner-kanban-swimlane-row";
			swimlaneRow.setAttribute("data-swimlane-row", swimlaneKey);

			// Swimlane label with drag handle, icon, title, and count
			const swimlaneLabel = document.createElement("div");
			swimlaneLabel.setAttribute("data-swimlane", swimlaneKey);

			if (isVerticalSwimHeader) {
				swimlaneLabel.className =
					"planner-kanban-swimlane-label planner-kanban-swimlane-label--vertical";
				if (freezeSwimlanes) {
					swimlaneLabel.classList.add("planner-kanban-swimlane-label--frozen");
				}
			} else {
				swimlaneLabel.className =
					"planner-kanban-swimlane-label planner-kanban-swimlane-label--horizontal";
				if (freezeSwimlanes) {
					swimlaneLabel.classList.add("planner-kanban-swimlane-label--frozen");
				}
			}

			// Header row with grab handle, icon, and title
			const labelHeader = document.createElement("div");
			if (isVerticalSwimHeader) {
				labelHeader.className = "planner-kanban-label-header--vertical";
			} else {
				labelHeader.className = "planner-kanban-label-header--horizontal";
			}

			// Grab handle for swimlane reordering (CSS handles styles and hover states)
			const grabHandle = document.createElement("span");
			grabHandle.className = "planner-kanban-swimlane-grab";
			setIcon(grabHandle, "grip-vertical");
			grabHandle.setAttribute("draggable", "true");
			this.host.drag.setupSwimlaneDragHandlers(grabHandle, swimlaneRow, swimlaneKey);
			labelHeader.appendChild(grabHandle);

			// Color dot for swimlane row (uses Pretty Properties / valueStyles / hash)
			{
				const dotEl = document.createElement("span");
				dotEl.className = "planner-kanban-column-dot";
				dotEl.style.backgroundColor = this.host.getFieldValueColor(swimlaneBy, swimlaneKey, true);
				labelHeader.appendChild(dotEl);
			}

			// Title (CSS class handles styles based on orientation)
			const titleSpan = document.createElement("span");
			titleSpan.className = isVerticalSwimHeader
				? "planner-kanban-swimlane-title--vertical"
				: "planner-kanban-swimlane-title--horizontal";
			titleSpan.textContent = swimlaneKey;
			labelHeader.appendChild(titleSpan);

			swimlaneLabel.appendChild(labelHeader);

			// Count badge (CSS class handles styles based on orientation)
			const count = swimlaneCounts.get(swimlaneKey) || 0;
			const countBadge = document.createElement("span");
			countBadge.className = isVerticalSwimHeader
				? "planner-kanban-swimlane-count planner-kanban-swimlane-count--vertical"
				: "planner-kanban-swimlane-count planner-kanban-swimlane-count--horizontal";
			countBadge.textContent = String(count);
			swimlaneLabel.appendChild(countBadge);

			swimlaneRow.appendChild(swimlaneLabel);

			// Get swimlane data, defaulting to empty Map if this swimlane key has no entries
			// (can happen with predefined priority/status values that have no data)
			const swimlane = swimlaneGroups.get(swimlaneKey) || new Map<string, EntrySnapshot[]>();

			// Render columns in this swimlane
			for (const columnKey of columnKeys) {
				const entries = swimlane.get(columnKey) || [];

				if (hideEmpty && entries.length === 0) {
					// Add empty placeholder to maintain grid alignment
					const placeholder = document.createElement("div");
					placeholder.className = "planner-kanban-placeholder";
					placeholder.setCssProps({ "--column-width": `${columnWidth}px` });
					swimlaneRow.appendChild(placeholder);
				} else {
					const cell = this.createSwimlaneCell(columnKey, swimlaneKey, entries, columnWidth);
					swimlaneRow.appendChild(cell);
				}
			}

			swimlaneContainer.appendChild(swimlaneRow);
		}

		this.board.appendChild(swimlaneContainer);
	}

	/**
	 * Create a cell for swimlane view (simplified column without header)
	 */
	private createSwimlaneCell(
		groupKey: string,
		swimlaneKey: string,
		entries: EntrySnapshot[],
		width: number,
	): HTMLElement {
		const cell = document.createElement("div");
		cell.className = "planner-kanban-swimlane-cell";
		cell.setCssProps({ "--column-width": `${width}px` });
		cell.setAttribute("data-group", groupKey);
		cell.setAttribute("data-swimlane", swimlaneKey);

		// Setup drop handlers
		this.host.drag.setupDropHandlers(cell, groupKey, swimlaneKey);

		// Render cards — same virtual-scroll threshold as the plain-column layout (PERF-001):
		// a swimlane x column grid otherwise builds one full card DOM subtree per entry in every
		// cell synchronously, which is unbounded against a large Base's entry count.
		if (entries.length >= VIRTUAL_SCROLL_THRESHOLD) {
			this.host.renderVirtualCards(cell, entries);
		} else {
			this.host.renderCards(cell, entries);
		}

		return cell;
	}

	renderColumns(groups: Map<string, EntrySnapshot[]>): void {
		if (!this.board) return;

		const columnWidth = this.host.getColumnWidth();
		const hideEmpty = this.host.getHideEmptyColumns();
		const columnKeys = this.host.getColumnKeys(groups);
		const freezeHeaders = this.host.getFreezeHeaders();
		const freezeColumns = freezeHeaders === "columns" || freezeHeaders === "both";

		// Create a wrapper that holds both header row (if sticky) and columns
		const wrapperContainer = document.createElement("div");
		wrapperContainer.className = "planner-kanban-wrapper";

		// If freeze columns is enabled, create a sticky header row
		if (freezeColumns) {
			const headerRow = document.createElement("div");
			headerRow.className =
				"planner-kanban-header-row planner-kanban-header-row--frozen planner-kanban-header-row--plain";

			const groupByField = this.host.getGroupBy();

			for (const columnKey of columnKeys) {
				const entries = groups.get(columnKey) || [];
				if (hideEmpty && entries.length === 0) continue;

				const headerCell = document.createElement("div");
				headerCell.className = "planner-kanban-column-header-cell";
				headerCell.setAttribute("data-group", columnKey);
				headerCell.setCssProps({ "--column-width": `${columnWidth}px` });

				// Grab handle for column reordering
				const grabHandle = document.createElement("span");
				grabHandle.className = "planner-kanban-column-grab";
				setIcon(grabHandle, "grip-vertical");
				grabHandle.setAttribute("draggable", "true");
				this.host.drag.setupSwimlaneColumnDragHandlers(grabHandle, headerCell, columnKey);
				headerCell.appendChild(grabHandle);

				// Color dot for column (uses Pretty Properties / valueStyles / hash)
				{
					const dotEl = document.createElement("span");
					dotEl.className = "planner-kanban-column-dot";
					dotEl.style.backgroundColor = this.host.getFieldValueColor(groupByField, columnKey, true);
					headerCell.appendChild(dotEl);
				}

				// Title (CSS class handles flex: 1)
				const titleSpan = document.createElement("span");
				titleSpan.className = "planner-kanban-column-title";
				titleSpan.textContent = columnKey;
				headerCell.appendChild(titleSpan);

				// Count badge (CSS class handles all styles)
				const countBadge = document.createElement("span");
				countBadge.className = "planner-kanban-column-count";
				countBadge.textContent = String(entries.length);
				headerCell.appendChild(countBadge);

				headerRow.appendChild(headerCell);
			}

			wrapperContainer.appendChild(headerRow);
		}

		// Create columns container (CSS class handles all styles)
		const columnsContainer = document.createElement("div");
		columnsContainer.className = "planner-kanban-columns-container";

		for (const columnKey of columnKeys) {
			const entries = groups.get(columnKey) || [];

			// Skip empty columns if configured
			if (hideEmpty && entries.length === 0) continue;

			const column = this.createColumn(columnKey, entries, columnWidth, freezeColumns);
			columnsContainer.appendChild(column);
		}

		wrapperContainer.appendChild(columnsContainer);
		this.board.appendChild(wrapperContainer);
	}

	private createColumn(
		groupKey: string,
		entries: EntrySnapshot[],
		width: number,
		skipHeader = false,
	): HTMLElement {
		const column = document.createElement("div");
		column.className = "planner-kanban-column";
		// Dynamic width from user setting requires inline style
		column.setCssProps({ "--column-width": `${width}px` });
		column.setAttribute("data-group", groupKey);

		// Column header (pass column for drag handlers) - skip if using sticky header row
		if (!skipHeader) {
			const header = this.createColumnHeader(groupKey, entries.length, column);
			column.appendChild(header);
		}

		// Cards container - fills column, no internal scrolling so content expands column (CSS class handles styles)
		const cardsContainer = document.createElement("div");
		cardsContainer.className = "planner-kanban-cards";
		cardsContainer.setAttribute("data-group", groupKey);

		// Setup drop handlers on cards container
		this.host.drag.setupDropHandlers(cardsContainer, groupKey);

		// Render cards
		if (entries.length >= VIRTUAL_SCROLL_THRESHOLD) {
			this.host.renderVirtualCards(cardsContainer, entries);
		} else {
			this.host.renderCards(cardsContainer, entries);
		}

		column.appendChild(cardsContainer);
		return column;
	}

	private createColumnHeader(groupKey: string, count: number, column: HTMLElement): HTMLElement {
		// CSS class handles all header styles
		const header = document.createElement("div");
		header.className = "planner-kanban-column-header";

		// Grab handle for column reordering (CSS class handles styles and hover states)
		const grabHandle = header.createSpan({ cls: "planner-kanban-column-grab" });
		setIcon(grabHandle, "grip-vertical");

		// Make the grab handle draggable for column reordering
		grabHandle.setAttribute("draggable", "true");
		this.host.drag.setupColumnDragHandlers(grabHandle, column, groupKey);

		// Color dot for column (uses Pretty Properties / valueStyles / hash)
		{
			const dotEl = header.createSpan({ cls: "planner-kanban-column-dot" });
			dotEl.style.backgroundColor = this.host.getFieldValueColor(
				this.host.getGroupBy(),
				groupKey,
				true,
			);
		}

		// Title (CSS class handles flex: 1)
		header.createSpan({ cls: "planner-kanban-column-title", text: groupKey });

		// Count badge (CSS class handles all styles)
		header.createSpan({ cls: "planner-kanban-column-count", text: String(count) });

		return header;
	}
}
