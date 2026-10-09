// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { NormalizedValue } from "./NormalizedValue";

/**
 * Renders any `NormalizedValue` as a single display string, or `null` for a missing/empty
 * result. Shared by any consumer that needs a plain-text rendering of a normalized value
 * (Timeline's title/group/color mapping, Card Core's title/subtitle/tag/property mapping) so
 * the same value always displays the same way everywhere.
 */
export function valueText(value: NormalizedValue | undefined): string | null {
	if (!value || value.kind === "missing") return null;
	switch (value.kind) {
		case "text":
		case "date":
			return value.value;
		case "number":
		case "boolean":
			return String(value.value);
		case "link":
			return value.display || value.target;
		case "file":
			return value.path;
		case "list": {
			const text = value.items
				.map(valueText)
				.filter((item): item is string => item != null)
				.join(", ");
			return text || null;
		}
		case "unsupported":
			return value.raw == null ? null : String(value.raw);
	}
}
