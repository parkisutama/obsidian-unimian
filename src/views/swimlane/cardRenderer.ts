// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesSwimlaneView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import type { BasesPropertyId } from "obsidian";
import { setIcon } from "obsidian";
import type { EntrySnapshot } from "../../core/entries/EntrySnapshot";
import { getContrastColor } from "../../utils/colorUtils";
import type { BadgePlacement, BorderStyle, CoverDisplay } from "./types";
import { formatDate, getEntryValue, looksLikeDateString, valueToString } from "./values";

/** What the card builder needs from its view: resolved options plus color/image services. */
export interface CardHost {
	getBorderStyle(): BorderStyle;
	getCoverField(): string | null;
	getCoverDisplay(): CoverDisplay;
	getCoverHeight(): number;
	getBadgePlacement(): BadgePlacement;
	getTitleBy(): string | null;
	getSummaryField(): string | null;
	getVisibleProperties(): string[];
	getDateFormat(): string;
	getGroupBy(): string;
	getDateStartField(): string;
	getDateEndField(): string;
	getShowPropertyLabels(): boolean;
	getEntryColor(entry: EntrySnapshot): string;
	getConfiguredFieldColor(fieldId: string, value: string): string | null;
	getDisplayName(propId: BasesPropertyId): string;
	resolveImagePath(path: string): string | null;
}

/** Builds a card's DOM (cover, title, summary, badges). Event wiring stays with the view. */
export class CardRenderer {
	constructor(private readonly host: CardHost) {}

	buildCard(entry: EntrySnapshot): HTMLElement {
		const card = document.createElement("div");
		card.className = "planner-kanban-card";
		card.setAttribute("data-path", entry.path);
		card.setAttribute("draggable", "true");

		const color = this.host.getEntryColor(entry);
		const borderStyle = this.host.getBorderStyle();

		// Apply base card styles and border variant via CSS classes
		card.classList.add("planner-kanban-card-base");
		if (borderStyle === "left-accent") {
			card.classList.add("planner-kanban-card-base--left-accent");
			card.setCssProps({ "--card-accent-color": color });
		} else if (borderStyle === "full-border") {
			card.classList.add("planner-kanban-card-base--full-border");
			card.setCssProps({ "--card-accent-color": color });
		} else {
			card.classList.add("planner-kanban-card-base--default-border");
		}

		// Cover image
		const coverField = this.host.getCoverField();
		const coverDisplay = this.host.getCoverDisplay();
		if (coverField && coverDisplay !== "none") {
			const coverValue = getEntryValue(entry, coverField);
			if (coverValue) {
				this.renderCover(card, valueToString(coverValue), coverDisplay);
			}
		}

		// Card content container (CSS class handles padding)
		const content = card.createDiv({ cls: "planner-kanban-card-content" });

		const placement = this.host.getBadgePlacement();

		// Title row (may include inline badges - CSS class handles inline layout)
		const titleRowCls =
			placement === "inline"
				? "planner-kanban-card-title-row planner-kanban-card-title-row--inline"
				: "planner-kanban-card-title-row";
		const titleRow = content.createDiv({ cls: titleRowCls });

		// Title (CSS class handles font-weight)
		const titleField = this.host.getTitleBy();
		const title = (titleField && getEntryValue(entry, titleField)) || entry.basename;
		titleRow.createSpan({ cls: "planner-kanban-card-title", text: valueToString(title) });

		// For inline placement, render badges in title row
		if (placement === "inline") {
			this.renderBadges(titleRow, entry);
		}

		// Summary - only show if configured and visible (CSS class handles all styles)
		const summaryField = this.host.getSummaryField();
		const visibleProps = this.host.getVisibleProperties();
		const summaryFieldProp = summaryField?.replace(/^(note|file|formula)\./, "");
		const isSummaryVisible =
			!!summaryField &&
			visibleProps.some(
				(p) =>
					p === summaryField ||
					p === `note.${summaryFieldProp}` ||
					p.endsWith(`.${summaryFieldProp}`),
			);

		if (summaryField && isSummaryVisible) {
			const summary = getEntryValue(entry, summaryField);
			if (summary && summary !== "null" && summary !== null) {
				const summaryStr = valueToString(summary);
				// Auto-format if the summary field points to a date/datetime property
				const displayText = looksLikeDateString(summaryStr)
					? (formatDate(summaryStr, this.host.getDateFormat()) ?? summaryStr)
					: summaryStr;
				content.createDiv({ cls: "planner-kanban-card-summary", text: displayText });
			}
		}

		// For properties-section placement, render badges below content
		if (placement === "properties-section") {
			this.renderBadges(content, entry);
		}

		return card;
	}

