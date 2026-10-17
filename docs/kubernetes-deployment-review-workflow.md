# Kubernetes Deployment Review Workflow

The Architecture Validation panel supports an in-memory review workflow:

- Filter current findings by all, not reviewed, or reviewed.
- Filter by resource ID, including source and target resource IDs on relationship findings.
- Select a finding to focus the affected canvas element.
- Mark a finding reviewed or return it to not reviewed.
- When revalidation removes a finding, the panel moves its prior version into **Resolved since last review**.
- If a finding with the same identity changes its message, severity, remediation, relationship type, or endpoint context, the previous version is recorded as resolved/changed and the updated finding is unreviewed.

Review markers and resolved history are temporary UI state for the open panel. They reset when the panel is reopened or the app is reloaded. They do not change Excalidraw elements, saved diagrams, or validation output. A finding is resolved here only in the sense that its prior diagnostic fingerprint is no longer present; this is not a live Kubernetes cluster check.


## Exporting a review

Use **Export Markdown** to create a readable report for tickets, pull requests, or team review. Use **Export JSON** for structured downstream processing. Both formats include current Kubernetes findings, severity, remediation guidance, reviewed state, and the panel's resolved/changed history.

Exports deliberately use an allowlist of Kubernetes diagnostic fields. They do not serialize the diagram, Excalidraw elements, credentials, arbitrary diagnostic metadata, or findings from other architecture providers. Review history is only the state currently held by the open panel; it is not persisted between sessions. The report is a diagram-level assessment, not a live-cluster audit.


## Comparing review snapshots

Use **Capture baseline** before making changes or revalidating the diagram. After the next validation run, select **Compare with baseline** to see new, unchanged, changed, and resolved findings, including severity increases or decreases. A new baseline replaces the prior baseline for the open panel.

The comparison is held in memory and is reset when the panel is reopened or the application is reloaded. It compares diagram-validation snapshots only; it does not query a Kubernetes cluster. Export the report separately if you need to retain or share the current findings.


## Saved review history

Use **Save snapshot** to retain the current sanitized Kubernetes report in this browser, then select a saved entry and choose **Compare with saved** after later revalidation. Snapshots survive reloads in the same browser profile. Up to 10 snapshots are retained; deleting a selected snapshot removes only that entry.

Snapshots use browser local storage and remain on this browser/device. They are not uploaded, synchronized, or shared automatically. The stored report contains only the report's allowlisted Kubernetes findings and review summary, not the diagram or arbitrary canvas metadata. If browser storage is disabled or full, saving may fail and the panel displays a status message.


## Review history view

Choose **View history** to expand the saved snapshots into cards showing capture date, total findings, error/warning/info counts, reviewed status, and unresolved review count. Select a card to make it the active comparison target. Each card also offers direct Compare and Delete actions. The history remains local to this browser and is limited to 10 saved snapshots.


## Exporting a comparison report

After comparing a captured baseline or saved snapshot, use **Export comparison Markdown** for a readable change report or **Export comparison JSON** for structured processing. The report records added, changed, resolved, and unchanged findings, including before/after severity, message, remediation, and relationship details where those fields changed. Resolved findings retain their prior remediation details.

Comparison exports contain sanitized Kubernetes validation data only; they exclude the full diagram and arbitrary metadata. Like the on-screen comparison, they compare two diagram-validation snapshots and do not query a live Kubernetes cluster.


## Reading and navigating comparison results

The comparison summary separates new, changed, resolved, and unchanged findings. Severity indicators show when a finding became more or less severe; individual changed entries show before/after severity and remediation text when those values changed. Use **Go to finding** to select a current or still-selectable finding on the canvas. A resolved finding may not have a current canvas element to select. These controls navigate the diagram only; they do not modify resources or contact a cluster.


## Filtering and sorting comparison findings

Use the comparison **Show** filter to focus on increased severity, changed remediation, unresolved errors, or changed/resolved findings. The text search matches resource identifiers, finding codes, and messages. Sort by severity, finding code, or resource to organize the visible results. Filters affect only the on-screen list; they do not alter the snapshots or the exported full comparison report.


## Remediation checklist

The **Remediation checklist** creates user-managed tasks from current Kubernetes validation findings. Select **Refresh from findings** to update task details from the current diagnostics; existing statuses for matching findings are preserved. Mark a task pending or completed as work progresses. Use the filters and search to focus on pending errors or a particular resource. Export the checklist as Markdown for human follow-up or JSON for structured processing.

Checklist status is stored in browser local storage and does not synchronize across browsers. Marking a task complete records your workflow status only; it does not modify the diagram, apply Kubernetes changes, or verify a live cluster.


## Remediation task lifecycle and progress

The checklist retains tasks when a finding disappears from a later diagram-validation run. Such tasks are labeled **Finding resolved** and can be filtered separately from **Finding active** tasks. If the same finding reappears, its task becomes active again while its pending/completed status is preserved.

A finding's absence from the latest diagnostics does not automatically mark the task complete: it is a diagram-validation result, not proof that a real-world remediation was performed. The summary and exports report active findings, resolved findings, pending tasks attached to resolved findings, and checklist completion percentage. Completion percentage is the proportion of retained checklist tasks manually marked complete; it is not a Kubernetes deployment-readiness score.


## Unified deployment review dashboard

The top-level **Deployment review dashboard** brings together current diagnostic counts, review coverage, remediation completion, saved review history, and the latest snapshot comparison when one exists. Its links focus the corresponding findings/task filters or expand saved history. Review and remediation percentages measure manual review/checklist state, not live cluster health. The readiness label is generated from the diagram-validation report and is not a deployment certification.


