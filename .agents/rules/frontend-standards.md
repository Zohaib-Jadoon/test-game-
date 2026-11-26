---
trigger: glob
globs: "*.tsx, *.jsx, *.css, *.html, app/**, components/**"
description: "Frontend React, Next.js, TypeScript, Tailwind CSS, responsive design, and WCAG 2.2 AA UI rules"
---
# Frontend Engineering Standards (Conditional)

- Apply `eng-frontend` (`SKILL.md` and `references/playbook.md` when complex).
- Render explicit loading, empty, actionable error, and success confirmation states for async UI.
- Enforce WCAG 2.2 AA contrast, semantic HTML landmarks, labeled inputs, and keyboard focus navigation.
- Prefer uncluttered hierarchy and existing UI primitives (`shadcn/ui` / Tailwind tokens) over unnecessary wrappers.
- Validate TypeScript strictness, avoid unnecessary client boundaries in Next.js App Router, and test interactive flows.
