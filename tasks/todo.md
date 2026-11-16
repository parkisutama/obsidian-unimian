# Repository remediation tasks

Plan and branch decisions: [plan.md](plan.md). All implementation tasks remain open.
Sizes refer to expected hand-edited files, excluding generated lockfile churn.

## Current execution state (2026-11-16)

- Work branch: `fix/repository-remediation`, based on `a53bfe9`.
- Maintainer explicitly requires the Cloudflare skill's strict sandbox, including for implementation validation; local Windows development execution was declined.
- T01's two per-test timeout changes are prepared, but not executed or verified.
- Regression tests for T05-T07 are drafted only. Their expected failures have not been observed; production fixes have not been applied. Do not treat these drafts as completed TDD or a passing branch.
- Correction after maintainer clarification: fnm already provides Linux Node 24.15.0 and 22.22.3 under `/home/park_is_/.local/share/fnm/node-versions/`. Node 24.15.0 successfully executed inside bubblewrap; no runtime installation was needed.
- A focused Vitest launch ran under bubblewrap with all namespaces unshared, capabilities dropped, cleared environment, read-only source/toolchain and hidden Git metadata, 512 MiB scratch tmpfs, 512 MiB Node heap, 12 GiB address-space limit, process/file/CPU limits, and a 45-second wall-clock limit. Source was mounted at its original WSL path to resolve Windows junctions. No host home/credentials or network were exposed. No retained sandbox files were promoted.
- Vitest failed during startup before collecting tests: installed Rolldown 1.2.9 lacks its Linux native binding, and its WASI fallback is also absent. Existing Windows `node_modules` cannot establish a usable Linux test environment. This is an environment failure, not an observed regression-test failure.
- Blocker: provide matching Linux dependencies through a maintainer-prepared trusted environment. The skill prohibits installing dependencies during this run; do not use the error's generic reinstall suggestion or Windows execution as a workaround. Strict sandbox remains required. No packages were installed or source files changed by the sandbox.
- Other remaining tasks are pending, not completed. An unverified checkpoint is being committed and pushed for Ubuntu handoff with maintainer authorization. No PR is opened and no merge, tag, release, or publication is authorized by this transfer. `git diff --check` passes; that is only a whitespace check. See `docs/handoff/current.md` for the receiving agent's instructions.

## T01: stabilize bundle tests (XS)

- [ ] Give each esbuild integration test an explicit bounded timeout, initially 30 seconds; preserve assertions and global timeout.
- [ ] Verify both tests independently and under full-suite load; investigate failures that persist.

Files: `tests/ui-runtime-bundle.test.mjs`. Dependencies: none.
Verification: `pnpm run test -- tests/ui-runtime-bundle.test.mjs`, then full suite at checkpoint.

## T02: establish baseline (S; diagnosis first)

- [ ] Capture current heads, exact application resolutions, full/production advisory applicability, and alert 46's affected package.
- [x] Explain the lockfile layout: pnpm 12 uses a two-document YAML stream; application resolutions exist in the second document. No missing-resolution defect was established.
- [ ] Prove frozen-install reproducibility in a disposable prepared environment; repair only an actually demonstrated defect.
- [ ] Establish compliant validation execution and refresh relevant PR head checks; record blockers without calling checks passed.

Files: audit evidence; lockfile/workspace config only if diagnosis justifies a follow-up fix.
Dependencies: T01 for reliable full-suite baseline. Verification: clean frozen installation, existing `pnpm run verify`, audit output with exact source/ref. No live-vault actions.

## T03: action setup (#25, S)

- [ ] Confirm stable target and SHA pin; review existing PR rather than duplicate it.
- [ ] Current-head Linux/Windows workflow checks pass; existing permissions and release gate remain intact.

Files: `.github/workflows/ci.yml`, `.github/workflows/release.yml`. Dependency: T02.
Verification: review workflow diff and GitHub checks. Merge remains a separate authorized action.

## T04: happy-dom (#24, S)

- [ ] Upgrade the isolated dev dependency to refreshed stable; preserve the test environment behavior.
- [ ] Full suite and coverage pass; reconcile #26's overlapping change after integration.

Files: `package.json`, application lockfile. Dependency: T02.
Verification: existing test/coverage commands and final advisory reconciliation.

## Checkpoint A

- [ ] Reproducible baseline, current-head CI evidence, and `pnpm run verify` pass after accepted T01-T04 slices; unresolved failures stay explicit.

## T05: vault paths (S)

- [ ] Add failing regression cases for absolute Unix paths, backslash roots, drive/UNC paths, and drive-relative paths; retain valid-path fixtures.
- [ ] Fix only the shared guard and verify all create/move/template/periodic callers; document adapter/symlink limitations separately.

Files: `src/core/paths/vaultPath.ts`, `tests/vault-path.test.ts`; existing caller tests as needed. Dependency: T02.
Verification: focused vault-path, frontmatter-create, template, and periodic-note tests; guard failure must occur before writes.

## T06: move collision limit (S)

- [ ] Reproduce exhaustion with a bounded mock fixture and assert no rename onto an occupied destination.
- [ ] Return a specific existing-compatible failure/message, preserving normal collision numbering and success behavior.

