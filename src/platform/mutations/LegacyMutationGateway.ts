// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Legacy mutation gateway (T023, spec §7.10).
 *
 * The one place direct `vault`/`fileManager` write APIs are called on behalf of existing views.
 * Resolves a `TFile` from a path for the duration of one call only — never stores one. Rejects
 * a write to a `formula.*` property id up front, before touching the vault, since a formula
 * property has no frontmatter field to write to.
 */

import { type App, stringifyYaml, TFile } from "obsidian";
import { assertInsideVault } from "../../core/paths/vaultPath";
import { createNoteFromTemplate, detectTemplateEngine } from "../../services/templateEngine";
import type {
	DateMutationCapability,
	DependencyMutationCapability,
	FileCreateCapability,
	MoveMutationCapability,
	MoveMutationResult,
	MutationResult,
	NoteCreationRequest,
	PropertyMutationCapability,
	TrashCapability,
} from "./types";

function isFormulaProperty(propertyId: string): boolean {
	return propertyId.startsWith("formula.");
}

/** The frontmatter key for a `note.status`/`file.status`-shaped property id. */
function propertyName(propertyId: string): string {
	const dot = propertyId.indexOf(".");
	return dot >= 0 ? propertyId.slice(dot + 1) : propertyId;
}

function errorResult(error: unknown): MutationResult {
	return {
		ok: false,
		reason: "error",
		message: error instanceof Error ? error.message : String(error),
	};
}

export class LegacyMutationGateway
	implements
		DateMutationCapability,
		PropertyMutationCapability,
		DependencyMutationCapability,
		FileCreateCapability,
		TrashCapability,
		MoveMutationCapability
{
	constructor(private readonly app: App) {}

	private resolveFile(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	async setProperty(path: string, propertyId: string, value: unknown): Promise<MutationResult> {
		if (isFormulaProperty(propertyId)) {
			return {
				ok: false,
				reason: "formula-property",
				message: `"${propertyId}" is a formula property and cannot be written.`,
			};
		}
		const file = this.resolveFile(path);
		if (!file) return { ok: false, reason: "file-not-found", message: `No file at "${path}".` };

		try {
			const name = propertyName(propertyId);
			await this.app.fileManager.processFrontMatter(
				file,
				(frontmatter: Record<string, unknown>) => {
					frontmatter[name] = value;
				},
			);
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				reason: "error",
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async setProperties(
		path: string,
		values: Readonly<Record<string, unknown>>,
	): Promise<MutationResult> {
		if (Object.keys(values).some(isFormulaProperty)) {
			return {
				ok: false,
				reason: "formula-property",
				message: "Formula properties cannot be written.",
			};
		}
		const file = this.resolveFile(path);
		if (!file) return { ok: false, reason: "file-not-found", message: `No file at "${path}".` };
		try {
			await this.app.fileManager.processFrontMatter(
				file,
				(frontmatter: Record<string, unknown>) => {
					for (const [propertyId, value] of Object.entries(values)) {
						frontmatter[propertyName(propertyId)] = value;
					}
				},
			);
			return { ok: true };
		} catch (error) {
			return errorResult(error);
		}
	}

	async updateRange(
		path: string,
		startPropertyId: string,
		start: string,
		endPropertyId?: string | null,
		end?: string | null,
	): Promise<MutationResult> {
		if (isFormulaProperty(startPropertyId) || (endPropertyId && isFormulaProperty(endPropertyId))) {
			return {
				ok: false,
				reason: "formula-property",
				message: "Date range properties cannot be formulas.",
			};
		}
		const file = this.resolveFile(path);
		if (!file) return { ok: false, reason: "file-not-found", message: `No file at "${path}".` };

		try {
			await this.app.fileManager.processFrontMatter(
				file,
				(frontmatter: Record<string, unknown>) => {
					frontmatter[propertyName(startPropertyId)] = start;
					if (endPropertyId && end != null) {
						frontmatter[propertyName(endPropertyId)] = end;
					}
				},
			);
			return { ok: true };
		} catch (error) {
			return errorResult(error);
		}
	}

	async setDependencies(
		path: string,
		propertyId: string,
		dependencies: unknown,
	): Promise<MutationResult> {
		return this.setProperty(path, propertyId, dependencies);
	}

	async moveToFolder(path: string, targetFolder: string): Promise<MoveMutationResult> {
		const file = this.resolveFile(path);
		if (!file) return { ok: false, reason: "file-not-found", message: `No file at "${path}".` };
		try {
			assertInsideVault(targetFolder);
			if (targetFolder && !this.app.vault.getAbstractFileByPath(targetFolder)) {
				await this.app.vault.createFolder(targetFolder);
			}
			if ((file.parent?.path ?? "") === targetFolder) return { ok: true, path };
			const prefix = targetFolder ? `${targetFolder}/` : "";
			let nextPath = `${prefix}${file.name}`;
			let counter = 1;
			while (this.app.vault.getAbstractFileByPath(nextPath) && nextPath !== path && counter < 100) {
				nextPath = `${prefix}${file.basename} ${counter}.${file.extension}`;
				counter++;
			}
			if (nextPath !== path) await this.app.fileManager.renameFile(file, nextPath);
			return { ok: true, path: nextPath };
		} catch (error) {
			return {
				ok: false,
				reason: "error",
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async trash(path: string): Promise<MutationResult> {
		const file = this.resolveFile(path);
		if (!file) return { ok: false, reason: "file-not-found", message: `No file at "${path}".` };

		try {
			await this.app.fileManager.trashFile(file);
			return { ok: true };
		} catch (error) {
			return errorResult(error);
		}
	}

	async createNote(request: NoteCreationRequest): Promise<MutationResult> {
		try {
			assertInsideVault(request.path);
			const template = request.templatePath ? this.resolveFile(request.templatePath) : null;
			const engine = detectTemplateEngine(this.app);
			if (template && engine !== "plain") {
				await createNoteFromTemplate(this.app, engine, {
					template,
					path: request.path,
					frontmatter: request.frontmatter,
				});
				return { ok: true };
			}
			const folder = request.path.includes("/")
				? request.path.slice(0, request.path.lastIndexOf("/"))
				: "";
			if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
				await this.app.vault.createFolder(folder);
			}
			// Obsidian's own serializer quotes and escapes property names and values; building the
			// YAML by hand let a name containing `:` or a line break corrupt the block.
			const yaml =
				request.frontmatter && Object.keys(request.frontmatter).length > 0
					? stringifyYaml(request.frontmatter).trimEnd()
					: "";
			const frontmatterBlock = yaml ? `---\n${yaml}\n---\n` : "";
			await this.app.vault.create(request.path, `${frontmatterBlock}${request.body ?? ""}`);
			return { ok: true };
		} catch (error) {
			return errorResult(error);
		}
	}
}
