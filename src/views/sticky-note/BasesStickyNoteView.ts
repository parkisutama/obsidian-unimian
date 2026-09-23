// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Sticky Note view (docs/specs/sticky-note.md): a Google-Keep-style card grid over Bases
 * entries. Read-only — no `capabilities.mutations`, no `legacyMutation` (spec §5.3); delete is
 * explicitly out of scope for v1.
 */

import { BasesView, Component, MarkdownRenderer, setIcon, type BasesEntry, type BasesPropertyId, type QueryController } from 'obsidian';
import type WiseViewPlugin from '../../main';
import { computeRenderSignature, type RenderSignatureInput } from '../../platform/bases/changeDetection';
import { normalizeValue } from '../../platform/bases/entrySnapshotAdapter';
import { ViewConfigReader } from '../../platform/bases/ViewConfigReader';
import { resolveColor } from '../../platform/colors/ColorResolver';
import { resolveCoverImageSrc } from '../../platform/dom/CoverImageResolver';
import { RenderScheduler } from '../../platform/dom/RenderScheduler';
import { ViewRuntime } from '../../platform/dom/ViewRuntime';
import { activateEntry, openPath } from '../../platform/navigation/NavigationService';
import { resolvePrettyPropertiesColor } from '../../integrations/PrettyPropertiesAdapter';
import { buildCardExcerpt, EMBED_ONLY_EXTENSIONS } from './content';
import { layoutMasonrySection } from './masonry';
import { findOwningBaseFile } from './ownerBaseFile';
import { readStickyNoteOptions, type StickyNoteOptions } from './options';
import { isPinned, togglePin } from './pinStore';

export const BASES_STICKY_NOTE_VIEW_ID = 'wise-view-sticky-note';

/** Reads one property's value off a live entry as plain text, or `null` if unset/unreadable. */
function propertyText(entry: BasesEntry, propertyId: BasesPropertyId | null): string | null {
	if (!propertyId) return null;
	const normalized = normalizeValue(entry.getValue(propertyId));
	switch (normalized.kind) {
		case 'text': return normalized.value;
		case 'file': return normalized.path;
		case 'link': return normalized.display ?? normalized.target;
		case 'number': return String(normalized.value);
		default: return null;
	}
}

export class BasesStickyNoteView extends BasesView {
	type = BASES_STICKY_NOTE_VIEW_ID;
	private readonly runtime: ViewRuntime;
	private readonly pinnedHeadingEl: HTMLElement;
	private readonly pinnedGridEl: HTMLElement;
	private readonly othersHeadingEl: HTMLElement;
	private readonly othersGridEl: HTMLElement;
	private renderChild: Component | null = null;
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
	/**
	 * STICKY-011: Bases calls `onDataUpdated()` far more often than the query's actual result
	 * changes (confirmed via console logging during native testing, 2026-09-22 — repeated calls
	 * with identical entries/config fired during plain hover/click interaction). Without this,
	 * every one of those calls tore down and rebuilt every card's DOM from scratch, which read
	 * as cards visibly "reorganizing" on interaction. Same fix Calendar already uses (PERF-002).
	 */
	private readonly renderScheduler = new RenderScheduler();

	constructor(controller: QueryController, private readonly containerEl: HTMLElement, private readonly plugin: WiseViewPlugin) {
		super(controller);
		this.runtime = new ViewRuntime(containerEl);
		this.containerEl.addClass('wise-view-sticky-note');
		this.pinnedHeadingEl = this.containerEl.createEl('h3', { text: 'Pinned', cls: 'wise-view-sticky-note-section-heading' });
		this.pinnedGridEl = this.containerEl.createDiv({ cls: 'wise-view-sticky-note-grid' });
		this.othersHeadingEl = this.containerEl.createEl('h3', { text: 'Others', cls: 'wise-view-sticky-note-section-heading' });
		this.othersGridEl = this.containerEl.createDiv({ cls: 'wise-view-sticky-note-grid' });
	}

	onload(): void {
		this.containerResizeObserver = new ResizeObserver(() => this.scheduleRelayout());
		this.containerResizeObserver.observe(this.containerEl);
		this.runtime.observe(this.containerResizeObserver);
		this.cardResizeObserver = new ResizeObserver(() => this.scheduleRelayout());
		this.runtime.observe(this.cardResizeObserver);
	}

