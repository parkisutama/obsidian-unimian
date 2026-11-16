# Audit: repository status, dependencies, and code quality

Date: 2026-11-16
Commit audited: `a53bfe9` on `main` (clean, in sync with `origin/main`)
Scope: repository status, dependency audit, open dependabot pull requests, a first pass over security-relevant code, and code quality checks.
Status: first pass, enriched with a focused static security review using the Cloudflare security-audit skill. This is not a completed full security audit; see the evidence boundaries below.

## Summary

- `main` passes typecheck, Biome, ESLint (obsidianmd), and rumdl.
- 713 of 714 tests pass. The one failure is a timing flake, not a defect (finding Q1).
- `pnpm audit --prod` reports no known vulnerabilities. All 14 advisories (3 high, 8 moderate, 3 low) are in development dependencies and do not reach the plugin bundle (finding S1).
- No use of `innerHTML`, `eval`, `new Function`, `fetch`, or network APIs in `src/`.
- Every path that reaches a vault write goes through `assertInsideVault`.
- Two hardening candidates were found (S2, S3); the follow-up review does not establish a security severity for either.
- External cover URLs reach image elements: absence of `fetch` does not establish absence of network traffic (see P1).
- Two dependabot pull requests are red (#23, #26). Two are green (#24, #25).

## Repository state

| Item | State |
|---|---|
| Branch | `main`, clean |
| Open pull requests | #14 release 0.0.1, #23, #24, #25, #26 |
| Stale local branches | `docs/fix-spec-findings` (still attached to a worktree), `spike/sticky-note-masonry`, `codex/spike-gantt-beta`, and several merged feature branches |
| Source size | 110 tracked files under `src/` and `scripts/` |
| Suppressions | none (`@ts-ignore`, `eslint-disable`, `biome-ignore`, `.skip`, `.only` all absent) |

## Check results

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `biome check` | pass (191 files) |
| `eslint src manifest.json LICENSE` | pass |
| `rumdl check .` | pass (53 files) |
| `vitest` | 713 pass, 1 fail (Q1); passes when run alone in 627 ms |
| `pnpm audit --prod` | no known vulnerabilities |
| `pnpm audit` | 14 advisories, all development-only |
| `pnpm run verify` | not run (build, coverage, conformance not covered) |

## Findings

Severity is for the plugin as shipped, not for the development environment.

### Security

#### S1. Development dependencies carry known advisories (medium, development only)

| Package | Advisory range | Patched in | Reaches via |
|---|---|---|---|
| `vite` | 8.3.0 to 8.3.2 | 8.3.3 | `vitest`, `@vitest/coverage-v8` |
| `happy-dom` | up to 20.14.6 | 21.0.0 | `vitest`, `@vitest/coverage-v8` |
| `fast-uri` | 3.0.0 up to 3.1.9 | 3.1.9 | `@commitlint/cli`, `eslint-plugin-obsidianmd` |
| `minimatch` | 7.0.0 up to 11.0.1 | 11.0.1 | `typescript-eslint` |

The three high advisories are `vite` and `happy-dom`.
Exposure is the developer machine and CI only.
Fix: merge #24, repair and merge #26, then re-run `pnpm audit`. Add `pnpm.overrides` for anything that remains.

#### S2. `escapesVault` rejects `..` only (needs validation)

File: `src/core/paths/vaultPath.ts:15`.
Absolute paths (`/x`, `C:\x`) pass the check.
Whether `vault.create` and `createFolder` in Obsidian reject them was not verified.
Fix: also reject paths that start with `/` or `\`, and paths that match `^[A-Za-z]:`. Add tests.

#### S3. User-controlled property names are used as object keys (hardening candidate)

Files: `src/platform/mutations/LegacyMutationGateway.ts:78`, `:109`, `:140`, and `src/services/templateEngine.ts:138`.
On an ordinary object with the inherited legacy setter, assigning an object or `null` to `__proto__` can change that object's prototype instead of writing an own key. Primitive assignments do not establish that effect. This does not demonstrate modification of `Object.prototype`, code execution, or downstream security impact. Obsidian's actual frontmatter object and serialization behavior remain unverified.
Potential fix: enforce one property-key policy for gateway assignments and the template merge, with regression tests. Rejecting keys only in `propertyName()` would miss `Object.assign(fm, values)` in `createNoteFromTemplate`; compatibility with existing user properties must be considered.

#### Observed as sound

- Frontmatter for new notes is serialized with Obsidian's `stringifyYaml` (PR #10).
- `assertInsideVault` guards `createNote`, `moveToFolder`, `ensureFolder`, and `availablePath`.
- `child_process` appears once, in `scripts/run-vitest.mjs`, as `spawnSync` for the test runner.
- Writes from the Gantt view are restricted to scoped grants (`docs/architecture/view-write-access.md`).

### Code quality

#### Q1. Flaky test under parallel load (medium)

File: `tests/ui-runtime-bundle.test.mjs:32`.
The test bundles `@jaeungkim/gantt-chart` with esbuild and times out at the default 5000 ms when 60 test files run in parallel.
Run alone it takes 627 ms.
Effect: `pnpm run check` and `pnpm run verify` can fail without a defect.
Fix: give the test an explicit timeout, for example 30 000 ms.

#### Q2. `moveToFolder` collision loop is capped at 100 (low)

File: `src/platform/mutations/LegacyMutationGateway.ts:172`.
After 100 name collisions the loop ends on a colliding path, `renameFile` fails, and the user sees a generic error.
Fix: return a specific failure reason when the cap is reached.

## Dependabot pull requests

| PR | Change | CI | Cause of failure |
|---|---|---|---|
| #25 | `pnpm/action-setup` 6.1.0 to 6.1.1 | pass | none |
| #24 | `happy-dom` 20.14.5 to 21.0.4 | pass | none; closes two high advisories |
| #26 | 10 development packages, including `vitest` 5.1.0, `eslint-plugin-obsidianmd` 0.5.1, `rumdl` 0.3.2 | fail | `ERR_MODULE_NOT_FOUND` for `eslint-plugin-obsidianmd/dist/lib/plainTextParser.js`; `eslint.config.mjs` imports an internal file removed in 0.5.x. Overlaps with #24 on `happy-dom` |
| #23 | `@jaeungkim/gantt-chart` 1.5.1 to 1.7.0, `preact` 10 to 11, `fullcalendar` 7.1.3, `temporal-polyfill` 1.0.6 | fail | two test failures: `gantt-view.test.ts` (scale callback not called with `'week'`) and `performance.test.ts` (row virtualization not engaged). The cause is not yet isolated between gantt-chart 1.7.0 and preact 11 |
| #14 | Release 0.0.1 | not run | left alone; only the maintainer merges it |

Production advisories are zero, so #23 is not urgent for security.

## Remediation plan

1. Merge #25, then #24. Both are green and independent.
2. Fix #26 on its branch: replace the `plainTextParser` import in `eslint.config.mjs`, run `pnpm run verify` and `pnpm audit`, and add `pnpm.overrides` if advisories remain.
3. Open one pull request `fix(security): harden property names and vault paths` covering S2, S3, and Q1, with tests.
4. Split #23:
   - a small pull request for `fullcalendar` and `temporal-polyfill`;
   - a separate investigation of `@jaeungkim/gantt-chart` 1.7.0 without preact 11, following `docs/specs/gantt.md`;
   - isolate and resolve Preact 11 compatibility with the React aliases in `scripts/ui-runtime-aliases.mjs`. The maintainer requests latest stable for all dependencies; do not add a permanent major-version ignore as the resolution. Keep any blocked upgrade explicitly open.
5. Finish with `pnpm run verify` green on `main` and an empty `pnpm audit`.

Steps 1, 2, and 4 change the remote repository and need the maintainer's go-ahead.

## Not covered

The original pass did not review the following. The focused follow-up below adds source inspection for several items, but does not replace runtime validation.

- `src/platform/colors/ColorResolver.ts`: sanitization of user-supplied CSS color values.
- `src/views/sticky-note/content.ts`: rendering of note excerpts.
- `src/platform/mutations/grants.ts`: the scoped write grants and the architecture guard.
- `src/platform/preview/QuickPreviewModal.ts` and the Gantt tooltip path: rendering of untrusted note content.
- Handling of Obsidian wiki links and external URLs found in property values.
- Template engine integration (Templater, core Templates): trust boundary when a template runs on user-chosen paths.
- CI workflow permissions, secret handling, and action pinning in `.github/workflows/`.
- Build outputs: `pnpm run verify`, `verify:artifacts`, and `conformance` were not run.
- Threat model for mobile (`isDesktopOnly: false`).

## Focused security enrichment

### Method and evidence limits

Applied the locally installed [Cloudflare security-audit skill](https://github.com/cloudflare/security-audit-skill), its attack-class guidance, and relevant client-side, desktop/mobile, and supply-chain guidance. This is a focused review enriching this document, not the skill's six-phase full-audit workflow. No independent verifier, machine-readable findings/coverage ledger, or full-audit completion claim is provided.

Source inspected: `a53bfe9a01d1cda7c2c9ab162259c9538c33e7cb`. The working tree has an untracked `docs/audit/` directory; the original clean-tree statement describes the earlier pass, not this follow-up. Earlier test counts, advisory counts, and remote PR statuses are historical evidence from that pass and were not rerun or refreshed here.

No target-controlled tests, builds, package installation, or probes were executed. The available execution environment does not establish all sandbox controls required by the skill: empty allowlisted environment, read-only target/toolchain, scratch-only writes, network isolation, and bounded resource limits. Use a disposable isolated environment with those controls for reproductions. Public package metadata retrieval is read-only research, not execution of package code.

Only a demonstrated trust-boundary failure merits a confirmed security finding and severity. Static hardening opportunities and intentional same-user capabilities do not by themselves meet that threshold. This pass adds no confirmed vulnerability.

### Threat model

Protected resources are vault integrity, files outside the vault, local application authority, user privacy, and release authenticity. Lower-trust inputs may include imported/shared notes, frontmatter, Base configuration, template content, and pull-request contributions. Whether an outside actor can supply each input without the owner's deliberate configuration is a prerequisite to validate, not an assumption.

Installed plugins and explicitly selected executable templates already run with the owner's granted authority. Scoped view grants constrain application architecture; they do not sandbox a malicious installed plugin. Desktop and mobile share source but differ in adapter, renderer, and plugin availability; desktop results cannot establish mobile acceptance.

### Coverage and source observations

| Surface and boundary | Source evidence | Assessment and remaining work |
|---|---|---|
| Property color to inline CSS | `src/platform/colors/ColorResolver.ts`: `SAFE_COLOR`, `isSafeColor`, `resolveColor` | All three supplied color sources pass the allowlist before selection; URLs and extra declarations are excluded. Existing `tests/color-resolver.test.ts` covers injection-shaped inputs, but was not run. This is not proof about every styling sink. |
| Note excerpt to Markdown | `src/views/sticky-note/content.ts`: `buildCardExcerpt`; `BasesStickyNoteView.ts`: card renderer | Text extensions are allowlisted and excerpts are truncated before `MarkdownRenderer.render`. Image-stripping regexes are presentation helpers, not HTML or URL sanitizers. Native renderer/postprocessor safety remains external. |
| Non-text entry to embed | `BasesStickyNoteView.ts`: non-text rendering branch | The current Base's self-embed is replaced with a placeholder. Other entries use a generated wiki embed; special-character filenames and indirect embed cycles still need bounded native checks. |
| Preview to native renderer/editor | `src/platform/preview/QuickPreviewModal.ts`: `onOpen`, `onClose` | File lookup requires a `TFile`; headings use text APIs. Mobile uses the Markdown fallback, desktop may embed an editable leaf. Markdown plugins and host sanitization are not audited here; preview is not uniformly read-only on desktop. |
| Gantt label to tooltip DOM | `src/views/gantt/tooltipGuard.ts`: `sweep`; `chartHost.ts`: `paint` | Guard labels use `textContent`. Task data is passed into the third-party chart; this does not prove all library tooltip/detail-panel sinks safe. Inspect the exact installed library and shipped bundle next. |
| View to mutation gateway | `src/platform/mutations/grants.ts`; `src/ViewRegistry.ts`: `validateViewDescriptor`, `mutationsFor` | Returned objects expose only granted methods; trash and move are not grantable. Registry checks approved view IDs. `tests/architecture.test.ts` provides source-pattern guards, not runtime isolation from code with access to `App`. |
| Entry to note navigation | `src/views/gantt/navigation.ts`: `resolve`; `src/platform/navigation/NavigationService.ts`: `openPath` | Gantt resolution checks container membership and `isNote`; navigation delegates to Obsidian. No arbitrary-protocol execution is established. Native Markdown/external-link handling remains unverified. |
| Template selection to execution | `src/services/templateEngine.ts`: `detectTemplateEngine`, `createNoteFromTemplate` | Enabled Templater is preferred and receives the selected template; this is intentional executable-template authority. Establish who controls the template and selection before alleging injection. Core Templates operates on the active editor, so async focus changes warrant a disposable-vault integrity check. |
| PR input to CI shell | `.github/workflows/ci.yml` | `pull_request` trigger, read-only contents permission, SHA-pinned actions, frozen lockfile. PR title and commit refs enter quoted environment variables instead of direct shell interpolation. Hosted token policy, fork approvals, and branch protection were not inspected. |
| Source to release artifact | `.github/workflows/release.yml` | Write permissions are job-scoped; publish consumes the build artifact in the workflow and emits provenance. Build checkout does not explicitly use the emitted tag SHA: validate event SHA/tag identity before claiming substitution. Release token scope and repository protections remain external facts. |

### P1. External covers can cause network requests (privacy observation)

`src/platform/dom/CoverImageResolver.ts:resolveCoverImageSrc` returns `http://`, `https://`, and `app://` values directly. `src/views/sticky-note/BasesStickyNoteView.ts` assigns the resolved value to an image's `src`. Thus “no network APIs in src” must not be read as “the plugin cannot cause network traffic.” Native Markdown embeds can also involve host-managed loading.

An imported note's cover URL could expose a network request to its destination when the view renders, subject to the host's loading policy. No request was made and no IP, referrer, credential, local-file disclosure, or same-user policy violation was demonstrated. This is a privacy/trust-policy question, not a confirmed SSRF or data-exfiltration finding.

Validation: use a disposable vault and isolated loopback image endpoint under the required sandbox; observe desktop and mobile requests with dummy note content. Decide whether remote covers are an intentional feature. If an explicit local-only policy is required, enforce it at the shared resolver and cover both views; do not silently remove an existing feature during this audit.

### Candidate validation plan

| ID | Current state | Missing decisive evidence | Minimal validation and prospective fix |
|---|---|---|---|
| S2 | `needs_validation`; no security severity | Actual adapter handling of absolute, drive-relative, UNC, and separator variants; attacker control over the requested destination | Static tests can establish acceptance by `escapesVault`, but not an outside-vault write. Use a disposable vault with an adjacent dummy sentinel and exact desktop/mobile adapters. Reject non-relative paths at the shared guard; evaluate symlink semantics separately. |
| S3 | Hardening candidate; no security severity | Actual frontmatter object prototype, value type, serialization, and security-relevant consumer | Use dummy frontmatter with an own `__proto__` key and an object value; check only local object identity, serialized output, and reparse. Include gateway single/bulk/date writes and template merges. `constructor`/`prototype` assignments alone are not global prototype pollution. |
| P1 | Privacy observation | Whether remote cover loading violates the intended user policy; host request behavior | Observe dummy loopback image loads without contacting remote services; document the policy and apply it consistently if changed. |

## Latest-stable upgrade policy and plan

Maintainer direction: target the latest stable official Obsidian API package and every direct runtime/development dependency. Audit and planning only are authorized in this pass; do not update manifests, lockfiles, remote PRs, or installed packages. Exclude prerelease channels and verify npm's `latest` metadata against the published version and official release notes. Recheck at implementation time: this document is a dated snapshot, not a perpetual version authority.

`package.json` currently declares `obsidian` 1.14.4. The API package version is distinct from the installed desktop/mobile app and from `manifest.json:minAppVersion`. Check the [official API package](https://www.npmjs.com/package/obsidian) and [official application changelog](https://obsidian.md/changelog/) separately; raise minimum application support only when required by APIs actually used.

Current policy conflicts are visible in `.github/dependabot.yml`: Obsidian, Biome, and `@eslint/json` updates are ignored; ESLint major, TypeScript minor/major, and Node type major updates are held. The comments cite shared engineering/conformance requirements and peer compatibility. These are upgrade blockers to resolve with the shared standard and compatible tooling, not evidence that an old pin satisfies latest stable. Do not weaken conformance tests to obtain a green result.

### Registry snapshot (2026-11-16)

Read-only requests to `https://registry.npmjs.org/<encoded-package-name>/latest` succeeded for all 21 direct packages. The following are registry `latest` versions, not installed versions or a claim that compatibility is verified. Current declarations come from `package.json`; ranges may already resolve newer versions.

| Package | Declared | Registry latest |
|---|---|---|
| `@jaeungkim/gantt-chart` | `1.5.1` | `1.7.0` |
| `fullcalendar` | `^7.1.0` | `7.1.5` |
| `preact` | `^10.29.8` | `11.2.0` |
| `temporal-polyfill` | `^1.0.5` | `1.0.8` |
| `@biomejs/biome` | `2.5.15` | `2.6.8` |
| `@commitlint/cli` | `^21.2.3` | `21.2.4` |
| `@commitlint/config-conventional` | `^21.2.3` | `21.2.4` |
| `@eslint/json` | `0.14.0` | `2.1.1` |
| `@types/node` | `^24.19.0` | `26.6.6` |
| `@typescript-eslint/parser` | `^8.71.1` | `8.72.2` |
| `@vitest/coverage-v8` | `^5.0.3` | `5.1.0` |
| `esbuild` | `^0.28.2` | `0.28.2` |
| `eslint` | `^9.39.5` | `10.15.0` |
| `eslint-plugin-obsidianmd` | `^0.4.2` | `0.6.0` |
| `happy-dom` | `^20.14.5` | `21.0.4` |
| `husky` | `^9.1.7` | `9.1.7` |
| `obsidian` | `1.14.4` | `1.14.4` |
| `rumdl` | `^0.2.78` | `0.3.4` |
| `typescript` | `^6.0.3` | `7.0.2` |
| `typescript-eslint` | `^8.71.1` | `8.72.2` |
| `vitest` | `^5.0.3` | `5.1.0` |

The official Obsidian API package is already at registry latest. The following compatibility blockers must stay visible:

- Latest `typescript-eslint` and `@typescript-eslint/parser` declare TypeScript `>=4.8.4 <6.1.0`; TypeScript `7.0.2` is outside that range. Updating all three to latest cannot currently satisfy their declared peers. Track upstream support or evaluate a supported tooling migration; do not suppress the constraint.
- Latest Preact declares a `preact-render-to-string >=6.7.0` peer. Determine whether it is required for this client-only build before changing the dependency graph; preserve the no-React architecture. The chart still declares React/React DOM peers, so version numbers alone do not validate the alias integration.
- Latest FullCalendar declares `temporal-polyfill ^1.0.7`; plan them together. Latest coverage requires matching Vitest `5.1.0`.
- `.node-version` selects Node 24 while latest Node types are 26. Align the runtime policy and supported APIs before adopting types from another major; Node latest stable was not checked in this pass.
- Correction during implementation: `pnpm-lock.yaml` is a two-document YAML stream. Its first document pins pnpm; its second contains the application importer and resolutions. The previous claim that application resolutions were absent was an inspection error. This layout is documented by [pnpm's lockfile documentation](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/lockfile.md). No speculative lockfile repair is needed; frozen-install validation remains pending.
- `pnpm-workspace.yaml` has an Obsidian peer override and `minimumReleaseAgeStrict: true`. Reconcile those policies with future stable upgrades explicitly; do not silently bypass release-age checks. pnpm latest stable was not checked here.

Implementation order after this audit:

1. Capture current manifest ranges, exact lockfile resolutions, registry stable versions, Node engines, peer ranges, official migration notes, and advisory applicability for every direct package. Date the inventory; include development tooling and the pnpm/Node toolchain.
2. Update the shared engineering/conformance baseline for the official Obsidian API and pinned tooling. Review API changes against `minAppVersion` and desktop/mobile behavior; preserve the release gate and `versions.json` requirements.
3. Upgrade lint/test tooling as compatible groups: ESLint with its Obsidian plugin and TypeScript parser; TypeScript with typescript-eslint; Vitest with coverage and DOM environment. Replace the private parser import using a supported API. Reassess transitive advisories after resolution; overrides require compatibility evidence.
4. Upgrade runtime libraries in isolated slices. Separate calendar/temporal changes from Gantt/Preact; then resolve chart scale callbacks, virtualization, and React-to-Preact aliases against latest stable. Leave failing upgrades open with exact reproductions rather than adding indefinite ignores.
5. In an environment meeting the skill's sandbox requirements, run focused regressions, `pnpm run verify`, and full/production dependency audits on the final tree. Inspect release artifacts and provenance; obtain maintainer-reported native desktop/mobile acceptance separately. A green CI run does not establish native acceptance.

Completion requires all direct packages on verified current stable versions, resolved compatibility blockers, a justified minimum app version, and passing final checks. Neither that state nor an empty advisory report has been established in this enrichment.

## Implementation handoff

The maintainer requested an easiest-first implementation plan and branch relevance review. See [the implementation plan](../../tasks/plan.md) and [task checklist](../../tasks/todo.md) for prerequisites, verification, GitHub Flow/release-please boundaries, and completed branch cleanup. The repository-state table above is the original audit snapshot; it is not the post-cleanup branch inventory.

Track TypeScript support through [typescript-eslint #10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940). On 2026-11-16 the issue remains open, but its external-API blocker label has been removed and maintainers report work-in-progress TS7.1 integration. Keep the supported TS6 toolchain as an explicit temporary exception until stable support is published; the original absence-of-API explanation should not be treated as a current verified blocker.

Implementation started on `fix/repository-remediation`. The maintainer reaffirmed strict sandbox execution and declined ordinary Windows development tests/installations. Per-test timeout changes and security regression-test drafts are prepared; production hardening fixes remain pending. After maintainer clarification, Linux Node 24.15.0 was located in fnm and executed successfully inside bubblewrap. A focused Vitest launch then failed before test collection because the Windows dependency tree lacks Rolldown 1.2.9's Linux native binding and WASI fallback. No regression test result or dependency upgrade is claimed. See the task checklist's execution-state section for controls and the remaining Linux-dependency blocker; no packages were installed.
