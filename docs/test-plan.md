# SKPM Integration Test Plan

End-to-end manual test plan for verifying the CLI + Registry work together.

## Prerequisites

```sh
# Node 21+ required
node --version

# Install dependencies from repo root
npm install

# Build the CLI
npm run build

# Verify unit tests pass
npm test
```

After building, the CLI binary is at `apps/cli/dist/cli/index.js`. All `skpm` commands below assume this alias:

```sh
alias skpm="node $(pwd)/apps/cli/dist/cli/index.js"
```

Verify it works:

```sh
skpm --help
```

---

## Part 1: Local File Registry (Offline Round-Trip)

These tests use a local file-based registry. No network needed.

### 1.1 Set Up Test Environment

```sh
# Create a temp workspace
export TEST_ROOT=$(mktemp -d)
export LOCAL_REGISTRY="$TEST_ROOT/registry"
mkdir -p "$LOCAL_REGISTRY"

echo "Test root: $TEST_ROOT"
echo "Registry:  $LOCAL_REGISTRY"
```

### 1.2 Create and Publish a Simple Skill

```sh
# Create the skill package directory
mkdir -p "$TEST_ROOT/skills/hello-world/skills"

# Create the skill content
cat > "$TEST_ROOT/skills/hello-world/skills/hello.md" << 'EOF'
# Hello World Skill

You are a friendly greeter. When the user says hello, respond with a warm greeting.
EOF

# Create the package manifest (skpm.json)
cat > "$TEST_ROOT/skills/hello-world/skpm.json" << 'EOF'
{
  "name": "hello-world",
  "version": "1.0.0",
  "description": "A simple greeting skill",
  "dependencies": {},
  "files": ["skills/**"],
  "license": "MIT",
  "author": "Test Author",
  "skills": [{ "source": "skills/hello.md" }]
}
EOF

# Publish to local registry
skpm publish --registry "file://$LOCAL_REGISTRY"
```

**Expected output:**
```
Published hello-world@1.0.0
Registry: file:///tmp/xxx/registry
```

**Verify registry artifacts:**

```sh
# Tarball exists
ls "$LOCAL_REGISTRY/tarballs/hello-world/1.0.0.tgz"

# Root index updated
cat "$LOCAL_REGISTRY/index.json" | python3 -m json.tool

# Package index created
cat "$LOCAL_REGISTRY/packages/hello-world/index.json" | python3 -m json.tool
```

**Expected:** `index.json` lists `hello-world` with version `1.0.0`. Package index contains the manifest, integrity hash (sha256-...), and tarball path.

### 1.3 Publish a Second Version

```sh
# Update version
cat > "$TEST_ROOT/skills/hello-world/skpm.json" << 'EOF'
{
  "name": "hello-world",
  "version": "1.1.0",
  "description": "A simple greeting skill (updated)",
  "dependencies": {},
  "files": ["skills/**"],
  "license": "MIT",
  "author": "Test Author",
  "skills": [{ "source": "skills/hello.md" }]
}
EOF

skpm publish --registry "file://$LOCAL_REGISTRY"
```

**Expected:** `Published hello-world@1.1.0`. The registry `index.json` now lists versions `["1.0.0", "1.1.0"]` with `latest` set to `1.1.0`.

### 1.4 Duplicate Version Publish Fails

```sh
skpm publish --registry "file://$LOCAL_REGISTRY"
```

**Expected:** Error: `Registry already contains hello-world@1.1.0.`

### 1.5 Search the Local Registry

```sh
skpm search --registry "file://$LOCAL_REGISTRY"
```

**Expected:** Lists both versions of `hello-world`.

```sh
skpm search hello --registry "file://$LOCAL_REGISTRY"
```

**Expected:** Filters to `hello-world` entries.

```sh
skpm search nonexistent --registry "file://$LOCAL_REGISTRY"
```

**Expected:** `No skills found.`

### 1.6 Initialize a Consumer Project

```sh
mkdir -p "$TEST_ROOT/my-project"
cd "$TEST_ROOT/my-project"
skpm init my-project
```

**Expected:** Creates `skpm.json` with `"name": "my-project"` and empty `"skills": {}`.

**Verify:**

```sh
cat skpm.json
```

### 1.7 Add and Install a Skill