	private renderCover(card: HTMLElement, coverPath: string, display: CoverDisplay): void {
		// Resolve the image path - returns null if not found
		const imgSrc = this.host.resolveImagePath(coverPath);
		if (!imgSrc) {
			return; // Don't render cover if image path can't be resolved
		}

		const coverHeight = this.host.getCoverHeight();

		// Create actual img element - works better with Obsidian's resource paths
		if (display === "banner") {
			const coverEl = card.createDiv({
				cls: "planner-kanban-card-cover planner-kanban-cover--banner",
			});
			// Dynamic cover height from user settings
			coverEl.setCssProps({ "--cover-height": `${coverHeight}px` });
			const img = coverEl.createEl("img");
			img.src = imgSrc;
			img.alt = "";
			this.setupCoverErrorHandler(coverEl, img);
		} else if (display === "thumbnail-left" || display === "thumbnail-right") {
			const coverEl = card.createDiv({
				cls: "planner-kanban-card-cover planner-kanban-cover--thumbnail planner-kanban-cover--thumbnail-small",
			});
			const img = coverEl.createEl("img");
			img.src = imgSrc;
			img.alt = "";
			// Adjust card layout for thumbnails (CSS classes handle styles)
			const thumbnailCls =
				display === "thumbnail-left"
					? "planner-kanban-card--thumbnail-left"
					: "planner-kanban-card--thumbnail-right";
			card.addClass(thumbnailCls);
			this.setupCoverErrorHandler(coverEl, img);
		} else if (display === "background") {
			const coverEl = card.createDiv({
				cls: "planner-kanban-card-cover planner-kanban-cover--background",
			});
			const img = coverEl.createEl("img");
			img.src = imgSrc;
			img.alt = "";
			card.addClass("planner-kanban-card--background-cover");
			this.setupCoverErrorHandler(coverEl, img);
		}
	}

	private setupCoverErrorHandler(coverEl: HTMLElement, img: HTMLImageElement): void {
		// Handle image load errors - hide cover if image fails
		img.addEventListener("error", () => {
			coverEl.addClass("planner-display-none");
		});
	}

	private renderBadges(container: HTMLElement, entry: EntrySnapshot): void {
		const placement = this.host.getBadgePlacement();
		const groupByField = this.host.getGroupBy();
		const groupByProp = groupByField.replace(/^(note|file|formula)\./, "");
		const visibleProps = this.host.getVisibleProperties();
		const showLabel = this.host.getShowPropertyLabels();
		// In properties-section each property gets its own row; inline stays flat
		const useRows = placement !== "inline";

		// Create badge container with appropriate styling based on placement
		const badgeContainer = container.createDiv({
			cls: `planner-kanban-badges planner-kanban-badges--${placement}`,
		});

		// CSS classes handle badge container layout based on placement
		if (placement === "inline") {
			badgeContainer.classList.add("planner-kanban-badges--inline");
		} else {
			badgeContainer.classList.add("planner-kanban-badges--bottom");
		}

		// Helper: check if a property ID is visible (accepts full propId or bare name)
		const isVisible = (propName: string) => {
			return visibleProps.some(
				(p) => p === `note.${propName}` || p === propName || p.endsWith(`.${propName}`),
			);
		};

		// Helper: get or create the correct container to append badges into.
		// For row mode, wraps in a prop row with an optional label.
		const makePropContainer = (labelText: string, iconName?: string): HTMLElement => {
			if (!useRows) return badgeContainer;
			const row = badgeContainer.createDiv({ cls: "planner-kanban-prop-row" });
			if (showLabel) {
				const lbl = row.createSpan({ cls: "planner-kanban-prop-row-label" });
				if (iconName) {
					const iconEl = lbl.createSpan({ cls: "planner-kanban-prop-row-label-icon" });
					setIcon(iconEl, iconName);
				}
				lbl.createSpan({ text: labelText });
			}
			return row;
		};

		// Configurable date fields — shown as a range badge when both visible, otherwise individually
		const dateStartField = this.host.getDateStartField();
		const dateEndField = this.host.getDateEndField();
		const dateStartProp = dateStartField.replace(/^(note|file|formula)\./, "");
		const dateEndProp = dateEndField.replace(/^(note|file|formula)\./, "");
		const startVisible = isVisible(dateStartProp);
		const endVisible = isVisible(dateEndProp);

		if (startVisible && endVisible) {
			const startVal = getEntryValue(entry, dateStartField);
			const endVal = getEntryValue(entry, dateEndField);
			if (startVal || endVal) {
				const row = makePropContainer("date", "calendar-range");
				this.createDateRangeBadge(row, startVal, endVal);
			}
		} else {
			if (startVisible) {
				const startVal = getEntryValue(entry, dateStartField);
				if (startVal) {
					const row = makePropContainer("start", "play");
					this.createDateBadge(row, startVal, "play");
				}
			}
			if (endVisible) {
				const endVal = getEntryValue(entry, dateEndField);
				if (endVal) {
					const row = makePropContainer("end", "flag");
					this.createDateBadge(row, endVal, "flag");
				}
			}
		}

		// Fields that are rendered elsewhere on the card — excluded from badges
		// Unset title/summary fields hide nothing: no property name is assumed.
		const titleField = this.host.getTitleBy();
		const titleProp = titleField?.replace(/^(note|file|formula)\./, "");
		const summaryField = this.host.getSummaryField();
		const summaryProp = summaryField?.replace(/^(note|file|formula)\./, "");
		const coverField = this.host.getCoverField();

		// Render all other visible properties, one row per property
		for (const propId of visibleProps) {
			const propName = propId.replace(/^(note|file|formula)\./, "");

			// Skip: the field used as the column grouping (redundant)
			if (propName === groupByProp || propId === groupByField) continue;
			// Skip: title field (shown as card title)
			if (propName === titleProp || propId === titleField) continue;
			// Skip: summary field (shown as summary line)
			if (propName === summaryProp || propId === summaryField) continue;
			// Skip: cover field (rendered as image, not a badge)
			if (
				coverField &&
				(propId === coverField || propName === coverField.replace(/^(note|file|formula)\./, ""))
			)
				continue;
			// Skip: date fields (already rendered above as date/range badges)
			if (propName === dateStartProp || propName === dateEndProp) continue;

			const value = getEntryValue(entry, propId);
			// Skip null, undefined, empty, and "null" string values
			if (value === null || value === undefined || value === "" || value === "null") continue;

			const rawValues = Array.isArray(value)
				? value.filter((v) => v && v !== "null").map((v) => valueToString(v))
				: [valueToString(value)];

			// Auto-format values that look like ISO date/datetime strings
			const fmt = this.host.getDateFormat();
			const formattedValues = rawValues.map((v) => {
				if (looksLikeDateString(v)) {
					return formatDate(v, fmt) ?? v;
				}
				return v;
			});

			// Filter empty values first; skip the whole prop if nothing to show
			const cleanValues = formattedValues
				.map((v, i) => ({ display: v, raw: rawValues[i] ?? v }))
				.filter(({ display }) => display && display !== "null" && display !== "None");
			if (cleanValues.length === 0) continue;

			const displayName = this.host.getDisplayName(propId as BasesPropertyId);

			// In row mode: one row per property, all its values sit inside that row
			const propContainer = makePropContainer(displayName);

			for (const { display, raw } of cleanValues) {
				// Only apply explicit color (PP or valueStyles); null lets CSS theme defaults apply
				const badgeColor = this.host.getConfiguredFieldColor(propId, raw);
				this.createValueBadge(propContainer, display, badgeColor);
			}
		}

		// Hide empty badge container
		if (badgeContainer.childElementCount === 0) {
			badgeContainer.addClass("planner-display-none");
		}
	}

