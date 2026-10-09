// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesSwimlaneView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import type { EntrySnapshot } from "../../core/entries/EntrySnapshot";

/** What the drag-and-drop controller needs from its view. */
export interface DragHost {
	readonly containerEl: HTMLElement;
	getDoc(): Document;
	getBoardEl(): HTMLElement | null;
	hasSwimlanes(): boolean;
	reorderColumns(draggedKey: string, targetKey: string, insertBefore: boolean): void;
	reorderSwimlanes(draggedKey: string, targetKey: string, insertBefore: boolean): void;
	/** Applies a card drop (fire-and-forget; the view owns the mutation and its error handling). */
	dropCard(filePath: string, groupValue: string, swimlaneValue?: string): void;
}

/**
 * Owns every mouse/touch drag interaction on the board (card moves, column and swimlane
 * reordering) together with the timers, clones, and listeners they create. `cancelAll`
 * releases all of it and is safe to call at any time, including repeatedly.
 */
export class DragController {
	// Drag state
	private draggedCardPath: string | null = null;
	private draggedFromColumn: string | null = null;

	// Mobile touch drag state
	private touchDragCard: HTMLElement | null = null;
	private touchDragClone: HTMLElement | null = null;
	private touchStartX: number = 0;
	private touchStartY: number = 0;
	private lastTouchX: number = 0;
	private lastTouchY: number = 0;
	private scrollInterval: number | null = null;
	private touchHoldTimer: number | null = null;
	private touchHoldReady: boolean = false;
	private touchHoldCard: HTMLElement | null = null;
	private touchHoldEntry: EntrySnapshot | null = null;
	// Context menu blocker for iOS (prevents long-press menu during drag)
	private boundContextMenuBlocker = (e: Event): void => {
		e.preventDefault();
		e.stopPropagation();
	};

	// Column reordering state
	private draggedColumn: HTMLElement | null = null;
	private draggedColumnKey: string | null = null;

	// Swimlane reordering state
	private draggedSwimlane: HTMLElement | null = null;
	private draggedSwimlaneKey: string | null = null;

	// Swimlane touch drag state (for mobile)
	private touchDragSwimlane: HTMLElement | null = null;
	private touchDragSwimlaneClone: HTMLElement | null = null;
	private touchSwimlaneStartX: number = 0;
	private touchSwimlaneStartY: number = 0;
	private touchSwimlaneHoldTimer: number | null = null;
	private touchSwimlaneHoldReady: boolean = false;

	constructor(private readonly host: DragHost) {}

	private get board(): HTMLElement | null {
		return this.host.getBoardEl();
	}

	/**
	 * Unconditionally releases touch/mouse drag state (card and swimlane reordering) without
	 * attempting to find or commit a drop, unlike endTouchDrag/endSwimlaneTouchDrag. Used when
	 * the view unloads mid-gesture so no clone, context-menu blocker, hold timer, or
	 * auto-scroll interval survives.
	 */
	cancelAll(): void {
		const doc = this.host.containerEl.ownerDocument;

		if (this.touchHoldTimer !== null) {
			window.clearTimeout(this.touchHoldTimer);
			this.touchHoldTimer = null;
		}
		if (this.touchSwimlaneHoldTimer !== null) {
			window.clearTimeout(this.touchSwimlaneHoldTimer);
			this.touchSwimlaneHoldTimer = null;
		}
		this.stopAutoScroll();
		doc.removeEventListener("contextmenu", this.boundContextMenuBlocker, true);

		if (this.touchDragClone) {
			this.touchDragClone.remove();
			this.touchDragClone = null;
		}
		this.touchDragCard = null;
		this.draggedCardPath = null;
		this.draggedFromColumn = null;

		if (this.touchDragSwimlaneClone) {
			this.touchDragSwimlaneClone.remove();
			this.touchDragSwimlaneClone = null;
		}
		this.touchDragSwimlane = null;
		this.draggedSwimlaneKey = null;
	}

