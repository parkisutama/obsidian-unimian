// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

// Test double for the `obsidian` module (aliased in vitest.config.mts). The real package only
// ships type declarations; its runtime is provided by the Obsidian app.

type DomOptions = { cls?: string | string[]; text?: string };

function createChild<K extends keyof HTMLElementTagNameMap>(
	parent: HTMLElement,
	tag: K,
	options: DomOptions = {},
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (options.cls) el.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
	if (options.text) el.textContent = options.text;
	parent.appendChild(el);
	return el;
}

/** Install Obsidian's HTMLElement helpers. Call once per DOM environment. */
export function installDomHelpers(): void {
	// Obsidian's globals are typed by the obsidian package; the test double only needs to exist.
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.empty = function (this: HTMLElement) {
		this.replaceChildren();
	};
	proto.addClass = function (this: HTMLElement, ...cls: string[]) {
		this.classList.add(...cls);
	};
	proto.removeClass = function (this: HTMLElement, ...cls: string[]) {
		this.classList.remove(...cls);
	};
	proto.toggleClass = function (this: HTMLElement, cls: string, value: boolean) {
		this.classList.toggle(cls, value);
	};
	proto.setText = function (this: HTMLElement, text: string) {
		this.textContent = text;
	};
	proto.createDiv = function (this: HTMLElement, options?: DomOptions) {
		return createChild(this, "div", options);
	};
	proto.createSpan = function (this: HTMLElement, options?: DomOptions) {
		return createChild(this, "span", options);
	};
	proto.createEl = function <K extends keyof HTMLElementTagNameMap>(
		this: HTMLElement,
		tag: K,
		options?: DomOptions,
	) {
		return createChild(this, tag, options);
	};
	proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
		for (const [name, value] of Object.entries(props)) {
			this.style.setProperty(name, value);
		}
	};
}

/** Renders a marker <svg data-icon="name"> so tests can assert which icon was set. */
export function setIcon(el: HTMLElement, name: string): void {
	el.replaceChildren();
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("data-icon", name);
	el.appendChild(svg);
}

export class App {}

export class BasesView {
	app: unknown;
	config: unknown;
	data: unknown;
	constructor(controller: { app?: unknown; config?: unknown; data?: unknown }) {
		this.app = controller.app;
		this.config = controller.config;
		this.data = controller.data;
	}
}

export class TAbstractFile {
	path = "";
}

export class TFile extends TAbstractFile {
	basename: string;
	constructor(path: string) {
		super();
		this.path = path;
		this.basename = path.replace(/\.md$/, "").split("/").pop() ?? path;
	}
}

export class WorkspaceLeaf {
	containerEl = document.createElement("div");
	constructor(public app: unknown) {}
	async openFile(): Promise<void> {}
	detach(): void {}
}

export class TFolder extends TAbstractFile {}

export const notices: string[] = [];
export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

/** Mirrors the real Keymap.isModEvent convention documented in obsidian.d.ts. */
export class Keymap {
	static isModEvent(
		evt?: {
			ctrlKey?: boolean;
			metaKey?: boolean;
			altKey?: boolean;
			shiftKey?: boolean;
			button?: number;
		} | null,
	): "tab" | "split" | "window" | boolean {
		if (!evt) return false;
		if ("button" in evt && evt.button === 1) return "tab";
		const mod = Boolean(evt.ctrlKey || evt.metaKey);
		if (!mod) return false;
		if (evt.altKey && evt.shiftKey) return "window";
		if (evt.altKey) return "split";
		return "tab";
	}
}

export class Menu {
	addItem(callback: (item: unknown) => void): this {
		const item = {
			setTitle: () => item,
			setIcon: () => item,
			onClick: () => item,
		};
		callback(item);
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtPosition(): void {}
}

// Bases value wrappers; the views only use them for instanceof checks and toString.
export class Value {
	isTruthy(): boolean {
		return true;
	}
}
export class NullValue extends Value {
	override isTruthy(): boolean {
		return false;
	}
}
export class NumberValue extends Value {
	constructor(private readonly value: number) {
		super();
	}
	toString(): string {
		return String(this.value);
	}
}
/** Accepts a date-only ("2026-01-01") or datetime ("2026-01-01T10:00:00") string, like real Bases. */
export class DateValue extends Value {
	constructor(private readonly value: string) {
		super();
	}
	dateOnly(): DateValue {
		return new DateValue(this.value.slice(0, 10));
	}
	toString(): string {
		return this.value;
	}
}
export class StringValue extends Value {
	constructor(protected readonly value: string) {
		super();
	}
	toString(): string {
		return this.value;
	}
	override isTruthy(): boolean {
		return this.value.length > 0;
	}
}
export class LinkValue extends StringValue {}
export class BooleanValue extends Value {
	constructor(private readonly value: boolean) {
		super();
	}
	override isTruthy(): boolean {
		return this.value;
	}
	toString(): string {
		return String(this.value);
	}
}
export class FileValue extends Value {
	constructor(private readonly path: string) {
		super();
	}
	toString(): string {
		return this.path;
	}
}
export class ListValue extends Value {
	constructor(private readonly items: Value[]) {
		super();
	}
	length(): number {
		return this.items.length;
	}
	get(index: number): Value {
		return this.items[index] ?? new NullValue();
	}
	override isTruthy(): boolean {
		return this.items.length > 0;
	}
	toString(): string {
		return this.items.map((item) => item.toString()).join(", ");
	}
}

/** Plugin base with in-memory data.json (set `storedData` before calling loadData). */
export class Plugin {
	app: unknown;
	storedData: unknown = null;
	constructor(app?: unknown) {
		this.app = app;
	}
	async loadData(): Promise<unknown> {
		return this.storedData;
	}
	async saveData(data: unknown): Promise<void> {
		this.storedData = data;
	}
	registerEvent(_eventRef: unknown): void {
		// No-op: tests that need to assert on event registration inspect the vault mock directly.
	}
}

export class PluginSettingTab {
	constructor(
		public app: unknown,
		public plugin: unknown,
	) {}
}
export class Setting {}

export class Modal {
	constructor(public app: unknown) {}
	open(): void {}
	close(): void {}
}
export class SuggestModal<T> extends Modal {
	declare readonly suggestion?: T;
}

export const normalizePath = (path: string): string => path;
export const parseYaml = (): Record<string, unknown> => ({});
export const stringifyYaml = (): string => "";
