// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

export interface EchoGateTimers {
	setTimeout(handler: () => void, ms: number): number;
	clearTimeout(id: number): void;
	now(): number;
}

/**
 * Holds Bases re-renders while our own frontmatter writes are landing.
 *
 * One gesture can write many notes (a phase drag moves every descendant), and Bases reports each
 * file change separately. Rendering those partial states would pull bars back to their old dates
 * mid-write. The gate stays closed while a write is in flight and until Bases has been quiet for
 * `settleMs` afterwards, then flushes exactly one render from the latest data. A hard cap keeps a
 * chatty vault from starving the view.
 */
export class EchoGate {
	private active = 0;
	private timer: number | null = null;
	private pending = false;
	private openedAt = 0;

	constructor(
		private readonly timers: EchoGateTimers,
		private readonly flush: () => void,
		private readonly settleMs = 350,
		private readonly maxHoldMs = 3000,
	) {}

	/** A write started. Every `begin` must be paired with one `end`. */
	begin(): void {
		if (this.active === 0 && this.timer === null) this.openedAt = this.timers.now();
		this.active += 1;
		this.clearTimer();
	}

	/** A write finished (successfully or not). */
	end(): void {
		this.active = Math.max(0, this.active - 1);
		if (this.active === 0) this.arm();
	}

	/**
	 * True when the caller must not render now. The data it holds is not lost: `flush` runs once the
	 * gate reopens and re-reads the view's latest data.
	 */
	hold(): boolean {
		if (this.active === 0 && this.timer === null) return false;
		this.pending = true;
		if (this.active === 0) this.arm();
		return true;
	}

	private arm(): void {
		this.clearTimer();
		const remaining = Math.max(0, this.maxHoldMs - (this.timers.now() - this.openedAt));
		this.timer = this.timers.setTimeout(
			() => {
				this.timer = null;
				if (this.active > 0) return;
				const flushNow = this.pending;
				this.pending = false;
				if (flushNow) this.flush();
			},
			Math.min(this.settleMs, remaining),
		);
	}

	private clearTimer(): void {
		if (this.timer === null) return;
		this.timers.clearTimeout(this.timer);
		this.timer = null;
	}
}
