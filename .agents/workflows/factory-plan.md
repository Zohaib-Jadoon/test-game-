---
description: Analyze requirements and generate a 14-agent DAG implementation plan with measurable acceptance criteria.
---

# /factory-plan

$ARGUMENTS

Use `factory-plan`, `poteto-mode` (`architect`), and `ponytail`.

1. Ensure `.factory/config.json` exists (`factory init "."` if needed).
2. Run `node "%USERPROFILE%\.gemini\factory-home\bin\factory.mjs" plan "." --goal "$ARGUMENTS"`.
3. Review generated tasks, dependencies, and risk gates before implementation.
