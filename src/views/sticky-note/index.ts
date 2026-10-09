// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesViewRegistration, QueryController } from "obsidian";
import type UnimianPlugin from "../../main";
import { BASES_STICKY_NOTE_VIEW_ID, BasesStickyNoteView } from "./BasesStickyNoteView";
import { getStickyNoteViewOptions } from "./options";

export { BASES_STICKY_NOTE_VIEW_ID, BasesStickyNoteView } from "./BasesStickyNoteView";

export function createStickyNoteViewRegistration(plugin: UnimianPlugin): BasesViewRegistration {
	return {
		name: "Sticky Note",
		icon: "sticky-note",
		factory: (controller: QueryController, containerEl: HTMLElement) =>
			new BasesStickyNoteView(controller, containerEl, plugin),
		options: () => getStickyNoteViewOptions(),
	};
}
