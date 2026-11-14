# Sketchizi Agentic Development Playbook

**Goal:** Replace open-ended, repeated prompting with a deliberate loop: specification → repository investigation → bounded implementation → automated verification → reviewable PR → human-approved merge.

This guidance covers the React/Vite repository. The separate Spring Boot backend needs its own repository-specific `AGENTS.md` and Maven/Java verification.

## Ownership

- **Product owner (human):** chooses priorities, user experience and architectural tradeoffs; accepts or rejects PRs; approves merges and releases.
- **Coding agent:** inspects the actual repository, proposes a plan, makes a scoped implementation on a feature branch, adds relevant tests, runs available verification, and opens a PR.
- **CI:** checks objective build/test contracts.
- **Reviewer (human, optionally assisted by another agent):** examines diff, UX evidence, security/data impact, and test adequacy.

Agents should not represent an unreviewed change as production-ready.

## Task contract

Use the following format for each task:

```markdown
### Goal
What user-observable result is needed?

### Context and reproduction
Current behavior, expected behavior, links/screenshots, affected feature.

### Scope
In scope; out of scope; cross-repository dependencies.

### Acceptance criteria
1. Measurable success condition.
2. Regression condition.
3. UI/accessibility/responsive/data-integrity condition if relevant.

### Required workflow
1. Inspect relevant repo files and existing tests.
2. Present a concise plan; highlight uncertainties.
3. Implement on a dedicated branch.
4. Add/update focused tests and run required checks.
5. Run browser checks for user-visible changes where possible.
6. Open a PR with evidence. Do NOT merge without approval.
```

Avoid vague requests like "make the whole UI better" as a single implementation ticket. Decompose into independently testable PRs.

## Definition of done

1. Acceptance criteria are met, with meaningful evidence.
2. Changed behavior has appropriate regression coverage.
3. Production CI is green or failures are fully disclosed and resolved before merge.
4. UI work includes actual interaction checks, not only string-matching tests. Evaluate desktop/mobile, light/dark, keyboard/focus and the drawing canvas where relevant.
5. A reviewer has inspected risk and user experience.
6. The product owner explicitly approves merging.

An agent may report **implemented** or **PR ready** before all of these are true; it must not call the work **done** or **shipped**.

## Existing verification surfaces

The frontend currently provides:

- `npm run check:package-lock-consistency`
- `npm run check:build-prerequisites`
- `npm run test:all`
- `npm run build`
- Focused `test:...` scripts in `package.json`
- Production GitHub Actions workflow with browser smoke checks
- Manual-dispatch staging deployment verification and UI visual audit workflows

Do not assert that a script, CI run, or visual check passed without inspecting its actual result.

## Parallel work and PR hygiene

- Prefer one feature or fix per issue and branch; use descriptive prefixes such as `fix/`, `feat/`, or `chore/`.
- Reserve separate PRs for cross-cutting refactors or large dependency changes.
- Identify shared files before parallel agent work and avoid concurrent modifications to the same area without coordination.
- Do not create competing PRs for the same behavior; check open PRs first.
- Keep frontend/backend changes independently reviewable; record API or schema contracts and rollout order.
- Before starting a new task, assess whether an open PR already addresses it.

## First pilot: compact Icon Library

Use the existing Icon Library design/implementation work as an agentic pilot after checking open PRs. The agent should verify the proposed UI against actual component/CSS behavior and the existing Icon Library tests, test panel placement at representative desktop and mobile widths, verify keyboard behavior and both themes, and provide a before/after screenshot. A mockup alone does not satisfy implementation acceptance. Do not merge until a human reviews functionality and visual evidence.

## Repository configuration to finish separately

- In GitHub repository settings, protect `main` using a ruleset or branch protection: require PRs, passing status checks, and prevent direct pushes where the plan supports it. Confirm the required status check names from completed workflows before configuring.
- Decide whether to require approvals or a `CODEOWNERS` review rule. For a solo repository, account for GitHub's limits on self-approval.
- Consider enabling automatic branch deletion after merges.
- Add a backend-specific agent guide and equivalent Maven/Java CI requirements in `codebuffdev/sketchizi-backend`.

These GitHub settings are **not** changed by adding this document or by opening its PR.
