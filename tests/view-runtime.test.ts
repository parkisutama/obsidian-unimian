// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it, vi } from "vitest";
import { DisposableScope } from "../src/platform/dom/DisposableScope";
import { ownerDocument, ownerWindow } from "../src/platform/dom/ownerWindow";
import { ViewRuntime } from "../src/platform/dom/ViewRuntime";

describe("ownerWindow/ownerDocument", () => {
	it("resolves the document/window that actually owns the element", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		expect(ownerDocument(el)).toBe(document);
		expect(ownerWindow(el)).toBe(document.defaultView);
		el.remove();
	});
});

describe("DisposableScope", () => {
	it("removes a tracked event listener exactly once on dispose", () => {
		const target = document.createElement("div");
		const listener = vi.fn();
		const scope = new DisposableScope();
		scope.addEventListener(target, "click", listener);

		target.dispatchEvent(new MouseEvent("click"));
		expect(listener).toHaveBeenCalledTimes(1);

		scope.dispose();
		target.dispatchEvent(new MouseEvent("click"));
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("disconnects every tracked observer exactly once", () => {
		const disconnect = vi.fn();
		const scope = new DisposableScope();
		scope.observe({ disconnect });

		scope.dispose();
		scope.dispose();
		expect(disconnect).toHaveBeenCalledTimes(1);
	});

	it("disposes an owned Disposable through whichever teardown method it exposes", () => {
		const dispose = vi.fn();
		const unload = vi.fn();
		const scope = new DisposableScope();
		scope.own({ dispose });
		scope.own({ unload });

		scope.dispose();
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(unload).toHaveBeenCalledTimes(1);
	});

	it("clears a tracked timer exactly once", () => {
		vi.useFakeTimers();
		const handler = vi.fn();
		const scope = new DisposableScope();
		scope.setTimeout(window, handler, 100);

		scope.dispose();
		vi.advanceTimersByTime(200);
		expect(handler).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("aborts every tracked AbortController exactly once", () => {
		const scope = new DisposableScope();
		const controller = scope.createAbortController();
		scope.dispose();
		scope.dispose();
		expect(controller.signal.aborted).toBe(true);
	});

	it("is safe to call dispose twice, running each cleanup only once", () => {
		const cleanup = vi.fn();
		const scope = new DisposableScope();
		scope.add(cleanup);
		scope.dispose();
		scope.dispose();
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(scope.isDisposed).toBe(true);
	});

	it("runs a cleanup immediately if registered after dispose instead of leaking it", () => {
		const cleanup = vi.fn();
		const scope = new DisposableScope();
		scope.dispose();
		scope.add(cleanup);
		expect(cleanup).toHaveBeenCalledTimes(1);
	});
});

describe("ViewRuntime", () => {
	it("derives its window/document from the root element's owner", () => {
		const root = document.createElement("div");
		document.body.appendChild(root);
		const runtime = new ViewRuntime(root);
		expect(runtime.doc).toBe(document);
		expect(runtime.win).toBe(document.defaultView);
		root.remove();
	});

	it("creates observers/RAF handles bound to the owning window and releases them once on dispose", () => {
		const root = document.createElement("div");
		document.body.appendChild(root);
		const runtime = new ViewRuntime(root);

		const cancelSpy = vi.spyOn(runtime.win, "cancelAnimationFrame");
		const rafSpy = vi.spyOn(runtime.win, "requestAnimationFrame").mockReturnValue(42);
		const id = runtime.requestAnimationFrame(() => {});
		expect(rafSpy).toHaveBeenCalledTimes(1);
		expect(id).toBe(42);

		runtime.dispose();
		runtime.dispose();
		expect(cancelSpy).toHaveBeenCalledTimes(1);
		expect(cancelSpy).toHaveBeenCalledWith(42);
		root.remove();
	});

	it("marks an earlier render epoch stale once a newer epoch begins", () => {
		const root = document.createElement("div");
		const runtime = new ViewRuntime(root);
		const first = runtime.beginEpoch();
		expect(runtime.isStaleEpoch(first)).toBe(false);

		const second = runtime.beginEpoch();
		expect(runtime.isStaleEpoch(first)).toBe(true);
		expect(runtime.isStaleEpoch(second)).toBe(false);
	});

	it("reports disposed state and is idempotent end-to-end", () => {
		const root = document.createElement("div");
		const runtime = new ViewRuntime(root);
		const cleanup = vi.fn();
		runtime.add(cleanup);

		expect(runtime.isDisposed).toBe(false);
		runtime.dispose();
		runtime.dispose();
		expect(runtime.isDisposed).toBe(true);
		expect(cleanup).toHaveBeenCalledTimes(1);
	});
});
