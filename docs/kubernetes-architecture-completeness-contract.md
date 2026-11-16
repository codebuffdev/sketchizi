# Kubernetes Architecture Completeness Contract

The shared architecture validator includes a provider-local completeness pass for Kubernetes diagrams. It runs only when at least one Kubernetes resource is present and does not alter Excalidraw elements.

It can recommend:

- adding a Cluster to establish deployment context (`info`);
- connecting a represented Cluster to each represented Namespace with a `contains` edge (`warning`);
- modeling Pods managed by Deployment, StatefulSet, or DaemonSet using `schedules` (`warning`);
- connecting a Service to the Pod targets it exposes with `exposes` (`info`);
- modeling a Pod-to-Node `runs-on` assignment when placement is in scope (`info`).

These are diagram-completeness recommendations, not claims that every resource is required by Kubernetes itself. Each finding explains when to ignore it if that part of the architecture is intentionally abstracted. The diagnostics can include `recommendedResourceTypes` for guidance. They are read-only and never create resources or relationships. AWS and Networking resources are excluded from these Kubernetes-specific rules.

Run the test suite with `npm run test:kubernetes-completeness`.
