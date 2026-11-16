# Design Studio Phase 4C — Event-Driven AWS Architecture

## Added template

- **ID:** `aws.event-driven.processing`
- **Version:** 1
- **Domain:** `cloud-infrastructure`
- **Flow:** Amazon EventBridge → Amazon SQS → AWS Lambda Worker → Amazon DynamoDB

The starter is an editable diagram template, not a deployable infrastructure definition.

## Validation

The template declares the expected component roles and allowed directed relationships. Automated tests check the component roles, connector bindings and direction, profile creation, validation, catalog preview, and file round-trip through the existing shared template test.

## Compatibility

This change extends the existing template registry and starter scene factory. It does not introduce a second editor, backend service, or persistence format.
