// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Sticky Note view (docs/specs/sticky-note.md): a Google-Keep-style card grid over Bases
 * entries. Read-only — no `capabilities.mutations`, no `legacyMutation` (spec §5.3); delete is
 * explicitly out of scope for v1.
 */

import {
	type BasesEntry,
	type BasesPropertyId,
	BasesView,
	Component,
	MarkdownRenderer,
	type QueryController,
	setIcon,
} from "obsidian";
import { resolvePrettyPropertiesColor } from "../../integrations/PrettyPropertiesAdapter";
import type UnimianPlugin from "../../main";
import {
	computeRenderSignature,
	type RenderSignatureInput,
} from "../../platform/bases/changeDetection";
import { normalizeValue } from "../../platform/bases/entrySnapshotAdapter";
import { ViewConfigReader } from "../../platform/bases/ViewConfigReader";
import { resolveColor } from "../../platform/colors/ColorResolver";
import { resolveCoverImageSrc } from "../../platform/dom/CoverImageResolver";
import { RenderScheduler } from "../../platform/dom/RenderScheduler";
import { ViewRuntime } from "../../platform/dom/ViewRuntime";
import { activateEntry, openPath } from "../../platform/navigation/NavigationService";
import { buildCardExcerpt, isTextExcerptExtension } from "./content";
import { getColumnCount, layoutMasonrySection } from "./masonry";
import {
	readStickyNoteOptions,
	STICKY_NOTE_CSS_ONLY_KEYS,
	type StickyNoteOptions,
} from "./options";
import { findOwningBaseFile } from "./ownerBaseFile";
import { isPinned, togglePin } from "./pinStore";

export const BASES_STICKY_NOTE_VIEW_ID = "unimian-sticky-note";

/** Reads one property's value off a live entry as plain text, or `null` if unset/unreadable. */
function propertyText(entry: BasesEntry, propertyId: BasesPropertyId | null): string | null {
	if (!propertyId) return null;
	const normalized = normalizeValue(entry.getValue(propertyId));
	switch (normalized.kind) {
		case "text":
			return normalized.value;
		case "file":
			return normalized.path;
		case "link":
			return normalized.display ?? normalized.target;
		case "number":
			return String(normalized.value);
		default:
			return null;
	}
}

interface CardEntry {
	el: HTMLElement;
	mtime: number;
	pinned: boolean;
	/** Owns whatever `MarkdownRenderer.render()` registered for this one card — unloaded only
	 * when this specific card is replaced or removed, never the whole view's cards at once.
	 * `null` for a placeholder (STICKY-009 virtualization), which renders no content. */
	component: Component | null;
	/** `'placeholder'` cards are cheap, fixed-height boxes standing in for an entry outside the
	 * initial render window (STICKY-009) — promoted to `'full'` as the user scrolls near them. */
	kind: "full" | "placeholder";
}

/** Windowing constants (STICKY-009). Deliberately rough heuristics, not exact measurement —
 * "roughly enough cards to cover a couple of screens" is the goal, not a precise virtual-list. */
const RENDER_WINDOW_SCREENS = 2;
const MIN_INITIAL_RENDER = 20;
/** How far ahead of the viewport a placeholder starts promoting, in either scroll direction. */
const PLACEHOLDER_ROOT_MARGIN_PX = 500;
/**
 * Caps how many placeholders one `flushPromotions()` call builds before yielding to the next
 * frame. A generous `rootMargin` plus a fast scroll can queue hundreds of placeholders at once;
 * building all of them in one uninterrupted sequential loop (each doing a file read plus a
 * `MarkdownRenderer.render()`) took long enough to look permanently stuck rather than merely
 * slow (maintainer report, 2026-09-23: "yang diatas itu tidak melanjutkan prosesnya" — scrolling
 * down then back up left the earlier batch looking abandoned, not just delayed). Processing a
 * bounded batch per frame and re-scheduling the rest keeps forward progress visible.
 */
const MAX_PROMOTIONS_PER_FLUSH = 15;

