# Community directory submission

<!-- markdownlint-disable MD013 -->

Obsidian no longer takes plugin submissions as a pull request against `obsidianmd/obsidian-releases` — that repository has pull requests closed. Submission now happens through the community directory, signed in with an Obsidian account.

## What the directory needs, and where it already stands

| Requirement | State |
| --- | --- |
| `manifest.json` at the repository root, semantic version | `0.1.0` |
| `id` unique and free of the word `obsidian` | `table-cards` |
| GitHub release tagged exactly as the manifest version, no `v` prefix | [`0.1.0`](https://github.com/Surdeddd/obsidian-table-cards/releases/tag/0.1.0) |
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
- Minimum app version: `1.6.7` — the floor the harness verifies; also verified on 1.13.7.

## Cutting a new release

```bash
# bump manifest.json and versions.json together, then
git tag -a <version> -m "Table Cards <version>"
git push origin <version>
```

The tag push runs tests, lint, and the production build, refuses to publish when the tag and the manifest version disagree, and attaches exactly the three runtime artifacts.
