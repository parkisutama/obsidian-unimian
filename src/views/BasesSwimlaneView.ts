// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesSwimlaneView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import {
	type BasesAllOptions,
	type BasesPropertyId,
	BasesView,
	type BasesViewConfig,
	type BasesViewRegistration,
	Notice,
	normalizePath,
	type QueryController,
	setIcon,
	TFolder,
} from "obsidian";
import type { EntrySnapshot } from "../core/entries/EntrySnapshot";
import type { NormalizedValue } from "../core/entries/NormalizedValue";
import { resolvePrettyPropertiesColor } from "../integrations/PrettyPropertiesAdapter";
import type UnimianPlugin from "../main";
import {
	computeRenderSignature,
	type RenderSignatureInput,
} from "../platform/bases/changeDetection";
import { createEntrySnapshot } from "../platform/bases/entrySnapshotAdapter";
import { resolveColor } from "../platform/colors/ColorResolver";
import { resolveCoverImageSrc } from "../platform/dom/CoverImageResolver";
import { RenderScheduler } from "../platform/dom/RenderScheduler";
import { ViewRuntime } from "../platform/dom/ViewRuntime";
import { LegacyMutationGateway } from "../platform/mutations/LegacyMutationGateway";
import {
	activateEntry,
	triggerHoverPreview as dispatchHoverPreview,
	openPath,
} from "../platform/navigation/NavigationService";
import { getContrastColor } from "../utils/colorUtils";
import { showOpenFileMenu } from "../utils/openFile";
import { BoardRenderer } from "./swimlane/boardRenderer";
import { CardRenderer } from "./swimlane/cardRenderer";
import { DragController } from "./swimlane/dragAndDrop";
import { KeyboardNavigator } from "./swimlane/keyboardNavigation";
import { createSwimlaneOptions } from "./swimlane/options";
import {
	COLUMN_ORDER_KEY,
	orderKeys,
	parseCustomOrder,
	reorderKeys,
	SWIMLANE_ORDER_KEY,
} from "./swimlane/ordering";
import type {
	BadgePlacement,
	BorderStyle,
	CoverDisplay,
	FreezeHeaders,
	SwimHeaderDisplay,
} from "./swimlane/types";
import { formatDate, getEntryValue, looksLikeDateString, valueToString } from "./swimlane/values";

export const BASES_SWIMLANE_VIEW_ID = "unimian-swimlane";

/**
 * Swimlane view for Obsidian Bases
 * Displays items in a drag-and-drop board with configurable columns
 */
export class BasesSwimlaneView extends BasesView {
	type = BASES_SWIMLANE_VIEW_ID;
	private plugin: UnimianPlugin;
	private containerEl: HTMLElement;
	private readonly runtime: ViewRuntime;
	private readonly mutations: LegacyMutationGateway;
	private readonly cardRenderer: CardRenderer;
	private readonly drag: DragController;
	private readonly keyboard: KeyboardNavigator;
	private readonly boardRenderer: BoardRenderer;
	private boardEl: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	/** PERF-002: skips rebuilding the board when an `onDataUpdated()` call is identical to the last. */
	private readonly renderScheduler = new RenderScheduler();

	// Render debouncing
	private renderDebounceTimer: number | null = null;
	private static readonly RENDER_DEBOUNCE_MS = 50;

	// Configuration getters
	private getGroupBy(): string {
		const value = this.config.get("plannerGroupBy") as string | undefined;
		return value || this.plugin.settings.swimlaneDefaults.plannerGroupBy;
	}

	private getSwimlaneBy(): string | null {
		const value = this.config.get("swimlaneBy") as string | undefined;
		return value || this.plugin.settings.swimlaneDefaults.swimlaneBy || null;
	}

	private getColorBy(): string {
		const value = this.config.get("colorBy") as string | undefined;
		return value || this.plugin.settings.swimlaneDefaults.colorBy || "";
	}

