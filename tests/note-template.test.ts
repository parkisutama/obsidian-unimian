// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LegacyMutationGateway } from "../src/platform/mutations/LegacyMutationGateway";
import { NoteTemplateService } from "../src/services/NoteTemplateService";
import { detectTemplateEngine, PLAIN_TEMPLATE_NOTICE } from "../src/services/templateEngine";
import { TFile as FakeFile, notices } from "./fixtures/obsidian";

vi.mock("../src/utils/openFile", () => ({ openFileInNewTab: vi.fn() }));

const TEMPLATE_TEXT = 'Created <% tp.date.now("YYYY-MM-DD") %> on {{date}}';

interface Fixture {
	app: never;
	files: Map<string, string>;
	templater: ReturnType<typeof vi.fn>;
	insertTemplate: ReturnType<typeof vi.fn>;
	processFrontMatter: ReturnType<typeof vi.fn>;
	open: ReturnType<typeof vi.fn>;
}

function createApp(engines: { templater?: boolean; core?: boolean } = {}): Fixture {
	const files = new Map<string, string>([["Templates/Event.md", TEMPLATE_TEXT]]);
	const tfiles = new Map<string, TFile>();
	const fileFor = (path: string) => {
		if (!files.has(path)) return null;
		if (!tfiles.has(path)) tfiles.set(path, new FakeFile(path) as unknown as TFile);
		return tfiles.get(path) as TFile;
	};
	const created: TFile[] = [];
	const templater = vi.fn(async (_template: TFile, _folder: unknown, name: string) => {
		files.set(`Events/${name}.md`, "processed by templater");
		const file = fileFor(`Events/${name}.md`) as TFile;
		created.push(file);
		return file;
	});
	const insertTemplate = vi.fn();
	const processFrontMatter = vi.fn(
		async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => fn({}),
	);
	const open = vi.fn();
	const folders = new Set<string>(["Events"]);

	const app = {
		vault: {
			getFileByPath: (path: string) => fileFor(path),
			getAbstractFileByPath: (path: string) => fileFor(path) ?? (folders.has(path) ? {} : null),
			getFolderByPath: (path: string) => (folders.has(path) ? { path } : null),
			getRoot: () => ({ path: "/" }),
			createFolder: async (path: string) => void folders.add(path),
			cachedRead: async (file: TFile) => files.get(file.path) ?? "",
			create: vi.fn(async (path: string, content: string) => {
				files.set(path, content);
				return fileFor(path) as TFile;
			}),
		},
		fileManager: {
			processFrontMatter,
			getNewFileParent: () => ({ path: "Events" }),
		},
		workspace: {
			getActiveFile: () => null,
			getLeaf: () => ({ openFile: open }),
		},
		plugins: {
			plugins: engines.templater
				? { "templater-obsidian": { templater: { create_new_note_from_template: templater } } }
				: {},
		},
		internalPlugins: {
			getPluginById: (id: string) => {
				if (id === "templates")
					return { enabled: Boolean(engines.core), instance: { insertTemplate } };
				return undefined;
			},
		},
	} as never;
	return { app, files, templater, insertTemplate, processFrontMatter, open };
}

const context = {
	title: "Event 2026-09-19 10.30",
	start: new Date(2026, 8, 19, 10, 30),
	end: null,
	allDay: false,
	frontmatter: { date_start: "2026-09-19" },
};
const settings = { templatePath: "Templates/Event", targetFolder: "Events", titleFormat: "" };

beforeEach(() => {
	notices.length = 0;
});

describe("template engine detection", () => {
	it("prefers Templater, then the core Templates plugin, then plain", () => {
		expect(detectTemplateEngine(createApp({ templater: true, core: true }).app)).toBe("templater");
		expect(detectTemplateEngine(createApp({ core: true }).app)).toBe("core-templates");
		expect(detectTemplateEngine(createApp().app)).toBe("plain");
	});
});

