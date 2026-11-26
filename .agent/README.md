# Workspace `.agent` Factory Guide (`v1.0.0`)

This workspace uses **Myfactory v1.0** for Google Antigravity IDE and Cursor IDE (`pstack` + `Ponytail` + 3-level SQLite memory + 60 categorized specialists).

- Slash workflows: `/factory-init`, `/factory-plan`, `/factory-build`, `/factory-status`, `/factory-test`, `/factory-review`, `/factory-fix`, `/factory-release`, `/factory-update`, `/factory-learn`, `/factory-skills`, `/factory-deploy`, `/factory-resume`.
- Core CLI commands: `factory init .`, `factory agents select . --request "..."`, `factory learn .`, `factory memory review`, `factory skills recommend .`, `factory deploy advise .`, `factory verify .`, `factory release .`, `factory serve .`.
- Safeguards: Never close/restart Antigravity or Cursor IDE, never store secrets/PII/biometrics in memory, never auto-push/deploy without explicit approval, and mark unexecuted checks `NOT VERIFIED`.
