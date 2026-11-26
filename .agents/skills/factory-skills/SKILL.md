---
name: factory-skills
description: Search, rank, security-inspect, recommend, and manage skills from local registry, skills.sh, and vetted GitHub repositories.
---
# Skill Discovery & Security Protocol

1. Recommend stack-appropriate minimal skills: `factory skills recommend "."`.
2. Search local registry, vetted catalog, or `npx skills`: `factory skills search "<query>"` (`--offline` when air-gapped).
3. Inspect any external skill before approving: `factory skills inspect <path-or-name>`.
4. Install allowlisted or reviewed (`--approve`) skills with SHA-256 lockfile verification: `factory skills install <spec> [--approve]`.
5. Audit integrity with `factory skills check` and never execute unreviewed remote setup scripts.
