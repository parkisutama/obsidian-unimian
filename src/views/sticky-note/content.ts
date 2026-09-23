// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Bounded card-content model (spec docs/specs/sticky-note.md §5.4).
 *
 * Design evidence, no code copied (see docs/architecture/upstream-provenance.md):
 * `rknastenka/obsidian-mini-notes` truncates raw text to a character budget, breaking at the
 * last newline before the limit, *before* handing it to `MarkdownRenderer` — so only the
 * excerpt is ever parsed, not the whole note. `k4fn/keep-bases-view` special-cases `.base`
 * entries instead of dumping their raw YAML as if it were prose.
 */

export const DEFAULT_EXCERPT_BUDGET = 800;

const FRONTMATTER_BLOCK = /^---\n[\s\S]*?\n---\n?/;
const LEADING_H1 = /^#\s+(.+?)\s*\n+/;
const WIKILINK_EMBED = /!\[\[([^\]]+)\]\]\n?/g;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)\n?/g;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|bmp)(\|[^\]]*)?$/i;

/**
 * Extensions whose raw file content is actual prose, safe to read via `cachedRead()` and
 * excerpt. Everything else — `.base`/`.canvas` (spec §5.4.2), and critically any binary format
 * (`.png`/`.jpg`/`.pdf`/etc.) — must render as a real embed instead: reading an image file's
 * raw bytes as text and handing them to `MarkdownRenderer` produces garbled binary-as-text
 * (confirmed in native testing, 2026-09-23 — a Base whose query matched image files showed raw
 * PNG chunk data as card content). A positive list is deliberately safer here than an
 * ever-growing negative list of "extensions known to be binary".
 */
export const TEXT_EXCERPT_EXTENSIONS = new Set(['md', 'markdown', 'txt']);

export function isTextExcerptExtension(extension: string): boolean {
	return TEXT_EXCERPT_EXTENSIONS.has(extension.toLowerCase());
}

export function stripFrontmatter(raw: string): string {
	return raw.replace(FRONTMATTER_BLOCK, '');
}

/**
 * Removes inline image embeds from excerpt text (spec §5.4.5): a random note image should not
 * bloat a compact card the way a dominant portrait image did in native testing. The one
 * deliberate way to show an image on a card is the `Cover image property` option, resolved
 * separately via `CoverImageResolver` — inline images stay out of the excerpt regardless of
 * whether a cover is configured, so there is never a duplicate.
 */
export function stripInlineImages(text: string): string {
	let result = text.replace(MARKDOWN_IMAGE, '');
	result = result.replace(WIKILINK_EMBED, (match, target: string) => (IMAGE_EXTENSION.test(target.trim()) ? '' : match));
	return result;
}

/** Truncates at `budget` characters, backing off to the last newline so Markdown isn't sheared mid-line. */
export function truncateExcerpt(text: string, budget: number = DEFAULT_EXCERPT_BUDGET): string {
	if (text.length <= budget) return text;
	const truncated = text.slice(0, budget);
	const lastNewline = truncated.lastIndexOf('\n');
	return lastNewline > budget * 0.7 ? truncated.slice(0, lastNewline) : truncated;
}

/** Drops a leading H1 whose text exactly matches `title` — the card's own title already shows it once. */
export function dedupeLeadingTitle(text: string, title: string): string {
	const match = LEADING_H1.exec(text);
	if (!match) return text;
	return match[1]!.trim() === title.trim() ? text.slice(match[0].length) : text;
}

/** Builds the bounded excerpt a card body should render: frontmatter-stripped, title-deduped, image-stripped, truncated. */
export function buildCardExcerpt(rawContent: string, title: string, budget: number = DEFAULT_EXCERPT_BUDGET): string {
	const withoutFrontmatter = stripFrontmatter(rawContent);
	const deduped = dedupeLeadingTitle(withoutFrontmatter, title);
	const withoutImages = stripInlineImages(deduped);
	return truncateExcerpt(withoutImages, budget);
}
