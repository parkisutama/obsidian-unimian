// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Render epochs and change-detection policy (T022, spec §7.11).
 *
 * `RenderScheduler` is infrastructure, not a renderer: it decides *whether* a view needs to
 * skip, take a CSS-only fast path, or fully re-render, and hands out abortable render epochs so
 * async work started by a superseded render can recognize that and refuse to commit its result.
 * Layout-specific rendering policy stays in the view/layout strategy.
 */

import { diffRenderSignatures, type RenderSignature } from "../bases/changeDetection";
import { areAllCssOnly, type ViewOptionSchema } from "../bases/viewOptionTypes";

export type RenderDecision = "skip" | "css-only" | "full";

export interface RenderEpoch {
	epoch: number;
	signal: AbortSignal;
}

export class RenderScheduler {
	private epoch = 0;
	private controller: AbortController | null = null;
	private signature: RenderSignature | null = null;

	/**
	 * Starts a new render epoch, aborting any `AbortSignal` handed out by the previous one.
	 * Async work should hold onto `epoch` and check `isCurrentEpoch` before writing to the DOM
	 * or a cache, not just check `signal.aborted` — the caller may not have wired abort-on-
	 * unload for every code path.
	 */
	beginEpoch(): RenderEpoch {
		this.controller?.abort();
		this.controller = new AbortController();
		this.epoch += 1;
		return { epoch: this.epoch, signal: this.controller.signal };
	}

	/** True while `epoch` is still the most recently begun one, i.e. its work has not been superseded. */
	isCurrentEpoch(epoch: number): boolean {
		return epoch === this.epoch;
	}

	/**
	 * Compares `next` against the last signature recorded (updating it either way) and returns
	 * what the caller must do:
	 * - `'skip'`: every layer is identical; do nothing.
	 * - `'css-only'`: only config changed, and every changed config key is CSS-only per
	 *   `schema`; update CSS variables/classes without rebuilding the data model.
	 * - `'full'`: entries, order, or groups changed (or config changed with no schema/changed
	 *   keys to prove it was CSS-only); re-render fully.
	 */
	decide(
		next: RenderSignature,
		schema?: ViewOptionSchema,
		changedConfigKeys?: readonly string[],
	): RenderDecision {
		const prev = this.signature;
		this.signature = next;
		const diff = diffRenderSignatures(prev, next);

		if (diff.identical) return "skip";

		const onlyConfigChanged =
			!diff.entriesChanged && !diff.orderChanged && !diff.groupsChanged && diff.configChanged;
		if (
			onlyConfigChanged &&
			schema &&
			changedConfigKeys &&
			areAllCssOnly(schema, changedConfigKeys)
		) {
			return "css-only";
		}

		return "full";
	}
}
