---
name: eng-architecture
description: Software architecture standards covering modularity, domain modeling, API contracts, monorepos, ADRs, and backward compatibility.
---
# Engineering Standards — Software Architecture

Load `references/playbook.md` ONLY when designing system boundaries, ADRs, monorepo splits, or major refactors (`DEEP` / `RELEASE` mode).

## Core Checklist
1. Understand existing entrypoints, data shapes, and callers before introducing new layers.
2. Keep business rules pure inside core domain modules; validate untrusted external inputs strictly at boundaries.
3. Document non-trivial structural choices and irreversible API contracts in Architecture Decision Records (ADRs).
4. Prefer Ponytail simplicity (stdlib first, zero speculative abstractions) while protecting public API & migration compatibility.