```sh
cd "$TEST_ROOT/my-project"
skpm add hello-world --registry "file://$LOCAL_REGISTRY"
```

**Expected output:**
```
Installed skills:
- hello-world@1.1.0
Added hello-world@* to skpm.json.
```

**Verify on-disk layout:**

```sh
# skpm.json updated
cat skpm.json
# Should show "skills": { "hello-world": "*" }

# Lockfile created
cat skpm-lock.json | python3 -m json.tool

# Store populated
ls .agents/skills/.store/
# Should show: hello-world@1.1.0

# Symlink created
ls -la .agents/skills/hello-world
# Should be a symlink to .store/hello-world@1.1.0

# Skill files are present
cat .agents/skills/hello-world/skills/hello.md
```

### 1.8 Add with Specific Version Range

```sh
cd "$TEST_ROOT/my-project"

# Remove first
skpm remove hello-world --registry "file://$LOCAL_REGISTRY"

# Add with pinned range
skpm add hello-world@^1.0.0 --registry "file://$LOCAL_REGISTRY"
```

**Expected:** Installs `hello-world@1.1.0` (highest matching `^1.0.0`). `skpm.json` shows `"hello-world": "^1.0.0"`.

### 1.9 Install from Lockfile (Deterministic)

```sh
cd "$TEST_ROOT/my-project"

# Wipe installed skills but keep lockfile
rm -rf .agents

# Reinstall
skpm install --registry "file://$LOCAL_REGISTRY"

# Verify same version
ls .agents/skills/.store/
# Should show hello-world@1.1.0
```

### 1.10 List Installed Skills

```sh
cd "$TEST_ROOT/my-project"
skpm list
```

**Expected:** `- hello-world@1.1.0`

### 1.11 Info Command

```sh
cd "$TEST_ROOT/my-project"
skpm info hello-world --registry "file://$LOCAL_REGISTRY"
```

**Expected:** Shows name, version, description, dependencies, files.

```sh
skpm info hello-world --version 1.0.0 --registry "file://$LOCAL_REGISTRY"
```

**Expected:** Shows info for version 1.0.0 specifically.

### 1.12 Update

```sh
cd "$TEST_ROOT/my-project"

# Publish a patch release
cat > "$TEST_ROOT/skills/hello-world/skpm.json" << 'EOF'
{
  "name": "hello-world",
  "version": "1.2.0",
  "description": "A simple greeting skill (v1.2)",
  "dependencies": {},
  "files": ["skills/**"],
  "license": "MIT",
  "author": "Test Author",
  "skills": [{ "source": "skills/hello.md" }]
}
EOF
skpm publish --registry "file://$LOCAL_REGISTRY"

# Now update the consumer project
cd "$TEST_ROOT/my-project"
skpm update --registry "file://$LOCAL_REGISTRY"
```

**Expected:** Updates to `1.2.0` (within `^1.0.0` range). Lockfile updated.

### 1.13 Remove a Skill

```sh
cd "$TEST_ROOT/my-project"
skpm remove hello-world --registry "file://$LOCAL_REGISTRY"
```

**Expected:** `hello-world` removed from `skpm.json`, lockfile updated, symlinks cleaned up.

```sh
cat skpm.json
# "skills" should be empty

ls .agents/skills/
# hello-world symlink should be gone
```

---

## Part 2: Dependencies and Conflict Resolution

### 2.1 Create a Dependency Tree

Create three skills: `utils` (leaf), `frontend` (depends on utils), `backend` (depends on utils).

