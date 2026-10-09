// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Path of the vitest CLI entry. Tests run it with the current Node binary instead of spawning
 * `pnpm`: on Windows pnpm is a .cmd shim, which spawnSync cannot start without a shell.
 */
export function resolveVitestCli() {
	const require = createRequire(import.meta.url);
	return path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	const tempDir =
		process.env.VITEST_TMPDIR ??
		(existsSync("/tmp") ? "/tmp" : (process.env.TEMP ?? process.env.TMP ?? os.tmpdir()));

	const result = spawnSync(
		process.execPath,
		[resolveVitestCli(), "run", ...process.argv.slice(2)],
		{
			stdio: "inherit",
			env: {
				...process.env,
				TMPDIR: tempDir,
				TEMP: tempDir,
				TMP: tempDir,
			},
		},
	);

	if (result.error) {
		console.error(`Failed to start vitest: ${result.error.message}`);
	}
	process.exit(result.status ?? 1);
}
