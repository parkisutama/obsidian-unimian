// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { type App, Notice, normalizePath, type TFile, type TFolder } from "obsidian";
import { assertInsideVault } from "../core/paths/vaultPath";

/**
 * The one place a note is created from a template file (docs/specs/note-template.md).
 *
 * Unimian never substitutes tokens in a template file's body. A template-application plugin
 * does that, or nobody does and the user is told so:
 *   1. Templater, through its own "create new note from template" API;
 *   2. the core Templates plugin, by inserting the template into the freshly created note;
 *   3. plain: the template is copied as-is (see `PLAIN_TEMPLATE_NOTICE`).
 */

export type TemplateEngine = "templater" | "core-templates" | "plain";

export const PLAIN_TEMPLATE_NOTICE =
	"Neither Templater nor the core Templates plugin is enabled, so the template was copied without processing its {{...}} or <% %> syntax.";

const TEMPLATER_ID = "templater-obsidian";

interface TemplaterApi {
	create_new_note_from_template(
		template: TFile,
		folder: TFolder | string,
		filename?: string,
		openNewNote?: boolean,
	): Promise<TFile | undefined>;
}

interface CoreTemplatesInstance {
	insertTemplate(template: TFile): Promise<void> | void;
}

interface AppWithPluginInternals extends App {
	plugins?: { plugins?: Record<string, { templater?: Partial<TemplaterApi> } | undefined> };
	internalPlugins?: {
		getPluginById?(
			id: string,
		): { enabled?: boolean; instance?: Partial<CoreTemplatesInstance> } | undefined;
	};
}

function templaterApi(app: App): TemplaterApi | null {
	const api = (app as AppWithPluginInternals).plugins?.plugins?.[TEMPLATER_ID]?.templater;
	return typeof api?.create_new_note_from_template === "function" ? (api as TemplaterApi) : null;
}

function coreTemplates(app: App): CoreTemplatesInstance | null {
	const plugin = (app as AppWithPluginInternals).internalPlugins?.getPluginById?.("templates");
	const instance = plugin?.enabled ? plugin.instance : undefined;
	return typeof instance?.insertTemplate === "function"
		? (instance as CoreTemplatesInstance)
		: null;
}

/** Templater wins over core Templates; `plain` means nothing will process the template. */
export function detectTemplateEngine(app: App): TemplateEngine {
	if (templaterApi(app)) return "templater";
	if (coreTemplates(app)) return "core-templates";
	return "plain";
}

/** Tells the user, every time, that a template went in unprocessed. */
export function noticePlainTemplate(): void {
	new Notice(PLAIN_TEMPLATE_NOTICE);
}

export async function ensureFolder(app: App, folder: string): Promise<void> {
	assertInsideVault(folder);
	if (!folder || app.vault.getFolderByPath(folder)) return;
	let current = "";
	for (const part of folder.split("/").filter(Boolean)) {
		current = current ? `${current}/${part}` : part;
		if (!app.vault.getFolderByPath(current)) await app.vault.createFolder(current);
	}
}

/** First free `Title.md`, `Title 2.md`, ... in the folder. */
export function availablePath(app: App, folder: string, title: string): string {
	const join = (name: string) => normalizePath(folder ? `${folder}/${name}.md` : `${name}.md`);
	let path = assertInsideVault(join(title));
	for (let counter = 2; app.vault.getAbstractFileByPath(path); counter += 1) {
		path = join(`${title} ${counter}`);
	}
	return path;
}

export interface TemplateNoteRequest {
	template: TFile;
	/** Vault path the note is created at (already collision-free). */
	path: string;
	/** Values the view computed; merged over whatever the template wrote. */
	frontmatter?: Readonly<Record<string, unknown>>;
}

/**
 * Creates the note through `engine` (never `plain`). The template engine writes the file;
 * `frontmatter` is merged afterwards so the view's own values win, as they always have.
 */
export async function createNoteFromTemplate(
	app: App,
	engine: Exclude<TemplateEngine, "plain">,
	request: TemplateNoteRequest,
): Promise<TFile> {
	assertInsideVault(request.path);
	const slash = request.path.lastIndexOf("/");
	const folderPath = slash >= 0 ? request.path.slice(0, slash) : "";
	const basename = request.path.slice(slash + 1).replace(/\.md$/, "");
	await ensureFolder(app, folderPath);

	let file: TFile | undefined;
	if (engine === "templater") {
		const api = templaterApi(app);
		if (!api) throw new Error("Templater is no longer available.");
		const folder = folderPath ? app.vault.getFolderByPath(folderPath) : app.vault.getRoot();
		file = await api.create_new_note_from_template(
			request.template,
			folder ?? folderPath,
			basename,
			false,
		);
	} else {
		const core = coreTemplates(app);
		if (!core) throw new Error("The core Templates plugin is no longer enabled.");
		file = await app.vault.create(request.path, "");
		// The core plugin inserts into the active editor, so the new note has to be open.
		await app.workspace.getLeaf("tab").openFile(file);
		await core.insertTemplate(request.template);
	}
	if (!file) throw new Error("The template engine did not create a note.");

	const values = request.frontmatter ?? {};
	if (Object.keys(values).length > 0) {
		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			Object.assign(fm, values);
		});
	}
	return file;
}