export class BasesStickyNoteView extends BasesView {
	type = BASES_STICKY_NOTE_VIEW_ID;
	private readonly runtime: ViewRuntime;
	private readonly pinnedHeadingEl: HTMLElement;
	private readonly pinnedGridEl: HTMLElement;
	private readonly othersHeadingEl: HTMLElement;
	private readonly othersGridEl: HTMLElement;
	/**
	 * STICKY-009: keyed by entry path, so `render()` can reuse a card whose content hasn't
	 * changed (same mtime) instead of tearing down and rebuilding every card on every
	 * `onDataUpdated()` — confirmed necessary at real scale (515-note Base, maintainer report
	 * 2026-09-23: a single file's mtime bump, e.g. from a linter autofix on save, was rebuilding
	 * all 515 cards for one changed note).
	 */
	private readonly cardsByPath = new Map<string, CardEntry>();
	/** Forces a full rebuild of every cached card when a content-affecting option changes. */
	private lastOptionsKey: string | null = null;
	private containerResizeObserver: ResizeObserver | null = null;
	/**
	 * Watches every card's own box size, not just the container — image `load` alone misses
	 * embeds (`.base`/note previews) and tables that finish rendering/reflowing after the
	 * initial markdown render resolves. Design evidence: `churnish/dynamic-views`'
	 * `cardResizeObserver` documents the same reasoning (no code copied, see
	 * docs/architecture/upstream-provenance.md's Dynamic Views entry).
	 */
	private cardResizeObserver: ResizeObserver | null = null;
	private relayoutFrame: number | null = null;
	private safetyNetTimer: number | null = null;
	private currentCardWidth = 240;
	private hasCompletedFirstLayout = false;
	/**
	 * STICKY-009 virtualization: only the "Others" section is windowed (Pinned is assumed small
	 * — always fully rendered). `othersRenderedCount` is how many of `lastOtherEntries`, in
	 * order, are currently promoted to full cards; the rest are placeholders. A card, once
	 * promoted, is never demoted back — bounded by however many the user actually scrolls
	 * through in one session, not by vault size.
	 */
	private lastOtherEntries: readonly BasesEntry[] = [];
	private othersRenderedCount = 0;
	/**
	 * Path → entry, rebuilt each render — lets the `IntersectionObserver` callback (which only
	 * knows a placeholder's DOM element and its `data-sticky-path`) find the `BasesEntry` to
	 * actually render.
	 */
	private otherEntryByPath = new Map<string, BasesEntry>();
	/**
	 * Promotes a placeholder the moment it comes within `PLACEHOLDER_ROOT_MARGIN_PX` of the
	 * viewport — not a `scroll`-event distance check. A first attempt measured distance to the
	 * bottom of the *whole* page (which includes every not-yet-promoted placeholder's estimated
	 * height), so it only ever fired once the user neared the very end of all 515 entries; a
	 * fast scroll straight past the initial window's real cards landed on bare placeholders with
	 * nothing promoting them (maintainer report, 2026-09-23 — "lazy load nya too lazy saat di
	 * scroll cepat"). `IntersectionObserver` tracks actual element geometry regardless of how
	 * the viewport got there, so a fast scroll/jump is caught correctly, not just a slow one.
	 */
	private placeholderObserver: IntersectionObserver | null = null;
	private readonly pendingPromotions = new Set<string>();
	private promoteFrame: number | null = null;
	private isFlushingPromotions = false;
	/**
	 * STICKY-011: Bases calls `onDataUpdated()` far more often than the query's actual result
	 * changes (confirmed via console logging during native testing, 2026-09-22 — repeated calls
	 * with identical entries/config fired during plain hover/click interaction). Without this,
	 * every one of those calls tore down and rebuilt every card's DOM from scratch, which read
	 * as cards visibly "reorganizing" on interaction. Same fix Calendar already uses (PERF-002).
	 */
	private readonly renderScheduler = new RenderScheduler();

	constructor(
		controller: QueryController,
		private readonly containerEl: HTMLElement,
		private readonly plugin: UnimianPlugin,
	) {
		super(controller);
		this.runtime = new ViewRuntime(containerEl);
		this.containerEl.addClass("unimian-sticky-note");
		this.pinnedHeadingEl = this.containerEl.createEl("h3", {
			text: "Pinned",
			cls: "unimian-sticky-note-section-heading",
		});
		this.pinnedGridEl = this.containerEl.createDiv({ cls: "unimian-sticky-note-grid" });
		this.othersHeadingEl = this.containerEl.createEl("h3", {
			text: "Others",
			cls: "unimian-sticky-note-section-heading",
		});
		this.othersGridEl = this.containerEl.createDiv({ cls: "unimian-sticky-note-grid" });
	}

