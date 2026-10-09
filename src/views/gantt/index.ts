// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesViewRegistration, QueryController } from "obsidian";
import type UnimianPlugin from "../../main";
import type { GrantedMutations } from "../../platform/mutations/grants";
import { BASES_GANTT_VIEW_ID, BasesGanttView } from "./BasesGanttView";
import { getGanttViewOptions } from "./options";

export { BASES_GANTT_VIEW_ID, BasesGanttView } from "./BasesGanttView";

export function createGanttViewRegistration(
	plugin: UnimianPlugin,
	mutationsFor: () => GrantedMutations = () => ({}),
): BasesViewRegistration {
	return {
		name: "Gantt",
		icon: "gantt-chart-square",
		factory: (controller: QueryController, containerEl: HTMLElement) =>
			new BasesGanttView(controller, containerEl, plugin, undefined, mutationsFor()),
		options: (config) => getGanttViewOptions(config),
	};
}
