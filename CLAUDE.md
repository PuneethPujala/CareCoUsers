# CLAUDE.md

This repository uses [AGENTS.md](file:///c:/dev/CareCoUsers/AGENTS.md) as the single source of truth for:
- Repository layout and directory purposes
- Common commands for starting the mobile app and backend
- Environment setup and configuration
- Architectural flows (authentication, API layer, routing, RBAC)
- Database schema naming conventions (crucial warning on mixed `camelCase` vs `snake_case` fields)
- Mobile state management and security notes

> [!IMPORTANT]
> **Clinical, Privacy, & Accessibility Checklists**
> See [CLINICAL_GUIDELINES.md](file:///c:/dev/CareCoUsers/CLINICAL_GUIDELINES.md) for required clinical safety, PHI privacy, and geriatric accessibility guidelines. AI agents **must** read and comply with this checklist before modifying any vitals, authentication, or PHI-adjacent code.

> [!TIP]
> **Specialized Agent Personas**
> For complex reviews or tasks, adopt or reference the specialized agent personas in `.github/agents/`:
> - 🩺 **Clinical Reviewer**: [clinical_reviewer.md](file:///c:/dev/CareCoUsers/.github/agents/clinical_reviewer.md)
> - 📱 **React Native Performance**: [react_native_performance.md](file:///c:/dev/CareCoUsers/.github/agents/react_native_performance.md)
> - 🔒 **Healthcare Security**: [healthcare_security.md](file:///c:/dev/CareCoUsers/.github/agents/healthcare_security.md)
> - ❤️ **Elder UX**: [elder_ux.md](file:///c:/dev/CareCoUsers/.github/agents/elder_ux.md)

Detailed flowchart diagrams, pipeline schemas, and interactive guides are maintained in the [docs/architecture](file:///c:/dev/CareCoUsers/docs/architecture/README.md) directory. Please refer to [AGENTS.md](file:///c:/dev/CareCoUsers/AGENTS.md) for repository conventions.
