# Repository remediation implementation plan

Date: 2026-11-16. Base: `main` at `a53bfe9`.
Source: [repository audit](../docs/audit/2026-11-16-repository-audit.md).
Task checklist: [todo.md](todo.md).

## Scope and working method

Repair the audit findings and move direct dependencies toward latest stable, in small independently reviewable changes. This document authorizes no implementation, merge, release, or package installation. Branch cleanup was separately requested and completed as recorded below.

Use GitHub Flow: branch from current `main`, implement one concern, open a Conventional Commit-titled PR, review and verify its current head, then squash merge when authorized. Refresh the next branch from updated `main`. Do not introduce a `dev` integration branch. Release-please owns versions, tags, and changelog generation; only the maintainer merges the Release PR. Never manually bump plugin versions. Existing dependency PRs may be reused where their scope fits; do not open duplicate replacements without documenting which PR they supersede.

Apply planning-and-task-breakdown and Ponytail: reuse existing guards, gateway, tests, build aliases, and verification commands. Avoid new validation frameworks, new dependency tooling, dual TypeScript installations, lint suppressions, or unrelated refactors. Write the smallest regression test before changing non-trivial behavior. Each PR must leave the existing quality bar intact.

## Branch relevance and cleanup

Local ancestry, `git cherry main <branch>` patch equivalence, and current GitHub branch/PR metadata were inspected. Commit counts alone are insufficient because this repository squash-merges.

| Branch group | Evidence and decision |
|---|---|
| `build/toolchain-alignment`, `chore/small-fixes`, `chore/spdx-headers`, `ci/standard-workflows`, `docs/fix-spec-findings`, `docs/move-guides-to-workspace`, `feat/restart-versioning`, `fix/frontmatter-serialization`, `fix/planner-source-paths` | Patch-equivalent changes already in `main`; nine local branches deleted. No merge prerequisite. |
| Local `dev`, `chore/license-compliance` | Ancestors of `main`; both local branches deleted. |
| Remote `dev` at `6d3bc22` | Ancestor of `main`; remote branch deleted with an expected-SHA lease. |
| Documentation worktree at `D:/repos/obsidian-univeritas/.worktrees/unimian` | Tracked/untracked state clean; relevant documents identical to `main`. Removed along with generated dependencies/build/cache outputs. |
| `codex/spike-gantt-beta` at `4d36960` | Two unique historical experimental commits retained. Not a prerequisite; do not merge old spike implementation over current Gantt. |
| `spike/sticky-note-masonry` at `c216a9b` | One unique experimental commit retained. Not a prerequisite; no Sticky Note redesign is in scope. |

Only `main` and the two local spikes remain locally, with one worktree. Spike retirement is a separate decision because their unique history has not been proven redundant. No feature branch needs merging before remediation.

GitHub confirms these five open PRs; CI outcomes below remain the audit's earlier snapshot and must be refreshed before integration:

