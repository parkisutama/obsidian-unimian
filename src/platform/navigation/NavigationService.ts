// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Shared navigation and hover service (T021, spec §7.9).
 *
 * Consolidates open/modifier-key behavior, Page Preview hover dispatch, and keyboard
 * activation into one place using registry source metadata, instead of each view reaching
 * into `app.workspace` with its own copy. Context-menu destinations already live in
 * `src/utils/openFile.ts`, which already opens the menu on the triggering event's own owning
 * document (popout-safe) — this module does not duplicate that, only the pieces that were
 * previously duplicated per view.
 */

import { Keymap, type App, type Component, type PaneType, type UserEvent } from 'obsidian';
import { QuickPreviewModal, type OpenFull } from '../preview/QuickPreviewModal';
import type { WiseViewSettings } from '../../types/settings';

export type OpenDestination = 'active' | PaneType;

/**
 * Resolves the same destination for a mouse or keyboard activation, since `UserEvent` already
 * covers both. Delegates to Obsidian's own `Keymap.isModEvent`, the documented convention
 * (Cmd/Ctrl → tab, Cmd/Ctrl+Alt → split, Cmd/Ctrl+Alt+Shift → window, middle-click → tab) — this
 * service does not invent its own keybinding scheme.
 */
export function resolveOpenDestination(event?: UserEvent | null): OpenDestination {
	const result = Keymap.isModEvent(event);
	return result === 'tab' || result === 'split' || result === 'window' ? result : 'active';
}

/** Opens `path`, choosing the pane from `event`'s modifiers (or the active pane with no event). */
export function openPath(app: App, path: string, event?: UserEvent | null): void {
	const destination = resolveOpenDestination(event);
	void app.workspace.openLinkText(path, '', destination === 'active' ? false : destination);
}

export interface HoverPreviewOptions {
	app: App;
	/** The Component (usually the plugin) Obsidian ties the preview's lifetime to. */
	hoverParent: Component;
	/** The registered hover source id — must match the view's `ViewDescriptor.id`. */
	sourceId: string;
	event: MouseEvent;
	filePath: string;
	targetEl: HTMLElement;
	sourcePath?: string;
}

/** Dispatches a `hover-link` event carrying the correct registered source id and target. */
export function triggerHoverPreview(options: HoverPreviewOptions): void {
	options.app.workspace.trigger('hover-link', {
		event: options.event,
		source: options.sourceId,
		hoverParent: options.hoverParent,
		targetEl: options.targetEl,
		linktext: options.filePath,
		sourcePath: options.sourcePath ?? '/',
	});
}

/** True for the keys that should activate a focused, keyboard-reachable card/row: Enter or Space. */
export function isActivationKey(event: KeyboardEvent): boolean {
	return event.key === 'Enter' || event.key === ' ';
}

export interface ActivateEntryOptions {
	app: App;
	settings: WiseViewSettings;
	path: string;
	event?: UserEvent | null;
	/** Falls back to the view's own pane-opening logic when the popup is skipped or dismissed. */
	openFull: OpenFull;
}

/**
 * Single decision point for card/item clicks across every view: a pane-destination modifier
 * (Ctrl/Cmd for a new tab, etc.) always means "open the file", same as before this existed.
 * Otherwise, when the user has quick preview enabled, open the read-only popup instead of
 * jumping straight into a workspace pane.
 */
export function activateEntry(options: ActivateEntryOptions): void {
	const { app, settings, path, event, openFull } = options;

	if (resolveOpenDestination(event) !== 'active') {
		openFull(path, event);
		return;
	}

	if (settings.openNotesInPreview) {
		new QuickPreviewModal(app, path, openFull).open();
		return;
	}

	openFull(path, event);
}
