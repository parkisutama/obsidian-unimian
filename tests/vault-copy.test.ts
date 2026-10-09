// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	BUILD_ARTIFACTS,
	copyToVault,
	deployToVault,
	readVaultPluginPath,
	runDeploy,
} from "../scripts/vault-copy.mjs";

const PLUGIN_ID = "unimian";
let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), "unimian-vault-"));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function writeDist(skip: string[] = []): string {
	const distDir = path.join(workDir, "dist");
	mkdirSync(distDir, { recursive: true });
	for (const name of BUILD_ARTIFACTS) {
		if (!skip.includes(name)) writeFileSync(path.join(distDir, name), "built");
	}
	writeFileSync(path.join(workDir, "manifest.json"), JSON.stringify({ id: PLUGIN_ID }));
	return distDir;
}

function makePluginsDir(): string {
	const pluginsDir = path.join(workDir, "vault", ".obsidian", "plugins");
	mkdirSync(pluginsDir, { recursive: true });
	return pluginsDir;
}

const envPath = () => path.join(workDir, ".env");

describe("readVaultPluginPath", () => {
	it("returns null without an .env file or without the key", () => {
		expect(readVaultPluginPath(envPath())).toBeNull();
		writeFileSync(envPath(), "OTHER=1\nOBSIDIAN_VAULT_PLUGIN_PATH=\n");
		expect(readVaultPluginPath(envPath())).toBeNull();
	});

	it("keeps Windows backslashes intact", () => {
		const value = "E:\\vault\\.obsidian\\plugins\\unimian";
		writeFileSync(envPath(), `OBSIDIAN_VAULT_PLUGIN_PATH=${value}\n`);
		expect(readVaultPluginPath(envPath())).toBe(value);
	});
});

describe("copyToVault", () => {
	it("copies every artifact into a folder named after the plugin ID", () => {
		const distDir = writeDist();
		const pluginDir = path.join(makePluginsDir(), PLUGIN_ID);

		copyToVault({ distDir, pluginDir, pluginId: PLUGIN_ID });

		for (const artifact of BUILD_ARTIFACTS) {
			expect(existsSync(path.join(pluginDir, artifact))).toBe(true);
		}
	});

	it("refuses a folder whose name is not the plugin ID", () => {
		const distDir = writeDist();
		const pluginDir = path.join(makePluginsDir(), "another-plugin");

		expect(() => copyToVault({ distDir, pluginDir, pluginId: PLUGIN_ID })).toThrow(
			/expected "unimian"/,
		);
		expect(existsSync(pluginDir)).toBe(false);
	});

	it("refuses when the parent plugins folder does not exist", () => {
		const distDir = writeDist();
		const pluginDir = path.join(workDir, "no-vault", ".obsidian", "plugins", PLUGIN_ID);

		expect(() => copyToVault({ distDir, pluginDir, pluginId: PLUGIN_ID })).toThrow(
			/parent folder does not exist/,
		);
		expect(existsSync(path.join(workDir, "no-vault"))).toBe(false);
	});

	it("refuses and copies nothing when an artifact is missing", () => {
		const distDir = writeDist(["styles.css"]);
		const pluginDir = path.join(makePluginsDir(), PLUGIN_ID);

		expect(() => copyToVault({ distDir, pluginDir, pluginId: PLUGIN_ID })).toThrow(
			/Missing build artifacts.*styles\.css/,
		);
		expect(existsSync(pluginDir)).toBe(false);
	});
});

describe("deployToVault", () => {
	it("fails when the vault path is not configured", () => {
		const distDir = writeDist();
		expect(() => deployToVault({ envPath: envPath(), distDir, pluginId: PLUGIN_ID })).toThrow(
			/OBSIDIAN_VAULT_PLUGIN_PATH is not set/,
		);
	});

	it("copies the build to the vault named in .env", () => {
		const distDir = writeDist();
		const pluginDir = path.join(makePluginsDir(), PLUGIN_ID);
		writeFileSync(envPath(), `OBSIDIAN_VAULT_PLUGIN_PATH=${pluginDir}\n`);

		expect(deployToVault({ envPath: envPath(), distDir, pluginId: PLUGIN_ID })).toBe(
			path.resolve(pluginDir),
		);
		expect(existsSync(path.join(pluginDir, "main.js"))).toBe(true);
	});
});

describe("runDeploy", () => {
	const recorder = () => {
		const lines: string[] = [];
		return {
			lines,
			log: (line: string) => lines.push(line),
			error: (line: string) => lines.push(line),
		};
	};

	it("returns 1 and explains when no vault is configured", () => {
		writeDist();
		const log = recorder();
		expect(runDeploy({ rootDir: workDir, log })).toBe(1);
		expect(log.lines.join(" ")).toMatch(/OBSIDIAN_VAULT_PLUGIN_PATH is not set/);
	});

	it("returns 0 after copying dist/ to the configured vault", () => {
		writeDist();
		const pluginDir = path.join(makePluginsDir(), PLUGIN_ID);
		writeFileSync(envPath(), `OBSIDIAN_VAULT_PLUGIN_PATH=${pluginDir}\n`);
		const log = recorder();
		expect(runDeploy({ rootDir: workDir, log })).toBe(0);
		expect(existsSync(path.join(pluginDir, "manifest.json"))).toBe(true);
	});
});
