# skpm: Skills Package Manager

<!-- belmont:codex-skill-routing:start -->
## Belmont Skill Routing (Codex)

- Belmont skills are local markdown files in `.agents/skills/belmont/` (and mirrored in `.codex/belmont/`).
- If the user says `belmont:<skill>` or "Use the belmont:<skill> skill", treat it as a skill reference, not a shell command.
- Load `.agents/skills/belmont/<skill>.md` first (fallback to `.codex/belmont/<skill>.md`) and follow that workflow.
- Known Belmont skills: `product-plan`, `tech-plan`, `implement`, `next`, `verify`, `status`, `reset`.
- If a requested skill file is missing, list available files in those directories and continue with the closest matching Belmont skill.
<!-- belmont:codex-skill-routing:end -->
