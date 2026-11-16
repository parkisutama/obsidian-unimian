// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function assertSafeFrontmatterKey(key: string): string {
	if (DANGEROUS_KEYS.has(key)) throw new Error(`Frontmatter property key "${key}" is not allowed.`);
	return key;
}

export function assertSafeFrontmatterKeys(
	values: Readonly<Record<string, unknown>> | undefined,
): void {
	for (const key of Object.keys(values ?? {})) assertSafeFrontmatterKey(key);
}
