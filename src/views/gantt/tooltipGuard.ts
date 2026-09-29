// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

let nextLabelId = 0;

/**
 * Elements whose `aria-label` duplicates something the chart already shows. Obsidian turns every
 * `aria-label` into a hover tooltip, so these produced a second bubble on top of the library's own:
 * the whole treegrid ("Gantt chart") and each bar (name, dates, progress), which is exactly what the
 * library's hover card says, plus the progress handle sitting on the bar. Labels on small controls
 * (link handles, delete dependency, close panel) stay: a tooltip helps there.
 */
const GUARDED = '[role="treegrid"][aria-label], [role="gridcell"][aria-label], [role="slider"][aria-label]';

/**
 * Moves each guarded label to `aria-labelledby` on a hidden element. Screen readers keep the name;
 * Obsidian has nothing to show. The library rewrites `aria-label` as dates or progress change, so
 * this re-runs on every mutation and keeps the hidden text current.
 */
export class TooltipGuard {
	private readonly observer: MutationObserver;
	private readonly labels = new Map<Element, HTMLElement>();

	constructor(private readonly root: HTMLElement, win: Window) {
		const MutationObserverCtor = (win as Window & { MutationObserver: typeof MutationObserver }).MutationObserver;
		this.observer = new MutationObserverCtor(() => this.sweep());
		this.observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] });
	}

	/** Idempotent; safe to call after every render. */
	sweep(): void {
		for (const [owner, label] of this.labels) {
			if (owner.isConnected) continue;
			label.remove();
			this.labels.delete(owner);
		}
		for (const element of Array.from(this.root.querySelectorAll<HTMLElement>(GUARDED))) {
			const name = element.getAttribute('aria-label') ?? '';
			element.removeAttribute('aria-label');
			if (!name) continue;
			const label = this.labelFor(element);
			label.textContent = name;
			element.setAttribute('aria-labelledby', label.id);
		}
	}

	private labelFor(owner: HTMLElement): HTMLElement {
		const existing = this.labels.get(owner);
		if (existing?.isConnected) return existing;
		const label = this.root.ownerDocument.createElement('span');
		label.id = `unimian-gantt-label-${nextLabelId++}`;
		label.className = 'gantt-sr-only';
		this.root.appendChild(label);
		this.labels.set(owner, label);
		return label;
	}

	dispose(): void {
		this.observer.disconnect();
		for (const label of this.labels.values()) label.remove();
		this.labels.clear();
	}
}
