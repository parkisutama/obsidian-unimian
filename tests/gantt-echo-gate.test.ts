// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EchoGate } from "../src/views/gantt/echoGate";

function makeGate(settleMs = 350, maxHoldMs = 3000) {
	const flush = vi.fn();
	const gate = new EchoGate(
		{
			setTimeout: (handler, ms) => setTimeout(handler, ms) as unknown as number,
			clearTimeout: (id) => clearTimeout(id),
			now: () => Date.now(),
		},
		flush,
		settleMs,
		maxHoldMs,
	);
	return { gate, flush };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("EchoGate (GBETA-010)", () => {
	it("passes renders straight through when no write happened", () => {
		const { gate, flush } = makeGate();
		expect(gate.hold()).toBe(false);
		vi.advanceTimersByTime(5000);
		expect(flush).not.toHaveBeenCalled();
	});

	it("holds renders while a write is in flight and flushes once after it settles", () => {
		const { gate, flush } = makeGate();
		gate.begin();
		expect(gate.hold()).toBe(true);
		expect(gate.hold()).toBe(true);
		gate.end();
		vi.advanceTimersByTime(349);
		expect(flush).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(flush).toHaveBeenCalledOnce();
		expect(gate.hold()).toBe(false);
	});

	it("does not flush when Bases never echoed the write", () => {
		const { gate, flush } = makeGate();
		gate.begin();
		gate.end();
		vi.advanceTimersByTime(5000);
		expect(flush).not.toHaveBeenCalled();
		expect(gate.hold()).toBe(false);
	});

	it("restarts the settle window while Bases keeps echoing file after file", () => {
		const { gate, flush } = makeGate();
		gate.begin();
		gate.end();
		for (let i = 0; i < 4; i += 1) {
			vi.advanceTimersByTime(300);
			expect(gate.hold()).toBe(true);
		}
		expect(flush).not.toHaveBeenCalled();
		vi.advanceTimersByTime(350);
		expect(flush).toHaveBeenCalledOnce();
	});

	it("keeps the gate closed until every overlapping write has finished", () => {
		const { gate, flush } = makeGate();
		gate.begin();
		gate.begin();
		gate.end();
		expect(gate.hold()).toBe(true);
		vi.advanceTimersByTime(2000);
		expect(flush).not.toHaveBeenCalled();
		gate.end();
		vi.advanceTimersByTime(350);
		expect(flush).toHaveBeenCalledOnce();
	});

	it("caps the hold so a chatty vault cannot starve the view", () => {
		const { gate, flush } = makeGate(350, 1000);
		gate.begin();
		gate.end();
		for (let elapsed = 0; elapsed < 900; elapsed += 300) {
			vi.advanceTimersByTime(300);
			gate.hold();
		}
		vi.advanceTimersByTime(100);
		expect(flush).toHaveBeenCalledOnce();
		expect(gate.hold()).toBe(false);
	});
});
