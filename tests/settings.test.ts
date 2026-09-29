// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import UnimianPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/types/settings";

async function loadWith(storedData: unknown) {
	const plugin = new UnimianPlugin({} as never, {} as never);
	(plugin as unknown as { storedData: unknown }).storedData = storedData;
	await plugin.loadSettings();
	return plugin.settings;
}

describe("UnimianPlugin.loadSettings", () => {
	it("uses defaults when there is no data.json", async () => {
		expect(await loadWith(null)).toEqual(DEFAULT_SETTINGS);
	});

	it("drops the legacy kanbanDefaults instead of reviving its forced column property", async () => {
		// Older versions saved every default, including plannerGroupBy: "note.status".
		const settings = await loadWith({ kanbanDefaults: { plannerGroupBy: "note.status", columnWidth: 300 } });
		expect(settings).not.toHaveProperty("kanbanDefaults");
		expect(settings.swimlaneDefaults.plannerGroupBy).toBe("");
	});

	it("keeps saved swimlane defaults and fills in missing keys", async () => {
		const settings = await loadWith({ swimlaneDefaults: { columnWidth: 320 } });
		expect(settings.swimlaneDefaults.columnWidth).toBe(320);
		expect(settings.swimlaneDefaults.borderStyle).toBe(DEFAULT_SETTINGS.swimlaneDefaults.borderStyle);
	});
});