	/** Render a standalone value pill (no embedded label — label lives on the containing prop-row). */
	private createValueBadge(container: HTMLElement, value: string, color: string | null): void {
		const badge = container.createSpan({
			cls: "planner-badge planner-kanban-badge planner-kanban-badge-generic",
		});
		if (color) {
			badge.style.backgroundColor = color;
			if (!color.startsWith("rgba") && !color.startsWith("hsla")) {
				badge.style.color = getContrastColor(color);
			}
		}
		badge.createSpan({ text: value });
		badge.setAttribute("title", value);
	}

	private createDateBadge(container: HTMLElement, value: unknown, icon: string): void {
		const dateStr = formatDate(value, this.host.getDateFormat());
		if (!dateStr) return;

		// CSS class handles all styles for date badge
		const badge = container.createSpan({
			cls: "planner-badge planner-kanban-badge planner-kanban-badge-date",
		});
		badge.setAttribute("title", String(value));

		const iconEl = badge.createSpan({ cls: "planner-kanban-badge-icon" });
		setIcon(iconEl, icon);

		badge.createSpan({ text: dateStr });
	}

	private createDateRangeBadge(
		container: HTMLElement,
		startValue: unknown,
		endValue: unknown,
	): void {
		const fmt = this.host.getDateFormat();
		const startStr = formatDate(startValue, fmt);
		const endStr = formatDate(endValue, fmt);
		if (!startStr && !endStr) return;

		const badge = container.createSpan({
			cls: "planner-badge planner-kanban-badge planner-kanban-badge-date",
		});
		badge.setAttribute("title", [startValue, endValue].filter(Boolean).join(" → "));

		const iconEl = badge.createSpan({ cls: "planner-kanban-badge-icon" });
		setIcon(iconEl, "calendar-range");

		if (startStr && endStr) {
			badge.createSpan({ text: `${startStr} → ${endStr}` });
		} else {
			badge.createSpan({ text: startStr ?? endStr ?? "" });
		}
	}
}