| PR | Plan |
|---|---|
| [#25](https://github.com/parkisutama/obsidian-unimian/pull/25), action setup | First dependency integration candidate; small CI-only update. Previously green. Recheck latest stable action and current-head CI. |
| [#24](https://github.com/parkisutama/obsidian-unimian/pull/24), happy-dom | Next candidate after baseline checks; previously green. Reconcile overlap with #26 after integration. |
| [#26](https://github.com/parkisutama/obsidian-unimian/pull/26), development group | Do not merge unchanged. Private parser import breaks, conformance pins require reconciliation, and some targets are no longer latest. Split where needed. |
| [#23](https://github.com/parkisutama/obsidian-unimian/pull/23), runtime group | Do not merge unchanged. Separate calendar/temporal from chart and Preact to isolate regressions. Existing targets are partly stale. |
| [#14](https://github.com/parkisutama/obsidian-unimian/pull/14), release | No prerequisite merge. Let release-please refresh it after accepted changes; maintainer alone makes release decision. |

The remote's cleanup response reported a high-severity Dependabot alert at [alert 46](https://github.com/parkisutama/obsidian-unimian/security/dependabot/46). Its package, applicability, and relation to existing audit findings were not inspected; triage during baseline work. This is not an independently confirmed new vulnerability.

## Order: easiest changes first, subject to prerequisites

| Order | Task | Reason and scope | Depends on |
|---|---|---|---|
| 1 | T01: stabilize bundle-test timeout | Tiny test-only change; avoid flakes obscuring later regressions. | None |
| 2 | T02: validate baseline and lockfile | The lockfile has two YAML documents, including application resolutions; earlier inspection was incomplete. Establish reproducibility before dependency edits. | T01 for reliable full suite |
| 3 | T03: action setup update (#25) | Two workflow files; no application behavior changes. | T02 |
| 4 | T04: happy-dom update (#24) | Isolated dev dependency update; useful advisory remediation. | T02 |
| 5 | T05: vault-path hardening (S2) | Reuse the pure guard and its callers; reject non-relative paths without changing valid paths. | T02 |
| 6 | T06: collision exhaustion error (Q2) | Small gateway behavior fix with a deterministic fixture. | T02 |
| 7 | T07: property-key hardening (S3) | Cover gateway writes and template merge consistently; assess compatibility first. | T05, T06 |
| 8 | T08a-c: stable development tooling (#26) | Coordinate shared standard and supported lint parser API, then test tooling; keep PRs small. | T04, T07 |
| 9 | T09: calendar and temporal updates | Upgrade together to satisfy peers, independently of Gantt/Preact. | T08c |
| 10 | T10a-b: chart then Preact | Highest integration risk; isolate scale callbacks/virtualization before runtime-major change. | T09 |
| 11 | T11a-c: remaining security validation | Native/library boundaries require bounded evidence; implementation only for demonstrated defects or approved policy. | T10b for final dependency behavior |
| 12 | T12: final verification and release handoff | Verify the integrated tree, reconcile advisories, update audit and Release PR evidence. | All unblocked tasks |
| Deferred | TS7: TypeScript compiler upgrade | External support gate; does not block other remediation. | Official stable typescript-eslint support |

If T02 finds a reproducibility defect, fix it in a separate small PR before T03/T04. Do not rewrite the lockfile speculatively. If a demonstrated serious vulnerability emerges, prioritize containment over this ease-based order.

## TypeScript exception and upstream tracking

Track [typescript-eslint #10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940). Live inspection on 2026-11-16 shows it is open, but the external-API blocker label was removed on September 11. The September 29 maintainer update describes work-in-progress TS7.1 integration and [PR #12803](https://github.com/typescript-eslint/typescript-eslint/pull/12803). “TypeScript has no API” is therefore historical context, not a sufficiently precise current status.

Keep the current supported TS6 toolchain while upgrading compatible lint packages. Latest stable remains the goal, with an explicit temporary exception for TypeScript tracked here. Do not introduce a second compiler, switch linters, or widen peer ranges to bypass support. Recheck issue, published support documentation, and package peers before upgrading; issue closure alone is insufficient. Upgrade only when a stable release officially supports the selected stable TypeScript and existing typed Obsidian lint checks pass.

Obsidian API 1.14.4 was already registry latest in the audit snapshot. Refresh all versions at implementation time. Resolve shared conformance pins in the workspace standard before copying the corresponding checks; do not relax them only in this plugin. Node/runtime-major alignment and latest stable toolchain policy must be settled together, rather than installing Node 26 types against Node 24 by accident.

## Verification, boundaries, and rollback

After every two or three slices, run the existing aggregate `pnpm run verify` on that actual tree; each PR also gets its focused checks. Run final full and production audits once after dependencies settle, repeating only for changed resolutions or unresolved evidence. No retries, global timeouts, skipped tests, or disabled rules to manufacture green results.

Security reproductions and target-controlled validation must meet the Cloudflare skill's sandbox requirements. Establish isolated execution before invoking repository scripts: no external network, allowlisted environment, read-only target/toolchain, bounded scratch-only writes and resources. Package acquisition is a separate trusted preparation step and is not performed by the sandboxed target. When unavailable, retain needs-validation explicitly; do not claim full security-audit completion.

Each accepted slice is independently revertible through its PR. Keep version pairs and their lockfile changes together. Use disposable dummy vaults for native tests; never operate on the user's working notes. Preserve existing remote-cover behavior until its privacy policy is decided. Final automated checks do not replace desktop/mobile acceptance.

Stop at a reviewable implementation and verification record. This plan does not authorize remote merges, Release PR merge, tag creation, or publication.
