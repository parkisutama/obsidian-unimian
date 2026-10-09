// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesAllOptions, BasesPropertyId } from "obsidian";
import type { ViewConfigReader } from "../../platform/bases/ViewConfigReader";
import { DEFAULT_EXCERPT_BUDGET } from "./content";
import { DEFAULT_TARGET_CARD_WIDTH } from "./masonry";

export const IMAGE_FITS = ["cover", "contain"] as const;
export type ImageFit = (typeof IMAGE_FITS)[number];

export const DEFAULT_CARD_MAX_HEIGHT = 480;

export interface StickyNoteOptions {
	titleProperty: BasesPropertyId | null;
	coverProperty: BasesPropertyId | null;
	colorProperty: BasesPropertyId | null;
	imageFit: ImageFit;
	cardWidth: number;
	cardMaxHeight: number;
	excerptBudget: number;
}

/** Reads only explicit Bases view options; no workflow property is guessed or defaulted. */
export function readStickyNoteOptions(config: ViewConfigReader): StickyNoteOptions {
	return {
		titleProperty: config.getPropertyId("titleBy"),
		coverProperty: config.getPropertyId("coverBy"),
		colorProperty: config.getPropertyId("colorBy"),
		imageFit: config.getEnum("imageFit", IMAGE_FITS, "cover"),
		cardWidth: config.getNumber("cardWidth", DEFAULT_TARGET_CARD_WIDTH),
		cardMaxHeight: config.getNumber("cardMaxHeight", DEFAULT_CARD_MAX_HEIGHT),
		excerptBudget: config.getNumber("excerptBudget", DEFAULT_EXCERPT_BUDGET),
	};
}

/** CSS-only keys (spec: viewOptionTypes.ts's data/css split) — changing these never needs a re-fetch of entry data. */
export const STICKY_NOTE_CSS_ONLY_KEYS = ["imageFit", "cardWidth", "cardMaxHeight"] as const;

export function getStickyNoteViewOptions(): BasesAllOptions[] {
	return [
		{
			type: "group",
			displayName: "Properties",
			items: [
				{ type: "property", key: "titleBy", displayName: "Card title", placeholder: "File name" },
				{
					type: "property",
					key: "coverBy",
					displayName: "Cover image property",
					placeholder: "No cover",
				},
				{
					type: "property",
					key: "colorBy",
					displayName: "Color property",
					placeholder: "No category color",
				},
			],
		},
		{
			type: "group",
			displayName: "Layout",
			items: [
				{
					type: "dropdown",
					key: "imageFit",
					displayName: "Cover image fit",
					default: "cover",
					options: { cover: "Crop to fill (cover)", contain: "Fit within (contain)" },
				},
				{
					type: "slider",
					key: "cardWidth",
					displayName: "Card width (px)",
					default: DEFAULT_TARGET_CARD_WIDTH,
					min: 160,
					max: 420,
					step: 10,
				},
				{
					type: "slider",
					key: "cardMaxHeight",
					displayName: "Card preview max height (px)",
					default: DEFAULT_CARD_MAX_HEIGHT,
					min: 200,
					max: 900,
					step: 20,
				},
				{
					type: "slider",
					key: "excerptBudget",
					displayName: "Excerpt length (characters)",
					default: DEFAULT_EXCERPT_BUDGET,
					min: 200,
					max: 2000,
					step: 100,
				},
			],
		},
	];
}
