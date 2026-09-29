// SPDX-License-Identifier: GPL-3.0-only
// Portions adapted from Planner (https://github.com/SawyerRensel/Planner): src/settings/SettingsTab.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import { App, PluginSettingTab, Setting } from 'obsidian';
import type UnimianPlugin from '../main';
import { UnimianSettings } from '../types/settings';

/**
 * Tab configuration
 */
interface TabConfig {
  id: string;
  label: string;
  render: (container: HTMLElement) => void;
}

export class UnimianSettingTab extends PluginSettingTab {
  plugin: UnimianPlugin;
  private activeTab = 'general';
  private tabContents: Map<string, HTMLElement> = new Map();
  private tabButtons: Map<string, HTMLElement> = new Map();

  constructor(app: App, plugin: UnimianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private getTabs(): TabConfig[] {
    return [
      { id: 'general', label: 'General', render: (c) => this.renderGeneralTab(c) },
      { id: 'gantt', label: 'Gantt', render: (c) => this.renderGanttTab(c) },
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.tabContents.clear();
    this.tabButtons.clear();

    const tabs = this.getTabs();

    // Create tab navigation
    const tabNav = containerEl.createDiv({ cls: 'planner-settings-tabs' });
    for (const tab of tabs) {
      const btn = tabNav.createEl('button', {
        text: tab.label,
        cls: 'planner-settings-tab',
      });
      if (tab.id === this.activeTab) {
        btn.addClass('is-active');
      }
      btn.addEventListener('click', () => this.switchTab(tab.id));
      this.tabButtons.set(tab.id, btn);
    }

    // Create tab content containers
    const tabContentsEl = containerEl.createDiv({ cls: 'planner-settings-tab-contents' });
    for (const tab of tabs) {
      const content = tabContentsEl.createDiv({ cls: 'planner-settings-tab-content' });
      if (tab.id === this.activeTab) {
        content.addClass('is-active');
        tab.render(content);
      }
      this.tabContents.set(tab.id, content);
    }
  }

  private switchTab(tabId: string): void {
    if (tabId === this.activeTab) return;

    const tabs = this.getTabs();

    // Update button states
    for (const [id, btn] of this.tabButtons) {
      btn.toggleClass('is-active', id === tabId);
    }

    // Update content visibility
    for (const [id, content] of this.tabContents) {
      const isActive = id === tabId;
      content.toggleClass('is-active', isActive);

      // Lazy render: only render content on first access
      if (isActive && content.children.length === 0) {
        const tab = tabs.find(t => t.id === id);
        if (tab) {
          tab.render(content);
        }
      }
    }

    this.activeTab = tabId;
  }

  private renderGeneralTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Clicking a card').setHeading();

    new Setting(containerEl)
      .setName('Open notes in a quick preview')
      .setDesc(
        'Clicking a card or item opens the note for editing in a popup (with a read-only ' +
        'preview as a fallback), plus its backlinks, instead of a workspace pane. Ctrl/Cmd-click ' +
        '(or any other pane-opening modifier) always opens the file directly, popup or not.'
      )
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.openNotesInPreview)
        .onChange(async (value) => {
          this.plugin.settings.openNotesInPreview = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName('Calendar view defaults').setHeading();

    new Setting(containerEl)
      .setName('Week starts on')
      .setDesc('First day of the week in the calendar')
      .addDropdown(dropdown => dropdown
        .addOption('monday', 'Monday')
        .addOption('tuesday', 'Tuesday')
        .addOption('wednesday', 'Wednesday')
        .addOption('thursday', 'Thursday')
        .addOption('friday', 'Friday')
        .addOption('saturday', 'Saturday')
        .addOption('sunday', 'Sunday')
        .setValue(this.plugin.settings.calendarDefaults.weekStartsOn)
        .onChange(async (value) => {
          this.plugin.settings.calendarDefaults.weekStartsOn = value as UnimianSettings['calendarDefaults']['weekStartsOn'];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Font size')
      .setDesc(`Font size for calendar events (${this.plugin.settings.calendarDefaults.fontSize}px)`)
      .addSlider(slider => slider
        .setLimits(6, 18, 1)
        .setValue(this.plugin.settings.calendarDefaults.fontSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.calendarDefaults.fontSize = value;
          await this.plugin.saveSettings();
          this.refreshCurrentTab();
        }));
  }

  private renderGanttTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Color configuration').setHeading();
    new Setting(containerEl).setDesc(
      'Bar colors for the Gantt view follow the same value styles as other views. ' +
      'Configure per-value colors in your data.json under "valueStyles", or install ' +
      'the Pretty Properties plugin to assign colors directly in your notes.'
    );
  }

  private refreshCurrentTab(): void {
    const content = this.tabContents.get(this.activeTab);
    if (content) {
      content.empty();
      const tabs = this.getTabs();
      const tab = tabs.find(t => t.id === this.activeTab);
      if (tab) {
        tab.render(content);
      }
    }
  }

}
