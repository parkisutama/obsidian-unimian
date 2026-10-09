import { describe, expect, it } from "vitest";
import { isSafeColor, resolveColor, toCssVariables } from "../src/platform/colors/ColorResolver";
import { getContrastColor, stringToColor } from "../src/utils/colorUtils";

describe("isSafeColor", () => {
	it("accepts hex, rgb(a), and hsl(a) forms", () => {
		expect(isSafeColor("#fff")).toBe(true);
		expect(isSafeColor("#ff0000")).toBe(true);
		expect(isSafeColor("rgb(1, 2, 3)")).toBe(true);
		expect(isSafeColor("rgba(1, 2, 3, 0.4)")).toBe(true);
		expect(isSafeColor("hsl(200, 50%, 50%)")).toBe(true);
		expect(isSafeColor("hsla(200, 50%, 50%, 0.4)")).toBe(true);
	});

	it("rejects anything that could smuggle extra CSS through an inline style", () => {
		expect(isSafeColor("red")).toBe(false);
		expect(isSafeColor("javascript:alert(1)")).toBe(false);
		expect(isSafeColor("#fff; background:url(evil)")).toBe(false);
		expect(isSafeColor("url(javascript:alert(1))")).toBe(false);
		expect(isSafeColor("")).toBe(false);
	});
});

describe("resolveColor: priority order (spec §7.8)", () => {
	it("prefers an explicit color property over everything else", () => {
		const resolved = resolveColor({
			explicitColor: "#ff0000",
			categoryValue: "Todo",
			resolvePrettyPropertiesColor: () => "#00ff00",
			valueStyleColor: "#0000ff",
		});
		expect(resolved).toEqual({
			background: "#ff0000",
			foreground: getContrastColor("#ff0000"),
			source: "explicit",
		});
	});

	it("accepts an explicit color missing its leading #", () => {
		expect(resolveColor({ explicitColor: "ff0000" }).background).toBe("#ff0000");
	});

	it("falls through an invalid explicit color to Pretty Properties", () => {
		const resolved = resolveColor({
			explicitColor: "not-a-color",
			categoryValue: "Todo",
			resolvePrettyPropertiesColor: () => "#00ff00",
		});
		expect(resolved).toMatchObject({ background: "#00ff00", source: "pretty-properties" });
	});

	it("uses Pretty Properties before valueStyles", () => {
		const resolved = resolveColor({
			categoryValue: "Todo",
			resolvePrettyPropertiesColor: () => "rgb(1, 2, 3)",
			valueStyleColor: "#0000ff",
		});
		expect(resolved).toMatchObject({ background: "rgb(1, 2, 3)", source: "pretty-properties" });
	});

	it("falls through an unsafe Pretty Properties result to valueStyles", () => {
		const resolved = resolveColor({
			categoryValue: "Todo",
			resolvePrettyPropertiesColor: () => "javascript:alert(1)",
			valueStyleColor: "#0000ff",
		});
		expect(resolved).toMatchObject({ background: "#0000ff", source: "value-style" });
	});

	it("falls through an unsafe valueStyle color to the deterministic fallback", () => {
		const resolved = resolveColor({ categoryValue: "Todo", valueStyleColor: "red; color: evil" });
		expect(resolved).toMatchObject({ background: stringToColor("Todo"), source: "fallback" });
	});

	it("uses the deterministic fallback when nothing else is configured", () => {
		const resolved = resolveColor({ categoryValue: "Todo" });
		expect(resolved).toEqual({
			background: stringToColor("Todo"),
			foreground: getContrastColor(stringToColor("Todo")),
			source: "fallback",
		});
	});

	it("falls back to the neutral color when there is no category value either", () => {
		expect(resolveColor({}).background).toBe(stringToColor(""));
	});
});

describe("expresses existing Calendar/Swimlane color scenarios", () => {
	it("matches Calendar's direct color-property fixture: entries with different values get different colors", () => {
		const launch = resolveColor({ categoryValue: "active" });
		const offsite = resolveColor({ categoryValue: "planned" });
		expect(launch.background).not.toBe(offsite.background);
		expect(launch.foreground).toMatch(/^#(000000|ffffff)$/);
	});

	it("matches Calendar's folder-coloring fixture: a bare folder name resolves like any category value", () => {
		const resolved = resolveColor({ categoryValue: "Root" });
		expect(resolved).toMatchObject({ background: stringToColor("Root"), source: "fallback" });
	});

	it("matches Swimlane's configured valueStyles fixture for a status column", () => {
		const resolved = resolveColor({ categoryValue: "Doing", valueStyleColor: "#268bd2" });
		expect(resolved).toMatchObject({ background: "#268bd2", source: "value-style" });
	});

	it("matches Swimlane's semi-transparent Pretty Properties background (alpha < 1)", () => {
		const resolved = resolveColor({
			categoryValue: "High",
			resolvePrettyPropertiesColor: () => "rgba(220, 50, 47, 0.4)",
		});
		expect(resolved).toMatchObject({
			background: "rgba(220, 50, 47, 0.4)",
			source: "pretty-properties",
		});
	});
});

describe("toCssVariables", () => {
	it("exposes background/foreground as semantic Unimian CSS variables", () => {
		const resolved = resolveColor({ explicitColor: "#ff0000" });
		expect(toCssVariables(resolved)).toEqual({
			"--unimian-color-bg": "#ff0000",
			"--unimian-color-fg": getContrastColor("#ff0000"),
		});
	});
});
