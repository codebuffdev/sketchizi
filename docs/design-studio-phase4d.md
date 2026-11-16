# Design Studio Phase 4D — AWS VPC and Networking

## Added template

- ID: `aws.vpc.networking`
- Version: `1`
- Category: AWS Architecture
- Creation mode: template

The starter represents Internet Clients → Internet Gateway → Application Load Balancer → EC2 Instances → Amazon RDS. A VPC boundary and public/private subnet boundaries provide network scope context. Boundary shapes are not part of the traffic connector chain.

This is an editable diagram starter, not deployable infrastructure-as-code. Subnet placement and connectivity are conceptual and should be reviewed before treating the diagram as a production network design.

## Validation

- Required roles: client, internet-gateway, load-balancer, compute, database.
- Allowed traffic relationships are defined in `templateRegistry.js`.
- `tests/design-framework.test.js` verifies boundary roles, traffic path, connector bindings and clean guided validation.

## Verification

`node --test tests/design-framework.test.js`: 44 tests passed.

JavaScript syntax checks passed for the modified template registry, scene generator and catalog. The production build was not run because dependencies are not installed in this extracted workspace.
