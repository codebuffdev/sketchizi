# Kubernetes Resource Validation Contract

Sketchizi validates resource properties only when a Kubernetes graph resource maps to a known definition in `src/kubernetesResourceDefinitions.js`. Unknown/legacy definitions continue through graph and relationship validation without being rejected solely because the current catalog does not describe them.

The provider rules validate:

- resource names and namespace names against Kubernetes-style lowercase DNS naming constraints;
- resource-specific select properties against their definition options;
- number properties as non-negative integers;
- the Kubernetes version string on cluster resources;
- explicit non-default namespace dependencies for Pods, Deployments, StatefulSets, DaemonSets, and Services.

For a non-default namespace, a matching Namespace resource should be present and have a `contains` relationship directed from the Namespace to the namespaced resource. The implicit `default` namespace is intentionally not flagged. These findings are diagnostics and recommendations; validation never changes a resource property or adds/removes a relationship.

The resource default names used for new insertions are lowercase and valid (for example, `kubernetes-cluster`, `deployment`, `statefulset`). AWS and Networking providers do not pass through Kubernetes-specific property or namespace checks.
