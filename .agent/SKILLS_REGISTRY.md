# Skills Registry (`v1.0.0`)

Verified inventory of native factory workflow skills, bundled engineering standards skills, external discovery sources, and upstream integrations.

## 1. Core Factory Skills (`15`) & Workflows (`15`)

- **Paths:** `.agents/skills/factory-*/SKILL.md`, `.agents/workflows/factory-*.md`, `.cursor/skills/factory-*/SKILL.md`
- **Commands:** `factory-init`, `factory-plan`, `factory-build`, `factory-status`, `factory-test`, `factory-review`, `factory-fix`, `factory-release`, `factory-resume`, `factory-verify`, `factory-security`, `factory-update`, `factory-learn`, `factory-skills`, `factory-deploy`.

## 2. Engineering Standards Skills (`10`)

`eng-architecture`, `eng-frontend`, `eng-backend`, `eng-databases`, `eng-mobile`, `eng-desktop`, `eng-ai-biometrics`, `eng-games`, `eng-quality`, `eng-deployment`.

## 3. External Discovery & Allowlist

- **Sources (`src/skills-engine.mjs`):** `https://skills.sh/`, `https://github.com/vercel-labs/skills`, `https://github.com/vercel-labs/agent-skills`, `https://github.com/anthropics/skills`, `https://github.com/backnotprop/pstack`, `https://github.com/DietrichGebert/ponytail`.
- **Reviewed Allowlist:** [`src/skill-allowlist.json`](src/skill-allowlist.json).
- **Commands:** `factory skills search "<topic>" [--offline]`, `recommend .`, `inspect <skill>`, `install <spec> [--approve]`, `list`, `check`, `update`, `remove`.

## 4. pstack & Ponytail Integrations

- **pstack (`https://github.com/backnotprop/pstack.git`, MIT):** Installed globally (`~/.gemini/config/skills/` & `~/.cursor/skills/` + `~/.cursor/agents/poteto-agent.md`). Auto-installed when missing unless `-SkipExternalSkills` / `--skip-external` / `--offline` is passed.
- **Ponytail (`https://github.com/DietrichGebert/ponytail.git`, MIT):** Installed globally (`ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, `ponytail-review`). Loose root `plugin.json` files are filtered cleanly by `Copy-SkillDirs` / `copySkillDirs`.

## 5. Precedence Policy

1. Security, secret protection, path boundaries, and human approval gates.
2. Truthful verification (`PASS` / `FAIL` / `NOT VERIFIED`).
3. Minimal complete diff (`Ponytail` + `pstack` simplicity).
4. Concise prose & comments (`unslop` / `no-comments`).
