# Decision record: granting write access to a new view (Gantt)

Status: Accepted 2026-09-19 (maintainer interview)
Context spec: [../specs/gantt.md](../specs/gantt.md) D2

## Context

The architecture guard (`tests/architecture.test.ts`, T005) forbids new views from mutating the
vault. Only the three legacy views (Calendar, Gantt, Swimlane) may write, and
`ViewCapabilities.legacyMutation` "must not be set on a new view without a separately approved
decision". Timeline, the only view added since, received such a decision for one narrow case:
quick scheduling writes only its configured start/end dates, through `LegacyMutationGateway`
with `legacyMutation` declared (docs/specs/timeline.md).

Gantt cannot meet its purpose without writing: date, progress, dependency, parent, and
order edits all persist to note properties.

## Decision

Gantt may write, under these conditions:

1. Writes go **only** through the capability interfaces in `src/platform/mutations/`
   (`DateMutationCapability`, `PropertyMutationCapability`, `DependencyMutationCapability`,
   `FileCreateCapability`). `src/views/gantt/` joins `GUARDED_MUTATION_DIRS`, so a direct
   `processFrontMatter`/`vault.modify` call there fails the guard.
2. The grant is declared on the view descriptor as `capabilities.mutations` (not
   `legacyMutation`), listing only `date`, `property`, `dependency`, and `fileCreate`. The view
   receives exactly those capabilities from `ViewRegistry.mutationsFor`, never the full gateway;
   trash and move are not grantable. Only ids in `APPROVED_MUTATION_GRANT_VIEW_IDS` may declare a
   grant, and `src/views/gantt/` may not import `LegacyMutationGateway` (GBETA-003).
3. Gantt never trashes or moves notes, and never edits note bodies. It writes frontmatter
   properties and creates new notes from a template.

## Consequences for plugin compatibility

This is the first new view granted broad property writes and note creation (Timeline writes
only start/end), so it sets a precedent. Future decisions should
weigh the following before granting the same capability to another view:

- **Shared property ownership.** Gantt writes to properties that other plugins may also
  own (task managers, Dataview/Tasks-style workflows, Templater-created fields, Obsidian
  Calendar/Full Calendar plugins). The same note can be edited by several plugins; Unimian
  writes must stay minimal (changed fields only) and format-preserving (keep list vs. comma
  shape, keep `Date` vs. `Date & time` shape) to avoid churn and conflicts.
- **Format contracts.** Gantt writes local floating dates (`YYYY-MM-DD`,
  `YYYY-MM-DDTHH:mm`) and wiki-link lists. Plugins that expect ISO `Z` timestamps or plain-text
  ids will not interoperate without a conversion setting — a future change to either format is
  a compatibility change and needs its own decision. Zoned values may be read and presented in
  the runtime local timezone, with that context disclosed in UI, but this acceptance does not
  authorize a new zoned-write contract or silent preservation/conversion claims.
- **New properties.** Gantt introduces optional per-type dependency properties (SS/FF/SF)
  and an Order property. Their names are user-chosen in Bases options, never hard-coded, so
  users can align them with other plugins' conventions.
- **Write frequency.** A single gesture (summary drag, dependency cascade) can modify many
  notes. Other plugins reacting to `metadataCache` changes (indexers, sync, git plugins) will
  see bursts; batching and changed-fields-only writes are required, not optional.
- **Precedent scope.** This decision grants Gantt only. Granting another view requires a
  new entry in this file naming the view, the capabilities, and the properties it writes, plus
  its id in `APPROVED_MUTATION_GRANT_VIEW_IDS` (`src/viewRegistry.ts`).

## Revisit when

- Another view requests write access.
- Obsidian ships a first-party write API for Bases views that supersedes this gateway.
- A compatibility conflict with another plugin is reported against a Gantt write.
- A view proposes preserving or producing `Z`/offset datetime values; review the other plugins
  that share those properties before choosing instant-preserving semantics.
