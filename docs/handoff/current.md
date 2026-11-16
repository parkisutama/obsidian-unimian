# Current handoff

Date: 2026-11-16.
Branch: `fix/repository-remediation`.
State: Checkpoints A and B complete; T01-T07 integrated and verified; T08 is next.
Current owner: Ubuntu development agent.
Next owner: Ubuntu development agent for dependency slices; Windows agent only for a later native checkpoint.
Source base: `a53bfe9a01d1cda7c2c9ab162259c9538c33e7cb`.
Code checkpoint: `2c7c1f59f16f9dfea2545c3e8358fcdc22c3f522` (merged `main` after T03/T04 into the T01/T05-T07 branch). This exact tree passed the strict aggregate verification below.

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
- PR #25 updated all workflow pins to `pnpm/action-setup` v6.1.1; PR #24 updated only `happy-dom` and its lockfile snapshots to 21.0.4.
- Plugin version, TypeScript exception, and preview behavior are unchanged.
- The earlier audit's missing-lockfile-resolutions claim was corrected: pnpm 12's lockfile has two YAML documents and application resolutions are in the second.
- Eleven integrated local branches, obsolete remote `dev`, and a clean documentation worktree were removed earlier with maintainer authorization. Two local historical spikes remain in Windows and are not prerequisites; they were not transferred through GitHub.

## Ubuntu environment

The workspace and three plugin repositories are independent clones under `/home/park_is_/repos/obsidian-univeritas/`. Windows checkout remains at `D:/repos/obsidian-univeritas/obsidian-unimian` for future native Windows testing; do not continue implementation there.

Ubuntu fnm Node 24.15.0 and exact pnpm 12.10.1 are active. The repository initially had no `node_modules`; the local pnpm store lacked Rolldown's Linux binding. After one explicit provisioning approval, `corepack install --global pnpm@12.10.1 && pnpm install --frozen-lockfile` installed 429 packages from the committed lockfile. Windows `node_modules` was not copied.

Merging refreshed `main` triggered an automatic dependency synchronization that downloaded one package outside bubblewrap. It changed only ignored `node_modules` and installed the committed `happy-dom` 21.0.4 graph, but it did not meet the target-lifecycle isolation policy and is not accepted as verification evidence. The integrated tree was subsequently verified from read-only source/toolchain inside the strict sandbox.

Bubblewrap, prlimit, timeout, and unshare provide the validation boundary. Target-controlled runs use no network or host credentials, a cleared allowlisted environment, read-only source/toolchain, tmpfs scratch/output, and bounded heap/address space/process/file/disk/CPU/wall time. The hook initially hit worker contention with a 512-process limit; its two affected files passed 97/97 in focused reproduction. Raising the still-bounded process/file ceilings to 1024/4096 let the unchanged full hook pass 733/733.

## Checks

- Focused post-fix suites pass: T05 53/53; T07 37/37; collision exhaustion and each T01 bundle test pass.
- Repository hook passes in strict isolation: typecheck, Biome, ESLint, Markdown lint, 60 Vitest files and 733 tests.
- Aggregate verification passes in strict isolation: hook checks plus coverage, production build, artifact verification, and 20/20 conformance tests.
- Coverage: 71.4% statements (4161/5827), 64.44% branches (2463/3822), 74.89% functions (883/1179), 72.99% lines (3838/5258).
- `pnpm audit --prod --json`: zero advisories. Post-integration development audit: 11 advisories (3 low, 7 moderate, 1 high, 0 critical). The remaining high is Vite 8.3.0 through Vitest and is assigned to T08c.
- No sandbox build or coverage artifact was promoted; outputs stayed on tmpfs. `git diff --check` passes.
- PR #24's refreshed head passed Linux Verify, Windows tests, and commit-message checks. Native Obsidian acceptance for the hardening checkpoint has not run; automated checks do not replace it.

## Dependency and remote evidence

- PR #25 passed its current-head checks and squash-merged as `410e6706474b468ad85a3477f225e26ccada6dfd`. It updates four workflow uses to the official v6.1.1 SHA `73e46992e05b19abd31f2f3c20e0e7370d762115`; permissions and release gate remain intact.
- PR #24 was refreshed onto that `main`; head `8b439facc6bc963befd17dbaa88bbcb8a10ad1f3` passed Linux Verify, Windows tests, and commit-message checks before squash-merging as `b254cba366bab6207e10ca52b0e6543f965db6e8`.
- Dependabot alert 46 is `GHSA-834v-8h66-3h79` / `CVE-2026-115895`, affecting direct development dependency `happy-dom` 17.0.0 through 21.0.3. GitHub marked it `fixed` at 2026-11-16T16:37:38Z after 21.0.4 reached `main`.
- PRs #23 and #26 still have failing current-head Verify checks and remain unsuitable unchanged. Release PR #14 was not touched.
- GitHub CLI is authenticated as `parkisutama`; this was used only for the explicitly authorized PR review, refresh, merge, and read-only alert verification.

## Decisions and authorization

- Apply engineering skills and Ponytail; continue the agreed remediation plan in small verifiable slices, preserving existing behavior and the quality bar.
- Maintainer explicitly requires strict sandbox validation and declined ordinary Windows test/install execution. The Cloudflare skill prohibits dependency installation during its audit workflow. Migration to Ubuntu does not implicitly revoke those constraints.
- Inspect existing Linux dependencies/store first. If a separate provisioning installation/download is required, explain the exact operation and obtain the missing authorization rather than treating environment migration as approval to bypass the skill.
- Keep all target-controlled test/build/lifecycle execution isolated: no network, no host credentials/home, read-only source/toolchain, bounded scratch-only output, explicit CPU/memory/process/file/disk/time limits. Provisioning and audit execution are separate activities.
- Latest stable is the dependency goal; retain the documented TypeScript exception pending official stable typescript-eslint support. Track [#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) and published peers. Do not suppress lint or install dual compilers.
- No preview change is requested. Current quick-preview setting and Gantt detail interaction remain as inspected.
- The maintainer authorized merging PRs #25/#24, synchronizing, pushing, and opening/updating the remediation PR. No force-push, tag, publication, manual version bump, or Release PR merge is authorized.

## Next actions for Ubuntu

1. Continue T08a-c. Shared workspace policy changes need their own writable scope and must preserve the tracked TypeScript exception for typescript-eslint/typescript-eslint#10940.
2. Resolve the remaining transitive Vite, fast-uri, and minimatch advisories through supported dependency updates; do not add overrides before proving the owning direct-package path.
3. Keep preview behavior unchanged. Request native Windows testing only at a coherent later checkpoint, with exact SHA and dummy-vault steps.
4. Do not merge the remediation PR, force-push, tag, publish, manually bump the plugin version, or merge Release PR #14.
