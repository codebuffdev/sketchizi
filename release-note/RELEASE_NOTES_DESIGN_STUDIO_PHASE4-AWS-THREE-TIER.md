# Design Studio Phase 4 — AWS Three-Tier Starter

## Added

- Added the built-in `aws.webapp.three-tier` template for an AWS-oriented web application architecture.
- Added editable client, Application Load Balancer, EC2 Auto Scaling, and Amazon RDS starter nodes.
- Added bound connectors for the intended client → load balancer → compute → database path.
- Added the AWS-specific template preview labels in the Design Studio catalog.
- Added tests for template metadata, role order, connector bindings, validation, and preview layout.

## Notes

- This is a diagram starter, not a deployable CloudFormation or Terraform definition.
- Existing editor, serialization, and design-profile mechanisms are reused.
- Production build status must be verified separately in an environment with the required dependencies and Excalidraw font assets installed.