	onload(): void {
		this.containerResizeObserver = new ResizeObserver(() => this.scheduleRelayout());
		this.containerResizeObserver.observe(this.containerEl);
		this.runtime.observe(this.containerResizeObserver);
		this.cardResizeObserver = new ResizeObserver(() => this.scheduleRelayout());
		this.runtime.observe(this.cardResizeObserver);
		// STICKY-009: promotes a placeholder to a full card once it comes within
		// PLACEHOLDER_ROOT_MARGIN_PX of the viewport, regardless of scroll speed/distance.
		this.placeholderObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const path = (entry.target as HTMLElement).dataset.stickyPath;
					if (path) this.schedulePromote(path);
					this.placeholderObserver?.unobserve(entry.target);
				}
			},
			{ root: this.containerEl, rootMargin: `${PLACEHOLDER_ROOT_MARGIN_PX}px 0px` },
		);
		this.runtime.observe(this.placeholderObserver);
	}

	onDataUpdated(): void {
		const decision = this.renderScheduler.decide(
			computeRenderSignature(this.buildRenderSignatureInput()),
		);
		if (decision === "skip") return;
		void this.render();
	}

	/** Only the primitives that affect this view's rendered output (spec docs/specs/sticky-note.md §5.4). */
	private buildRenderSignatureInput(): RenderSignatureInput {
		const entries = (this.data?.groupedData ?? []).flatMap((group) =>
			group.entries.map((entry) => ({ path: entry.file.path, mtime: entry.file.stat?.mtime ?? 0 })),
		);
		const options = readStickyNoteOptions(new ViewConfigReader(this.config));
		return {
			entries,
			order: [],
			groupKeys: [],
			config: {
				titleProperty: options.titleProperty,
				coverProperty: options.coverProperty,
				colorProperty: options.colorProperty,
				imageFit: options.imageFit,
				cardWidth: options.cardWidth,
				cardMaxHeight: options.cardMaxHeight,
				excerptBudget: options.excerptBudget,
			},
		};
	}

	onunload(): void {
		if (this.relayoutFrame !== null) this.runtime.win.cancelAnimationFrame(this.relayoutFrame);
		if (this.promoteFrame !== null) this.runtime.win.cancelAnimationFrame(this.promoteFrame);
		if (this.safetyNetTimer !== null) this.runtime.win.clearTimeout(this.safetyNetTimer);
		for (const { component } of this.cardsByPath.values()) component?.unload();
		this.cardsByPath.clear();
		this.runtime.dispose();
	}

	private scheduleRelayout(): void {
		if (this.relayoutFrame !== null) return;
		this.relayoutFrame = this.runtime.requestAnimationFrame(() => {
			this.relayoutFrame = null;
			layoutMasonrySection(this.pinnedGridEl, this.currentCardWidth);
			layoutMasonrySection(this.othersGridEl, this.currentCardWidth);
			// Cards render in normal document flow (stacked, unstyled) until their first
			// `position: absolute` placement lands — at a real Base size (515 entries,
			// maintainer report 2026-09-23) building that first batch takes long enough for the
			// unstyled stack to be visibly seen for a second or two before "becoming" the
			// masonry grid. Hidden via CSS opacity until the first layout completes, once, then
			// left visible for every later relayout — not re-hidden on every update.
			if (!this.hasCompletedFirstLayout) {
				this.hasCompletedFirstLayout = true;
				this.pinnedGridEl.addClass("is-ready");
				this.othersGridEl.addClass("is-ready");
			}
		});
	}

	private resolveCardColor(options: StickyNoteOptions, entry: BasesEntry): string | undefined {
		if (!options.colorProperty) return undefined;
		const raw = propertyText(entry, options.colorProperty);
		if (!raw) return undefined;
		const propName =
			String(options.colorProperty).split(".").pop() || String(options.colorProperty);
		const resolved = resolveColor({
			explicitColor: raw,
			categoryValue: raw,
			resolvePrettyPropertiesColor: (categoryValue) =>
				resolvePrettyPropertiesColor(
					this.runtime.win,
					this.runtime.doc,
					propName,
					categoryValue,
					0.4,
				),
			valueStyleColor:
				this.plugin.settings.valueStyles[String(options.colorProperty)]?.[raw]?.color ?? null,
		});
		return resolved.source === "fallback" ? undefined : resolved.background;
	}

	private async renderCard(
		entry: BasesEntry,
		options: StickyNoteOptions,
		basePath: string,
		parent: HTMLElement,
	): Promise<CardEntry> {
		const file = entry.file;
		const title = propertyText(entry, options.titleProperty) ?? file.basename;
		const pinned = isPinned(this.plugin.settings.stickyNote, basePath, file.path);
		const child = new Component();
		child.load();

		const card = parent.createDiv({
			cls: `unimian-sticky-note-card unimian-sticky-note-fit-${options.imageFit}`,
		});
		const color = this.resolveCardColor(options, entry);
		if (color) card.style.setProperty("--unimian-color-bg", color);

		const open = (event: MouseEvent | KeyboardEvent) => {
			if ((event.target as HTMLElement).closest("a, .internal-embed, .unimian-sticky-note-pin-btn"))
				return;
			activateEntry({
				app: this.plugin.app,
				settings: this.plugin.settings,
				path: file.path,
				event,
				openFull: (p, e) => openPath(this.plugin.app, p, e),
			});
		};
		card.addEventListener("click", open);
		card.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			open(event);
		});
		card.setAttribute("tabindex", "0");
		card.setAttribute("role", "button");

		const pinBtn = card.createDiv({
			cls: `unimian-sticky-note-pin-btn${pinned ? " is-pinned" : ""}`,
		});
		setIcon(pinBtn, "pin");
		pinBtn.setAttribute("aria-label", pinned ? "Unpin note" : "Pin note");
		pinBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			this.plugin.settings.stickyNote = togglePin(
				this.plugin.settings.stickyNote,
				basePath,
				file.path,
			);
			void this.plugin.saveSettings();
			void this.render();
		});

		const coverRaw = propertyText(entry, options.coverProperty);
		if (coverRaw) {
			const coverSrc = resolveCoverImageSrc(this.plugin.app, coverRaw);
			if (coverSrc) {
				const cover = card.createDiv({ cls: "unimian-sticky-note-cover" });
				cover.createEl("img", { attr: { src: coverSrc, alt: "" } });
			}
		}

		card.createEl("h4", { text: title, cls: "unimian-sticky-note-title" });
		const body = card.createDiv({ cls: "unimian-sticky-note-body" });
		try {
			if (!isTextExcerptExtension(file.extension)) {
				if (file.extension === "canvas") {
					// spec §5.4.2: a canvas has no meaningful bounded-height inline preview —
					// embedding it via MarkdownRenderer renders nothing useful inside a small
					// card (native testing, 2026-09-23; the real preview only appeared once
					// opened in Quick Preview's own live leaf).
					body.createDiv({
						text: "Canvas — open to view.",
						cls: "unimian-sticky-note-embed-placeholder",
					});
				} else if (file.extension === "base" && file.path === basePath) {
					// STICKY-008: a Base's own query can list the Base file itself as an entry
					// (seen in native testing). Embedding it here would recurse into this same
					// Sticky Note view rendering its own entries again — a real infinite-loop
					// risk, not a hypothetical. Placeholder instead of an embed for this one
					// case; every other non-text entry (other `.base` files, images, PDFs, ...)
					// still embeds normally.
					body.createDiv({
						text: "This Base — open to view.",
						cls: "unimian-sticky-note-embed-placeholder",
					});
				} else {
					// A binary file's raw bytes are never meaningful as prose (spec §5.4.2 for
					// `.base`/`.canvas`, generalized 2026-09-23 after native testing showed an
					// image entry's raw PNG bytes rendered as garbled text) — embed instead of
					// reading it as text.
					await MarkdownRenderer.render(
						this.plugin.app,
						`![[${file.path}]]`,
						body,
						file.path,
						child,
					);
				}
			} else {
				const raw = await this.plugin.app.vault.cachedRead(file);
				const excerpt = buildCardExcerpt(raw, title, options.excerptBudget);
				await MarkdownRenderer.render(
					this.plugin.app,
					excerpt || "*(empty note)*",
					body,
					file.path,
					child,
				);
			}
		} catch {
			body.createDiv({ text: "Could not render preview.", cls: "unimian-sticky-note-error" });
		}

		return { el: card, mtime: file.stat?.mtime ?? 0, pinned, component: child, kind: "full" };
	}

	/**
	 * Cheap fixed-height stand-in for an entry outside the initial render window (STICKY-009).
	 * `data-sticky-path` is how the `IntersectionObserver` callback identifies which entry to
	 * promote once this element nears the viewport — see `placeholderObserver`.
	 */
	private createPlaceholder(
		entry: BasesEntry,
		parent: HTMLElement,
		estimatedHeight: number,
	): CardEntry {
		const el = parent.createDiv({
			cls: "unimian-sticky-note-card unimian-sticky-note-card-placeholder",
		});
		el.style.height = `${estimatedHeight}px`;
		el.dataset.stickyPath = entry.file.path;
		this.placeholderObserver?.observe(el);
		return {
			el,
			mtime: entry.file.stat?.mtime ?? 0,
			pinned: false,
			component: null,
			kind: "placeholder",
		};
	}

	/**
	 * Rough estimate of a typical card's rendered height, for sizing the initial render window
	 * and placeholders — not a measurement. Exact accuracy doesn't matter: it only decides how
	 * many cards to build eagerly versus lazily, not anything visually final (a placeholder is
	 * replaced with a real card, at its real height, well before it's likely to be seen).
	 */
	private estimateCardHeight(cardMaxHeight: number): number {
		return Math.max(120, cardMaxHeight * 0.5);
	}

	private computeWindowCount(cardMaxHeight: number): number {
		const containerHeight = this.containerEl.clientHeight || 800;
		const containerWidth = this.othersGridEl.clientWidth || this.containerEl.clientWidth || 800;
		const columns = getColumnCount(containerWidth, this.currentCardWidth);
		const rows = Math.max(
			1,
			Math.ceil((containerHeight * RENDER_WINDOW_SCREENS) / this.estimateCardHeight(cardMaxHeight)),
		);
		return Math.max(MIN_INITIAL_RENDER, columns * rows);
	}

	/** Queues one entry for promotion, coalescing multiple intersections into one batch/relayout. */
	private schedulePromote(path: string): void {
		this.pendingPromotions.add(path);
		this.scheduleFlush();
	}

	private scheduleFlush(): void {
		if (this.promoteFrame !== null) return;
		this.promoteFrame = this.runtime.requestAnimationFrame(() => {
			this.promoteFrame = null;
			void this.flushPromotions();
		});
	}

	/**
	 * Builds a real card for up to `MAX_PROMOTIONS_PER_FLUSH` queued paths, then — if more are
	 * still queued, whether left over from this batch or added while it ran — schedules another
	 * flush for the next frame instead of looping until the whole queue drains in one go.
	 * `isFlushingPromotions` additionally rules out two flushes running at once: `flushPromotions`
	 * is async and awaits per card, so a burst of intersections arriving mid-flush would
	 * otherwise schedule a second, overlapping call.
	 */
	private async flushPromotions(): Promise<void> {
		if (this.isFlushingPromotions) {
			this.scheduleFlush();
			return;
		}
		if (this.pendingPromotions.size === 0) return;

		this.isFlushingPromotions = true;
		try {
			const batch = [...this.pendingPromotions].slice(0, MAX_PROMOTIONS_PER_FLUSH);
			for (const path of batch) this.pendingPromotions.delete(path);

			const options = readStickyNoteOptions(new ViewConfigReader(this.config));
			const basePath = findOwningBaseFile(this.plugin.app, this.containerEl)?.path ?? "";
			const newlyObserved: HTMLElement[] = [];

			for (const path of batch) {
				const existing = this.cardsByPath.get(path);
				if (existing?.kind === "full") continue;
				const entry = this.otherEntryByPath.get(path);
				if (!entry) continue; // Stale — a re-render already dropped this entry.
				existing?.el.remove();
				const rebuilt = await this.renderCard(entry, options, basePath, this.othersGridEl);
				this.cardsByPath.set(path, rebuilt);
				newlyObserved.push(rebuilt.el);
			}

			if (newlyObserved.length > 0) {
				// Promoted cards were appended to the end of the grid, not inserted in place —
				// a single reorder pass afterwards keeps DOM order matching the query's own
				// order for masonry, cheaper than tracking insertion points per card.
				for (const entry of this.lastOtherEntries) {
					const card = this.cardsByPath.get(entry.file.path);
					if (card) this.othersGridEl.appendChild(card.el);
				}
				// Contiguous-from-start recount — see the same logic in `render()`.
				let fullCount = 0;
				for (const entry of this.lastOtherEntries) {
					if (this.cardsByPath.get(entry.file.path)?.kind !== "full") break;
					fullCount++;
				}
				this.othersRenderedCount = fullCount;

				for (const observed of newlyObserved) this.cardResizeObserver?.observe(observed);
				this.scheduleRelayout();
			}
		} finally {
			this.isFlushingPromotions = false;
			if (this.pendingPromotions.size > 0) this.scheduleFlush();
		}
	}

	private async render(): Promise<void> {
		const config = new ViewConfigReader(this.config);
		const options = readStickyNoteOptions(config);
		this.currentCardWidth = options.cardWidth;
		const basePath = findOwningBaseFile(this.plugin.app, this.containerEl)?.path ?? "";

		if (this.safetyNetTimer !== null) this.runtime.win.clearTimeout(this.safetyNetTimer);
		for (const gridEl of [this.pinnedGridEl, this.othersGridEl]) {
			gridEl.style.setProperty("--unimian-sticky-note-max-height", `${options.cardMaxHeight}px`);
		}

		// Only content-affecting options invalidate cached cards — cardWidth/cardMaxHeight/
		// imageFit (STICKY_NOTE_CSS_ONLY_KEYS) are excluded so dragging the "Card width" slider
		// (Bases calls onDataUpdated() on every tick while dragging) doesn't rebuild every
		// card's markdown content, only reflows via masonry. The per-path mtime check below
		// can't catch a content-option change on its own, since the file itself didn't change.
		const contentOptions = Object.fromEntries(
			Object.entries(options).filter(
				([key]) => !(STICKY_NOTE_CSS_ONLY_KEYS as readonly string[]).includes(key),
			),
		);
		const optionsKey = JSON.stringify(contentOptions);
		if (optionsKey !== this.lastOptionsKey) {
			this.lastOptionsKey = optionsKey;
			for (const { el, component } of this.cardsByPath.values()) {
				component?.unload();
				el.remove();
			}
			this.cardsByPath.clear();
			this.othersRenderedCount = 0;
		}

		const entries = (this.data?.groupedData ?? []).flatMap((group) => group.entries);
		if (entries.length === 0) {
			this.pinnedHeadingEl.hide();
			this.othersHeadingEl.hide();
			for (const { el, component } of this.cardsByPath.values()) {
				component?.unload();
				el.remove();
			}
			this.cardsByPath.clear();
			this.othersRenderedCount = 0;
			this.lastOtherEntries = [];
			this.otherEntryByPath.clear();
			this.cardResizeObserver?.disconnect();
			this.othersGridEl.addClass("is-ready"); // No relayout will run to add this — the empty state has no cards to hide behind a fade-in.
			this.othersGridEl.createDiv({
				text: "No entries match this Base.",
				cls: "unimian-sticky-note-empty",
			});
			return;
		}

		const pinnedEntries = entries.filter((entry) =>
			isPinned(this.plugin.settings.stickyNote, basePath, entry.file.path),
		);
		const otherEntries = entries.filter(
			(entry) => !isPinned(this.plugin.settings.stickyNote, basePath, entry.file.path),
		);
		this.lastOtherEntries = otherEntries;
		this.otherEntryByPath = new Map(otherEntries.map((entry) => [entry.file.path, entry]));

		this.pinnedHeadingEl.toggle(pinnedEntries.length > 0);
		this.othersHeadingEl.toggle(pinnedEntries.length > 0);

		// STICKY-009: reuse a card whose content hasn't changed instead of tearing every card
		// down and rebuilding it on every onDataUpdated() — see the `cardsByPath` field comment.
		// Cards are still built one at a time for genuinely new/changed entries (each
		// `await MarkdownRenderer.render()` yields to the event loop), so their
		// ResizeObserver.observe() is deferred to a final batch pass, same reasoning as before:
		// observing each one as soon as it's built would let the observer's initial fire (and
		// the relayout it schedules) run mid-batch, against a still-growing/still-reordering set.
		//
		// The "Others" section is additionally windowed: only the first `windowCount` entries
		// (plus anything already promoted past that by scrolling — `existing?.kind === 'full'`)
		// get a real card; the rest get a cheap placeholder (createPlaceholder), observed by
		// `placeholderObserver` and promoted once the user scrolls near it. "Pinned" is assumed
		// small and always fully rendered.
		const windowCount = this.computeWindowCount(options.cardMaxHeight);
		const estimatedHeight = this.estimateCardHeight(options.cardMaxHeight);
		const seenPaths = new Set<string>();
		const newlyObserved: HTMLElement[] = [];

		for (const [gridEl, list] of [
			[this.pinnedGridEl, pinnedEntries],
			[this.othersGridEl, otherEntries],
		] as const) {
			const isOthers = gridEl === this.othersGridEl;
			for (let i = 0; i < list.length; i++) {
				const entry = list[i]!;
				const path = entry.file.path;
				seenPaths.add(path);
				const mtime = entry.file.stat?.mtime ?? 0;
				const pinned = gridEl === this.pinnedGridEl;
				const existing = this.cardsByPath.get(path);
				const wantFull = !isOthers || i < windowCount || existing?.kind === "full";

				if (
					existing &&
					existing.mtime === mtime &&
					((wantFull && existing.kind === "full") || (!wantFull && existing.kind === "placeholder"))
				) {
					if (existing.kind === "full") {
						if (existing.pinned !== pinned) {
							const pinBtn = existing.el.querySelector(".unimian-sticky-note-pin-btn");
							pinBtn?.classList.toggle("is-pinned", pinned);
							pinBtn?.setAttribute("aria-label", pinned ? "Unpin note" : "Pin note");
							existing.pinned = pinned;
						}
						// `imageFit` is excluded from the content-invalidation key above
						// (CSS-only), but still needs syncing on a reused card — cheap class
						// toggle, not a rebuild.
						existing.el.className = `unimian-sticky-note-card unimian-sticky-note-fit-${options.imageFit}`;
					}
					gridEl.appendChild(existing.el); // Cheap even if already the right parent — keeps DOM order matching the query's order for masonry.
					continue;
				}

				existing?.component?.unload();
				existing?.el.remove();

				if (wantFull) {
					const rebuilt = await this.renderCard(entry, options, basePath, gridEl);
					this.cardsByPath.set(path, rebuilt);
					newlyObserved.push(rebuilt.el);
				} else {
					this.cardsByPath.set(path, this.createPlaceholder(entry, gridEl, estimatedHeight));
				}
			}
		}

		// Contiguous-from-start by construction (initial window and every promotion both start
		// at the current `othersRenderedCount` and move forward) — the first non-full entry
		// marks where placeholders begin.
		let fullCount = 0;
		for (const entry of otherEntries) {
			if (this.cardsByPath.get(entry.file.path)?.kind !== "full") break;
			fullCount++;
		}
		this.othersRenderedCount = fullCount;

		for (const [path, { el, component }] of this.cardsByPath) {
			if (seenPaths.has(path)) continue;
			component?.unload();
			el.remove();
			this.cardsByPath.delete(path);
		}

		for (const el of newlyObserved) this.cardResizeObserver?.observe(el);

		this.scheduleRelayout();
		// `placeholderObserver` fires its own initial callback for any placeholder that is
		// already within the viewport/root-margin the moment `observe()` is called on it (no
		// manual "did the initial window fill the viewport?" check needed).
		// Safety net for height changes neither the card ResizeObserver nor an image `load`
		// catches in time (e.g. an embed whose own async content-loading doesn't resize the
		// card element itself until several ticks later).
		this.safetyNetTimer = this.runtime.setTimeout(() => this.scheduleRelayout(), 500);
	}
}