	onDataUpdated(): void {
		const decision = this.renderScheduler.decide(computeRenderSignature(this.buildRenderSignatureInput()));
		if (decision === 'skip') return;
		void this.render();
	}

	/** Only the primitives that affect this view's rendered output (spec docs/specs/sticky-note.md §5.4). */
	private buildRenderSignatureInput(): RenderSignatureInput {
		const entries = (this.data?.groupedData ?? []).flatMap((group) =>
			group.entries.map((entry) => ({ path: entry.file.path, mtime: entry.file.stat?.mtime ?? 0 })));
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
		if (this.safetyNetTimer !== null) this.runtime.win.clearTimeout(this.safetyNetTimer);
		this.renderChild?.unload();
		this.renderChild = null;
		this.runtime.dispose();
	}

	private scheduleRelayout(): void {
		if (this.relayoutFrame !== null) return;
		this.relayoutFrame = this.runtime.requestAnimationFrame(() => {
			this.relayoutFrame = null;
			layoutMasonrySection(this.pinnedGridEl, this.currentCardWidth);
			layoutMasonrySection(this.othersGridEl, this.currentCardWidth);
		});
	}

	private resolveCardColor(options: StickyNoteOptions, entry: BasesEntry): string | undefined {
		if (!options.colorProperty) return undefined;
		const raw = propertyText(entry, options.colorProperty);
		if (!raw) return undefined;
		const propName = String(options.colorProperty).split('.').pop() || String(options.colorProperty);
		const resolved = resolveColor({
			explicitColor: raw,
			categoryValue: raw,
			resolvePrettyPropertiesColor: (categoryValue) => resolvePrettyPropertiesColor(this.runtime.win, this.runtime.doc, propName, categoryValue, 0.4),
			valueStyleColor: this.plugin.settings.valueStyles[String(options.colorProperty)]?.[raw]?.color ?? null,
		});
		return resolved.source === 'fallback' ? undefined : resolved.background;
	}