```sh
# -- utils v1.0.0 --
mkdir -p "$TEST_ROOT/skills/utils/skills"
cat > "$TEST_ROOT/skills/utils/skills/utils.md" << 'EOF'
# Utils
Shared utility patterns.
EOF
cat > "$TEST_ROOT/skills/utils/skpm.json" << 'EOF'
{
  "name": "utils",
  "version": "1.0.0",
  "description": "Shared utility skill",
  "dependencies": {},
  "files": ["skills/**"],
  "license": "MIT",
  "author": "Test"
}
EOF
skpm publish --registry "file://$LOCAL_REGISTRY"

# -- utils v2.0.0 (breaking) --
cat > "$TEST_ROOT/skills/utils/skpm.json" << 'EOF'
{
  "name": "utils",
  "version": "2.0.0",
  "description": "Shared utility skill v2",
  "dependencies": {},
  "files": ["skills/**"],
  "license": "MIT",
  "author": "Test"
}
EOF
skpm publish --registry "file://$LOCAL_REGISTRY"

# -- frontend v1.0.0 (depends on utils ^1.0.0) --
mkdir -p "$TEST_ROOT/skills/frontend/skills"
cat > "$TEST_ROOT/skills/frontend/skills/frontend.md" << 'EOF'
# Frontend
Frontend development patterns.
EOF
cat > "$TEST_ROOT/skills/frontend/skpm.json" << 'EOF'
{
  "name": "frontend",
  "version": "1.0.0",
  "description": "Frontend development skill",
  "dependencies": { "utils": "^1.0.0" },
  "files": ["skills/**"],
  "license": "MIT",
  "author": "Test"
}
EOF
skpm publish --registry "file://$LOCAL_REGISTRY"

# -- backend v1.0.0 (also depends on utils ^1.0.0) --
mkdir -p "$TEST_ROOT/skills/backend/skills"
cat > "$TEST_ROOT/skills/backend/skills/backend.md" << 'EOF'
# Backend
Backend development patterns.
EOF
cat > "$TEST_ROOT/skills/backend/skpm.json" << 'EOF'
{
  "name": "backend",
  "version": "1.0.0",
  "description": "Backend development skill",
  "dependencies": { "utils": "^1.0.0" },
  "files": ["skills/**"],
  "license": "MIT",
  "author": "Test"
}
EOF
skpm publish --registry "file://$LOCAL_REGISTRY"
```

### 2.2 Install Compatible Dependencies

```sh
mkdir -p "$TEST_ROOT/dep-project"
cd "$TEST_ROOT/dep-project"
skpm init dep-project

# Add both frontend and backend (both require utils ^1.0.0)
skpm add frontend --registry "file://$LOCAL_REGISTRY"
skpm add backend --registry "file://$LOCAL_REGISTRY"
```

**Expected:**
- `frontend` and `backend` installed as top-level skills (symlinked)
- `utils@1.0.0` resolved as a shared dependency (in `.store` but NOT symlinked at top level)
- No conflict errors

**Verify:**

```sh
# Top-level symlinks exist for frontend and backend
ls -la .agents/skills/frontend
ls -la .agents/skills/backend

# utils is in the store but NOT symlinked at top level
ls .agents/skills/.store/ | grep utils
ls .agents/skills/utils 2>&1 || echo "OK: utils not exposed (dependency only)"

# Lockfile contains all three packages
cat skpm-lock.json | python3 -m json.tool
```

### 2.3 Dependency Conflict Detection

Create a skill that requires an incompatible version of utils.

```sh
# -- conflicting v1.0.0 (requires utils ^2.0.0) --
mkdir -p "$TEST_ROOT/skills/conflicting/skills"
cat > "$TEST_ROOT/skills/conflicting/skills/conflict.md" << 'EOF'
# Conflicting Skill
EOF
cat > "$TEST_ROOT/skills/conflicting/skpm.json" << 'EOF'
{
  "name": "conflicting",
  "version": "1.0.0",
  "description": "Skill that conflicts on utils",
  "dependencies": { "utils": "^2.0.0" },
  "files": ["skills/**"],
  "license": "MIT",
  "author": "Test"
}
EOF
skpm publish --registry "file://$LOCAL_REGISTRY"

# Try to add it to the project that already has frontend (utils ^1.0.0)
cd "$TEST_ROOT/dep-project"
skpm add conflicting --registry "file://$LOCAL_REGISTRY"
```

**Expected:** Install fails with a conflict error showing the dependency paths:
```
Conflict on utils: ^1.0.0 (frontend -> utils) vs ^2.0.0 (conflicting -> utils)
```

### 2.4 JSON Error Output

```sh
cd "$TEST_ROOT/dep-project"
skpm add conflicting --registry "file://$LOCAL_REGISTRY" --json
```

**Expected:** JSON output with `"ok": false` and error details.

---

## Part 3: Tool Integration (Symlinks)

### 3.1 Auto-Detect Claude

```sh
mkdir -p "$TEST_ROOT/tool-project"
cd "$TEST_ROOT/tool-project"
skpm init tool-project

# Create .claude directory to trigger auto-detection
mkdir -p .claude

skpm add hello-world --registry "file://$LOCAL_REGISTRY"
```

