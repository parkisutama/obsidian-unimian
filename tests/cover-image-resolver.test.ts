// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { resolveCoverImageSrc } from "../src/platform/dom/CoverImageResolver";
import { TFile } from "./fixtures/obsidian";

function makeApp(options: { existingFiles?: string[] } = {}) {
	const files = new Set(options.existingFiles ?? []);
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (files.has(path) ? new TFile(path) : null),
			getResourcePath: (file: TFile) => `app://vault/${file.path}`,
			getFiles: () => [...files].map((path) => new TFile(path)),
		},
	} as unknown as App;
	return { app };
}

describe("resolveCoverImageSrc", () => {
	it("returns an external/app:// URL as-is", () => {
		const { app } = makeApp();
		expect(resolveCoverImageSrc(app, "https://example.com/a.png")).toBe(
			"https://example.com/a.png",
		);
		expect(resolveCoverImageSrc(app, "app://local/a.png")).toBe("app://local/a.png");
	});

	it("resolves a direct vault path", () => {
		const { app } = makeApp({ existingFiles: ["Covers/a.png"] });
		expect(resolveCoverImageSrc(app, "Covers/a.png")).toBe("app://vault/Covers/a.png");
	});

	it("strips wikilink brackets and an alias", () => {
		const { app } = makeApp({ existingFiles: ["Covers/a.png"] });
		expect(resolveCoverImageSrc(app, "[[Covers/a.png]]")).toBe("app://vault/Covers/a.png");
		expect(resolveCoverImageSrc(app, "[[Covers/a.png|Alias]]")).toBe("app://vault/Covers/a.png");
	});

	it("normalizes a leading ./ or ../ segment", () => {
		const { app } = makeApp({ existingFiles: ["a.png"] });
		expect(resolveCoverImageSrc(app, "./a.png")).toBe("app://vault/a.png");
		expect(resolveCoverImageSrc(app, "../a.png")).toBe("app://vault/a.png");
	});

	it("guesses a common image extension when none is given", () => {
		const { app } = makeApp({ existingFiles: ["Covers/a.png"] });
		expect(resolveCoverImageSrc(app, "Covers/a")).toBe("app://vault/Covers/a.png");
	});

	it("falls back to a vault-wide basename search", () => {
		const { app } = makeApp({ existingFiles: ["Deep/Nested/a.png"] });
		expect(resolveCoverImageSrc(app, "a.png")).toBe("app://vault/Deep/Nested/a.png");
	});

	it("returns null (never throws) when nothing matches", () => {
		const { app } = makeApp();
		expect(resolveCoverImageSrc(app, "does-not-exist.png")).toBeNull();
		expect(resolveCoverImageSrc(app, "")).toBeNull();
		expect(resolveCoverImageSrc(app, "[[]]")).toBeNull();
	});
});
