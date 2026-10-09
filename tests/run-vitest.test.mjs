// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { resolveVitestCli } from "../scripts/run-vitest.mjs";

describe("resolveVitestCli", () => {
	it("resolves the vitest CLI entry from node_modules, without spawning pnpm", () => {
		const cli = resolveVitestCli();
		expect(path.isAbsolute(cli)).toBe(true);
		expect(path.basename(cli)).toBe("vitest.mjs");
		expect(existsSync(cli)).toBe(true);
	});
});
