---
name: factory-init
description: Initialize the Universal Software Factory in a project repository, detect stack adapters, register SQLite tracking, and configure initial quality gates.
---

# Factory Init Protocol

1. Inspect the workspace root before initializing (`package.json`, `pyproject.toml`, `pubspec.yaml`, `*.sln`, `*.csproj`, `migrations/`, `.env.example`, Git status).
2. Run `factory init "<project>"` (or fallback `node "%USERPROFILE%/.gemini/factory-home/bin/factory.mjs" init "<project>"`) to scaffold `.agent/`, `.agents/`, `.cursor/`, `.factory/config.json`, detect stack adapters (`nextjs`, `react`, `nestjs`, `node`, `python`, `dotnet`, `flutter`, `expo`, `postgres`, `sqlserver`, `docker`, `ai_ml`, `monorepo`), and register SQLite tracking (`factory.db`).
3. Inspect the generated `.factory/config.json` and add any missing stack-specific `required_checks` (lint, typecheck, unit, integration, build). Never delete safety defaults (`human_approval_required: true`, `automatic_deployment: false`).
4. Run `factory doctor "<project>"` and report detected adapters, available runtimes, missing tools (`NOT VERIFIED` if absent), and dashboard URL (`factory serve`).
