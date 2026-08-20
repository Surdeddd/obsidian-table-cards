# Community directory submission

<!-- markdownlint-disable MD013 -->

Obsidian no longer takes plugin submissions as a pull request against `obsidianmd/obsidian-releases` — that repository has pull requests closed. Submission now happens through the community directory, signed in with an Obsidian account.

## What the directory needs, and where it already stands

| Requirement | State |
| --- | --- |
| `manifest.json` at the repository root, semantic version | `0.2.2` |
| `id` unique and free of the word `obsidian` | `table-cards` |
| GitHub release tagged exactly as the manifest version, no `v` prefix | [`0.2.2`](https://github.com/Surdeddd/obsidian-table-cards/releases/tag/0.2.2) |
| Release assets `main.js`, `manifest.json`, `styles.css` | attached by `.github/workflows/release.yml` on tag push |
| `README.md` describing purpose and usage | present, with screenshots |
| `LICENSE` | MIT |
| Developer policies: no telemetry, no network client, no Node or Electron imports | holds; runtime code uses public Obsidian API only |

## Steps that need the account owner

1. Sign in at <https://community.obsidian.md> with the Obsidian account.
2. Link the GitHub account that owns `Surdeddd/obsidian-table-cards`.
3. Add the plugin to the directory and point it at that repository.
4. Read the automated review output. Every error it reports is fixed in the repository, then a new tagged release is published — the workflow attaches the artifacts automatically.

## Details to hand the form

- Repository: `Surdeddd/obsidian-table-cards`
- Plugin id: `table-cards`
- Name: `Table Cards`
- Author: `Maxim Kravtsov`
- Description: `Study Markdown tables as adaptive, all-visible cards with a visual layout editor.`
- Minimum app version: `1.6.7` — the floor the harness verifies; also verified on 1.13.7 and on Android.

## Directory review of 0.1.0, and what changed (2026-08-20)

| Review item | Answer |
| --- | --- |
| Release has no description | Both `0.1.0` and `0.2.0` carry the changelog section for that version. |
| Missing artifact attestations | `release.yml` runs `actions/attest-build-provenance` for `main.js`, `manifest.json`, and `styles.css`; every release from `0.2.1` on is attested. |
| Vault enumeration (`getMarkdownFiles`) | Used only to fill the note picker in setup and the editor, and to expand a folder source into its notes. The plugin reads a file only when it belongs to a deck source, and never writes to a vault note. |
| Unsafe values from typed code (`no-unsafe-*`) | The reported sites were `Array.at`, `flatMap`, `matchAll`, and `Object.fromEntries` — APIs newer than the declared `ES2018` target, which type to `any` under an older lib and would throw on an older mobile WebView. All of them are gone from `src/`, and `typescript-eslint`'s type-checked rules now run over the whole repository. |
| Unnecessary assertion in `settings/defaults.ts` | Removed with the same pass. |
| `getSettingDefinitions()` not implemented | Deliberate. The declarative settings API arrived in 1.13.0; this plugin supports 1.6.7, where it does not exist. `display()` stays the render path, and the rule is switched off for that one file with the reason in `eslint.config.mts`. |
| `display` / `setWarning` deprecated | Same floor argument. Internal re-renders no longer call the deprecated entry point, and `setWarning()` remains the only destructive-button API that exists at 1.6.7. |
| `!important` | None left. Specificity and source order carry every override, including the visually-hidden helper and the `prefers-reduced-motion` reset. |
| `:has()` | Replaced by state classes the plugin sets itself (`is-launcher`, `is-scope-open`, `is-sheet-open`). No `:has()` remains in `styles.css`. |

## The two findings that stay open, and why

Both come from one decision: `minAppVersion` is `1.6.7`.

- **`getSettingDefinitions()` is not implemented.** The declarative settings API landed in 1.13.0.
  Implementing it while keeping `display()` for 1.6.7 means two renderings of the same tab, and
  `eslint-plugin-obsidianmd` correctly refuses 1.13 APIs under a 1.6.7 floor — the suppression would
  have to be wider than the problem. The cost is that Table Cards settings do not show up in
  Obsidian's settings search for users on 1.13 or later.
- **`setWarning()` instead of `setDestructive()`.** `setDestructive()` also arrived in 1.13.0. At the
  declared floor `setWarning()` is the only destructive-button API that exists.

Raising the floor to 1.13.0 clears both, at the price of dropping every user below it. The owner
decided on 2026-08-20 to keep 1.6.7 and let both findings stand, so the plugin keeps working on the
version it is actually used on.

## Guideline audit (2026-08-20)

Checked against [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines): no global `app`,
no console output, no `innerHTML`/`outerHTML`, no regex lookbehind, no `any` casts, no `var`, no default hotkeys,
no Node or Electron imports, no `Vault.modify` on user notes, settings headings through `setHeading()`.

## Cutting a new release

```bash
# bump manifest.json and versions.json together, then
git tag -a <version> -m "Table Cards <version>"
git push origin <version>
```

The tag push runs tests, lint, and the production build, refuses to publish when the tag and the manifest version disagree, and attaches exactly the three runtime artifacts.