	setupColumnDragHandlers(grabHandle: HTMLElement, column: HTMLElement, groupKey: string): void {
		grabHandle.addEventListener("dragstart", (e: DragEvent) => {
			e.stopPropagation(); // Don't trigger card drag
			this.draggedColumn = column;
			this.draggedColumnKey = groupKey;
			column.classList.add("planner-kanban-column--dragging");
			e.dataTransfer?.setData("text/plain", `column:${groupKey}`);
			e.dataTransfer!.effectAllowed = "move";
		});

		// Handle edge scrolling during column drag
		grabHandle.addEventListener("drag", (e: DragEvent) => {
			if (!this.board || !e.clientX) return;
			this.handleEdgeScroll(e.clientX, e.clientY);
		});

		grabHandle.addEventListener("dragend", () => {
			if (this.draggedColumn) {
				this.draggedColumn.classList.remove("planner-kanban-column--dragging");
			}
			this.draggedColumn = null;
			this.draggedColumnKey = null;
			this.stopAutoScroll(); // Stop any auto-scrolling
			// Remove all drop indicators
			this.host
				.getDoc()
				.querySelectorAll(".planner-kanban-column--drop-left, .planner-kanban-column--drop-right")
				.forEach((el) => {
					el.classList.remove(
						"planner-kanban-column--drop-left",
						"planner-kanban-column--drop-right",
					);
				});
		});

		// Setup drop handlers on the column itself
		column.addEventListener("dragover", (e: DragEvent) => {
			// Only handle column drops, not card drops
			if (!this.draggedColumn || this.draggedColumn === column) return;
			e.preventDefault();
			e.dataTransfer!.dropEffect = "move";

			// Determine drop position (left or right half of column)
			const rect = column.getBoundingClientRect();
			const midpoint = rect.left + rect.width / 2;
			column.classList.remove(
				"planner-kanban-column--drop-left",
				"planner-kanban-column--drop-right",
			);
			if (e.clientX < midpoint) {
				column.classList.add("planner-kanban-column--drop-left");
			} else {
				column.classList.add("planner-kanban-column--drop-right");
			}
		});

		column.addEventListener("dragleave", () => {
			column.classList.remove(
				"planner-kanban-column--drop-left",
				"planner-kanban-column--drop-right",
			);
		});

		column.addEventListener("drop", (e: DragEvent) => {
			if (!this.draggedColumn || !this.draggedColumnKey || this.draggedColumn === column) return;
			e.preventDefault();

			const rect = column.getBoundingClientRect();
			const midpoint = rect.left + rect.width / 2;
			const insertBefore = e.clientX < midpoint;

			// Reorder columns
			this.host.reorderColumns(this.draggedColumnKey, groupKey, insertBefore);

			column.classList.remove(
				"planner-kanban-column--drop-left",
				"planner-kanban-column--drop-right",
			);
		});
	}

	setupSwimlaneColumnDragHandlers(
		grabHandle: HTMLElement,
		headerCell: HTMLElement,
		groupKey: string,
	): void {
		grabHandle.addEventListener("dragstart", (e: DragEvent) => {
			e.stopPropagation();
			this.draggedColumn = headerCell;
			this.draggedColumnKey = groupKey;
			headerCell.classList.add("planner-kanban-column--dragging");
			e.dataTransfer?.setData("text/plain", `column:${groupKey}`);
			e.dataTransfer!.effectAllowed = "move";
		});

		// Handle edge scrolling during column drag
		grabHandle.addEventListener("drag", (e: DragEvent) => {
			if (!this.board || !e.clientX) return;
			this.handleEdgeScroll(e.clientX, e.clientY);
		});

		grabHandle.addEventListener("dragend", () => {
			if (this.draggedColumn) {
				this.draggedColumn.classList.remove("planner-kanban-column--dragging");
			}
			this.draggedColumn = null;
			this.draggedColumnKey = null;
			this.stopAutoScroll(); // Stop any auto-scrolling
			// Remove all drop indicators
			this.host
				.getDoc()
				.querySelectorAll(".planner-kanban-column--drop-left, .planner-kanban-column--drop-right")
				.forEach((el) => {
					el.classList.remove(
						"planner-kanban-column--drop-left",
						"planner-kanban-column--drop-right",
					);
				});
		});

		// Setup drop handlers on the header cell itself
		headerCell.addEventListener("dragover", (e: DragEvent) => {
			// Only handle column drops
			if (!this.draggedColumn || this.draggedColumn === headerCell) return;
			e.preventDefault();
			e.dataTransfer!.dropEffect = "move";

			// Determine drop position (left or right half)
			const rect = headerCell.getBoundingClientRect();
			const midpoint = rect.left + rect.width / 2;
			headerCell.classList.remove(
				"planner-kanban-column--drop-left",
				"planner-kanban-column--drop-right",
			);
			if (e.clientX < midpoint) {
				headerCell.classList.add("planner-kanban-column--drop-left");
			} else {
				headerCell.classList.add("planner-kanban-column--drop-right");
			}
		});

		headerCell.addEventListener("dragleave", () => {
			headerCell.classList.remove(
				"planner-kanban-column--drop-left",
				"planner-kanban-column--drop-right",
			);
		});

		headerCell.addEventListener("drop", (e: DragEvent) => {
			if (!this.draggedColumn || !this.draggedColumnKey || this.draggedColumn === headerCell)
				return;
			e.preventDefault();

			const rect = headerCell.getBoundingClientRect();
			const midpoint = rect.left + rect.width / 2;
			const insertBefore = e.clientX < midpoint;

			// Reorder columns
			this.host.reorderColumns(this.draggedColumnKey, groupKey, insertBefore);

			headerCell.classList.remove(
				"planner-kanban-column--drop-left",
				"planner-kanban-column--drop-right",
			);
		});
	}

