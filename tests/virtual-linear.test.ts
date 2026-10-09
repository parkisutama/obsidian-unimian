// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { VirtualLinearCollection } from "../src/platform/dom/VirtualLinearCollection";

interface Item {
	path: string;
	label: string;
}

function viewport(height = 200): HTMLElement {
	const element = document.createElement("div");
	Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
	document.body.appendChild(element);
	return element;
}

describe("VirtualLinearCollection", () => {
	it("keeps mounted rows bounded for 5,000 items", () => {
		const root = viewport(400);
		const collection = new VirtualLinearCollection<Item>(root, {
			rowHeight: 20,
			overscan: 3,
			renderRow: (item) => ({ element: document.createElement("div"), dispose: vi.fn() }),
		});
		collection.updateItems(
			Array.from({ length: 5000 }, (_, index) => ({
				path: `item-${index}.md`,
				label: String(index),
			})),
		);
		expect(collection.mountedCount).toBeLessThanOrEqual(26);
		expect(root.querySelectorAll("[data-path]").length).toBe(collection.mountedCount);
		collection.destroy();
		root.remove();
	});

	it("restores the first visible path and offset after reordering/group changes", () => {
		const root = viewport(40);
		const collection = new VirtualLinearCollection<Item>(root, {
			rowHeight: 20,
			renderRow: () => ({ element: document.createElement("div"), dispose: vi.fn() }),
		});
		const items = ["a", "b", "c", "d"].map((path) => ({ path, label: path }));
		collection.updateItems(items);
		root.scrollTop = 45;
		collection.refresh();
		const anchoredElement = root.querySelector('[data-path="c"]');
		collection.updateItems([items[2]!, items[0]!, items[1]!, items[3]!]);
		expect(root.scrollTop).toBe(5);
		expect(root.querySelector('[data-path="c"]')).toBe(anchoredElement);
		collection.destroy();
		root.remove();
	});

	it("disposes every row when it leaves the range or the collection is destroyed", () => {
		const root = viewport(40);
		const disposers = new Map<string, ReturnType<typeof vi.fn>>();
		const collection = new VirtualLinearCollection<Item>(root, {
			rowHeight: 20,
			renderRow: (item) => {
				const dispose = vi.fn();
				disposers.set(item.path, dispose);
				return { element: document.createElement("div"), dispose };
			},
		});
		collection.updateItems(["a", "b", "c", "d"].map((path) => ({ path, label: path })));
		root.scrollTop = 40;
		collection.refresh();
		expect(disposers.get("a")).toHaveBeenCalledTimes(1);
		expect(disposers.get("b")).toHaveBeenCalledTimes(1);
		collection.destroy();
		expect(disposers.get("c")).toHaveBeenCalledTimes(1);
		expect(disposers.get("d")).toHaveBeenCalledTimes(1);
		expect(() => collection.destroy()).not.toThrow();
		root.remove();
	});

	it("rejects duplicate path identities", () => {
		const root = viewport();
		const collection = new VirtualLinearCollection<Item>(root, {
			rowHeight: 20,
			renderRow: () => ({ element: document.createElement("div"), dispose: vi.fn() }),
		});
		expect(() =>
			collection.updateItems([
				{ path: "a", label: "one" },
				{ path: "a", label: "two" },
			]),
		).toThrow(/Duplicate/);
		collection.destroy();
		root.remove();
	});
});
