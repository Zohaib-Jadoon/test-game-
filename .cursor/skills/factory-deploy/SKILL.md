---
name: factory-deploy
description: Evaluate deployment platforms, reuse verified past deployment lessons, and generate practical rollback-ready deployment plans.
---
# Smart Deployment Advisor Protocol

1. Analyze project profile, existing hosting configs, and past deployment memory: `factory deploy advise "."`.
2. Generate target-specific pre-flight, artifact verification, health check, and rollback steps: `factory deploy plan "." [--target <platform>]`.
3. Never migrate working hosting unnecessarily or recommend heavy orchestrators without proven scale requirements.
4. Distinguish debug/emulator artifacts from signed/store builds; stop for explicit human approval before any live deployment.
