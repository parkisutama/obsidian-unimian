// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { DependencyType, TaskDependency } from "@jaeungkim/gantt-chart";

export type DependencyValues = Partial<Record<DependencyType, unknown>>;
export type LinkResolver = (target: string) => string | null;

const TYPES: readonly DependencyType[] = ["FS", "SS", "FF", "SF"];
/** How a Depends on property is stored: a YAML list of links, or one text value of links. */
export type DependencyStorage = "list" | "text";

// Link text never contains a bracket, so a value damaged into "[[[[Note]]" still yields "[[Note]]".
const WIKILINK_ANYWHERE = /\[\[[^[\]|]+(?:\|[^[\]]+)?\]\]/g;
const WIKILINK_TARGET = /^\[\[([^[\]|]+)(?:\|[^[\]]+)?\]\]$/;

/** A link target with any stray brackets around it removed. */
export function cleanLinkTarget(target: string): string {
	return target.trim().replace(/^\[+/, "").replace(/\]+$/, "").trim();
}

/** Wraps a target once. Re-wrapping an already wrapped target is what grew "[[[[[[Note]]". */
export function wikiLinkText(target: string): string {
	return `[[${cleanLinkTarget(target)}]]`;
}

/**
 * Every link written in a stored value, one raw entry each. A list item or text value may hold
 * several links ("[[A]], [[B]]"): Bases hands a text value stored in a List-type property back as a
 * single item, so entries are split here instead of trusting the storage shape.
 */
function expand(value: unknown): string[] {
	const raws = Array.isArray(value) ? value : [value];
	return raws.flatMap((raw) => {
		if (typeof raw !== "string") return [];
		const text = raw.trim();
		if (!text) return [];
		const wikilinks = text.match(WIKILINK_ANYWHERE);
		if (wikilinks) return wikilinks;
		return text
			.split(/[\n,]/)
			.map((part) => part.trim())
			.filter(Boolean);
	});
}

function linkTarget(raw: string): string {
	return cleanLinkTarget(WIKILINK_TARGET.exec(raw.trim())?.[1] ?? raw);
}

export function toGanttWikiLink(filePath: string): string {
	return `[[${filePath.replace(/\.md$/i, "")}]]`;
}

/** `onUnresolved` hears every link that names no note, which is otherwise dropped without a trace. */
export function parseGanttDependencies(
	values: DependencyValues,
	resolve: LinkResolver,
	onUnresolved?: (target: string) => void,
): TaskDependency[] {
	const result: TaskDependency[] = [];
	const seen = new Set<string>();
	for (const type of TYPES) {
		for (const raw of expand(values[type])) {
			const target = linkTarget(raw);
			const targetId = target ? resolve(target) : null;
			if (target && !targetId) onUnresolved?.(target);
			const key = targetId ? `${type}:${targetId}` : null;
			if (!targetId || !key || seen.has(key)) continue;
			seen.add(key);
			result.push({ targetId, type });
		}
	}
	return result;
}

/**
 * Appends one link. An existing list stays a list, and a text value stays text only when the
 * property is text-typed; anything else becomes a list, because one text value holding several
 * links cannot be read back from a List-type property. A malformed multi-link item is split into
 * proper entries on the way, so the next write repairs it.
 */
export function appendGanttDependency(
	value: unknown,
	targetPath: string,
	resolve: LinkResolver,
	storage: DependencyStorage = "list",
	formatLink: (targetPath: string) => string = toGanttWikiLink,
): unknown {
	const existing = expand(value);
	if (existing.some((raw) => resolve(linkTarget(raw)) === targetPath)) return value;
	const link = formatLink(targetPath);
	if (storage === "text") {
		if (existing.length === 0) return link;
		const separator = typeof value === "string" && value.includes("\n") ? "\n" : ", ";
		return [...existing, link].join(separator);
	}
	return [...existing, link];
}

function removeFromValue(value: unknown, targetPath: string, resolve: LinkResolver): unknown {
	if (!Array.isArray(value) && typeof value !== "string") return value;
	const kept = expand(value).filter((raw) => resolve(linkTarget(raw)) !== targetPath);
	if (Array.isArray(value)) return kept;
	return kept.join(value.includes("\n") ? "\n" : ", ");
}

/** Removes one resolved dependency while preserving array, comma, or newline storage shape. */
export function removeGanttDependency(
	value: unknown,
	targetPath: string,
	resolve: LinkResolver,
): unknown {
	return removeFromValue(value, targetPath, resolve);
}

/** Removes the target pair from every dependency-type property, as required by the library. */
export function removeGanttDependencyFromAllTypes(
	values: DependencyValues,
	targetPath: string,
	resolve: LinkResolver,
): DependencyValues {
	return Object.fromEntries(
		TYPES.map((type) => [type, removeFromValue(values[type], targetPath, resolve)]),
	);
}
