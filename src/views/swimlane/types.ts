// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesSwimlaneView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

export type BorderStyle = "none" | "left-accent" | "full-border";
export type CoverDisplay = "none" | "banner" | "thumbnail-left" | "thumbnail-right" | "background";
export type BadgePlacement = "inline" | "properties-section";
export type FreezeHeaders = "off" | "columns" | "swimlanes" | "both";
export type SwimHeaderDisplay = "horizontal" | "vertical";

/** Virtual scrolling kicks in when a column has this many cards or more. */
export const VIRTUAL_SCROLL_THRESHOLD = 15;
