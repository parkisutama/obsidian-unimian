// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Per-view runtime (T008, spec §7.4).
 *
 * Bundles a `DisposableScope` with the owning window/document of a view's root element, so
 * observers, timers, and animation frames are always created against the window that actually
 * renders the element (popout-safe) instead of the bare global `document`/`window`. Also hands
 * out monotonically increasing render epochs so async work started by an older render can
 * recognize it has been superseded.
 */

import { type Disposable, DisposableScope } from "./DisposableScope";
import { ownerDocument, ownerWindow } from "./ownerWindow";

export class ViewRuntime {
	readonly scope = new DisposableScope();
	private currentEpoch = 0;

	constructor(private readonly rootEl: HTMLElement) {}

	get doc(): Document {
		return ownerDocument(this.rootEl);
	}

	get win(): Window {
		return ownerWindow(this.rootEl);
	}

	get isDisposed(): boolean {
		return this.scope.isDisposed;
	}

	addEventListener<K extends keyof WindowEventMap>(
		target: EventTarget,
		type: K | string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void {
		this.scope.addEventListener(target, type, listener, options);
	}

	observe(observer: { disconnect(): void }): void {
		this.scope.observe(observer);
	}

	setTimeout(handler: () => void, timeout?: number): number {
		return this.scope.setTimeout(this.win, handler, timeout);
	}

	setInterval(handler: () => void, timeout?: number): number {
		return this.scope.setInterval(this.win, handler, timeout);
	}

	requestAnimationFrame(callback: (time: number) => void): number {
		return this.scope.requestAnimationFrame(this.win, callback);
	}

	createAbortController(): AbortController {
		return this.scope.createAbortController();
	}

	own<T extends Disposable>(disposable: T): T {
		return this.scope.own(disposable);
	}

	add(cleanup: () => void): void {
		this.scope.add(cleanup);
	}

	/** Starts a new render epoch and returns its number. */
	beginEpoch(): number {
		this.currentEpoch += 1;
		return this.currentEpoch;
	}

	/** True once a newer epoch has begun than the one given, i.e. `epoch`'s work is stale. */
	isStaleEpoch(epoch: number): boolean {
		return epoch !== this.currentEpoch;
	}

	/** Releases every owned resource exactly once. Safe to call twice. */
	dispose(): void {
		this.scope.dispose();
	}
}