	/**
	 * Setup drag handlers for swimlane rows (for reordering swimlanes)
	 */
	setupSwimlaneDragHandlers(
		grabHandle: HTMLElement,
		swimlaneRow: HTMLElement,
		swimlaneKey: string,
	): void {
		grabHandle.addEventListener("dragstart", (e: DragEvent) => {
			e.stopPropagation();
			this.draggedSwimlane = swimlaneRow;
			this.draggedSwimlaneKey = swimlaneKey;
			swimlaneRow.classList.add("planner-kanban-swimlane--dragging");
			e.dataTransfer?.setData("text/plain", `swimlane:${swimlaneKey}`);
			e.dataTransfer!.effectAllowed = "move";
		});

		// Handle edge scrolling during swimlane drag
		grabHandle.addEventListener("drag", (e: DragEvent) => {
			if (!this.board || !e.clientX) return;
			this.handleEdgeScroll(e.clientX, e.clientY);
		});

		grabHandle.addEventListener("dragend", () => {
			if (this.draggedSwimlane) {
				this.draggedSwimlane.classList.remove("planner-kanban-swimlane--dragging");
			}
			this.draggedSwimlane = null;
			this.draggedSwimlaneKey = null;
			this.stopAutoScroll(); // Stop any auto-scrolling
			// Remove all drop indicators
			this.host
				.getDoc()
				.querySelectorAll(
					".planner-kanban-swimlane--drop-above, .planner-kanban-swimlane--drop-below",
				)
				.forEach((el) => {
					el.classList.remove(
						"planner-kanban-swimlane--drop-above",
						"planner-kanban-swimlane--drop-below",
					);
				});
		});

		// Setup drop handlers on the swimlane row itself
		swimlaneRow.addEventListener("dragover", (e: DragEvent) => {
			// Only handle swimlane drops
			if (!this.draggedSwimlane || this.draggedSwimlane === swimlaneRow) return;
			e.preventDefault();
			e.dataTransfer!.dropEffect = "move";

			// Determine drop position (top or bottom half)
			const rect = swimlaneRow.getBoundingClientRect();
			const midpoint = rect.top + rect.height / 2;
			swimlaneRow.classList.remove(
				"planner-kanban-swimlane--drop-above",
				"planner-kanban-swimlane--drop-below",
			);
			if (e.clientY < midpoint) {
				swimlaneRow.classList.add("planner-kanban-swimlane--drop-above");
			} else {
				swimlaneRow.classList.add("planner-kanban-swimlane--drop-below");
			}
		});

		swimlaneRow.addEventListener("dragleave", () => {
			swimlaneRow.classList.remove(
				"planner-kanban-swimlane--drop-above",
				"planner-kanban-swimlane--drop-below",
			);
		});

		swimlaneRow.addEventListener("drop", (e: DragEvent) => {
			if (!this.draggedSwimlane || !this.draggedSwimlaneKey || this.draggedSwimlane === swimlaneRow)
				return;
			e.preventDefault();

			const rect = swimlaneRow.getBoundingClientRect();
			const midpoint = rect.top + rect.height / 2;
			const insertBefore = e.clientY < midpoint;

			// Reorder swimlanes
			this.host.reorderSwimlanes(this.draggedSwimlaneKey, swimlaneKey, insertBefore);

			swimlaneRow.classList.remove(
				"planner-kanban-swimlane--drop-above",
				"planner-kanban-swimlane--drop-below",
			);
		});

		// Mobile touch handlers for swimlane reordering with hold delay
		const HOLD_DELAY_MS = 200;

		grabHandle.addEventListener(
			"touchstart",
			(e: TouchEvent) => {
				const firstTouch = e.touches[0];
				if (!firstTouch) return;
				this.touchSwimlaneStartX = firstTouch.clientX;
				this.touchSwimlaneStartY = firstTouch.clientY;
				this.touchSwimlaneHoldReady = false;

				this.touchSwimlaneHoldTimer = window.setTimeout(() => {
					this.touchSwimlaneHoldReady = true;
					grabHandle.classList.add("planner-kanban-grab--hold-ready");
				}, HOLD_DELAY_MS);
			},
			{ passive: true },
		);

		grabHandle.addEventListener(
			"touchmove",
			(e: TouchEvent) => {
				const moveTouch = e.touches[0];
				if (!moveTouch) return;
				const dx = Math.abs(moveTouch.clientX - this.touchSwimlaneStartX);
				const dy = Math.abs(moveTouch.clientY - this.touchSwimlaneStartY);

				// If moved before hold timer completed, cancel and allow normal scrolling
				if (!this.touchSwimlaneHoldReady && (dx > 10 || dy > 10)) {
					this.cancelSwimlaneTouchHold(grabHandle);
					return;
				}

				// Start touch drag if hold completed and moved enough
				if (this.touchSwimlaneHoldReady && !this.touchDragSwimlane) {
					if (dx > 10 || dy > 10) {
						this.startSwimlaneTouchDrag(swimlaneRow, swimlaneKey, e);
					}
				} else if (this.touchDragSwimlaneClone) {
					e.preventDefault();
					this.updateSwimlaneTouchDrag(e);
				}
			},
			{ passive: false },
		);

		grabHandle.addEventListener("touchend", (e: TouchEvent) => {
			this.cancelSwimlaneTouchHold(grabHandle);
			if (this.touchDragSwimlane) {
				this.endSwimlaneTouchDrag(e);
			}
		});

		grabHandle.addEventListener("touchcancel", () => {
			this.cancelSwimlaneTouchHold(grabHandle);
			this.cleanupSwimlaneTouchDrag();
		});
	}

