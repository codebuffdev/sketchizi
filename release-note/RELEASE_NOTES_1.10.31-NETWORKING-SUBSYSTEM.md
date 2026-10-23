# Sketchizi 1.10.31 — Networking Subsystem

Baseline: `Sketchizi-1.10.30-dropdown-layering-fix(3).zip`.

## N1 — Networking catalog
- Added a Networking category to the existing Icon Library with 14 resources: Router, Switch, Firewall, Load Balancer, Reverse Proxy, DNS, CDN, VPN, NAT Gateway, Internet Gateway, VPC/VNet, Subnet, Network, and Endpoint.
- Resources are inserted into the existing Excalidraw canvas as grouped editable elements carrying stable `customData.networkingResource` metadata.

## N2 — Editable metadata
- Added resource-specific Name and applicable CIDR, Region, Network type, Availability zone, and Environment properties.
- CIDR edits validate IPv4 and IPv6 notation/prefix ranges before applying; invalid values are rejected with the existing toast mechanism.
- Metadata is stored in Excalidraw element customData and therefore participates in the existing save/load and collaboration serialization.

## N3/N4 — Relationships and unified graph
- Existing Excalidraw native arrows/lines remain the connection mechanism.
- The architecture graph now includes networking resources and derives cross-provider relationships from bound native connectors. Relationship semantics can be set on cross-provider connectors through Properties: traffic-flow, contains, routes-to, depends-on, or connects-to.
- This phase does not implement route tables or routing simulation.

## N5/N6 — Validation integration
- Added shared-engine checks for malformed CIDR metadata, orphaned networking resources, and a warning when a load balancer explicitly configured as public has no connection to an Internet Gateway.
- Findings use the existing validation result model and panel.
- No rule assumes all subnets need an Internet Gateway.

## Validation
- Added `npm run test:networking` with four Node test cases covering catalog completeness, IPv4/IPv6 CIDR validation, cross-provider graph relationships, and invalid-CIDR diagnostics.
- Build attempted but unavailable in the environment: `npm install --no-audit --no-fund` timed out; `npm run build` reported `vite: not found` (exit 127). Browser interaction testing remains necessary.

## Limitations
- Networking visual resources are editable grouped canvas shapes rather than provider-specific vendor artwork.
- Relationship discovery depends on Excalidraw connectors being bound to resource elements; merely crossing a shape visually does not establish a graph edge.
- Full route-table, route-target, subnet reachability, and network-policy simulation are intentionally not implemented because the current model does not represent those configurations.
