# Workbench 0.46 — Validated SQL stdin execution

- Feed the exact validated generated SQL text to `psql --file -` instead of reopening the source path.
- Keep exact-fixture matching, psql meta-command rejection, protected database names, and mutation/remote opt-ins.
- Assert the same fixture bytes are supplied to both DDL passes.
- Release status remains open pending a complete successful release-gate run.