	private cancelSwimlaneTouchHold(grabHandle: HTMLElement): void {
		if (this.touchSwimlaneHoldTimer) {
			clearTimeout(this.touchSwimlaneHoldTimer);
			this.touchSwimlaneHoldTimer = null;
		}
		grabHandle.classList.remove("planner-kanban-grab--hold-ready");
		this.touchSwimlaneHoldReady = false;
	}

	private startSwimlaneTouchDrag(
		swimlaneRow: HTMLElement,
		swimlaneKey: string,
		e: TouchEvent,
	): void {
		this.touchDragSwimlane = swimlaneRow;
		this.draggedSwimlaneKey = swimlaneKey;

		// Create visual clone
		const labelEl = swimlaneRow.querySelector(".planner-kanban-swimlane-label");
		if (labelEl) {
			this.touchDragSwimlaneClone = labelEl.cloneNode(true) as HTMLElement;
			this.touchDragSwimlaneClone.className = "planner-kanban-swimlane-drag-clone";
			this.touchDragSwimlaneClone.setCssProps({ "--clone-width": `${labelEl.clientWidth}px` });
			this.host.getDoc().body.appendChild(this.touchDragSwimlaneClone);
		}

		swimlaneRow.classList.add("planner-kanban-swimlane--dragging");
		this.updateSwimlaneTouchDrag(e);
	}