## Executive review report

Use **Export executive Markdown** for a readable summary or **Export executive JSON** for structured downstream processing. The report combines the current diagram-level readiness assessment, prioritized error/unreviewed findings, review coverage, the current comparison summary when available, and checklist status. It deliberately distinguishes a finding's absence from the current diagnostics from a task manually marked complete.

The export contains sanitized finding and checklist fields only. It excludes the diagram and arbitrary metadata. It does not query a live cluster or certify that workloads, networking, rollout status, security posture, or runtime behavior are healthy. A report without an active comparison explicitly says that comparison data was unavailable at export time.


## Executive report references and priority groups

Executive exports include a report version, schema version, generation timestamp, declared reference scheme, and a scope label. Each sanitized finding receives a deterministic `K8S-XXXXXXXX` reference derived from its normalized diagnostic code, severity, resource label, and message. These references make findings easier to discuss across exports with unchanged diagnostic content; they are not permanent database identifiers and can change when the diagnostic itself changes. The reference is a compact hash, not a security or integrity guarantee.

Priority actions are grouped as **High priority — errors**, **Medium priority — unreviewed warnings**, and **Review recommended — unreviewed informational findings**. Error findings remain high priority even if manually marked reviewed. Reviewed warnings and reviewed informational findings are not repeated in the action list. The JSON export retains the same finding references and group membership as the Markdown export.

Report metadata and finding references are generated from allowlisted diagnostic fields. The export continues to exclude canvas IDs, the full diagram, credentials, and arbitrary diagnostic metadata.


## Stable references in snapshot comparisons

Comparison exports now include deterministic `K8S-XXXXXXXX` finding references and report metadata (report/schema version, generation timestamp, reference scheme, and scope). The reference is derived from the comparison's internal finding identity but does not publish that identity as a separate export field. A changed finding retains one reference across its before/after state within that comparison report. References help with discussion and triage; they are not permanent database IDs, globally unique guarantees, or security controls.

The comparison summary also counts findings whose remediation guidance changed. For each changed finding, the report presents before/after remediation text when it changed; resolved findings retain their previous remediation, and new findings retain their suggested remediation. These are changes in diagram-validation guidance only and do not prove that remediation was applied to a cluster.


## Navigation and remediation status clarity

Comparison navigation only offers **Go to finding** when the comparison entry matches a current diagnostic. Resolved entries explicitly state that the finding no longer has a current canvas target; stale or unmatched entries explain that navigation is unavailable rather than attempting to select an obsolete diagnostic.

The checklist keeps two independent states visible: **Pending/Completed** is the manually tracked remediation status, while **Finding active/ Finding resolved** describes whether the diagnostic appears in the current validation. A resolved finding does not automatically complete a task. Users should confirm the actual work before marking a task completed.


## Keyboard accessibility and review announcements (1.13.9)

- Review filters, export/navigation actions, dashboard controls, and remediation checkboxes have a consistent visible keyboard-focus indicator in day and night themes.
- Remediation checkboxes expose task-specific accessible names that state the resulting Pending or Completed action.
- Comparison filtering announces the number of currently displayed findings through a concise polite status region. The whole comparison report is no longer treated as one large live region, avoiding excessive screen-reader announcements.
- Remediation persistence feedback continues to announce the task code and resulting status. Task completion remains an explicit user action and is not inferred from finding resolution.


## Review workflow usability (1.13.10)

- Comparison and remediation empty states now explain that active filters produced no results.
- Contextual reset buttons restore comparison filters to All changes, an empty search, and Severity sorting, or restore remediation filters to All tasks and an empty search.
- Empty states distinguish a genuinely empty remediation checklist from a filtered list with no matches.
- Narrow-window styling lets remediation tasks wrap without forcing their text into an overly narrow column.


## Review status and action consistency (1.13.11)

- Export actions consistently name the artifact first and the format second (for example, “Export comparison as Markdown”).
- Snapshot and checklist actions use explicit nouns to distinguish saving a review snapshot from saving other data, and refreshing checklist tasks from findings.
- Dashboard progress bars expose readable value text including counts, not only a numeric percentage.
- The diagram readiness badge exposes a status label for assistive technology.
- Dashboard cards adapt from four columns to two at intermediate viewport widths and to one column on narrow viewports.


## Review navigation and active filters (1.13.12)

- Dashboard shortcuts now apply their associated filter and smoothly navigate to the matching findings, remediation, history, or comparison section.
- Dashboard shortcut targets have scroll margins so section headings are less likely to sit flush against the viewport edge.
- Non-default finding, comparison, and remediation filters are summarized in visible active-filter rows.
- Each active-filter row offers a clear action that resets only that section’s filters and search/sort values; review data and checklist statuses are not changed.
- Active-filter rows stack vertically on narrow viewports.


## Unified review-view reset and shortcut state (1.13.13)

- Added a dashboard-level Reset review view action whenever any finding, comparison, or remediation filter/search/sort is non-default.
- The unified reset clears view filters and search/sort terms only; it does not alter review marks, stored snapshots, diagnostic data, or task completion status.
- Dashboard shortcuts show selected-state text and expose `aria-pressed` for filter shortcuts; the saved-history shortcut exposes its expanded state.
- Findings navigation clears a conflicting resource filter; pending-task navigation clears task search; comparison navigation clears resource search and returns sorting to severity so shortcuts are not defeated by stale secondary filters.
- Added selected shortcut styling and reduced-motion support for review-section navigation.
