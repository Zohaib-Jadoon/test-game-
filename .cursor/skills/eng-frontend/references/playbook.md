# Frontend Engineering Playbook

## 1. Next.js (14–16) & React 19 Patterns
- Fetch non-interactive read data on the server (`Server Components`); push `"use client"` down to interactive controls.
- Use explicit cache revalidation strategies (`revalidatePath` / `revalidateTag` / `cache: 'no-store'` on private authenticated reads) matched to data freshness requirements.
- Handle Server Actions & Form states cleanly without swallowing validation errors silently.
- Official docs: https://nextjs.org/docs & https://react.dev/reference/react

## 2. TypeScript & State Safety
- Enable `strict: true` (`noUncheckedIndexedAccess` where practical); never mask API mismatches with `as any`.
- Guard nullable/empty arrays and URL query parameters defensively.

## 3. Accessibility (WCAG 2.2 AA) & Responsive Hierarchy
- Minimum contrast 4.5:1 (normal text) and 3:1 (large text / UI components).
- Use native `<button>`, `<a href>`, and `<label htmlFor>` over clickable `<div>` tags.
- Ensure focus visibility (`focus-visible`) and logical tab order in modals, tables, and drawers.
- Design mobile-first grid/flex breakpoints (`360px` to `1440px+`) without horizontal overflow or cluttered nested card wrappers.

## 4. Browser Auth & Security Hygiene
- Keep auth/session validation on the server (`middleware` + API verification), never relying solely on hidden client routes.
- Sanitize or avoid `dangerouslySetInnerHTML`; prevent CSRF/XSS via HttpOnly cookies and CSP headers.