	private async renderCard(entry: BasesEntry, options: StickyNoteOptions, basePath: string, child: Component, parent: HTMLElement): Promise<HTMLElement> {
		const file = entry.file;
		const title = propertyText(entry, options.titleProperty) ?? file.basename;
		const pinned = isPinned(this.plugin.settings.stickyNote, basePath, file.path);

		const card = parent.createDiv({ cls: `wise-view-sticky-note-card wise-view-sticky-note-fit-${options.imageFit}` });
		const color = this.resolveCardColor(options, entry);
		if (color) card.style.setProperty('--wise-view-color-bg', color);

		const open = (event: MouseEvent | KeyboardEvent) => {
			if ((event.target as HTMLElement).closest('a, .internal-embed, .wise-view-sticky-note-pin-btn')) return;
			activateEntry({
				app: this.plugin.app,
				settings: this.plugin.settings,
				path: file.path,
				event,
				openFull: (p, e) => openPath(this.plugin.app, p, e),
			});
		};
		card.addEventListener('click', open);
		card.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			open(event);
		});
		card.setAttribute('tabindex', '0');
		card.setAttribute('role', 'button');

		const pinBtn = card.createDiv({ cls: `wise-view-sticky-note-pin-btn${pinned ? ' is-pinned' : ''}` });
		setIcon(pinBtn, 'pin');
		pinBtn.setAttribute('aria-label', pinned ? 'Unpin note' : 'Pin note');
		pinBtn.addEventListener('click', (event) => {
			event.stopPropagation();
			this.plugin.settings.stickyNote = togglePin(this.plugin.settings.stickyNote, basePath, file.path);
			void this.plugin.saveSettings();
			void this.render();
		});

		const coverRaw = propertyText(entry, options.coverProperty);
		if (coverRaw) {
			const coverSrc = resolveCoverImageSrc(this.plugin.app, coverRaw);
			if (coverSrc) {
				const cover = card.createDiv({ cls: 'wise-view-sticky-note-cover' });
				cover.createEl('img', { attr: { src: coverSrc, alt: '' } });
			}
		}

		card.createEl('h4', { text: title, cls: 'wise-view-sticky-note-title' });
		const body = card.createDiv({ cls: 'wise-view-sticky-note-body' });
		try {
			if (EMBED_ONLY_EXTENSIONS.has(file.extension)) {
				if (file.path === basePath) {
					// STICKY-008: a Base's own query can list the Base file itself as an entry
					// (seen in native testing). Embedding it here would recurse into this same
					// Sticky Note view rendering its own entries again — a real infinite-loop
					// risk, not a hypothetical. Placeholder instead of an embed for this one
					// case; other `.base`/`.canvas` entries still embed normally.
					body.createDiv({ text: 'This Base — open to view.', cls: 'wise-view-sticky-note-embed-placeholder' });
				} else {
					// spec §5.4.2: a `.base`/`.canvas` entry's raw text is never meaningful as
					// prose — render it as a real embed instead of dumping YAML/JSON.
					await MarkdownRenderer.render(this.plugin.app, `![[${file.path}]]`, body, file.path, child);
				}
			} else {
				const raw = await this.plugin.app.vault.cachedRead(file);
				const excerpt = buildCardExcerpt(raw, title, options.excerptBudget);
				await MarkdownRenderer.render(this.plugin.app, excerpt || '*(empty note)*', body, file.path, child);
			}
		} catch {
			body.createDiv({ text: 'Could not render preview.', cls: 'wise-view-sticky-note-error' });
		}

		return card;
	}

	private async render(): Promise<void> {
		const config = new ViewConfigReader(this.config);
		const options = readStickyNoteOptions(config);
		this.currentCardWidth = options.cardWidth;
		const basePath = findOwningBaseFile(this.plugin.app, this.containerEl)?.path ?? '';

		this.renderChild?.unload();
		const child = new Component();
		child.load();
		this.renderChild = child;

		this.cardResizeObserver?.disconnect();
		if (this.safetyNetTimer !== null) this.runtime.win.clearTimeout(this.safetyNetTimer);
		this.pinnedGridEl.empty();
		this.othersGridEl.empty();
		for (const gridEl of [this.pinnedGridEl, this.othersGridEl]) {
			gridEl.style.setProperty('--wise-view-sticky-note-max-height', `${options.cardMaxHeight}px`);
		}

		const entries = (this.data?.groupedData ?? []).flatMap((group) => group.entries);
		if (entries.length === 0) {
			this.pinnedHeadingEl.hide();
			this.othersHeadingEl.hide();
			this.othersGridEl.createDiv({ text: 'No entries match this Base.', cls: 'wise-view-sticky-note-empty' });
			return;
		}

		const pinnedEntries = entries.filter((entry) => isPinned(this.plugin.settings.stickyNote, basePath, entry.file.path));
		const otherEntries = entries.filter((entry) => !isPinned(this.plugin.settings.stickyNote, basePath, entry.file.path));

		this.pinnedHeadingEl.toggle(pinnedEntries.length > 0);
		this.othersHeadingEl.toggle(pinnedEntries.length > 0);

		// Cards are built one at a time (each `await MarkdownRenderer.render()` yields to the
		// event loop), so observing each card's ResizeObserver as soon as it's created would let
		// the observer's initial fire — and the relayout it schedules — happen mid-batch,
		// against a still-growing card set. That produced a visible "cards keep shifting as more
		// appear" effect during the initial render of a larger Base (maintainer report,
		// 2026-09-23). Observing every card only after the whole batch is built means the
		// initial-fire storm is one coalesced relayout, not several partial ones.
		const cards: HTMLElement[] = [];
		for (const entry of pinnedEntries) cards.push(await this.renderCard(entry, options, basePath, child, this.pinnedGridEl));
		for (const entry of otherEntries) cards.push(await this.renderCard(entry, options, basePath, child, this.othersGridEl));
		for (const card of cards) this.cardResizeObserver?.observe(card);

		this.scheduleRelayout();
		// Safety net for height changes neither the card ResizeObserver nor an image `load`
		// catches in time (e.g. an embed whose own async content-loading doesn't resize the
		// card element itself until several ticks later).
		this.safetyNetTimer = this.runtime.setTimeout(() => this.scheduleRelayout(), 500);
	}
}