describe("NoteTemplateService", () => {
	it("creates the note through Templater's own API and merges the view's frontmatter over it", async () => {
		const f = createApp({ templater: true });
		await new NoteTemplateService(f.app, settings).createNote({} as never, context);

		expect(f.templater).toHaveBeenCalledTimes(1);
		const [template, folder, name, openNew] = f.templater.mock.calls[0] as [
			TFile,
			{ path: string },
			string,
			boolean,
		];
		expect(template.path).toBe("Templates/Event.md");
		expect(folder.path).toBe("Events");
		expect(name).toBe("Event 2026-09-19 10.30");
		expect(openNew).toBe(false);
		expect(f.processFrontMatter).toHaveBeenCalledTimes(1);
		expect(f.files.get("Events/Event 2026-09-19 10.30.md")).toBe("processed by templater");
		expect(notices).toEqual([]);
	});

	it("falls back to the core Templates plugin when Templater is absent", async () => {
		const f = createApp({ core: true });
		await new NoteTemplateService(f.app, settings).createNote({} as never, context);

		expect(f.insertTemplate).toHaveBeenCalledTimes(1);
		expect((f.insertTemplate.mock.calls[0] as [TFile])[0].path).toBe("Templates/Event.md");
		expect(f.templater).not.toHaveBeenCalled();
		// The note was created empty and opened before the template was inserted.
		expect(f.files.get("Events/Event 2026-09-19 10.30.md")).toBe("");
		expect(f.open).toHaveBeenCalled();
		expect(notices).toEqual([]);
	});

	it("copies the template unprocessed and tells the user every time when no engine is available", async () => {
		const f = createApp();
		const service = new NoteTemplateService(f.app, settings);
		await service.createNote({} as never, context);
		await service.createNote({} as never, context);

		expect(f.templater).not.toHaveBeenCalled();
		expect(f.insertTemplate).not.toHaveBeenCalled();
		// No {{...}} substitution against the template body, and no overwrite of a created file.
		expect(f.files.get("Events/Event 2026-09-19 10.30.md")).toBe(TEMPLATE_TEXT);
		expect(f.files.get("Events/Event 2026-09-19 10.30 2.md")).toBe(TEMPLATE_TEXT);
		expect(notices).toEqual([PLAIN_TEMPLATE_NOTICE, PLAIN_TEMPLATE_NOTICE]);
	});

	it("applies Unimian's own tokens to the title format only", async () => {
		const f = createApp({ templater: true });
		await new NoteTemplateService(f.app, {
			...settings,
			titleFormat: "Meeting {{date}} {{time}}",
		}).createNote({} as never, context);
		expect(f.templater.mock.calls[0]?.[2]).toBe("Meeting 2026-09-19 10-30");
	});

	it("hands scoped-write views a template path when an engine is available, a body when not", async () => {
		const withEngine = await new NoteTemplateService(
			createApp({ templater: true }).app,
			settings,
		).prepareNote(context);
		expect(withEngine).toMatchObject({
			path: "Events/Event 2026-09-19 10.30.md",
			templatePath: "Templates/Event.md",
		});
		expect(withEngine.body).toBeUndefined();

		notices.length = 0;
		const plain = await new NoteTemplateService(createApp().app, settings).prepareNote(context);
		expect(plain.templatePath).toBeUndefined();
		expect(plain.body).toBe(TEMPLATE_TEXT);
		expect(notices).toEqual([PLAIN_TEMPLATE_NOTICE]);
	});

	it("creates through the view when no template is configured", async () => {
		const f = createApp({ templater: true });
		const createFileForView = vi.fn();
		await new NoteTemplateService(f.app, {
			templatePath: "",
			targetFolder: "",
			titleFormat: "",
		}).createNote({ createFileForView } as never, context);
		expect(createFileForView).toHaveBeenCalledWith("Event 2026-09-19 10.30", expect.any(Function));
		expect(f.templater).not.toHaveBeenCalled();
	});
});

describe("LegacyMutationGateway.createNote with a template", () => {
	it("routes through Templater when the request names a template", async () => {
		const f = createApp({ templater: true });
		const result = await new LegacyMutationGateway(f.app).createNote({
			path: "Events/Task.md",
			frontmatter: { date_start: "2026-09-19" },
			templatePath: "Templates/Event.md",
		});
		expect(result).toEqual({ ok: true });
		expect(f.templater).toHaveBeenCalledTimes(1);
		expect(f.processFrontMatter).toHaveBeenCalledTimes(1);
	});
});