Files: `src/platform/mutations/LegacyMutationGateway.ts`, `tests/mutation-capability.test.ts`. Dependency: T02.
Verification: existing gateway tests plus exhaustion regression. Avoid a new result type unless callers require it.

## T07: frontmatter property keys (M)

- [ ] Define compatible handling of dangerous keys from actual frontmatter behavior; test single/bulk/date writes and template merge before changing behavior.
- [ ] Apply the smallest common policy at gateway and template write boundaries; invalid bulk input must be rejected before partial mutation.
- [ ] Preserve normal user property names, formula rejection, and serialization; do not claim global prototype pollution without evidence.

Files: gateway, template engine, their existing tests; one shared helper only if both paths need it (maximum five hand-edited files per slice). Dependencies: T05, T06.
Verification: mutation-capability, note-template, and create-note-frontmatter tests with dummy objects.

## Checkpoint B

- [ ] `pnpm run verify` passes after T05-T07; no valid-path regression, partial rejected write, or grant expansion.

## T08a-c: development tooling (three S/M slices)

- [ ] T08a: update shared engineering pins and policy in the workspace first, including lint/Node compatibility and explicit TS6 exception; preserve the quality bar. No changes to other plugin repos in this plan.
- [ ] T08b: adopt supported stable lint packages and public license-parser API; preserve manifest/license rules and typed linting. Sync approved conformance baseline.
- [ ] T08c: upgrade Vitest/coverage together and remaining small tools to refreshed stable; reconcile #26 and transitive advisories with evidence.

Likely files by slice: workspace template/policy (outside this writable root); then `eslint.config.mjs`, `package.json`, lockfile, conformance file, workspace config as needed. Split further if more than five hand-edited files.
Dependencies: T04, T07; T08b follows T08a, T08c follows T08b.
Verification: typecheck, both lint paths, license/manifest validation, tests/coverage, conformance; aggregate at checkpoint. External workspace edits need appropriate filesystem access.

## T09: calendar/temporal (S)

- [ ] Update FullCalendar and temporal-polyfill to compatible refreshed stable versions, separated from chart/Preact.
- [ ] Existing date-only/inclusive-end and date-time behavior passes; native desktop/mobile calendar smoke check recorded separately.

Files: package manifest, lockfile; relevant calendar tests/source only for a demonstrated API change, split if needed. Dependency: T08c.
Verification: calendar and temporal tests, production build, maintainer native check.

## Checkpoint C

- [ ] `pnpm run verify` passes after T08-T09; documented TypeScript exception remains visible and all other holds have concrete reasons.

## T10a-b: Gantt and Preact (two M slices)

- [ ] T10a: update chart alone, localize scale callback and virtualization failures, and fix the narrow responsible adapter without weakening tests.
- [ ] T10b: update Preact separately; assess the render-to-string peer against actual bundle requirements, retain no-React aliases and architectural checks.
- [ ] Whole-array diff, ordered writes, echo gate, scoped grants, dates, and theme/resize behavior remain intact in each slice.

Likely files per slice: manifest, lockfile, the responsible chart adapter or runtime alias, and targeted tests (maximum five hand-edited files; split if exceeded). Dependency: T09; T10b follows T10a.
Verification: Gantt scale/view/performance/writeback tests, bundle/architecture tests, production build, native Gantt desktop/mobile acceptance.

## T11a-c: remaining security evidence (three bounded reviews)

- [ ] T11a: inspect exact shipped chart tooltip/detail sinks and native Markdown/URL behavior; retain source traces and unresolved host facts.
- [ ] T11b: validate path adapters, property-key behavior, template active-editor targeting, and external covers with dummy data under compliant isolation; remote-cover policy changes require a separate product decision.
- [ ] T11c: verify release event/tag/build identity and actual repository protections/token scope where accessible; propose a small fix only for a demonstrated gap.

Files: audit evidence; any resulting implementation gets its own regression-tested slice. Dependency: T10b for final-library evidence. Earlier source diagnosis is safe independently.
Verification: concrete bounded boundary outcomes, or exact needs-validation blockers; no live endpoint/vault probes and no invented security severity.

## T12: final verification and release handoff (S)

- [ ] Run `pnpm run verify` plus full/production audits on the integrated final tree; refresh stable-version inventory and document any remaining exceptions.
- [ ] Update audit and release evidence; list only maintainer-reported native checks as accepted.
- [ ] Review release-please's refreshed PR; leave release decision to maintainer. No manual version bump, tag, or publication.

Files: audit, task status, and release record only when required by release policy. Dependencies: all unblocked tasks.
Verification: exact commit/check provenance and explicit unresolved TS7/native/security blockers.

## TS7: deferred upstream dependency

- [ ] Recheck [#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940), published stable support, and peers during dependency review.
- [ ] Upgrade TypeScript only when stable typescript-eslint officially supports it and all existing typed lint/typecheck/conformance checks pass.

Files: manifest, lockfile, approved shared baseline and tracking note as necessary. Dependency: upstream stable support; independent of other remediation. No dual compiler or lint suppression workaround.
