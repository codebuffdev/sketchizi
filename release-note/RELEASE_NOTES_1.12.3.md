# Sketchizi 1.12.3

## Kubernetes Deployment Review Workflow

- Adds All / Not reviewed / Reviewed filters to Architecture Validation.
- Adds resource filtering that includes relationship source and target IDs.
- Adds accessible per-finding review markers and reviewed counts.
- Keeps existing canvas selection and safe Kubernetes correction actions.
- Review markers are in-memory only; they do not mutate diagrams or suppress validation.
- Adds `npm run test:kubernetes-review-ui`.

Production build and browser-level verification remain outstanding.