	private updateSwimlaneTouchDrag(e: TouchEvent): void {
		if (!this.touchDragSwimlaneClone || !this.board) return;

		const touch = e.touches[0];
		if (!touch) return;
		this.touchDragSwimlaneClone.style.left = `${touch.clientX - 50}px`;
		this.touchDragSwimlaneClone.style.top = `${touch.clientY - 20}px`;

		// Handle edge scrolling
		this.handleEdgeScroll(touch.clientX, touch.clientY);

		// Highlight drop target
		this.highlightSwimlaneDropTarget(touch.clientY);
	}

	private highlightSwimlaneDropTarget(clientY: number): void {
		// Clear previous highlights
		this.host
			.getDoc()
			.querySelectorAll(
				".planner-kanban-swimlane--drop-above, .planner-kanban-swimlane--drop-below",
			)
			.forEach((el) => {
				el.classList.remove(
					"planner-kanban-swimlane--drop-above",
					"planner-kanban-swimlane--drop-below",
				);
			});

		// Find swimlane row under touch point
		const rows = Array.from(this.host.getDoc().querySelectorAll(".planner-kanban-swimlane-row"));
		for (const row of rows) {
			if (row === this.touchDragSwimlane) continue;
			const rect = row.getBoundingClientRect();
			if (clientY >= rect.top && clientY <= rect.bottom) {
				const midpoint = rect.top + rect.height / 2;
				if (clientY < midpoint) {
					row.classList.add("planner-kanban-swimlane--drop-above");
				} else {
					row.classList.add("planner-kanban-swimlane--drop-below");
				}
				break;
			}
		}
	}

	private endSwimlaneTouchDrag(e: TouchEvent): void {
		this.stopAutoScroll();

		const touch = e.changedTouches[0];
		if (!touch) {
			this.cleanupSwimlaneTouchDrag();
			return;
		}

		// Find drop target
		const rows = Array.from(this.host.getDoc().querySelectorAll(".planner-kanban-swimlane-row"));
		for (const row of rows) {
			if (row === this.touchDragSwimlane) continue;
			const rect = row.getBoundingClientRect();
			if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
				const targetKey = row.getAttribute("data-swimlane-row");
				if (targetKey && this.draggedSwimlaneKey) {
					const midpoint = rect.top + rect.height / 2;
					const insertBefore = touch.clientY < midpoint;
					this.host.reorderSwimlanes(this.draggedSwimlaneKey, targetKey, insertBefore);
				}
				break;
			}
		}

