// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Quick preview popup, opened from a card/item click in any view instead of jumping straight into
 * a workspace pane. Embeds a real, editable Markdown leaf (see `detachedLeaf.ts`) so Edit/Reading
 * mode and the "..." menu are genuinely Obsidian's own; falls back to a read-only render (with a
 * "Linked mentions" backlinks panel either way) if the leaf can't be embedded — mobile, or a future
 * Obsidian internal change.
 *
 * This is a deliberate, scoped exception to the plugin's read-only "view enrichment" philosophy —
 * the four views themselves (their bars/cards/cells) stay exactly as read-only as before; only
 * this explicitly user-requested popup opens a real editor.
 *
 * `Modal` does not extend `Component`, so the fallback render's `MarkdownRenderer.render` is given
 * a scratch `Component` created on open and unloaded on close, per the Obsidian API contract.
 */

import { App, Component, MarkdownRenderer, Modal, Notice, TFile, type UserEvent } from 'obsidian';
import { getBacklinkPaths } from './backlinks';
import { closeDetachedLeaf, openDetachedMarkdownLeaf, type DetachedLeaf } from './detachedLeaf';

const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/**
 * Toggled on `document.body` while the popup is open. Obsidian's own `.hover-popover` (Page
 * Preview's Ctrl/Cmd-hover popover, triggered by the embedded leaf) sits at `--layer-popover`
 * (below `--layer-modal`), so without this it renders correctly but invisibly behind the modal.
 * Scoped to this class, active only while a Quick Preview modal is open, rather than a global
 * z-index change.
 */
const ACTIVE_CLASS = 'unimian-quick-preview-active';

export type OpenFull = (path: string, event?: UserEvent | null) => void;

export class QuickPreviewModal extends Modal {
	private renderChild: Component | null = null;
	private detachedLeaf: DetachedLeaf | null = null;
	private closed = false;

	constructor(app: App, private readonly path: string, private readonly onOpenFull: OpenFull) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.path);
		if (!(file instanceof TFile)) {
			new Notice('Unimian: note not found.');
			this.close();
			return;
		}

		this.modalEl.addClass('unimian-quick-preview');
		document.body.classList.add(ACTIVE_CLASS);
		const { contentEl } = this;
		contentEl.empty();

		// No "Open in tab" button: the embedded leaf path already exposes Obsidian's own "..."
		// menu (which includes opening a real tab) and clicking a linked-mention item below
		// chains straight into that note's own quick preview instead — nothing here needs a
		// second, redundant way to leave the popup.
		const layout = contentEl.createDiv({ cls: 'unimian-quick-preview-layout' });
		const bodyEl = layout.createDiv({ cls: 'unimian-quick-preview-body' });

		const backlinks = getBacklinkPaths(this.app, this.path);
		if (backlinks.length > 0) {
			const panel = layout.createDiv({ cls: 'unimian-quick-preview-backlinks' });
			panel.createEl('h3', { text: 'Linked mentions' });
			const list = panel.createEl('ul');
			for (const backlink of backlinks) {
				const item = list.createEl('li');
				const link = item.createEl('a', {
					text: backlink.basename,
					cls: 'unimian-quick-preview-backlink',
					attr: { title: backlink.path },
				});
				link.addEventListener('click', (event) => {
					event.preventDefault();
					// Chains to the linked note's own quick preview instead of closing out to a
					// full tab — clicking a "Linked mention" should feel like navigating within
					// the preview, not leaving it.
					this.close();
					new QuickPreviewModal(this.app, backlink.path, this.onOpenFull).open();
				});
			}
		}

		// Detached Markdown leaves open in the editor's native state on some mobile devices,
		// which immediately focuses the editor and raises the software keyboard. Mobile quick
		// preview is intentionally read-only so opening a note remains a viewing action.
		const isMobile = document.body.classList.contains('is-mobile');
		const detached = isMobile ? null : await openDetachedMarkdownLeaf(this.app, file);
		if (this.closed) {
			if (detached) closeDetachedLeaf(detached);
			return;
		}

		if (detached) {
			this.detachedLeaf = detached;
			bodyEl.addClass('unimian-quick-preview-body--leaf');
			bodyEl.appendChild(detached.el);
			return;
		}

		bodyEl.createEl('h2', { text: file.basename, cls: 'unimian-quick-preview-title' });

		this.renderChild = new Component();
		this.renderChild.load();

		const raw = await this.app.vault.cachedRead(file);
		const body = raw.replace(FRONTMATTER_BLOCK, '');
		await MarkdownRenderer.render(this.app, body, bodyEl, file.path, this.renderChild);
	}

	onClose(): void {
		this.closed = true;
		document.body.classList.remove(ACTIVE_CLASS);
		if (this.detachedLeaf) {
			closeDetachedLeaf(this.detachedLeaf);
			this.detachedLeaf = null;
		}
		this.renderChild?.unload();
		this.renderChild = null;
		this.contentEl.empty();
	}
}