	/** Title property; null means the card shows the file name. */
	private getTitleBy(): string | null {
		const value = this.config.get("titleBy") as string | undefined;
		return value || null;
	}

	private getBorderStyle(): BorderStyle {
		const value = this.config.get("borderStyle") as string | undefined;
		return (
			(value as BorderStyle) ||
			(this.plugin.settings.swimlaneDefaults.borderStyle as BorderStyle) ||
			"left-accent"
		);
	}

	private getCoverField(): string | null {
		const value = this.config.get("coverField") as string | undefined;
		return value || null;
	}

	private getCoverDisplay(): CoverDisplay {
		const value = this.config.get("coverDisplay") as string | undefined;
		return (value as CoverDisplay) || "banner";
	}

	private getSummaryField(): string | null {
		const value = this.config.get("summaryField") as string | undefined;
		return value || null;
	}

	private getDateStartField(): string {
		const value = this.config.get("dateStartField") as string | undefined;
		return value || this.plugin.settings.swimlaneDefaults.dateStartField || "";
	}

	private getDateEndField(): string {
		const value = this.config.get("dateEndField") as string | undefined;
		return value || this.plugin.settings.swimlaneDefaults.dateEndField || "";
	}

	private getDateFormat(): string {
		const value = this.config.get("dateFormat") as string | undefined;
		return value || "date-short";
	}

	private getBadgePlacement(): BadgePlacement {
		const value = this.config.get("badgePlacement") as string | undefined;
		return (
			(value as BadgePlacement) ||
			(this.plugin.settings.swimlaneDefaults.badgePlacement as BadgePlacement) ||
			"properties-section"
		);
	}

	private getColumnWidth(): number {
		const value = this.config.get("columnWidth") as string | number | undefined;
		if (typeof value === "string")
			return parseInt(value, 10) || this.plugin.settings.swimlaneDefaults.columnWidth;
		return value || this.plugin.settings.swimlaneDefaults.columnWidth;
	}

	private getHideEmptyColumns(): boolean {
		const value = this.config.get("hideEmptyColumns") as string | boolean | undefined;
		if (typeof value === "string") return value === "true";
		return value ?? this.plugin.settings.swimlaneDefaults.hideEmptyColumns;
	}

	private getFreezeHeaders(): FreezeHeaders {
		const value = this.config.get("freezeHeaders") as string | undefined;
		return (
			(value as FreezeHeaders) ||
			(this.plugin.settings.swimlaneDefaults.freezeHeaders as FreezeHeaders) ||
			"none"
		);
	}

	private getSwimHeaderDisplay(): SwimHeaderDisplay {
		const value = this.config.get("swimHeaderDisplay") as string | undefined;
		return (value as SwimHeaderDisplay) || "vertical";
	}

	private getShowPropertyLabels(): boolean {
		const value = this.config.get("showPropertyLabels") as string | boolean | undefined;
		if (value === "false" || value === false) return false;
		if (value === "true" || value === true) return true;
		return this.plugin.settings.swimlaneDefaults.showPropertyLabels ?? true;
	}

	private getCustomColumnOrder(): string[] {
		return parseCustomOrder(this.config.get(COLUMN_ORDER_KEY));
	}

	private setCustomColumnOrder(order: string[]): void {
		this.config.set(COLUMN_ORDER_KEY, JSON.stringify(order));
	}

	private getCustomSwimlaneOrder(): string[] {
		return parseCustomOrder(this.config.get(SWIMLANE_ORDER_KEY));
	}

	private setCustomSwimlaneOrder(order: string[]): void {
		this.config.set(SWIMLANE_ORDER_KEY, JSON.stringify(order));
	}

	private getCoverHeight(): number {
		const value = this.config.get("coverHeight") as string | number | undefined;
		if (typeof value === "string") {
			return parseInt(value, 10) || 100;
		}
		return value || 100;
	}

