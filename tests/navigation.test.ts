// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
	isActivationKey,
	openPath,
	resolveOpenDestination,
	triggerHoverPreview,
} from "../src/platform/navigation/NavigationService";
import { showOpenFileMenuWithItems } from "../src/utils/openFile";

describe("resolveOpenDestination: mouse and keyboard produce the same contract", () => {
	it("resolves a plain activation, mouse or keyboard, to 'active'", () => {
		expect(resolveOpenDestination(new MouseEvent("click"))).toBe("active");
		expect(resolveOpenDestination(new KeyboardEvent("keydown", { key: "Enter" }))).toBe("active");
		expect(resolveOpenDestination(null)).toBe("active");
		expect(resolveOpenDestination()).toBe("active");
	});

	it("resolves Cmd/Ctrl, mouse or keyboard, to 'tab'", () => {
		expect(resolveOpenDestination(new MouseEvent("click", { ctrlKey: true }))).toBe("tab");
		expect(
			resolveOpenDestination(new KeyboardEvent("keydown", { key: "Enter", metaKey: true })),
		).toBe("tab");
	});

	it("resolves Cmd/Ctrl+Alt to 'split' and Cmd/Ctrl+Alt+Shift to 'window'", () => {
		expect(resolveOpenDestination(new MouseEvent("click", { ctrlKey: true, altKey: true }))).toBe(
			"split",
		);
		expect(
			resolveOpenDestination(
				new MouseEvent("click", { ctrlKey: true, altKey: true, shiftKey: true }),
			),
		).toBe("window");
	});

	it("resolves a middle-click to 'tab'", () => {
		expect(resolveOpenDestination(new MouseEvent("auxclick", { button: 1 }))).toBe("tab");
	});
});

describe("openPath", () => {
	it("opens with the destination resolved from the event's modifiers", () => {
		const openLinkText = vi.fn();
		const app = { workspace: { openLinkText } } as never;

		openPath(app, "Note.md", new MouseEvent("click"));
		expect(openLinkText).toHaveBeenCalledWith("Note.md", "", false);

		openPath(app, "Note.md", new MouseEvent("click", { ctrlKey: true }));
		expect(openLinkText).toHaveBeenCalledWith("Note.md", "", "tab");
	});
});

describe("triggerHoverPreview", () => {
	it("dispatches hover-link with the given registered source id and target", () => {
		const trigger = vi.fn();
		const app = { workspace: { trigger } } as never;
		const targetEl = document.createElement("div");
		const event = new MouseEvent("mouseenter");
		const hoverParent = {} as never;

		triggerHoverPreview({
			app,
			hoverParent,
			sourceId: "unimian-timeline",
			event,
			filePath: "A.md",
			targetEl,
		});

		expect(trigger).toHaveBeenCalledWith("hover-link", {
			event,
			source: "unimian-timeline",
			hoverParent,
			targetEl,
			linktext: "A.md",
			sourcePath: "/",
		});
	});
});

describe("isActivationKey", () => {
	it("accepts Enter and Space, rejects everything else", () => {
		expect(isActivationKey(new KeyboardEvent("keydown", { key: "Enter" }))).toBe(true);
		expect(isActivationKey(new KeyboardEvent("keydown", { key: " " }))).toBe(true);
		expect(isActivationKey(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(false);
	});
});

describe("context menus use the event's owning document (spec §7.9)", () => {
	it("shows the menu on the same document the triggering event belongs to", async () => {
		const { Menu } = await import("./fixtures/obsidian");
		const showAtPosition = vi.spyOn(Menu.prototype, "showAtPosition");
		const app = { workspace: {} } as never;
		const el = document.createElement("div");
		document.body.appendChild(el);
		const event = new MouseEvent("contextmenu", { clientX: 1, clientY: 2 });
		Object.defineProperty(event, "view", { value: document.defaultView });

		showOpenFileMenuWithItems(app, "A.md", event);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(showAtPosition).toHaveBeenCalledWith({ x: 1, y: 2 }, document);
		el.remove();
	});
});
