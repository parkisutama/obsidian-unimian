// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Pure periodic-note path resolution (docs/specs/periodic-notes.md). No `obsidian` import.
 *
 * A pattern is one string, folder and file name together, split by `/`, using moment-style tokens
 * and `[...]` literals, e.g. `timeline/YYYY/YYYY-MM/YYYY-MM-DD`. ISO 8601 is the default:
 * `GGGG`/`WW` are always ISO (Monday start, week one holds 4 January); `gggg`/`ww` follow the
 * `week` option (first weekday and the number of days a week needs in a year to belong to it).
 */

export type PeriodicKind = "day" | "week" | "month" | "quarter" | "year";

export interface WeekRule {
	/** First weekday, 0 = Sunday .. 6 = Saturday. */
	firstDay: number;
	/** Days of a year a week needs to be that year's week 1 (ISO = 4, US = 1). */
	minDays: number;
}

export const ISO_WEEK: WeekRule = { firstDay: 1, minDays: 4 };

export type PeriodicPathResult =
	| { ok: true; path: string; folder: string; name: string }
	| { ok: false; reason: string };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const DAY_MS = 86_400_000;

/** Local calendar date as a UTC timestamp, so arithmetic is immune to DST. */
const utc = (date: Date): number => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

interface WeekInfo {
	year: number;
	week: number;
}

/** The week's year and number: a week belongs to the year that holds its `7 - minDays` offset day. */
export function weekInfo(date: Date, rule: WeekRule): WeekInfo {
	const day = utc(date);
	const weekday = new Date(day).getUTCDay();
	const weekStart = day - ((weekday - rule.firstDay + 7) % 7) * DAY_MS;
	const anchor = new Date(weekStart + (7 - rule.minDays) * DAY_MS);
	const year = anchor.getUTCFullYear();
	const ordinal = Math.round((anchor.getTime() - Date.UTC(year, 0, 1)) / DAY_MS) + 1;
	return { year, week: Math.floor((ordinal - 1) / 7) + 1 };
}

/** First day of the period containing `date`, as a local date. */
export function periodStart(date: Date, kind: PeriodicKind, rule: WeekRule = ISO_WEEK): Date {
	const y = date.getFullYear();
	const m = date.getMonth();
	switch (kind) {
		case "day":
			return new Date(y, m, date.getDate());
		case "week":
			return new Date(y, m, date.getDate() - ((date.getDay() - rule.firstDay + 7) % 7));
		case "month":
			return new Date(y, m, 1);
		case "quarter":
			return new Date(y, m - (m % 3), 1);
		case "year":
			return new Date(y, 0, 1);
	}
}

/** Tokens, longest first so `YYYY` is never read as `YY` + `YY`. */
const TOKENS = [
	"YYYY",
	"GGGG",
	"gggg",
	"MMMM",
	"dddd",
	"MMM",
	"ddd",
	"YY",
	"MM",
	"DD",
	"WW",
	"ww",
	"M",
	"D",
	"Q",
	"W",
	"w",
];

function tokenValue(token: string, date: Date, rule: WeekRule): string {
	switch (token) {
		case "YYYY":
			return pad(date.getFullYear(), 4);
		case "YY":
			return pad(date.getFullYear() % 100);
		case "MMMM":
			return MONTHS[date.getMonth()] ?? "";
		case "MMM":
			return (MONTHS[date.getMonth()] ?? "").slice(0, 3);
		case "MM":
			return pad(date.getMonth() + 1);
		case "M":
			return String(date.getMonth() + 1);
		case "DD":
			return pad(date.getDate());
		case "D":
			return String(date.getDate());
		case "dddd":
			return WEEKDAYS[date.getDay()] ?? "";
		case "ddd":
			return (WEEKDAYS[date.getDay()] ?? "").slice(0, 3);
		case "Q":
			return String(Math.floor(date.getMonth() / 3) + 1);
		case "GGGG":
			return pad(weekInfo(date, ISO_WEEK).year, 4);
		case "WW":
			return pad(weekInfo(date, ISO_WEEK).week);
		case "W":
			return String(weekInfo(date, ISO_WEEK).week);
		case "gggg":
			return pad(weekInfo(date, rule).year, 4);
		case "ww":
			return pad(weekInfo(date, rule).week);
		case "w":
			return String(weekInfo(date, rule).week);
		default:
			return token;
	}
}

/** Substitutes tokens in `pattern`; `[text]` is copied literally, anything else passes through. */
export function formatPeriodicTokens(
	pattern: string,
	date: Date,
	rule: WeekRule = ISO_WEEK,
): string {
	let out = "";
	let previousWasToken = false;
	for (let i = 0; i < pattern.length; ) {
		if (pattern[i] === "[") {
			const close = pattern.indexOf("]", i + 1);
			if (close !== -1) {
				out += pattern.slice(i + 1, close);
				i = close + 1;
				previousWasToken = false;
				continue;
			}
		}
		const token = TOKENS.find((candidate) => pattern.startsWith(candidate, i));
		if (token) {
			const previous = pattern[i - 1];
			const nextIndex = i + token.length;
			const next = pattern[nextIndex];
			const previousIsLetter = previous !== undefined && /\p{L}/u.test(previous);
			const nextIsLetter = next !== undefined && /\p{L}/u.test(next);
			const nextStartsToken =
				next !== undefined && TOKENS.some((candidate) => pattern.startsWith(candidate, nextIndex));
			if ((previousWasToken || !previousIsLetter) && (!nextIsLetter || nextStartsToken)) {
				out += tokenValue(token, date, rule);
				i = nextIndex;
				previousWasToken = true;
				continue;
			}
		}
		out += pattern[i];
		i += 1;
		previousWasToken = false;
	}
	return out;
}

const FORBIDDEN_CHARACTERS = /[\\:*?"<>|]/;

/**
 * Resolves the vault path of the note for `date` in `kind`'s period. The path is built from the
 * date given, so future dates without a note resolve like any other. Unsafe results (empty or
 * `..` segments, absolute paths, characters Obsidian rejects) are refused, never created.
 */
export function resolvePeriodicPath(
	date: Date,
	pattern: string,
	rule: WeekRule = ISO_WEEK,
): PeriodicPathResult {
	if (!pattern.trim()) return { ok: false, reason: "The path pattern is empty." };

	const formatted = formatPeriodicTokens(pattern.trim(), date, rule);
	if (formatted.startsWith("/"))
		return { ok: false, reason: "The path must be relative to the vault root." };
	if (FORBIDDEN_CHARACTERS.test(formatted)) {
		return { ok: false, reason: "The path contains a character Obsidian does not allow." };
	}

	const segments = formatted.split("/");
	if (segments.some((segment) => segment.trim() === "" || segment === "." || segment === "..")) {
		return { ok: false, reason: 'The path has an empty, "." or ".." segment.' };
	}

	const name = segments[segments.length - 1] ?? "";
	const folder = segments.slice(0, -1).join("/");
	return { ok: true, path: `${folder ? `${folder}/` : ""}${name}.md`, folder, name };
}