**Expected:** Creates symlink at `.claude/agents/hello-world` pointing to `.agents/skills/hello-world`.

```sh
ls -la .claude/agents/hello-world
```

### 3.2 Explicit Tool Override

```sh
mkdir -p "$TEST_ROOT/tool-override"
cd "$TEST_ROOT/tool-override"
skpm init tool-override

skpm add hello-world --registry "file://$LOCAL_REGISTRY" --tool claude,cursor
```

**Expected:** Creates symlinks for both Claude and Cursor (even if their directories don't exist yet):

```sh
# Claude symlink
ls -la .claude/agents/hello-world

# Cursor creates .mdc files from .md files
ls -la .cursor/rules/hello-world/
```

### 3.3 Multiple Tool Targets

```sh
mkdir -p "$TEST_ROOT/multi-tool"
cd "$TEST_ROOT/multi-tool"
skpm init multi-tool
mkdir -p .claude .windsurf .gemini

skpm add hello-world --registry "file://$LOCAL_REGISTRY"
```

**Expected:**

```sh
ls -la .claude/agents/hello-world     # exists
ls -la .windsurf/rules/hello-world    # exists
ls -la .gemini/rules/hello-world      # exists
```

---

## Part 4: Live Registry Tests

These tests verify the deployed registry at `registry.skpm.dev` and API at `api.skpm.dev`.

### 4.1 API Health Check

```sh
curl -s https://api.skpm.dev/api/health
```

**Expected:** `{"ok":true}`

### 4.2 Registry Index Accessible

```sh
curl -s https://registry.skpm.dev/index.json | python3 -m json.tool
```

**Expected:** Returns JSON with a `packages` object (may be empty if nothing published yet).

### 4.3 Unauthenticated Publish Rejected

```sh
curl -s -X POST https://api.skpm.dev/api/publish
```

**Expected:** `{"ok":false,"error":"Unauthorized"}`

### 4.4 Publish via API (Requires Token)

This test requires the `SKPM_PUBLISH_TOKEN`. Skip if you don't have it.

```sh
# Build a test tarball
cd "$TEST_ROOT/skills/hello-world"
cat > skpm.json << 'EOF'
{
  "name": "test-hello",
  "version": "0.0.1",
  "description": "Test publish to live registry",
  "dependencies": {},
  "files": ["skills/**"],
  "license": "MIT",
  "author": "Test"
}
EOF

# Create tarball manually
tar -czf "$TEST_ROOT/test-hello-0.0.1.tgz" -C "$TEST_ROOT/skills/hello-world" skills skpm.json

# Compute integrity (sha256 of the files)
INTEGRITY="sha256-$(shasum -a 256 "$TEST_ROOT/test-hello-0.0.1.tgz" | cut -d' ' -f1)"

# Publish via curl
curl -X POST https://api.skpm.dev/api/publish \
  -H "Authorization: Bearer $SKPM_PUBLISH_TOKEN" \
  -F "metadata={\"name\":\"test-hello\",\"version\":\"0.0.1\",\"manifest\":{\"name\":\"test-hello\",\"version\":\"0.0.1\",\"description\":\"Test publish to live registry\",\"dependencies\":{},\"files\":[\"skills/**\"],\"license\":\"MIT\",\"author\":\"Test\"},\"integrity\":\"$INTEGRITY\",\"tarball\":\"tarballs/test-hello/0.0.1.tgz\"}" \
  -F "tarball=@$TEST_ROOT/test-hello-0.0.1.tgz"
```

**Expected:** `{"ok":true,"name":"test-hello","version":"0.0.1"}`

### 4.5 Install from Live Registry

After publishing to the live registry (4.4), test install:

```sh
mkdir -p "$TEST_ROOT/live-project"
cd "$TEST_ROOT/live-project"
skpm init live-project
skpm add test-hello
```

**Expected:** Installs `test-hello@0.0.1` from `https://registry.skpm.dev`.

```sh
ls .agents/skills/test-hello/skills/
cat .agents/skills/test-hello/skills/hello.md
```

### 4.6 Search Live Registry

```sh
skpm search
```

**Expected:** Lists all published skills from the live registry.

### 4.7 Duplicate Publish to API Returns 409

```sh
curl -X POST https://api.skpm.dev/api/publish \
  -H "Authorization: Bearer $SKPM_PUBLISH_TOKEN" \
  -F "metadata={\"name\":\"test-hello\",\"version\":\"0.0.1\",\"manifest\":{\"name\":\"test-hello\",\"version\":\"0.0.1\",\"description\":\"Test\",\"dependencies\":{},\"files\":[\"skills/**\"],\"license\":\"MIT\",\"author\":\"Test\"},\"integrity\":\"sha256-abc\",\"tarball\":\"tarballs/test-hello/0.0.1.tgz\"}" \
  -F "tarball=@$TEST_ROOT/test-hello-0.0.1.tgz"
```

**Expected:** `{"ok":false,"error":"Version already exists: test-hello@0.0.1"}` with HTTP 409.

---

## Part 5: Edge Cases and Error Handling

### 5.1 Init Without Name Infers from Directory

```sh
mkdir -p "$TEST_ROOT/auto-name-project"
cd "$TEST_ROOT/auto-name-project"
skpm init
cat skpm.json
```

**Expected:** `"name": "auto-name-project"` (inferred from directory name).

### 5.2 Install Without skpm.json Fails

```sh
cd /tmp
skpm install 2>&1
```

**Expected:** `Missing skpm.json. Run 'skpm init' first.`

### 5.3 Publish Without skpm.json Fails

```sh
cd /tmp
skpm publish --registry "file://$LOCAL_REGISTRY" 2>&1
```

**Expected:** `Missing skpm.json. Publish must be run from a package root.`

### 5.4 Publish with No Matching Files Fails

```sh
mkdir -p "$TEST_ROOT/skills/bad-skill"
cat > "$TEST_ROOT/skills/bad-skill/skpm.json" << 'EOF'
{
  "name": "bad-skill",
  "version": "0.1.0",
  "description": "Bad skill",
  "dependencies": {},
  "files": ["nonexistent/**"],
  "license": "MIT",
  "author": "Test"
}
EOF

cd "$TEST_ROOT/skills/bad-skill"
skpm publish --registry "file://$LOCAL_REGISTRY" 2>&1
```

**Expected:** `No files match pattern: nonexistent/**`

### 5.5 Add Nonexistent Skill Fails

```sh
cd "$TEST_ROOT/my-project"
skpm add does-not-exist --registry "file://$LOCAL_REGISTRY" 2>&1
```

**Expected:** Error about missing registry metadata.

### 5.6 JSON Mode

```sh
cd "$TEST_ROOT/my-project"
skpm list --json
skpm search --registry "file://$LOCAL_REGISTRY" --json
```

**Expected:** Structured JSON output wrapped in `{ "ok": true, "data": [...] }`.

### 5.7 Publish to HTTP Registry Fails (Not Yet Supported)

```sh
cd "$TEST_ROOT/skills/hello-world"
skpm publish --registry "https://registry.skpm.dev" 2>&1
```

**Expected:** `Publish requires a file:// registry URL or an explicit registryBaseDir. HTTP upload is not supported yet.`

---

## Part 6: Homepage and DNS

### 6.1 Homepage

```sh
curl -sI https://skpm.dev | head -1
```

**Expected:** `HTTP/2 200`

### 6.2 WWW Redirect

```sh
curl -sI https://www.skpm.dev | grep -i location
```

**Expected:** Redirects to `https://skpm.dev/`

---

## Cleanup

```sh
rm -rf "$TEST_ROOT"

# Optionally clear the registry cache
rm -rf ~/.skpm/registry
```

---

## Quick Reference

| Command | What It Does |
|---------|-------------|
| `skpm init [name]` | Create `skpm.json` |
| `skpm search [query]` | Search registry |
| `skpm add <name[@range]>` | Add skill to manifest + install |
| `skpm install` | Install from manifest/lockfile |
| `skpm update` | Re-resolve and update lockfile |
| `skpm list` | Show installed skills |
| `skpm remove <name>` | Remove skill |
| `skpm info <name>` | Show skill details |
| `skpm publish` | Publish to registry |

| Flag | Purpose |
|------|---------|
| `--registry <url>` | Override registry (file://, http://, https://) |
| `--tool <name[,name]>` | Override tool targets (claude, cursor, windsurf, gemini, codex, copilot) |
| `--json` | JSON output |
| `--verbose` | Verbose logging |
