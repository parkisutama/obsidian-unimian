// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesAllOptions, TFile } from 'obsidian';
import { PERIODIC_KINDS, periodicKeys, WEEK_NUMBERING_KEY } from './config';
import type { PeriodicKind } from './resolver';

const GROUPS: Record<PeriodicKind, { name: string; placeholder: string }> = {
  day: { name: 'Daily notes', placeholder: 'timeline/YYYY/YYYY-MM/YYYY-MM-DD' },
  week: { name: 'Weekly notes', placeholder: 'timeline/GGGG/GGGG-[W]WW' },
  month: { name: 'Monthly notes', placeholder: 'timeline/YYYY/YYYY-MM' },
  quarter: { name: 'Quarterly notes', placeholder: 'timeline/YYYY/YYYY-[Q]Q' },
  year: { name: 'Yearly notes', placeholder: 'timeline/YYYY' },
};

/**
 * One option group per period. A period with an empty path pattern is not configured and gets no
 * links. The template is created through Templater or core Templates; Unimian never substitutes
 * tokens in it.
 */
export function createPeriodicOptions(): BasesAllOptions[] {
  return PERIODIC_KINDS.map((kind): BasesAllOptions => {
    const keys = periodicKeys(kind);
    const items: Extract<BasesAllOptions, { type: 'group' }>['items'] = [
      {
        type: 'text',
        key: keys.path,
        displayName: 'Path pattern',
        default: '',
        placeholder: `Example: ${GROUPS[kind].placeholder}`,
      },
      {
        type: 'file',
        key: keys.template,
        displayName: 'Template note',
        default: '',
        placeholder: `Templates/${GROUPS[kind].name}.md`,
        filter: (file: TFile) => file.extension === 'md',
      },
    ];
    if (kind === 'week') {
      items.push({
        type: 'dropdown',
        key: WEEK_NUMBERING_KEY,
        displayName: 'Week numbering',
        default: 'iso',
        options: {
          iso: 'ISO 8601 (Monday, week 1 holds 4 January)',
          locale: 'Follow "Week starts on"',
        },
      });
    }
    return { type: 'group', displayName: GROUPS[kind].name, items };
  });
}
