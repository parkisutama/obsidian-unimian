// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { type App, Notice } from "obsidian";
import {
	createNoteFromTemplate,
	detectTemplateEngine,
	ensureFolder,
	noticePlainTemplate,
} from "../../../services/templateEngine";
import type { NoteTemplateDefaults } from "../../../types/settings";
import { openFileInNewTab } from "../../../utils/openFile";
import { PERIODIC_KINDS, type PeriodicConfig } from "./config";
import { type PeriodicKind, resolvePeriodicPath } from "./resolver";

/**
 * Where a period's note lives and how it is opened or created (docs/specs/periodic-notes.md).
 * The path comes from the clicked date alone. Content is produced by Templater or the core
 * Templates plugin through `services/templateEngine.ts`; nothing here substitutes template text.
 */

export type PeriodicTarget =
	| { status: "unconfigured" }
	| { status: "refused"; reason: string }
	| { status: "ok"; path: string; folder: string };

export function periodicNoteTarget(
	date: Date,
	kind: PeriodicKind,
	config: PeriodicConfig,
): PeriodicTarget {
	const { pattern } = config.periods[kind];
	if (!pattern) return { status: "unconfigured" };
	const resolved = resolvePeriodicPath(date, pattern, config.weekRule);
	return resolved.ok
		? { status: "ok", path: resolved.path, folder: resolved.folder }
		: { status: "refused", reason: resolved.reason };
}

/** Path of the period's note when it already exists, else null. Never creates or notifies. */
export function existingPeriodicNotePath(
	app: App,
	date: Date,
	kind: PeriodicKind,
	config: PeriodicConfig,
): string | null {
	const target = periodicNoteTarget(date, kind, config);
	if (target.status !== "ok") return null;
	return app.vault.getAbstractFileByPath(target.path) ? target.path : null;
}

/** Opens the period's note in a new tab, creating it first if it does not exist. */
export async function openPeriodicNote(
	app: App,
	date: Date,
	kind: PeriodicKind,
	config: PeriodicConfig,
): Promise<void> {
	const target = periodicNoteTarget(date, kind, config);
	if (target.status === "unconfigured") return;
	if (target.status === "refused") {
		new Notice(`Cannot open the ${kind} note: ${target.reason}`);
		return;
	}

	// Opened by the path the note actually ended up at: a template may move it (Templater's
	// tp.file.move), and opening the pattern's path then would create a second, empty note.
	let openPath = target.path;
	if (!app.vault.getAbstractFileByPath(target.path)) {
		const templatePath = config.periods[kind].template;
		const template = templatePath
			? (app.vault.getFileByPath(templatePath) ?? app.vault.getFileByPath(`${templatePath}.md`))
			: null;
		if (templatePath && !template)
			new Notice(`Template not found: ${templatePath}. Created an empty note.`);

		const engine = detectTemplateEngine(app);
		if (template && engine !== "plain") {
			const created = await createNoteFromTemplate(app, engine, { template, path: target.path });
			openPath = created.path;
			if (openPath !== target.path) {
				new Notice(
					`The template moved the ${kind} note to ${openPath}. Calendar looks for it at ${target.path}, so it will not be marked or reused.`,
				);
			}
		} else {
			// Nothing will process the template: copy it as-is and say so.
			let content = "";
			if (template) {
				content = await app.vault.cachedRead(template);
				noticePlainTemplate();
			}
			await ensureFolder(app, target.folder);
			await app.vault.create(target.path, content);
		}
	}
	openFileInNewTab(app, openPath);
}

/**
 * Template defaults for a new event note. When the Base sets no target folder and the daily
 * period is configured, the note goes to the daily folder of the event's **start** day, once,
 * however many days the event spans. Returns null (after telling the user) when the pattern is
 * unsafe, so nothing is created in an unexpected place.
 */
export function eventTemplateDefaults(
	defaults: NoteTemplateDefaults,
	start: Date,
	config: PeriodicConfig,
): NoteTemplateDefaults | null {
	if (defaults.targetFolder) return defaults;
	const target = periodicNoteTarget(start, "day", config);
	if (target.status === "unconfigured") return defaults;
	if (target.status === "refused") {
		new Notice(`Cannot choose a folder for the event note: ${target.reason}`);
		return null;
	}
	return { ...defaults, targetFolder: target.folder };
}

/** Local calendar date of a frontmatter value; date-only strings must not shift with the time zone. */
function localDate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
	const date = match
		? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
		: new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * True when `path` is the period note for its own start date in any configured period. Such a
 * note is reached through the calendar's period links, so it is not drawn as an event. Checked
 * by resolving the path forward, so no pattern has to be parsed backwards.
 */
export function isPeriodicNote(path: string, start: string, config: PeriodicConfig): boolean {
	const date = localDate(start);
	if (!date) return false;
	return PERIODIC_KINDS.some((kind) => {
		const target = periodicNoteTarget(date, kind, config);
		return target.status === "ok" && target.path === path;
	});
}
