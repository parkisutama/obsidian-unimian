# Repository remediation tasks

Plan and branch decisions: [plan.md](plan.md).
Sizes refer to expected hand-edited files, excluding generated lockfile churn.

## Current execution state (2026-11-17)

- Work branch: `chore/lint-tooling-alignment`; verified T08b code checkpoint `9c70669fa41f9b628a4175e48d7fc07905807ea6`.
- Ubuntu fnm Node 24.15.0 and exact pnpm 12.10.1 are active. A maintainer-approved `pnpm install --frozen-lockfile` provisioned 429 Linux packages from the committed lockfile; Windows dependencies were not copied.
- T01 bundle tests pass independently and in the 733-test full suite.
- T05-T07 completed an observed red/green cycle. Before the source fix, the focused regressions failed 18 cases; the direct template-boundary regression also failed. After the fix, focused and aggregate checks pass.
- All target-controlled checks ran in bubblewrap without network or host credentials, with a cleared allowlisted environment, read-only source/toolchain, tmpfs outputs, and explicit memory/process/file/CPU/wall-time bounds.
- Aggregate verification passes: typecheck, Biome, ESLint, Markdown lint, 60 Vitest files/733 tests with coverage, production build, artifact verification, and 20 conformance tests. Coverage is 71.4% statements, 64.44% branches, 74.89% functions, and 72.99% lines.
- PR #25 merged as `410e670`; refreshed PR #24 passed Linux/Windows/commit checks and merged as `b254cba`. Dependabot alert 46 identifies direct development dependency `happy-dom` and changed to `fixed` after 21.0.4 reached `main`.
- The T08b full audit reports 11 development-only advisories (3 low, 7 moderate, 1 high, 0 critical) through Vite 8.3.0, `fast-uri` 3.1.8, and `minimatch` 9.0.9/10.2.6; production audit reports zero. Resolve them through their owning direct packages in T08c rather than adding overrides here.
- No preview behavior, TypeScript exception, plugin version, tag, release, or publication was changed. See `docs/handoff/current.md` for exact evidence and remaining ownership.

## T01: stabilize bundle tests (XS)

- [x] Give each esbuild integration test an explicit bounded timeout, initially 30 seconds; preserve assertions and global timeout.
- [x] Verify both tests independently and under full-suite load; investigate failures that persist.

Files: `tests/ui-runtime-bundle.test.mjs`. Dependencies: none.
Verification: `pnpm run test -- tests/ui-runtime-bundle.test.mjs`, then full suite at checkpoint.

## T02: establish baseline (S; diagnosis first)

- [x] Capture current heads, exact application resolutions, full/production advisory applicability, and alert 46's affected package.
- [x] Explain the lockfile layout: pnpm 12 uses a two-document YAML stream; application resolutions exist in the second document. No missing-resolution defect was established.
- [x] Prove frozen-install reproducibility in a disposable prepared environment; repair only an actually demonstrated defect.
- [x] Establish compliant validation execution and refresh relevant PR head checks; record blockers without calling checks passed.

Files: audit evidence; lockfile/workspace config only if diagnosis justifies a follow-up fix.
Dependencies: T01 for reliable full-suite baseline. Verification: clean frozen installation, existing `pnpm run verify`, audit output with exact source/ref. No live-vault actions.

## T03: action setup (#25, S)

- [x] Confirm stable target and SHA pin; review existing PR rather than duplicate it.
- [x] Current-head Linux/Windows workflow checks pass; existing permissions and release gate remain intact.

Files: `.github/workflows/ci.yml`, `.github/workflows/release.yml`. Dependency: T02.
Verification: review workflow diff and GitHub checks. Merge remains a separate authorized action.

## T04: happy-dom (#24, S)

- [x] Upgrade the isolated dev dependency to refreshed stable; preserve the test environment behavior.
- [x] Full suite and coverage pass; reconcile #26's overlapping change after integration.

Files: `package.json`, application lockfile. Dependency: T02.
Verification: existing test/coverage commands and final advisory reconciliation.

## Checkpoint A

- [x] Reproducible baseline, current-head CI evidence, and `pnpm run verify` pass after accepted T01-T04 slices; unresolved failures stay explicit.

## T05: vault paths (S)

- [x] Add failing regression cases for absolute Unix paths, backslash roots, drive/UNC paths, and drive-relative paths; retain valid-path fixtures.
- [x] Fix only the shared guard and verify all create/move/template/periodic callers; document adapter/symlink limitations separately.

Files: `src/core/paths/vaultPath.ts`, `tests/vault-path.test.ts`; existing caller tests as needed. Dependency: T02.
Verification: focused vault-path, frontmatter-create, template, and periodic-note tests; guard failure must occur before writes.

## T06: move collision limit (S)

- [x] Reproduce exhaustion with a bounded mock fixture and assert no rename onto an occupied destination.
- [x] Return a specific existing-compatible failure/message, preserving normal collision numbering and success behavior.

Files: `src/platform/mutations/LegacyMutationGateway.ts`, `tests/mutation-capability.test.ts`. Dependency: T02.
Verification: existing gateway tests plus exhaustion regression. Avoid a new result type unless callers require it.

## T07: frontmatter property keys (M)

- [x] Define compatible handling of dangerous keys from actual frontmatter behavior; test single/bulk/date writes and template merge before changing behavior.
- [x] Apply the smallest common policy at gateway and template write boundaries; invalid bulk input must be rejected before partial mutation.
- [x] Preserve normal user property names, formula rejection, and serialization; do not claim global prototype pollution without evidence.

Files: gateway, template engine, their existing tests; one shared helper only if both paths need it (maximum five hand-edited files per slice). Dependencies: T05, T06.
Verification: mutation-capability, note-template, and create-note-frontmatter tests with dummy objects.

## Checkpoint B

- [x] `pnpm run verify` passes after T05-T07; no valid-path regression, partial rejected write, or grant expansion.

## T08a-c: development tooling (three S/M slices)

- [x] T08a: update shared engineering pins and policy in the workspace first, including lint/Node compatibility and explicit TS6 exception; preserve the quality bar. No changes to other plugin repos in this plan.
- [x] T08b: adopt supported stable lint packages and public license-parser API; preserve manifest/license rules and typed linting. Sync approved conformance baseline.
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
