# Sketchizi Design Studio — AWS Serverless API Starter

## Added

- Added the built-in `aws.serverless.api` template.
- Starter scene contains Amazon API Gateway, AWS Lambda, and Amazon DynamoDB.
- Added bound connectors for API Gateway → Lambda → DynamoDB.
- Added a dedicated catalog preview layout for the serverless API starter.
- Added regression coverage for template metadata, node roles, connector bindings, and validation.

## Scope notes

This is a diagram starter, not a deployable AWS infrastructure definition. It does not provision cloud resources or claim production readiness.

## Verification

- `node --test tests/design-framework.test.js tests/personal-template-store.test.js tests/template-catalog.test.js` — 51 tests passed.
- JavaScript syntax checks passed for changed modules and tests.
- Production build not run because dependencies are not installed in this extracted working tree.
