---
name: eng-frontend
description: Frontend standards for React 19, Next.js 14-16 App Router, TypeScript strictness, Tailwind CSS v4, accessibility, and auth UX.
---
# Engineering Standards — Frontend

Load `references/playbook.md` when implementing full pages, complex state flows, auth boundaries, or accessibility/performance audits.

## Core Checklist
1. Render Server Components by default in Next.js App Router; keep `"use client"` leaves small and intentional.
2. Implement loading skeletons, informative empty states, actionable error boundaries, and clear success confirmations.
3. Meet WCAG 2.2 AA contrast, semantic HTML (`<main>`, `<nav>`, `<label>`), and full keyboard operability.
4. Keep client bundles lean, validate forms explicitly, and test real interactive DOM behavior.