		this.cleanupSwimlaneTouchDrag();
	}

	private cleanupSwimlaneTouchDrag(): void {
		if (this.touchDragSwimlaneClone) {
			this.touchDragSwimlaneClone.remove();
			this.touchDragSwimlaneClone = null;
		}
		if (this.touchDragSwimlane) {
			this.touchDragSwimlane.classList.remove("planner-kanban-swimlane--dragging");
			this.touchDragSwimlane = null;
		}
		this.draggedSwimlaneKey = null;
		this.stopAutoScroll();

		// Clear all drop indicators
		this.host
			.getDoc()
			.querySelectorAll(
				".planner-kanban-swimlane--drop-above, .planner-kanban-swimlane--drop-below",
			)
			.forEach((el) => {
				el.classList.remove(
					"planner-kanban-swimlane--drop-above",
					"planner-kanban-swimlane--drop-below",
				);
			});
	}

	setupCardDragHandlers(card: HTMLElement, entry: EntrySnapshot): void {
		// Desktop drag handlers
		card.addEventListener("dragstart", (e: DragEvent) => {
			this.draggedCardPath = entry.path;
			this.draggedFromColumn =
				card.closest(".planner-kanban-column")?.getAttribute("data-group") ||
				card.closest(".planner-kanban-swimlane-cell")?.getAttribute("data-group") ||
				null;
			card.classList.add("planner-kanban-card--dragging");
			e.dataTransfer?.setData("text/plain", entry.path);
		});

		card.addEventListener("dragend", () => {
			card.classList.remove("planner-kanban-card--dragging");
			this.draggedCardPath = null;
			this.draggedFromColumn = null;
			this.stopAutoScroll();
		});

		// Desktop dragover for edge scrolling
		card.addEventListener("drag", (e: DragEvent) => {
			if (!this.board || !e.clientX) return;
			this.handleEdgeScroll(e.clientX, e.clientY);
		});

		// Mobile touch handlers with tap-hold delay to prevent accidental drags while scrolling
		const HOLD_DELAY_MS = 200; // Time finger must be held before drag is enabled

		card.addEventListener(
			"touchstart",
			(e: TouchEvent) => {
				// Clear any previous touch state (important after scrolling on iOS)
				this.cancelTouchHold();

				const startTouch = e.touches[0];
				if (!startTouch) return;
				this.touchStartX = startTouch.clientX;
				this.touchStartY = startTouch.clientY;
				this.touchHoldReady = false;
				this.touchHoldCard = card;
				this.touchHoldEntry = entry;

				// CRITICAL: Set touch-action: none IMMEDIATELY to prevent iOS from committing to scroll.
				// iOS decides touch behavior at touchstart based on CSS at that moment.
				// If user moves before hold completes, we remove this class in cancelTouchHold().
				card.classList.add("planner-kanban-card--touch-active");

				// Start hold timer - drag only enabled after delay
				this.touchHoldTimer = window.setTimeout(() => {
					this.touchHoldReady = true;
					// Add visual feedback that card is ready to drag
					card.classList.add("planner-kanban-card--hold-ready");
				}, HOLD_DELAY_MS);
			},
			{ passive: true },
		);

		card.addEventListener(
			"touchmove",
			(e: TouchEvent) => {
				const moveT = e.touches[0];
				if (!moveT) return;
				const dx = Math.abs(moveT.clientX - this.touchStartX);
				const dy = Math.abs(moveT.clientY - this.touchStartY);

				// If moved before hold timer completed, cancel and allow normal scrolling
				if (!this.touchHoldReady && (dx > 10 || dy > 10)) {
					this.cancelTouchHold();
					return; // Allow default scroll behavior
				}

				// Once hold-ready, ALWAYS prevent default to stop iOS from committing to scroll
				// This must happen on every touchmove, not just when movement threshold is met
				if (this.touchHoldReady) {
					e.preventDefault();
				}

				// Start drag if hold delay completed, not already dragging, and moved enough
				if (this.touchHoldReady && !this.touchDragCard && !this.touchDragClone) {
					if (dx > 10 || dy > 10) {
						this.startTouchDrag(card, entry, e);
					}
				} else if (this.touchDragClone) {
					this.updateTouchDrag(e);
				}
			},
			{ passive: false },
		);

		card.addEventListener("touchend", (e: TouchEvent) => {
			this.cancelTouchHold();
			if (this.touchDragCard) {
				this.endTouchDrag(e);
			}
		});

		card.addEventListener("touchcancel", () => {
			this.cancelTouchHold();
			if (this.touchDragCard) {
				const doc = this.host.containerEl.ownerDocument;
				// Remove context menu blocker
				doc.removeEventListener("contextmenu", this.boundContextMenuBlocker, true);
				// Clean up drag state on cancel
				if (this.touchDragClone) {
					this.touchDragClone.remove();
					this.touchDragClone = null;
				}
				if (this.touchDragCard) {
					// Remove all drag-related classes
					this.touchDragCard.classList.remove("planner-kanban-card--dragging");
					this.touchDragCard.classList.remove("planner-kanban-card--hold-ready");
					this.touchDragCard.classList.remove("planner-kanban-card--touch-active");
					this.touchDragCard = null;
				}
				this.draggedCardPath = null;
				this.draggedFromColumn = null;
				this.lastTouchX = 0;
				this.lastTouchY = 0;
				this.stopAutoScroll();
			}
		});
	}

	private cancelTouchHold(): void {
		if (this.touchHoldTimer) {
			clearTimeout(this.touchHoldTimer);
			this.touchHoldTimer = null;
		}
		if (this.touchHoldCard) {
			this.touchHoldCard.classList.remove("planner-kanban-card--hold-ready");
			// Restore touch-action to allow normal scrolling
			this.touchHoldCard.classList.remove("planner-kanban-card--touch-active");
		}
		this.touchHoldReady = false;
		this.touchHoldCard = null;
		this.touchHoldEntry = null;
	}

	private startTouchDrag(card: HTMLElement, entry: EntrySnapshot, e: TouchEvent): void {
		const doc = this.host.containerEl.ownerDocument;

		this.touchDragCard = card;
		this.draggedCardPath = entry.path;
		this.draggedFromColumn =
			card.closest(".planner-kanban-column")?.getAttribute("data-group") ||
			card.closest(".planner-kanban-swimlane-cell")?.getAttribute("data-group") ||
			null;

		// Block context menu during drag (critical for iOS long-press)
		doc.addEventListener("contextmenu", this.boundContextMenuBlocker, true);

		// Create a clone for visual feedback
		this.touchDragClone = card.cloneNode(true) as HTMLElement;
		this.touchDragClone.className = "planner-kanban-drag-clone";
		this.touchDragClone.setCssProps({ "--clone-width": `${card.offsetWidth}px` });
		doc.body.appendChild(this.touchDragClone);

		// Remove hold-ready class (has touch-action: none which must not persist)
		// and add dragging class
		card.classList.remove("planner-kanban-card--hold-ready");
		card.classList.add("planner-kanban-card--dragging");

		this.updateTouchDrag(e);
	}

	private updateTouchDrag(e: TouchEvent): void {
		if (!this.touchDragClone || !this.board) return;

		const touch = e.touches[0];
		if (!touch) return;
		this.touchDragClone.style.left = `${touch.clientX - 50}px`;
		this.touchDragClone.style.top = `${touch.clientY - 20}px`;

		// Store last touch position for iOS fallback (touchend coordinates can be unreliable)
		this.lastTouchX = touch.clientX;
		this.lastTouchY = touch.clientY;

		// Handle edge scrolling
		this.handleEdgeScroll(touch.clientX, touch.clientY);

		// Highlight drop target
		this.highlightDropTarget(touch.clientX, touch.clientY);
	}

	private endTouchDrag(e: TouchEvent): void {
		const doc = this.host.containerEl.ownerDocument;

		this.stopAutoScroll();

		// Remove context menu blocker
		doc.removeEventListener("contextmenu", this.boundContextMenuBlocker, true);

		// Find drop target BEFORE removing clone (iOS Safari needs this timing)
		// The clone has pointer-events: none, so elementFromPoint sees through it
		let dropTarget: { group: string; swimlane?: string } | null = null;
		if (this.touchDragCard) {
			const touch = e.changedTouches[0];
			if (touch) {
				// Try touchend coordinates first, fall back to last stored position from touchmove
				// (iOS touchend coordinates can be unreliable)
				dropTarget = this.findDropTarget(touch.clientX, touch.clientY);
			}
			if (!dropTarget && (this.lastTouchX !== 0 || this.lastTouchY !== 0)) {
				dropTarget = this.findDropTarget(this.lastTouchX, this.lastTouchY);
			}
		}

		if (this.touchDragClone) {
			this.touchDragClone.remove();
			this.touchDragClone = null;
		}

		if (this.touchDragCard) {
			// Remove all drag-related classes
			this.touchDragCard.classList.remove("planner-kanban-card--dragging");
			this.touchDragCard.classList.remove("planner-kanban-card--hold-ready");
			this.touchDragCard.classList.remove("planner-kanban-card--touch-active");

			if (dropTarget && this.draggedCardPath) {
				this.host.dropCard(this.draggedCardPath, dropTarget.group, dropTarget.swimlane);
			}

			this.touchDragCard = null;
		}

		this.draggedCardPath = null;
		this.draggedFromColumn = null;
		this.lastTouchX = 0;
		this.lastTouchY = 0;

		// Clear all dragover highlights
		doc.querySelectorAll(".planner-kanban-cards--dragover").forEach((el) => {
			el.classList.remove("planner-kanban-cards--dragover");
		});
	}

	private handleEdgeScroll(clientX: number, clientY: number): void {
		if (!this.board) return;

		const boardRect = this.board.getBoundingClientRect();
		const edgeThreshold = 60;
		const scrollSpeed = 15;

		let scrollX = 0;
		let scrollY = 0;

		// Check horizontal edges (always use boardEl rect)
		if (clientX < boardRect.left + edgeThreshold) {
			scrollX = -scrollSpeed;
		} else if (clientX > boardRect.right - edgeThreshold) {
			scrollX = scrollSpeed;
		}

		// Check vertical edges
		// When swimlanes are enabled, use containerEl rect since that's the vertical scroll container
		const verticalRect = this.host.hasSwimlanes()
			? this.host.containerEl.getBoundingClientRect()
			: boardRect;

		if (clientY < verticalRect.top + edgeThreshold) {
			scrollY = -scrollSpeed;
		} else if (clientY > verticalRect.bottom - edgeThreshold) {
			scrollY = scrollSpeed;
		}

		if (scrollX !== 0 || scrollY !== 0) {
			this.startAutoScroll(scrollX, scrollY);
		} else {
			this.stopAutoScroll();
		}
	}

	private startAutoScroll(scrollX: number, scrollY: number): void {
		if (this.scrollInterval) {
			clearInterval(this.scrollInterval);
		}

		this.scrollInterval = window.setInterval(() => {
			if (this.board) {
				// Horizontal scrolling always uses boardEl
				this.board.scrollLeft += scrollX;

				// Vertical scrolling: when swimlanes are enabled, use containerEl
				// because boardEl has min-height: min-content and expands to fit content
				if (scrollY !== 0 && this.host.hasSwimlanes()) {
					this.host.containerEl.scrollTop += scrollY;
				} else {
					this.board.scrollTop += scrollY;
				}
			}
		}, 16);
	}

	private stopAutoScroll(): void {
		if (this.scrollInterval) {
			clearInterval(this.scrollInterval);
			this.scrollInterval = null;
		}
	}

	private highlightDropTarget(clientX: number, clientY: number): void {
		const doc = this.host.containerEl.ownerDocument;

		// Clear previous highlights
		doc.querySelectorAll(".planner-kanban-cards--dragover").forEach((el) => {
			el.classList.remove("planner-kanban-cards--dragover");
		});

		// Hide ghost before elementFromPoint (critical for iOS Safari)
		if (this.touchDragClone) this.touchDragClone.classList.add("planner-kanban-drag-clone--hidden");

		// Find and highlight current target
		const target = doc.elementFromPoint(clientX, clientY);

		// Restore ghost visibility
		if (this.touchDragClone)
			this.touchDragClone.classList.remove("planner-kanban-drag-clone--hidden");

		const dropZone = target?.closest(".planner-kanban-cards, .planner-kanban-swimlane-cell");
		if (dropZone) {
			dropZone.classList.add("planner-kanban-cards--dragover");
		}
	}

	private findDropTarget(
		clientX: number,
		clientY: number,
	): { group: string; swimlane?: string } | null {
		const doc = this.host.containerEl.ownerDocument;

		// Hide ghost before elementFromPoint (critical for iOS Safari)
		if (this.touchDragClone) this.touchDragClone.classList.add("planner-kanban-drag-clone--hidden");

		const target = doc.elementFromPoint(clientX, clientY);

		// Restore ghost visibility
		if (this.touchDragClone)
			this.touchDragClone.classList.remove("planner-kanban-drag-clone--hidden");

		const dropZone = target?.closest(
			".planner-kanban-cards, .planner-kanban-swimlane-cell, .planner-kanban-column",
		);
		const group = dropZone?.getAttribute("data-group");
		if (!group) return null;

		const swimlane = dropZone?.getAttribute("data-swimlane") || undefined;
		return { group, swimlane };
	}

	setupDropHandlers(container: HTMLElement, groupKey: string, swimlaneKey?: string): void {
		container.addEventListener("dragover", (e: DragEvent) => {
			e.preventDefault();
			container.classList.add("planner-kanban-cards--dragover");
		});

		container.addEventListener("dragleave", () => {
			container.classList.remove("planner-kanban-cards--dragover");
		});

		container.addEventListener("drop", (e: DragEvent) => {
			e.preventDefault();
			container.classList.remove("planner-kanban-cards--dragover");

			if (this.draggedCardPath) {
				this.host.dropCard(this.draggedCardPath, groupKey, swimlaneKey);
			}
		});
	}
}
