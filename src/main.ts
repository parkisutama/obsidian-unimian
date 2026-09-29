// SPDX-License-Identifier: GPL-3.0-only AND MIT
// Portions adapted from Planner (https://github.com/SawyerRensel/Planner): src/main.ts
// Copyright (C) 2025 Sawyer Rensel
// Portions adapted from obsidian-bases-gantt (https://github.com/lhassa8/obsidian-bases-gantt): src/main.ts
// Copyright (c) 2026 Lars Tray. MIT License, see THIRD_PARTY_NOTICES.md
// Modifications Copyright (C) 2026 Parkis Utama

import { Plugin } from 'obsidian';
import { UnimianSettings, DEFAULT_SETTINGS } from './types/settings';
import { UnimianSettingTab } from './settings/SettingsTab';
import { ViewRegistry, type ViewDescriptor } from './viewRegistry';

import {
  BASES_SWIMLANE_VIEW_ID,
  createSwimlaneViewRegistration,
} from './views/BasesSwimlaneView';

import {
  BASES_CALENDAR_VIEW_ID,
  createCalendarViewRegistration,
} from './views/BasesCalendarView';

import {
  BASES_TIMELINE_VIEW_ID,
  createTimelineViewRegistration,
} from './views/timeline';
import {
  BASES_GANTT_VIEW_ID,
  createGanttViewRegistration,
} from './views/gantt';
import {
  BASES_STICKY_NOTE_VIEW_ID,
  createStickyNoteViewRegistration,
} from './views/sticky-note';
import { migratePath, pruneMissing } from './views/sticky-note/pinStore';

// A Grid view (adopting Dynamic Views) was attempted and removed on 2026-09-19: native testing
// surfaced repeated, hard-to-diagnose CSS Grid layout failures (oversized covers, then flattened
// cards) even after direct fixes, so the maintainer stopped guessing and removed it rather than
// ship or keep patching it blind. See docs/architecture/upstream-provenance.md's Dynamic Views
// entry for the history if this is revisited.

export default class UnimianPlugin extends Plugin {
  settings!: UnimianSettings;
  private readonly viewRegistry = new ViewRegistry();

  async onload() {
    await this.loadSettings();

    // Register Bases views, hover sources, and commands from one descriptor list.
    this.registerViewDescriptors(this.buildViewDescriptors());

    // Add settings tab
    this.addSettingTab(new UnimianSettingTab(this.app, this));

    // Sticky Note pin persistence (spec docs/specs/sticky-note.md §5.1): plugin-level, never a
    // note property. Prune stale entries once at load, then keep both sides of the mapping
    // (pinned note paths and .base file keys) in sync with renames for the rest of the session.
    const prunedStickyNote = pruneMissing(this.settings.stickyNote, (path) => this.app.vault.getAbstractFileByPath(path) !== null);
    if (prunedStickyNote !== this.settings.stickyNote) {
      this.settings.stickyNote = prunedStickyNote;
      await this.saveSettings();
    }
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      const migrated = migratePath(this.settings.stickyNote, oldPath, file.path);
      if (migrated === this.settings.stickyNote) return;
      this.settings.stickyNote = migrated;
      void this.saveSettings();
    }));
  }

  /**
   * The registry is the single source of truth for every view's id, hover attribution, and
   * commands (spec §7.3). Building it here does not instantiate any view: each `factory` is
   * only stored until Obsidian itself mounts the view.
   */
  private buildViewDescriptors(): ViewDescriptor[] {
    const swimlane = createSwimlaneViewRegistration(this);
    const calendar = createCalendarViewRegistration(this);
    const timeline = createTimelineViewRegistration(this);
    const gantt = createGanttViewRegistration(this,
      () => this.viewRegistry.mutationsFor(BASES_GANTT_VIEW_ID, this.app));
    const stickyNote = createStickyNoteViewRegistration(this);

    return [
      {
        id: BASES_SWIMLANE_VIEW_ID,
        name: swimlane.name,
        icon: swimlane.icon,
        factory: swimlane.factory,
        options: swimlane.options,
        hover: { display: 'Swimlane', defaultMod: true },
        capabilities: { legacyMutation: true },
      },
      {
        id: BASES_CALENDAR_VIEW_ID,
        name: calendar.name,
        icon: calendar.icon,
        factory: calendar.factory,
        options: calendar.options,
        hover: { display: 'Calendar', defaultMod: true },
        capabilities: { legacyMutation: true },
      },
      {
        id: BASES_TIMELINE_VIEW_ID,
        name: timeline.name,
        icon: timeline.icon,
        factory: timeline.factory,
        options: timeline.options,
        hover: { display: 'Timeline', defaultMod: true },
		capabilities: { legacyMutation: true },
      },
      {
        id: BASES_GANTT_VIEW_ID,
        name: gantt.name,
        icon: gantt.icon,
        factory: gantt.factory,
        options: gantt.options,
        hover: { display: 'Gantt', defaultMod: true },
        capabilities: { mutations: ['date', 'property', 'dependency', 'fileCreate'] },
      },
      {
        id: BASES_STICKY_NOTE_VIEW_ID,
        name: stickyNote.name,
        icon: stickyNote.icon,
        factory: stickyNote.factory,
        options: stickyNote.options,
        hover: { display: 'Sticky Note', defaultMod: true },
        // Read-only (spec docs/specs/sticky-note.md §5.3): no capabilities declared.
      },
    ];
  }

  /** Registers every descriptor's Bases view, hover source, and commands with Obsidian. */
  private registerViewDescriptors(descriptors: ViewDescriptor[]): void {
    for (const descriptor of descriptors) {
      this.viewRegistry.register(descriptor);
    }

    for (const descriptor of this.viewRegistry.list()) {
      this.registerBasesView(descriptor.id, {
        name: descriptor.name,
        icon: descriptor.icon,
        factory: descriptor.factory,
        options: descriptor.options,
      });

      if (descriptor.hover) {
        this.registerHoverLinkSource(descriptor.id, descriptor.hover);
      }

      for (const command of descriptor.commands ?? []) {
        this.addCommand(command);
      }
    }
  }

  onunload() {
    // Plugin cleanup handled automatically
  }

  async loadSettings() {
    const loadedData = await this.loadData() as (Partial<UnimianSettings> & { kanbanDefaults?: unknown; ganttDefaults?: unknown }) | null;
    // Versions before the Swimlane rename saved every Kanban default, including a forced
    // "note.status" column property. Drop that key instead of migrating it. The Frappe Gantt view's
    // "ganttDefaults" are dropped the same way: nothing reads them any more.
    const { kanbanDefaults: _legacyKanbanDefaults, ganttDefaults: _legacyGanttDefaults, ...data } = loadedData ?? {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      // Deep-merge nested objects so missing sub-keys still get defaults
      calendarDefaults: { ...DEFAULT_SETTINGS.calendarDefaults, ...(data.calendarDefaults ?? {}) },
      swimlaneDefaults: { ...DEFAULT_SETTINGS.swimlaneDefaults, ...(data.swimlaneDefaults ?? {}) },
      valueStyles: { ...DEFAULT_SETTINGS.valueStyles, ...(data.valueStyles ?? {}) },
      stickyNote: {
        ...DEFAULT_SETTINGS.stickyNote,
        ...(data.stickyNote ?? {}),
        pinnedByBase: { ...DEFAULT_SETTINGS.stickyNote.pinnedByBase, ...(data.stickyNote?.pinnedByBase ?? {}) },
      },
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

}
