# Workbench Diagnostic Secret Redaction — 0.68

## Summary

Diagnostic bundles now redact common credential formats from packaged CI log copies and failure-analysis excerpts. Original local log files remain unchanged. The manifest records which files were redacted and hashes the sanitized bytes that are actually included in the archive.

## Protected patterns

- Bearer and Basic authorization headers
- Common key/token/password/secret assignments
- GitHub personal-access-token prefixes
- Common `sk-` API-key forms
- Credentials embedded in PostgreSQL/MySQL and HTTP(S) URLs

## Verification

- Diagnostic bundle tests: passed
- Failure-analysis tests: passed
- Secret-redaction tests: passed
- ZIP extraction/hash consistency: tested against bundled log content

Redaction is heuristic, not a guarantee that every possible secret format is recognized. Review bundles before external sharing, especially if logs can contain unusual credential formats. Generated OpenAPI/SQL artifacts are not broadly rewritten, preserving their exact content.

## Suggested commit

`fix(workbench): redact secrets from diagnostic bundles`
