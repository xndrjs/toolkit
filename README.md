# Libraries monorepo

A collection of npm-publishable packages using a **pnpm** workspace. Each library lives under `packages/<name>`.

## Requirements

- Node **25** (see `engines` in `package.json`)
- [pnpm](https://pnpm.io) **9.15** (matches `packageManager`)

## Useful commands

| Command               | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `pnpm install`        | Install dependencies for the whole workspace                     |
| `pnpm build:packages` | Run `build` in each `packages/*` package that defines the script |
| `pnpm test`           | Run tests for all packages                                       |
| `pnpm changeset`      | Create or update a release note (files under `.changeset/`)      |

## npm releases (stable and **alpha**)

We use [**Changesets**](https://github.com/changesets/changesets) to version and publish. Public **scoped** packages use `access: public` (see `.changeset/config.json`).

### GitHub secrets and permissions

#### `NPM_TOKEN` (you must create this)

This is a **repository secret** that holds an npm automation token so CI can run `pnpm changeset publish`.

1. Sign in at [npmjs.com](https://www.npmjs.com) with an account that is allowed to publish under your scope (e.g. member of the `@xndrjs` org, or owner of the user scope).
2. Open **Access Tokens**:
   - **Granular token** (recommended): create a token with **Packages and scopes** → permission to **Read and write** for the relevant packages (or the whole scope / org, depending on how npm presents it).
   - **Classic token**: type **Automation** (or **Publish**) so it can publish from CI without 2FA prompts.
3. Copy the token once npm shows it (you will not see it again).
4. In GitHub: open the repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
5. Name: **`NPM_TOKEN`**, value: paste the token → save.

The workflows pass this to npm as `NPM_TOKEN` / `NODE_AUTH_TOKEN` (see `.github/workflows/release-*.yml`). If publish fails with **403** or **404**, the token usually lacks publish rights for that scope or the package name is not created yet under your org.

#### `GITHUB_TOKEN` (usually nothing to paste)

GitHub Actions **injects** `secrets.GITHUB_TOKEN` automatically for each run. You do **not** need to add a secret named `GITHUB_TOKEN` in the UI unless you intentionally override it.

The **stable** workflow grants the job `contents: write` and `pull-requests: write` so the Changesets action can open/update the “Version Packages” PR and push commits. The **alpha** workflow uses `contents: write` so it can push the version bump after publish.

If PR creation fails with permission errors, check the repo’s **Settings** → **Actions** → **General** → **Workflow permissions**: enable **Read and write permissions** for workflows (or the default token will stay read-only and cannot open PRs or push).

### Day-to-day: changes and changesets

1. Develop on a feature branch.
2. When the change should ship to npm, from the repo root run:
   ```bash
   pnpm changeset
   ```
   Pick the package and bump type (`patch` / `minor` / `major`).
3. Commit the generated files under `.changeset/` together with your code.

### **Alpha** releases (`alpha` branch, npm dist-tag `alpha`)

Alpha lines use **prerelease semver** (e.g. `0.1.1-alpha.0`, `0.1.1-alpha.1`), **not** snapshot versions like `0.0.0-alpha-<timestamp>`. Consumers install with:

```bash
npm install @xndrjs/branded@alpha
```

#### One-time setup for the `alpha` branch

1. Create the branch from `main` (or your integration branch of choice):
   ```bash
   git checkout main
   git pull
   git checkout -b alpha
   ```
2. Enter Changesets **prerelease mode** (creates `.changeset/pre.json`):
   ```bash
   pnpm changeset pre enter alpha
   ```
3. Commit and push the branch:
   ```bash
   git add .changeset/pre.json
   git commit -m "chore: enter changesets prerelease (alpha)"
   git push -u origin alpha
   ```

**Important:** `.changeset/pre.json` should exist **only** on the `alpha` branch. Do not merge it to `main` (the stable workflow fails if it finds `pre.json` on `main`).

#### Each alpha release

1. Add a changeset (`pnpm changeset`) and merge to `alpha` like any other change.
2. On push to `alpha`, the **Release alpha** workflow (`.github/workflows/release-alpha.yml`):
   - checks `pre.json` is in `pre` mode with tag `alpha`;
   - runs tests and builds packages under `packages/*`;
   - if there are changesets to apply, runs `pnpm changeset version`, publishes with `pnpm changeset publish` (npm dist-tag `alpha` comes from `.changeset/pre.json`, not from `--tag` on the CLI), then commits the version bump (and changelog) with a message that includes `[skip ci]` to avoid CI loops.

If there are no new changesets, the workflow exits without publishing.

You can also run the workflow manually from the **Actions** tab (**Run workflow**).

### **Stable** releases (`main` branch, dist-tag `latest`)

1. Ensure **`main`** does not contain `.changeset/pre.json`.
2. Land your work (including `.changeset/` files when a release is needed).
3. On every push to `main`, the **Release stable** workflow (`.github/workflows/release-stable.yml`):
   - if there are open changesets, the [**changesets action**](https://github.com/changesets/action) opens or updates the **“Version Packages”** pull request;
   - after **merging** that PR (which updates versions and changelogs), the next push runs `pnpm changeset publish` to the registry (default tag **`latest`**).

For packages that need a build before publish (e.g. `dist/`), the publish script in the workflow includes `pnpm run build:packages`.

### Graduating from alpha to stable

When you want to promote alpha versions to normal releases:

1. On the **`alpha`** branch, leave prerelease mode and align versions (follow Changesets prompts):
   ```bash
   git checkout alpha
   pnpm changeset pre exit
   pnpm changeset version
   ```
   Resolve any conflicts; verify `package.json` and changelogs.
2. Merge `alpha` into **`main`** without bringing `.changeset/pre.json` along (after `pre exit` it is usually no longer needed in the same form; if it still exists, **do not** merge it to `main`).
3. On `main`, follow the stable flow (Version Packages PR + publish) as above.

Official details: [Prereleases](https://github.com/changesets/changesets/blob/main/docs/prereleases.md).

After `pre exit`, if you want to **keep publishing alphas** from the `alpha` branch, run `pnpm changeset pre enter alpha` again and commit the updated `pre.json` (same as the initial setup).

### Local pack (tarball)

In the `branded` package:

```bash
cd packages/branded
pnpm run pack
```

This writes `artifacts/*.tgz` (folder is gitignored). Useful to inspect what would ship before publishing.

## Packages

| Package           | Description                                  |
| ----------------- | -------------------------------------------- |
| `@xndrjs/branded` | Zod-first branded types (`packages/branded`) |
