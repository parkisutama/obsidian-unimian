// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import {
	calculateLinearVirtualRange,
	type LinearVirtualRange,
} from "../../core/layouts/linearVirtualRange";

export interface VirtualLinearItem {
	path: string;
}

export interface VirtualRowHandle {
	element: HTMLElement;
	dispose(): void;
}

export interface VirtualLinearCollectionOptions<T extends VirtualLinearItem> {
	rowHeight: number;
	overscan?: number;
	renderRow(item: T, index: number): VirtualRowHandle;
	/** Refreshes a reused path-keyed row when its immutable model changes. */
	updateRow?(handle: VirtualRowHandle, item: T, index: number): void;
}

interface MountedRow<T extends VirtualLinearItem> {
	item: T;
	handle: VirtualRowHandle;
}

/**
 * Fixed-height, path-keyed linear DOM virtualization. The caller owns item modeling; this
 * controller owns only visible row handles, positioning, scroll anchoring, and cleanup.
 */
export class VirtualLinearCollection<T extends VirtualLinearItem> {
	private readonly contentEl: HTMLElement;
	private readonly mounted = new Map<string, MountedRow<T>>();
	private items: readonly T[] = [];
	private destroyed = false;
	private range: LinearVirtualRange = calculateLinearVirtualRange({
		itemCount: 0,
		rowHeight: 1,
		scrollTop: 0,
		viewportHeight: 0,
	});
	private readonly onScroll = (): void => this.refresh();

	constructor(
		private readonly viewportEl: HTMLElement,
		private readonly options: VirtualLinearCollectionOptions<T>,
	) {
		if (!Number.isFinite(options.rowHeight) || options.rowHeight <= 0)
			throw new Error("rowHeight must be positive.");
		this.contentEl = viewportEl.ownerDocument.createElement("div");
		this.contentEl.className = "unimian-virtual-linear-content";
		this.contentEl.style.position = "relative";
		viewportEl.appendChild(this.contentEl);
		viewportEl.addEventListener("scroll", this.onScroll, { passive: true });
	}

	get mountedCount(): number {
		return this.mounted.size;
	}

	get currentRange(): LinearVirtualRange {
		return this.range;
	}

	updateItems(items: readonly T[], preserveAnchor = true): void {
		if (this.destroyed) return;
		const paths = new Set<string>();
		for (const item of items) {
			if (paths.has(item.path)) throw new Error(`Duplicate virtual row path: ${item.path}`);
			paths.add(item.path);
		}
		const anchor = preserveAnchor ? this.captureAnchor() : null;
		this.items = items;
		if (anchor) {
			const newIndex = items.findIndex((item) => item.path === anchor.path);
			if (newIndex >= 0)
				this.viewportEl.scrollTop = newIndex * this.options.rowHeight + anchor.offset;
		}
		this.refresh();
	}

	refresh(): void {
		if (this.destroyed) return;
		this.range = calculateLinearVirtualRange({
			itemCount: this.items.length,
			rowHeight: this.options.rowHeight,
			scrollTop: this.viewportEl.scrollTop,
			viewportHeight: this.viewportEl.clientHeight,
			overscan: this.options.overscan ?? 0,
		});
		this.contentEl.style.height = `${this.range.totalHeight}px`;
		const wanted = new Set<string>();
		for (let index = this.range.startIndex; index < this.range.endIndex; index++) {
			const item = this.items[index];
			if (!item) continue;
			wanted.add(item.path);
			let row = this.mounted.get(item.path);
			if (!row) {
				const handle = this.options.renderRow(item, index);
				handle.element.dataset.path = item.path;
				handle.element.style.position = "absolute";
				handle.element.style.left = "0";
				handle.element.style.right = "0";
				handle.element.style.height = `${this.options.rowHeight}px`;
				this.contentEl.appendChild(handle.element);
				row = { item, handle };
				this.mounted.set(item.path, row);
			} else {
				row.item = item;
				this.options.updateRow?.(row.handle, item, index);
			}
			row.handle.element.style.transform = `translateY(${index * this.options.rowHeight}px)`;
		}
		for (const [path, row] of this.mounted) {
			if (!wanted.has(path)) this.unmount(path, row);
		}
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.viewportEl.removeEventListener("scroll", this.onScroll);
		for (const [path, row] of [...this.mounted]) this.unmount(path, row);
		this.contentEl.remove();
	}

	private captureAnchor(): { path: string; offset: number } | null {
		if (this.items.length === 0) return null;
		const index = Math.min(
			this.items.length - 1,
			Math.max(0, Math.floor(this.viewportEl.scrollTop / this.options.rowHeight)),
		);
		const item = this.items[index];
		return item
			? { path: item.path, offset: this.viewportEl.scrollTop - index * this.options.rowHeight }
			: null;
	}

	private unmount(path: string, row: MountedRow<T>): void {
		this.mounted.delete(path);
		row.handle.dispose();
		row.handle.element.remove();
	}
}
