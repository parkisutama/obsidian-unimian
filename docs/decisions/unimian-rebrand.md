# Unimian identity decision

Status: Accepted by the maintainer on 2026-09-29. Local preparation only.

## Decision

The product formerly named **Wise View** is rebranded as **Unimian**.

| Surface | Current value | Unimian value |
| --- | --- | --- |
| Display name | `Wise View` | `Unimian` |
| Obsidian plugin ID and install folder | `wise-view` | `unimian` |
| Package name | `obsidian-wise-view` | `obsidian-unimian` |
| GitHub repository target | `parkisutama/obsidian-wise-view` | `parkisutama/obsidian-unimian` |
| Release archive | `wise-view.zip` | `unimian.zip` |
| Bases view ID prefix | `wise-view-*` | `unimian-*` |
| Plugin CSS class and variable prefix | `wise-view-*` | `unimian-*` |

The plugin is being prepared locally. Do not rename the GitHub repository, push, publish a release, submit to the Obsidian Community Directory, or deploy to an operational vault as part of this decision.

## Scope and invariants

- Replace the active product name, repository references, package identity, install-folder guidance, and release archive name.
- Keep the existing product positioning and feature set. The rebrand does not change view behavior, editor behavior, plugin settings schema, or note/frontmatter data.
- Rename registered Bases view IDs and CSS hooks to the `unimian-*` prefix. No vault `.base` files are changed as part of local preparation; any existing view type references need manual updating if they are used.
- Keep stored view option keys unchanged so existing view settings retain their shape when a `.base` file uses a renamed view type.
- Keep third-party license terms, copyright notices, and source attribution intact; update only references to the current product identity.
- No note/frontmatter data or settings-schema migration is required. If an existing `.base` file
  stores an old view type, change that type to its `unimian-*` ID manually; the plugin does not
  register aliases for the old IDs. The maintainer is the only current user.
- Preserve the current version metadata during local preparation. Choose a release version when a release is authorized; its tag must match `manifest.json`.

## Obsidian directory constraints for a future submission

- The plugin ID must be unique, use lowercase letters and hyphens, and must not contain `obsidian`. The install folder must match the ID.
- The display name must be unique and must not contain `Obsidian` or `Plugin`.
- The manifest description must be no longer than 250 characters and end with a period.
- A directory submission requires the final manifest on the default branch and a GitHub release with a matching version tag and the required plugin assets.
- Submit through the Obsidian Community Directory flow when publication is later authorized.

## Historical identifiers

The old `wise-view-*` identifiers are retained only in historical notes and in the old-to-new mapping above. They are no longer registered by Unimian.

Historical task reports and the license-compliance plan retain the Wise View name where it records the identity used at the time. Update active product documentation and runtime copy; do not rewrite historical acceptance evidence.
