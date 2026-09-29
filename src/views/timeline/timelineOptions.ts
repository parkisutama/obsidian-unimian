// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesPropertyId } from 'obsidian';
import type { ViewConfigReader } from '../../platform/bases/ViewConfigReader';
import type { TimelineZoom } from '../../core/temporal/TimelineScale';

export interface TimelineOptions {
	startProperty: BasesPropertyId | null;
	endProperty: BasesPropertyId | null;
	titleProperty: BasesPropertyId | null;
	colorProperty: BasesPropertyId | null;
	wrapTitles: boolean;
	zoom: TimelineZoom;
}

export const TIMELINE_ZOOMS: readonly TimelineZoom[] = ['day', 'week', 'biweek', 'month', 'quarter', 'year', 'fiveyear'];

function compatibleProperty(config: ViewConfigReader, key: string, legacyKey: string): BasesPropertyId | null {
	return config.getPropertyId(key) ?? config.getPropertyId(legacyKey);
}

/** Reads only explicit Bases view options; no workflow property is guessed or defaulted. */
export function readTimelineOptions(config: ViewConfigReader): TimelineOptions {
	return {
		// `start`/`end` are the upstream Timeline keys. Keep the early Unimian
		// `startDate`/`endDate` keys readable so existing Bases do not break.
		startProperty: compatibleProperty(config, 'start', 'startDate'),
		endProperty: compatibleProperty(config, 'end', 'endDate'),
		titleProperty: config.getPropertyId('titleBy'),
		colorProperty: config.getPropertyId('colorBy'),
		wrapTitles: config.getBoolean('wrapTitles', false),
		zoom: config.getEnum('zoom', TIMELINE_ZOOMS, 'month'),
	};
}

export function timelineRequestedProperties(options: TimelineOptions): BasesPropertyId[] {
	return [...new Set([
		options.startProperty,
		options.endProperty,
		options.titleProperty,
		options.colorProperty,
	].filter((property): property is BasesPropertyId => property != null))];
}
