# Current handoff

Date: 2026-11-16.
Branch: `fix/repository-remediation`.
State: unverified implementation checkpoint; no production hardening fixes yet.
Current owner: Windows agent, preparing transfer.
Next owner: Ubuntu development agent after clone synchronization.
Source base: `a53bfe9a01d1cda7c2c9ab162259c9538c33e7cb`.
Code checkpoint: the commit containing this initial handoff; resolve its full SHA before validation. No code SHA has passed tests in this branch.

## Read first

- [Agent instructions](../../AGENTS.md).
- [Protocol](README.md).
- [Audit](../audit/2026-11-16-repository-audit.md).
- [Implementation plan](../../tasks/plan.md).
- [Task checklist and execution evidence](../../tasks/todo.md).

## Work preserved

- Two Gantt bundle integration tests now have explicit 30-second timeouts; assertions and global timeout are unchanged.
- Draft regression cases cover non-relative vault paths, move-name collision exhaustion, and dangerous frontmatter keys including template creation. They have not run: no observed red/green TDD cycle is claimed.
- Production source, dependencies, lockfile, plugin version, and preview behavior are unchanged.
- The earlier audit's missing-lockfile-resolutions claim was corrected: pnpm 12's lockfile has two YAML documents and application resolutions are in the second.
- Eleven integrated local branches, obsolete remote `dev`, and a clean documentation worktree were removed earlier with maintainer authorization. Two local historical spikes remain in Windows and are not prerequisites; they were not transferred through GitHub.

## Environment

The workspace and three plugin repositories are independent clones under `/home/park_is_/repos/obsidian-univeritas/`. Windows checkout remains at `D:/repos/obsidian-univeritas/obsidian-unimian` for future native Windows testing; do not continue implementation there.

Ubuntu fnm provides Node 24.15.0 (default) and 22.22.3. Login-shell initialization discovers fnm; do not infer absence of Node from a bare shell. Use the project Node policy and an explicit resolved executable inside validation. Do not copy Windows `node_modules` or Codex home/auth/session files.

Bubblewrap, prlimit, timeout, and unshare exist in Ubuntu. Node 24.15.0 successfully launched inside a sandbox with unshared namespaces, cleared environment, read-only target/toolchain, hidden Git metadata, scratch-only writes, and resource limits. The attempted Vitest launch against Windows dependencies then failed before collection because Rolldown's Linux native binding and WASI fallback were absent. This is an environment startup failure, not an observed test failure.

## Checks

- `git diff --check`: passed before transfer (whitespace only).
- Focused Vitest: startup failure before test collection; no test result.
- Full tests, typecheck, lint, coverage, build, conformance, frozen-install proof, refreshed dependency audit, and native acceptance: not performed in this implementation pass.
- Checkpoint is intentionally unverified. It must not be merged on this evidence.
- Windows Git hooks (`pnpm run check` and commitlint) are not executed for this transfer checkpoint, using a command-scoped hooks-path override to avoid forbidden host execution. Repository hook configuration and CI requirements remain unchanged; validate the commit and files in the Linux environment.

## Decisions and authorization

- Apply engineering skills and Ponytail; continue the agreed remediation plan in small verifiable slices, preserving existing behavior and the quality bar.
- Maintainer explicitly requires strict sandbox validation and declined ordinary Windows test/install execution. The Cloudflare skill prohibits dependency installation during its audit workflow. Migration to Ubuntu does not implicitly revoke those constraints.
- Inspect existing Linux dependencies/store first. If a separate provisioning installation/download is required, explain the exact operation and obtain the missing authorization rather than treating environment migration as approval to bypass the skill.
- Keep all target-controlled test/build/lifecycle execution isolated: no network, no host credentials/home, read-only source/toolchain, bounded scratch-only output, explicit CPU/memory/process/file/disk/time limits. Provisioning and audit execution are separate activities.
- Latest stable is the dependency goal; retain the documented TypeScript exception pending official stable typescript-eslint support. Track [#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) and published peers. Do not suppress lint or install dual compilers.
- No preview change is requested. Current quick-preview setting and Gantt detail interaction remain as inspected.
- Current authorization covers checkpoint commit/push and Ubuntu synchronization without opening a PR. Do not merge, force-push, tag, publish, or change Release PR #14. Subsequent remote mutations require existing explicit authorization or a new approval.

## Next actions for Ubuntu

1. Confirm branch, HEAD, clean working tree, all handoff files, and local skill availability. Read workspace conventions before changing shared standards.
2. Make the Linux dependency/sandbox environment reproducible; do not repeat the Windows dependency attempt. Record any provisioning approval separately.
3. Validate timeout changes; execute the existing regression drafts against unfixed source and record actual failures before production fixes. Review formatting and test coverage gaps as part of this work.
4. Continue T01-T12 in the linked plan, with the TypeScript exception explicit. Refresh registry versions/PR checks when acting; older audit statuses are snapshots.
5. Request native Windows testing only at a coherent code checkpoint. Record its full SHA and concrete test steps here, transfer the writer turn, and wait for Windows results before modifying that code.
