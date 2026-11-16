# Current handoff

Date: 2026-11-16.
Branch: `fix/repository-remediation`.
State: Ubuntu environment ready; T01 and T05-T07 verified locally; T02-T04 integration remains open.
Current owner: Ubuntu development agent.
Next owner: Ubuntu development agent for dependency slices; Windows agent only for a later native checkpoint.
Source base: `a53bfe9a01d1cda7c2c9ab162259c9538c33e7cb`.
Code checkpoint: `ea2ded22bef00ad9994be5da4b4e62110e3e8816` (`fix: harden mutation boundaries`). This commit passed the repository hook and the stricter aggregate verification described below.

## Read first

- [Agent instructions](../../AGENTS.md).
- [Protocol](README.md).
- [Audit](../audit/2026-11-16-repository-audit.md).
- [Implementation plan](../../tasks/plan.md).
- [Task checklist and execution evidence](../../tasks/todo.md).

## Completed work

- Two Gantt bundle integration tests have explicit 30-second timeouts; assertions and global timeout are unchanged. Both pass independently and under full-suite load.
- The regression drafts were executed against unfixed production code first: 18 focused cases failed, plus the direct template-engine boundary case. This establishes the requested red evidence.
- The shared vault guard now rejects rooted Unix/backslash, drive, drive-relative, and UNC-shaped inputs while retaining valid relative paths.
- Move collision exhaustion now returns an existing-compatible error before any occupied destination can be overwritten.
- A shared frontmatter-key guard rejects `__proto__`, `constructor`, and `prototype` at gateway and template write boundaries. Bulk/date inputs are validated before mutation; ordinary names and formula rejection remain unchanged.
- Dependencies, lockfile, plugin version, TypeScript exception, and preview behavior are unchanged by the code checkpoint.
- The earlier audit's missing-lockfile-resolutions claim was corrected: pnpm 12's lockfile has two YAML documents and application resolutions are in the second.
- Eleven integrated local branches, obsolete remote `dev`, and a clean documentation worktree were removed earlier with maintainer authorization. Two local historical spikes remain in Windows and are not prerequisites; they were not transferred through GitHub.

## Ubuntu environment

The workspace and three plugin repositories are independent clones under `/home/park_is_/repos/obsidian-univeritas/`. Windows checkout remains at `D:/repos/obsidian-univeritas/obsidian-unimian` for future native Windows testing; do not continue implementation there.

Ubuntu fnm Node 24.15.0 and exact pnpm 12.10.1 are active. The repository initially had no `node_modules`; the local pnpm store lacked Rolldown's Linux binding. After one explicit provisioning approval, `corepack install --global pnpm@12.10.1 && pnpm install --frozen-lockfile` installed 429 packages from the committed lockfile. Windows `node_modules` was not copied.

Bubblewrap, prlimit, timeout, and unshare provide the validation boundary. Target-controlled runs use no network or host credentials, a cleared allowlisted environment, read-only source/toolchain, tmpfs scratch/output, and bounded heap/address space/process/file/disk/CPU/wall time. The hook initially hit worker contention with a 512-process limit; its two affected files passed 97/97 in focused reproduction. Raising the still-bounded process/file ceilings to 1024/4096 let the unchanged full hook pass 733/733.

## Checks

- Focused post-fix suites pass: T05 53/53; T07 37/37; collision exhaustion and each T01 bundle test pass.
- Repository hook passes in strict isolation: typecheck, Biome, ESLint, Markdown lint, 60 Vitest files and 733 tests.
- Aggregate verification passes in strict isolation: hook checks plus coverage, production build, artifact verification, and 20/20 conformance tests.
- Coverage: 71.4% statements (4161/5827), 64.44% branches (2463/3822), 74.89% functions (883/1179), 72.99% lines (3838/5258).
- `pnpm audit --prod --json`: zero advisories. Full development audit: 14 advisories (3 low, 8 moderate, 3 high, 0 critical), centered on test/build dependencies.
- No sandbox build or coverage artifact was promoted; outputs stayed on tmpfs. `git diff --check` passes.
- Native Ubuntu/Windows Obsidian acceptance and current remote CI for `ea2ded2` have not run. Automated checks do not replace them.

## Dependency and remote evidence

- PR #25 head `064ece3cc19163d06cc4b5ea247c293849b96804` updates only four workflow uses from `pnpm/action-setup` v6.1.0 to v6.1.1 SHA `73e46992e05b19abd31f2f3c20e0e7370d762115`; current public checks are green. Official releases confirm v6.1.1 is the stable target.
- PR #24 head `508d0906788633112f1ec088d44a62a68ec1f8ec` updates only `happy-dom` 20.14.5 to stable 21.0.4 and lockfile peer snapshots; current public checks are green. npm confirms 21.0.4 is latest.
- PRs #23 and #26 still have failing current-head Verify checks and remain unsuitable unchanged. Release PR #14 was not touched.
- GitHub authentication is unavailable in this Ubuntu session. Dependabot alert 46 therefore remains an exact-package/applicability blocker; do not infer its identity solely from the aggregate audit.

## Decisions and authorization

- Apply engineering skills and Ponytail; continue the agreed remediation plan in small verifiable slices, preserving existing behavior and the quality bar.
- Maintainer explicitly requires strict sandbox validation and declined ordinary Windows test/install execution. The Cloudflare skill prohibits dependency installation during its audit workflow. Migration to Ubuntu does not implicitly revoke those constraints.
- Inspect existing Linux dependencies/store first. If a separate provisioning installation/download is required, explain the exact operation and obtain the missing authorization rather than treating environment migration as approval to bypass the skill.
- Keep all target-controlled test/build/lifecycle execution isolated: no network, no host credentials/home, read-only source/toolchain, bounded scratch-only output, explicit CPU/memory/process/file/disk/time limits. Provisioning and audit execution are separate activities.
- Latest stable is the dependency goal; retain the documented TypeScript exception pending official stable typescript-eslint support. Track [#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) and published peers. Do not suppress lint or install dual compilers.
- No preview change is requested. Current quick-preview setting and Gantt detail interaction remain as inspected.
- The verified code checkpoint is local only and one commit ahead of `origin/fix/repository-remediation`. No push, PR mutation, merge, force-push, tag, publication, or Release PR change occurred. Obtain explicit authorization before any remote mutation.

## Next actions for Ubuntu

1. Finish T02 by inspecting Dependabot alert 46 with authenticated, read-only GitHub access and record exact applicability. The frozen Linux install and local aggregate baseline are already established.
2. Integrate T03/T04 through their existing GitHub Flow PRs only when authorized; do not duplicate them on this branch. Re-run the same strict verification after the accepted heads land and reconcile #26 overlap.
3. Continue T08a-c only after T04/T07 prerequisites. Shared workspace policy changes need their own writable scope and must preserve the tracked TypeScript exception for typescript-eslint/typescript-eslint#10940.
4. Keep preview behavior unchanged. Request native Windows testing only at a coherent later checkpoint, with exact SHA and dummy-vault steps.
5. Before remote work, resolve the current documentation-only working tree, then request explicit push/PR authorization. Do not merge, force-push, tag, publish, or modify Release PR #14.