	/**
	 * Get the list of visible properties from Bases config
	 */
	/** Properties chosen in the Bases "Properties" menu; none are assumed by default. */
	private getVisibleProperties(): string[] {
		return this.config.getOrder();
	}

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: UnimianPlugin) {
		super(controller);
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.runtime = new ViewRuntime(containerEl);
		this.mutations = new LegacyMutationGateway(this.plugin.app);
		this.drag = new DragController({
			containerEl,
			getDoc: () => this.runtime.doc,
			getBoardEl: () => this.boardEl,
			hasSwimlanes: () => Boolean(this.getSwimlaneBy()),
			reorderColumns: (dragged, target, before) => this.reorderColumns(dragged, target, before),
			reorderSwimlanes: (dragged, target, before) => this.reorderSwimlanes(dragged, target, before),
			dropCard: (filePath, group, swimlane) => {
				void this.handleCardDrop(filePath, group, swimlane);
			},
		});
		this.cardRenderer = new CardRenderer({
			getBorderStyle: () => this.getBorderStyle(),
			getCoverField: () => this.getCoverField(),
			getCoverDisplay: () => this.getCoverDisplay(),
			getCoverHeight: () => this.getCoverHeight(),
			getBadgePlacement: () => this.getBadgePlacement(),
			getTitleBy: () => this.getTitleBy(),
			getSummaryField: () => this.getSummaryField(),
			getVisibleProperties: () => this.getVisibleProperties(),
			getDateFormat: () => this.getDateFormat(),
			getGroupBy: () => this.getGroupBy(),
			getDateStartField: () => this.getDateStartField(),
			getDateEndField: () => this.getDateEndField(),
			getShowPropertyLabels: () => this.getShowPropertyLabels(),
			getEntryColor: (entry) => this.getEntryColor(entry),
			getConfiguredFieldColor: (fieldId, value) => this.getConfiguredFieldColor(fieldId, value),
			getDisplayName: (propId) => this.config.getDisplayName(propId),
			resolveImagePath: (path) => resolveCoverImageSrc(this.plugin.app, path),
		});
		this.setupContainer();
		this.setupResizeObserver();
		this.boardRenderer = new BoardRenderer({
			containerEl,
			drag: this.drag,
			getBoardEl: () => this.boardEl,
			getGroupBy: () => this.getGroupBy(),
			getSwimlaneBy: () => this.getSwimlaneBy(),
			getHideEmptyColumns: () => this.getHideEmptyColumns(),
			getFreezeHeaders: () => this.getFreezeHeaders(),
			getColumnWidth: () => this.getColumnWidth(),
			getSwimHeaderDisplay: () => this.getSwimHeaderDisplay(),
			getFieldValueColor: (fieldId, value, solid) => this.getFieldValueColor(fieldId, value, solid),
			getColumnKeys: (groups) => this.getColumnKeys(groups),
			getOrderedSwimlaneKeys: (keys, by) => this.getOrderedSwimlaneKeys(keys, by),
			setCustomColumnOrder: (order) => this.setCustomColumnOrder(order),
			setCustomSwimlaneOrder: (order) => this.setCustomSwimlaneOrder(order),
			createSnapshots: () => this.createSnapshots(),
			groupEntriesByField: (entries) => this.groupEntriesByField(entries),
			createCard: (entry) => this.createCard(entry),
			renderCards: (container, entries) => this.renderCards(container, entries),
			renderVirtualCards: (container, entries) => this.renderVirtualCards(container, entries),
			render: () => this.render(),
		});
		this.keyboard = new KeyboardNavigator({
			containerEl,
			getDoc: () => this.runtime.doc,
			getBoardEl: () => this.boardEl,
		});
		this.registerRuntimeCleanup();
	}

	/**
	 * Registers every teardown once; each closure reads current field state at dispose time, so
	 * it stays correct no matter how many times render()/setup has replaced that state. Covers
	 * resize/keyboard/debounce/virtual-scroll cleanup plus forcing any in-flight touch/mouse
	 * drag (card or swimlane reordering) to release its clone, timers, and interval instead of
	 * leaking them if the view unloads mid-gesture.
	 */
	private registerRuntimeCleanup(): void {
		this.runtime.add(() => {
			this.resizeObserver?.disconnect();
			this.resizeObserver = null;
		});
		this.runtime.add(() => {
			if (this.renderDebounceTimer !== null) {
				window.clearTimeout(this.renderDebounceTimer);
				this.renderDebounceTimer = null;
			}
		});
		this.runtime.add(() => this.cleanupVirtualScroll());
		this.runtime.add(() => this.keyboard.dispose());
		this.runtime.add(() => this.containerEl.removeClass("planner-bases-kanban"));
		this.runtime.add(() => this.drag.cancelAll());
	}

	private setupContainer(): void {
		this.containerEl.empty();
		this.containerEl.addClass("planner-bases-kanban");

		this.boardEl = this.containerEl.createDiv({ cls: "planner-kanban-board" });
	}

	private setupResizeObserver(): void {
		this.resizeObserver = new ResizeObserver(() => {
			// Handle resize if needed
		});
		this.resizeObserver.observe(this.containerEl);
	}

	onDataUpdated(): void {
		// PERF-002: an identical update (same entries/order/groups/config as last time) skips
		// rebuilding the board entirely, the same way Timeline's RenderScheduler does.
		const decision = this.renderScheduler.decide(
			computeRenderSignature(this.buildRenderSignatureInput()),
		);
		if (decision === "skip") {
			if (this.renderDebounceTimer !== null) {
				window.clearTimeout(this.renderDebounceTimer);
				this.renderDebounceTimer = null;
			}
			return;
		}

		// Debounce rapid data updates to prevent performance issues
		if (this.renderDebounceTimer !== null) {
			window.clearTimeout(this.renderDebounceTimer);
		}
		this.renderDebounceTimer = window.setTimeout(() => {
			this.renderDebounceTimer = null;
			this.render();
		}, BasesSwimlaneView.RENDER_DEBOUNCE_MS);
	}

	/** Only the primitives that affect the board's rendered output (spec §2.2). */
	private buildRenderSignatureInput(): RenderSignatureInput {
		const entries = this.data.groupedData.flatMap((group) =>
			group.entries.map((entry) => ({ path: entry.file.path, mtime: entry.file.stat?.mtime ?? 0 })),
		);
		const groupKeys = this.data.groupedData.map((group) =>
			group.hasKey() ? String(group.key) : "",
		);
		return {
			entries,
			order: this.getVisibleProperties(),
			groupKeys,
			config: {
				groupBy: this.getGroupBy(),
				swimlaneBy: this.getSwimlaneBy(),
				colorBy: this.getColorBy(),
				titleBy: this.getTitleBy(),
				borderStyle: this.getBorderStyle(),
				coverField: this.getCoverField(),
				coverDisplay: this.getCoverDisplay(),
				coverHeight: this.getCoverHeight(),
				summaryField: this.getSummaryField(),
				dateStartField: this.getDateStartField(),
				dateEndField: this.getDateEndField(),
				dateFormat: this.getDateFormat(),
				badgePlacement: this.getBadgePlacement(),
				columnWidth: this.getColumnWidth(),
				hideEmptyColumns: this.getHideEmptyColumns(),
				freezeHeaders: this.getFreezeHeaders(),
				swimHeaderDisplay: this.getSwimHeaderDisplay(),
				showPropertyLabels: this.getShowPropertyLabels(),
				customColumnOrder: this.getCustomColumnOrder(),
				customSwimlaneOrder: this.getCustomSwimlaneOrder(),
			},
		};
	}

	onunload(): void {
		// Resize/debounce/virtual-scroll/keyboard cleanup and forcing any in-flight drag to
		// release its clone/timers/interval all run through the runtime's DisposableScope,
		// registered once in the constructor; dispose() is idempotent.
		this.runtime.dispose();
	}

	private render(): void {
		// Clean up virtual scroll observers before re-render
		this.cleanupVirtualScroll();

		if (!this.boardEl || !this.boardEl.isConnected) {
			this.setupContainer();
		}

		if (this.boardEl) {
			this.boardEl.empty();
		}

		// Build color map for colorBy field
		// Check if swimlanes are enabled
		const swimlaneBy = this.getSwimlaneBy();
		const snapshots = this.createSnapshots();

		// No column property is assumed: ask for one instead of guessing (e.g. "status").
		if (!this.getGroupBy()) {
			this.boardEl?.createDiv({
				cls: "planner-empty",
				text: 'Choose a property in "Columns by" to build the board.',
			});
			return;
		}

		if (swimlaneBy) {
			// Render with swimlanes (2D grid)
			this.boardRenderer.renderWithSwimlanes(swimlaneBy, snapshots);
		} else {
			// Group entries by the groupBy field
			const groups = this.groupEntriesByField(snapshots);
			// Render columns
			this.boardRenderer.renderColumns(groups);
		}
	}

	private createSnapshots(): EntrySnapshot[] {
		const propertyIds = [
			this.getGroupBy(),
			this.getSwimlaneBy(),
			this.getColorBy(),
			this.getTitleBy(),
			this.getCoverField(),
			this.getSummaryField(),
			this.getDateStartField(),
			this.getDateEndField(),
			...this.getVisibleProperties(),
		].filter((id): id is BasesPropertyId => Boolean(id));
		const uniquePropertyIds = [...new Set(propertyIds)];
		return this.data.groupedData.flatMap((group) =>
			group.entries.map((entry) => createEntrySnapshot(entry, uniquePropertyIds)),
		);
	}

	private getEntryColor(entry: EntrySnapshot): string {
		const colorByField = this.getColorBy();
		const value = getEntryValue(entry, colorByField);
		if (!value) return resolveColor({ categoryValue: "" }).background;
		const strValue = valueToString(Array.isArray(value) ? value[0] : value);
		return this.getFieldValueColor(colorByField, strValue);
	}

	/**
	 * Resolve a field/value color through the shared color and Pretty Properties services.
	 */
	private getFieldValueColor(fieldId: string, value: string, solid = false): string {
		return this.resolveFieldColor(fieldId, value, solid).background;
	}

	/**
	 * Like getFieldValueColor but returns null when only the hash fallback would fire.
	 * Use this for generic badges so the CSS theme default is preserved when no
	 * explicit color is configured via Pretty Properties or Planner valueStyles.
	 */
	private getConfiguredFieldColor(fieldId: string, value: string): string | null {
		const resolved = this.resolveFieldColor(fieldId, value, false);
		return resolved.source === "fallback" ? null : resolved.background;
	}

	private resolveFieldColor(fieldId: string, value: string, solid: boolean) {
		const propName = fieldId.split(".").pop() || fieldId;
		return resolveColor({
			categoryValue: value,
			resolvePrettyPropertiesColor: (categoryValue) =>
				resolvePrettyPropertiesColor(
					this.runtime.win,
					this.runtime.doc,
					propName,
					categoryValue,
					solid ? 1 : 0.4,
				),
			valueStyleColor: this.plugin.settings.valueStyles[fieldId]?.[value]?.color ?? null,
		});
	}

	private groupEntriesByField(entries: readonly EntrySnapshot[]): Map<string, EntrySnapshot[]> {
		const groupByField = this.getGroupBy();
		const groups = new Map<string, EntrySnapshot[]>();

		for (const entry of entries) {
			const value = getEntryValue(entry, groupByField);
			const groupKey = valueToString(value);

			if (!groups.has(groupKey)) {
				groups.set(groupKey, []);
			}
			groups.get(groupKey)!.push(entry);
		}

		return groups;
	}

	/**
	 * Get ordered column keys based on the groupBy field and custom order
	 */
	private getColumnKeys(groups: Map<string, EntrySnapshot[]>): string[] {
		return orderKeys(groups.keys(), this.getCustomColumnOrder());
	}

	/**
	 * Get ordered swimlane keys based on the swimlaneBy field and custom order
	 */
	private getOrderedSwimlaneKeys(swimlaneKeys: string[], _swimlaneBy: string): string[] {
		return orderKeys(swimlaneKeys, this.getCustomSwimlaneOrder());
	}

	private reorderColumns(draggedKey: string, targetKey: string, insertBefore: boolean): void {
		const groups = this.groupEntriesByField(this.createSnapshots());
		const currentOrder = this.getColumnKeys(groups);
		this.setCustomColumnOrder(reorderKeys(currentOrder, draggedKey, targetKey, insertBefore));

		// Re-render
		this.render();
	}

	/**
	 * Setup drag handlers for swimlane column headers (for reordering columns in swimlane view)
	 */
	private reorderSwimlanes(draggedKey: string, targetKey: string, insertBefore: boolean): void {
		const swimlaneBy = this.getSwimlaneBy();
		if (!swimlaneBy) return;

		// Collect current swimlane keys
		const swimlaneKeys: string[] = [];
		for (const entry of this.createSnapshots()) {
			const value = getEntryValue(entry, swimlaneBy);
			const key = valueToString(value);
			if (!swimlaneKeys.includes(key)) {
				swimlaneKeys.push(key);
			}
		}

		const currentOrder = this.getOrderedSwimlaneKeys(swimlaneKeys, swimlaneBy);
		this.setCustomSwimlaneOrder(reorderKeys(currentOrder, draggedKey, targetKey, insertBefore));

		// Re-render
		this.render();
	}

	private renderCards(container: HTMLElement, entries: EntrySnapshot[]): void {
		for (const entry of entries) {
			const card = this.createCard(entry);
			container.appendChild(card);
		}
	}

	/**
	 * Virtual scroll state for columns with many cards
	 */
	private virtualScrollObservers: Map<HTMLElement, IntersectionObserver> = new Map();
	private renderedCardRanges: Map<HTMLElement, { start: number; end: number }> = new Map();

	/**
	 * Render cards with virtual scrolling for performance
	 * Only renders visible cards + a buffer for smooth scrolling
	 */
	private renderVirtualCards(container: HTMLElement, entries: EntrySnapshot[]): void {
		const BUFFER_SIZE = 5; // Cards to render above/below viewport
		const ESTIMATED_CARD_HEIGHT = 100; // px - used for placeholder sizing

		// Create a wrapper to hold placeholders and cards (CSS class handles position)
		const wrapper = document.createElement("div");
		wrapper.className = "planner-kanban-virtual-wrapper";

		// Create placeholder elements for all entries
		const placeholders: HTMLElement[] = [];
		entries.forEach((entry, index) => {
			const placeholder = document.createElement("div");
			placeholder.className = "planner-kanban-card-placeholder";
			placeholder.setAttribute("data-index", String(index));
			placeholder.setAttribute("data-path", entry.path);
			// Dynamic min-height for virtual scrolling placeholder sizing
			placeholder.setCssProps({ "--placeholder-height": `${ESTIMATED_CARD_HEIGHT}px` });
			placeholders.push(placeholder);
			wrapper.appendChild(placeholder);
		});

		container.appendChild(wrapper);

		// Track which cards are rendered
		const renderedCards = new Set<number>();

		// Create IntersectionObserver to detect visible placeholders
		const observer = new IntersectionObserver(
			(observerEntries) => {
				for (const observerEntry of observerEntries) {
					const placeholder = observerEntry.target as HTMLElement;
					const index = parseInt(placeholder.getAttribute("data-index") || "-1", 10);

					if (index < 0 || index >= entries.length) continue;

					if (observerEntry.isIntersecting && !renderedCards.has(index)) {
						// Render this card and buffer cards around it
						const start = Math.max(0, index - BUFFER_SIZE);
						const end = Math.min(entries.length, index + BUFFER_SIZE + 1);

						for (let i = start; i < end; i++) {
							if (!renderedCards.has(i)) {
								renderedCards.add(i);
								const entry = entries[i];
								const targetPlaceholder = placeholders[i];
								if (!entry || !targetPlaceholder) continue;
								const card = this.createCard(entry);

								// Replace placeholder content with actual card (CSS class handles min-height reset)
								targetPlaceholder.empty();
								targetPlaceholder.appendChild(card);
								targetPlaceholder.classList.add("planner-kanban-card-rendered");
							}
						}
					}
				}
			},
			{
				root: this.boardEl,
				rootMargin: "200px 0px", // Load cards 200px before they enter viewport
				threshold: 0,
			},
		);

		// Observe all placeholders
		placeholders.forEach((placeholder) => {
			observer.observe(placeholder);
		});

		// Store observer for cleanup
		this.virtualScrollObservers.set(container, observer);
	}

	/**
	 * Clean up virtual scroll observers when view is destroyed
	 */
	private cleanupVirtualScroll(): void {
		for (const [, observer] of this.virtualScrollObservers) {
			observer.disconnect();
		}
		this.virtualScrollObservers.clear();
		this.renderedCardRanges.clear();
	}

	private createCard(entry: EntrySnapshot): HTMLElement {
		const card = this.cardRenderer.buildCard(entry);

		// Setup drag handlers
		this.drag.setupCardDragHandlers(card, entry);

		// Click → quick preview (or open in new tab per modifier); right-click → location picker
		card.addEventListener("click", (e) => {
			this.handleCardClick(entry, e);
		});
		card.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			showOpenFileMenu(this.plugin.app, entry.path, e);
		});
		// Page Preview: Ctrl/Cmd + hover over card shows preview popup
		card.addEventListener("mouseenter", (e) => {
			this.triggerHoverPreview(e, entry.path, card);
		});

		return card;
	}

	private async handleCardDrop(
		filePath: string,
		newGroupValue: string,
		newSwimlaneValue?: string,
	): Promise<void> {
		try {
			const groupByField = this.getGroupBy();
			const swimlaneBy = this.getSwimlaneBy();

			// Check if we need to handle folder moves
			const isFolderGroupBy = this.isFolderProperty(groupByField);
			const isFolderSwimlane = swimlaneBy ? this.isFolderProperty(swimlaneBy) : false;

			// Determine target folder from either groupBy or swimlane (folder takes priority)
			let targetFolder: string | null = null;
			if (isFolderGroupBy && newGroupValue && newGroupValue !== "None") {
				targetFolder = this.findFolderPath(newGroupValue);
			} else if (isFolderSwimlane && newSwimlaneValue && newSwimlaneValue !== "None") {
				targetFolder = this.findFolderPath(newSwimlaneValue);
			}

			// Move file if folder changed
			let newFilePath = filePath;
			if (targetFolder !== null) {
				const moveResult = await this.mutations.moveToFolder(filePath, normalizePath(targetFolder));
				if (!moveResult.ok) throw new Error(moveResult.message);
				newFilePath = moveResult.path;
			}

			// Now update frontmatter for non-folder and non-formula properties
			// Formula properties are computed by Bases and should never be written to frontmatter
			const isFormulaGroup = groupByField.startsWith("formula.");
			const isFormulaSwimlane = swimlaneBy ? swimlaneBy.startsWith("formula.") : false;

			const needsFrontmatterUpdate =
				(!isFolderGroupBy && !isFormulaGroup && newGroupValue !== undefined) ||
				(!isFolderSwimlane && !isFormulaSwimlane && swimlaneBy && newSwimlaneValue !== undefined);

			if (needsFrontmatterUpdate) {
				const values: Record<string, unknown> = {};
				if (!isFolderGroupBy && !isFormulaGroup) {
					values[groupByField] = this.convertValueForField(
						groupByField.replace(/^(note|file|formula)\./, ""),
						newGroupValue,
					);
				}
				if (
					!isFolderSwimlane &&
					!isFormulaSwimlane &&
					swimlaneBy &&
					newSwimlaneValue !== undefined
				) {
					values[swimlaneBy] = this.convertValueForField(
						swimlaneBy.replace(/^(note|file|formula)\./, ""),
						newSwimlaneValue,
					);
				}
				const updateResult = await this.mutations.setProperties(newFilePath, values);
				if (!updateResult.ok) throw new Error(updateResult.message);
			}
		} catch (error) {
			console.error("Planner: Failed to update card:", error);
			new Notice("Failed to move card. Check console for details.");
		}
	}

	/**
	 * Check if a property ID refers to folder
	 */
	private isFolderProperty(propId: string): boolean {
		const normalized = propId.replace(/^(note|file|formula)\./, "");
		return normalized === "folder";
	}

	/**
	 * Convert a value for a specific field, handling special cases like tags and multi-value properties
	 */
	private convertValueForField(fieldName: string, value: string): string | string[] {
		// If the value contains a comma, it was joined from an array by valueToString
		// and should be split back into an array
		const hasMultipleValues = value.includes(",");

		if (hasMultipleValues) {
			// Split comma-separated values into array
			const values = value
				.split(",")
				.map((v) => v.trim())
				.filter((v) => v.length > 0);

			// For tags, ensure each value has # prefix
			if (fieldName === "tags") {
				return values.map((v) => (v.startsWith("#") ? v : `#${v}`));
			}

			return values;
		}

		// Single value - check if it should still be an array (for tags)
		if (fieldName === "tags") {
			const normalizedTag = value.startsWith("#") ? value : `#${value}`;
			return [normalizedTag];
		}

		return value;
	}

	/**
	 * Find the full path to a folder by its name
	 * Returns the first matching folder path, or null if not found
	 */
	private findFolderPath(folderName: string): string | null {
		if (folderName === "Root" || folderName === "/") {
			return "";
		}

		const allFiles = this.plugin.app.vault.getAllLoadedFiles();
		for (const file of allFiles) {
			if (file instanceof TFolder && file.name === folderName) {
				return file.path;
			}
		}
		return null;
	}

	private handleCardClick(entry: EntrySnapshot, event: MouseEvent): void {
		activateEntry({
			app: this.plugin.app,
			settings: this.plugin.settings,
			path: entry.path,
			event,
			openFull: (path, e) =>
				openPath(this.plugin.app, path, e ?? ({ ctrlKey: true } as MouseEvent)),
		});
	}

	/**
	 * Trigger Obsidian's Page Preview for a file path.
	 * The preview popup appears when the user holds Ctrl/Cmd while hovering;
	 * Obsidian's internal page-preview plugin handles that key check.
	 */
	private triggerHoverPreview(event: MouseEvent, filePath: string, targetEl: HTMLElement): void {
		dispatchHoverPreview({
			app: this.plugin.app,
			event,
			hoverParent: this.plugin,
			sourceId: BASES_SWIMLANE_VIEW_ID,
			targetEl,
			filePath,
		});
	}
}

/**
 * Create the Bases view registration for the Swimlane
 */
export function createSwimlaneViewRegistration(plugin: UnimianPlugin): BasesViewRegistration {
	return {
		name: "Swimlane",
		icon: "rows-3",
		factory: (controller: QueryController, containerEl: HTMLElement) => {
			return new BasesSwimlaneView(controller, containerEl, plugin);
		},
		options: (_config: BasesViewConfig): BasesAllOptions[] => createSwimlaneOptions(plugin.app),
	};
}
