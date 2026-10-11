// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesKanbanView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

/** What keyboard navigation needs from its view. */
export interface KeyboardHost {
	readonly containerEl: HTMLElement;
	getDoc(): Document;
	getBoardEl(): HTMLElement | null;
}

/**
 * Arrow/vim-key navigation between cards. Attaches on construction; `dispose` removes the
 * listener and the container's tabindex, and is safe to call more than once.
 */
export class KeyboardNavigator {
	private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

	constructor(private readonly host: KeyboardHost) {
		this.setup();
	}

	private get board(): HTMLElement | null {
		return this.host.getBoardEl();
	}

	dispose(): void {
		if (this.keyboardHandler) {
			this.host.containerEl.removeEventListener("keydown", this.keyboardHandler);
			this.keyboardHandler = null;
		}
		this.host.containerEl.removeAttribute("tabindex");
	}

	/**
	 * Setup keyboard navigation for the Swimlane board
	 * Allows navigating between cards with arrow keys
	 */
	private setup(): void {
		this.keyboardHandler = (e: KeyboardEvent) => {
			// Only handle if board is focused or a card is focused
			const active = this.host.getDoc().activeElement;
			if (!this.board?.contains(active) && active !== this.host.containerEl) {
				return;
			}

			const cards = this.getAllCards();
			if (cards.length === 0) return;

			switch (e.key) {
				case "ArrowDown":
				case "j": // vim-style
					e.preventDefault();
					this.navigateCards(cards, "down");
					break;
				case "ArrowUp":
				case "k": // vim-style
					e.preventDefault();
					this.navigateCards(cards, "up");
					break;
				case "ArrowRight":
				case "l": // vim-style
					e.preventDefault();
					this.navigateCards(cards, "right");
					break;
				case "ArrowLeft":
				case "h": // vim-style
					e.preventDefault();
					this.navigateCards(cards, "left");
					break;
				case "Enter":
				case " ":
					e.preventDefault();
					this.activateFocusedCard();
					break;
				case "Escape":
					e.preventDefault();
					this.clearCardFocus();
					break;
			}
		};

		this.host.containerEl.addEventListener("keydown", this.keyboardHandler);
		// Make container focusable
		this.host.containerEl.setAttribute("tabindex", "0");
	}

	/**
	 * Get all card elements in the board
	 */
	private getAllCards(): HTMLElement[] {
		if (!this.board) return [];
		return Array.from(this.board.querySelectorAll(".planner-kanban-card"));
	}

	/**
	 * Navigate between cards using arrow keys
	 */
	private navigateCards(cards: HTMLElement[], direction: "up" | "down" | "left" | "right"): void {
		const currentFocused = this.board?.querySelector(
			".planner-kanban-card--focused",
		) as HTMLElement | null;
		const currentIndex = currentFocused ? cards.indexOf(currentFocused) : -1;

		if (currentIndex === -1) {
			// No card focused, focus first card
			this.focusCard(cards[0] ?? null);
			return;
		}

		// Get cards organized by columns for left/right navigation
		if (direction === "left" || direction === "right") {
			const columnCards = this.getCardsByColumn();
			const currentCard = cards[currentIndex];
			if (!currentCard) return;
			const currentColumn = currentCard.closest("[data-group]") as HTMLElement;
			const currentGroup = currentColumn?.getAttribute("data-group");

			if (!currentGroup) return;

			const columnKeys = Array.from(columnCards.keys());
			const currentColumnIndex = columnKeys.indexOf(currentGroup);
			const targetColumnIndex =
				direction === "right"
					? Math.min(currentColumnIndex + 1, columnKeys.length - 1)
					: Math.max(currentColumnIndex - 1, 0);

			const targetColumnKey = columnKeys[targetColumnIndex];
			if (!targetColumnKey) return;
			const targetColumnCards = columnCards.get(targetColumnKey) || [];

			if (targetColumnCards.length > 0) {
				// Find card at same position in target column, or last card
				const currentColumnCards = columnCards.get(currentGroup) || [];
				const positionInColumn = currentColumnCards.indexOf(currentCard);
				const targetCard =
					targetColumnCards[Math.min(positionInColumn, targetColumnCards.length - 1)];
				this.focusCard(targetCard ?? null);
			}
		} else {
			// Up/down navigation within column
			const currentCard = cards[currentIndex];
			if (!currentCard) return;
			const currentColumn = currentCard.closest("[data-group]") as HTMLElement;
			const cardsInColumn = Array.from(
				currentColumn?.querySelectorAll<HTMLElement>(".planner-kanban-card") || [],
			);
			const positionInColumn = cardsInColumn.indexOf(currentCard);

			let targetIndex: number;
			if (direction === "down") {
				targetIndex = Math.min(positionInColumn + 1, cardsInColumn.length - 1);
			} else {
				targetIndex = Math.max(positionInColumn - 1, 0);
			}

			this.focusCard(cardsInColumn[targetIndex] ?? null);
		}
	}

	/**
	 * Get cards organized by column
	 */
	private getCardsByColumn(): Map<string, HTMLElement[]> {
		const result = new Map<string, HTMLElement[]>();
		if (!this.board) return result;

		const columns = this.board.querySelectorAll("[data-group]");
		columns.forEach((column) => {
			const group = column.getAttribute("data-group");
			if (group) {
				const cards = Array.from(column.querySelectorAll<HTMLElement>(".planner-kanban-card"));
				if (cards.length > 0) {
					result.set(group, cards);
				}
			}
		});

		return result;
	}

	/**
	 * Focus a specific card
	 */
	private focusCard(card: HTMLElement | null): void {
		if (!card) return;

		// Remove focus from all cards
		this.board?.querySelectorAll(".planner-kanban-card--focused").forEach((el) => {
			el.classList.remove("planner-kanban-card--focused");
		});

		// Add focus to target card
		card.classList.add("planner-kanban-card--focused");
		card.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}

	/**
	 * Activate (click) the currently focused card
	 */
	private activateFocusedCard(): void {
		const focused = this.board?.querySelector(
			".planner-kanban-card--focused",
		) as HTMLElement | null;
		if (focused) {
			focused.click();
		}
	}

	/**
	 * Clear card focus
	 */
	private clearCardFocus(): void {
		this.board?.querySelectorAll(".planner-kanban-card--focused").forEach((el) => {
			el.classList.remove("planner-kanban-card--focused");
		});
	}
}
