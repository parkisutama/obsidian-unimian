import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const VAULT_PATH_KEY = "OBSIDIAN_VAULT_PLUGIN_PATH";
export const BUILD_ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

/** Reads only the vault plugin path from `.env`; every other key in the file is ignored. */
export function readVaultPluginPath(envPath = ".env") {
	if (!existsSync(envPath)) return null;
	const value = parseEnv(readFileSync(envPath, "utf8"))[VAULT_PATH_KEY];
	return value?.trim() || null;
}

/**
 * Copies the build artifacts into a vault's plugin folder. Refuses any destination whose folder
 * name differs from the plugin ID, or whose parent `plugins` folder does not exist, so a typo in
 * `.env` cannot write into another plugin or create a stray vault structure.
 */
export function copyToVault({ distDir, pluginDir, pluginId }) {
	const destination = path.resolve(pluginDir);
	const folderName = path.basename(destination);
	if (folderName !== pluginId) {
		throw new Error(
			`${VAULT_PATH_KEY} points at folder "${folderName}", expected "${pluginId}" (the plugin ID).`,
		);
	}
	const pluginsDir = path.dirname(destination);
	if (!existsSync(pluginsDir)) {
		throw new Error(`${VAULT_PATH_KEY}: parent folder does not exist: ${pluginsDir}`);
	}
	const missing = BUILD_ARTIFACTS.filter((file) => !existsSync(path.join(distDir, file)));
	if (missing.length > 0) {
		throw new Error(`Missing build artifacts in ${distDir}: ${missing.join(", ")}`);
	}

	mkdirSync(destination, { recursive: true });
	for (const file of BUILD_ARTIFACTS) {
		copyFileSync(path.join(distDir, file), path.join(destination, file));
	}
	return destination;
}

/**
 * Copies the build to the vault plugin folder named in `.env`. Unlike the dev watcher, which skips
 * the copy when no folder is configured, an explicit deploy without one is an error.
 */
export function deployToVault({ envPath = ".env", distDir = "dist", pluginId }) {
	const pluginDir = readVaultPluginPath(envPath);
	if (!pluginDir) {
		throw new Error(`${VAULT_PATH_KEY} is not set in ${envPath}; there is no vault to deploy to.`);
	}
	return copyToVault({ distDir, pluginDir, pluginId });
}

/**
 * The `deploy` command: returns the process exit code and reports through `log`.
 * @param {{ rootDir?: string, log?: { log(line: string): unknown, error(line: string): unknown } }} [options]
 */
export function runDeploy({ rootDir = process.cwd(), log = console } = {}) {
	try {
		const { id } = JSON.parse(readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
		const destination = deployToVault({
			envPath: path.join(rootDir, ".env"),
			distDir: path.join(rootDir, "dist"),
			pluginId: id,
		});
		log.log(`✓ Deployed to ${destination}`);
		return 0;
	} catch (error) {
		log.error(`✗ ${error.message}`);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(runDeploy());
