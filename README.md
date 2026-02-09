# SKPM CLI

SKPM is a v0 skills package manager for AI tools (Claude Code, Codex, Cursor, Windsurf, etc.). It installs, updates, searches, and publishes skills from an HTTP registry with deterministic lockfiles.

## Quick Start

```bash
skpm init
skpm add frontend
skpm install
```

## Commands

- `skpm init [name]` - Create a project `skpm.json`
- `skpm search [query]` - Search the registry
- `skpm add <name[@range]>` - Add a skill and install
- `skpm install` - Install skills from `skpm.json`
- `skpm update` - Update versions and reinstall
- `skpm list` - List installed skills
- `skpm remove <name>` - Remove a skill and reinstall
- `skpm info <name> [--version <version>]` - Show skill info
- `skpm publish` - Publish a skill package to the registry

Global options:

- `--registry <url>` - Override registry URL
- `--tool <name[,name]>` - Override agent targets for install
- `--json` - JSON output
- `--verbose` - Verbose logging

## Manifests

### Project Manifest (`skpm.json`)

```json
{
  "name": "my-project",
  "skills": {
    "frontend": "^1.2.0",
    "backend": "~2.0.0"
  },
  "registry": "https://registry.skpm.dev",
  "agentTargets": ["claude", "codex"]
}
```

Required fields:

- `name`
- `skills` (map of skill name -> semver range)

Optional fields:

- `registry`
- `agentTargets`

### Package Manifest (`skpm.json` in a skill package)

```json
{
  "name": "frontend",
  "version": "1.2.3",
  "description": "Frontend skills",
  "dependencies": {
    "base": "^1.0.0"
  },
  "files": ["skills/**", "agents/**"],
  "license": "MIT",
  "author": "Your Name",
  "skills": [{ "source": "skills/frontend.md" }],
  "agents": [{ "source": "agents/frontend.md" }]
}
```

Required fields:

- `name`
- `version`
- `description`
- `files` (glob patterns relative to package root)
- `license`
- `author`

Optional fields:

- `dependencies`
- `skills`
- `agents`

### Lockfile (`skpm-lock.json`)

```json
{
  "lockfileVersion": 1,
  "registry": "https://registry.skpm.dev",
  "root": {
    "name": "my-project",
    "skills": {
      "frontend": "^1.2.0"
    }
  },
  "packages": {
    "frontend@1.2.3": {
      "name": "frontend",
      "version": "1.2.3",
      "dependencies": {
        "base": "^1.0.0"
      },
      "resolved": {
        "base": "1.0.4"
      },
      "integrity": "sha256-..."
    }
  }
}
```

## Registry Layout

The registry is a static HTTP layout with metadata + tarballs:

```
index.json
packages/<name>/index.json
tarballs/<name>/<version>.tgz
```

Each package index entry includes the package `manifest`, `integrity`, and `tarball` path. The default registry URL used by the CLI is `https://registry.skpm.dev`.

## Tool Integration

SKPM installs packages into:

```
.agents/skills/.store/<name>@<version>/
```

Then exposes a single version per top-level skill:

```
.agents/skills/<name> -> .store/<name>@<version>
```

Tool-specific symlinks (auto-detected unless `--tool` / `agentTargets` is set):

- Claude: `.claude/agents/<name>` -> `../../.agents/skills/<name>`
- Codex: `.codex/<name>` -> `../.agents/skills/<name>`
- Cursor: `.cursor/rules/<name>/*.mdc` -> `.agents/skills/<name>/*.md`
- Windsurf: `.windsurf/rules/<name>` -> `../../.agents/skills/<name>`
- Gemini: `.gemini/rules/<name>` -> `../../.agents/skills/<name>`
- Copilot: `.github/<name>` -> `../.agents/skills/<name>`

## Examples

### Initialize

```bash
skpm init
```

### Add and Install

```bash
skpm add frontend@^1.2.0
```

### Update

```bash
skpm update
```

### Publish

From a skill package root (with a package `skpm.json`):

```bash
skpm publish
```

This writes a tarball and metadata into a file-based registry directory, updating `index.json` and `packages/<name>/index.json`. The CLI requires a local registry path (e.g. `--registry file:///path/to/registry` or `--registry ./local-registry`) because HTTP upload is not supported yet.

## Development

```bash
npm run typecheck
npm run lint:fix
npm run test
npm run build
```
