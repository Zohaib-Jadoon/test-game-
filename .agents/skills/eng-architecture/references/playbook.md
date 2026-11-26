# Software Architecture Playbook

## 1. Modularity & Separation of Concerns
- Separate transport adapters (HTTP controllers, IPC handlers, CLI parsers) from pure domain services and storage repositories.
- Enforce unidirectional dependency graphs (`CLI/API -> Domain/Application -> Persistence`); reject circular imports across modules.
- Group by feature/bounded-context once a directory exceeds cohesive module clarity, rather than creating empty microservice layers prematurely.

## 2. Domain Modeling & State Machines
- Encode explicit lifecycle transitions (e.g., `queued -> running -> verified -> approved`) in a state table or validator instead of scattered boolean flags.
- Fail loudly on illegal state transitions at domain boundaries.

## 3. API Contracts & Backward Compatibility
- Version public schemas and REST payloads; prefer additive fields over breaking renames or silent type changes.
- Define explicit request/response contracts (OpenAPI / DTO schemas / TypeScript discriminated unions) before parallel frontend/backend work begins.

## 4. Monorepo & Dependency Discipline
- Isolate app-specific dependencies per package/workspace while sharing pure types and validation helpers cleanly.
- Justify every third-party package addition against native runtime/stdlib capabilities, bundle impact, maintenance health, and license compatibility.

## 5. Architecture Decision Records (ADRs)
- Record: Context, Considered Options, Decision, Tradeoffs, Verification Method, and Reversal Cost.
- Update ADRs when constraints change instead of letting design docs drift silently from implementation.
