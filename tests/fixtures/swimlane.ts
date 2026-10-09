// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type UnimianPlugin from "../../src/main";
import { DEFAULT_SETTINGS } from "../../src/types/settings";
import { BasesSwimlaneView } from "../../src/views/BasesSwimlaneView";
// Import the test double directly so this file type-checks against it; at runtime "obsidian"
// resolves to the same module through the vitest alias.
import { TFile } from "./obsidian";

/** A note as Bases exposes it: frontmatter keyed by property name. */
export interface NoteFixture {
	path: string;
	[property: string]: string;
}

export const sampleNotes = (): NoteFixture[] => [
	{
		path: "Tasks/Write spec.md",
		title: "Spec title",
		status: "Todo",
		priority: "High",
		cover: "cover.png",
		summary: "Spec summary",
	},
	{ path: "Tasks/Build.md", title: "Build title", status: "Doing", priority: "Low" },
	{ path: "Tasks/Ship.md", status: "Done" },
];

export interface SwimlaneHarnessOptions {
	notes?: NoteFixture[];
	/** Bases view options (`config.get` values). Nothing is set by default. */
	config?: Record<string, unknown>;
	/** Properties chosen in the Bases "Properties" menu (`config.getOrder()`). */
	order?: string[];
	/** Vault paths that exist (e.g. cover images). */
	existingFiles?: string[];
}

export interface SwimlaneHarness {
	view: BasesSwimlaneView;
	host: HTMLElement;
	destroy(): void;
}

/** The view debounces rendering (RENDER_DEBOUNCE_MS = 50). */
export const waitForRender = () => new Promise((resolve) => setTimeout(resolve, 80));

/** Mount the real BasesSwimlaneView against the obsidian test double and wait for it to render. */
export async function createSwimlaneHarness(
	options: SwimlaneHarnessOptions = {},
): Promise<SwimlaneHarness> {
	const notes = options.notes ?? sampleNotes();
	const config: Record<string, unknown> = { ...options.config };
	const byPath = new Map(notes.map((note) => [note.path, note]));
	const files = new Set(options.existingFiles ?? ["cover.png"]);

	const entries = notes.map((note) => {
		const file = new TFile(note.path) as TFile & {
			extension: string;
			parent: { path: string } | null;
			stat: { ctime: number; mtime: number };
		};
		file.extension = "md";
		file.parent = {
			path: note.path.includes("/") ? note.path.slice(0, note.path.lastIndexOf("/")) : "",
		};
		file.stat = { ctime: 1, mtime: 2 };
		return {
			file,
			getValue: (id: string) => note[id.replace(/^(note|file|formula)\./, "")] ?? null,
		};
	});

	const app = {
		metadataCache: {
			getFileCache: (file: TFile) => {
				const note = byPath.get(file.path);
				if (!note) return null;
				const { path: _path, ...frontmatter } = note;
				return { frontmatter };
			},
		},
		vault: {
			getAbstractFileByPath: (path: string) => (files.has(path) ? new TFile(path) : null),
			getResourcePath: (file: TFile) => `app://vault/${file.path}`,
			getFiles: () => [],
			getAllLoadedFiles: () => [],
		},
		workspace: { trigger: () => {}, openLinkText: async () => {} },
		fileManager: { processFrontMatter: async () => {} },
	};

	const controller = {
		app,
		config: {
			get: (key: string) => config[key],
			set: (key: string, value: unknown) => {
				config[key] = value;
			},
			getOrder: () => options.order ?? [],
			getDisplayName: (id: string) => id.replace(/^(note|file|formula)\./, ""),
		},
		data: { groupedData: [{ entries, hasKey: () => false }] },
	};
	const plugin = { app, settings: structuredClone(DEFAULT_SETTINGS) } as unknown as UnimianPlugin;

	const host = document.createElement("div");
	document.body.appendChild(host);

	// The QueryController shape is internal to Obsidian; the view only reads app/config/data.
	const view = new BasesSwimlaneView(controller as never, host, plugin);
	view.onDataUpdated();
	await waitForRender();

	return {
		view,
		host,
		destroy() {
			view.onunload();
			host.remove();
		},
	};
}
