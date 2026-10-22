import { useMemo, useState } from "react";
import {
  buildRemediationHandoffPolicyApprovalReport,
  evaluateRemediationHandoffPolicyReleaseGate,
  recordRemediationHandoffPolicyApprovalEvent,
} from "../simulation/experiments/escalationPolicyApproval.js";
import { recordRemediationHandoffPolicyVersion } from "../simulation/experiments/escalationPolicyGovernance.js";

const DEFAULT_POLICY_ID = "escalation-policy";
const latestStatus = (events, entryId) => events.filter((event) => event.policyEntryId === entryId).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)?.status || "draft";

export default function PolicyApprovalPanel({ policyGovernance = {}, onUpdatePolicyGovernance, canEdit = true }) {
  const policyHistory = Array.isArray(policyGovernance.policyHistory) ? policyGovernance.policyHistory : [];
  const approvalEvents = Array.isArray(policyGovernance.approvalEvents) ? policyGovernance.approvalEvents : [];
  const [policyId, setPolicyId] = useState(DEFAULT_POLICY_ID);
  const [changedBy, setChangedBy] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  const [overdueDays, setOverdueDays] = useState("7");
  const [agingDays, setAgingDays] = useState("14");
  const [severities, setSeverities] = useState(["error", "warning"]);
  const [rolloutBlockersOnly, setRolloutBlockersOnly] = useState(true);
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [message, setMessage] = useState("");
  const sortedEntries = [...policyHistory].sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt));
  const selected = sortedEntries.find((entry) => entry.id === selectedEntryId) || sortedEntries[0] || null;
  const report = useMemo(() => {
    try { return buildRemediationHandoffPolicyApprovalReport(policyHistory, approvalEvents); }
    catch { return { policies: [], policyVersionCount: 0, approvedCount: 0, pendingCount: 0, rejectedCount: 0, blockedCount: 0 }; }
  }, [policyHistory, approvalEvents]);
  const commit = (history, events) => onUpdatePolicyGovernance?.({ policyHistory: history, approvalEvents: events });
  const run = (fn) => {
    try { fn(); setMessage("Policy governance record saved to this Sketchizi document."); }
    catch (error) { setMessage(error?.message || "Policy workflow action failed."); }
  };
  const createVersion = () => run(() => {
    if (!changedBy.trim() || !rationale.trim()) throw new TypeError("Change owner and change rationale are required.");
    const previous = policyHistory.filter((entry) => entry.policy?.id === policyId.trim()).sort((a, b) => b.policy.version - a.policy.version)[0];
    const version = (previous?.policy.version || 0) + 1;
    const result = recordRemediationHandoffPolicyVersion(policyHistory, {
      id: policyId.trim(), version, overdueDays: Number(overdueDays), agingDays: Number(agingDays), severities, rolloutBlockersOnly,
    }, { changedBy: changedBy.trim(), rationale: rationale.trim(), id: `${policyId.trim()}-v${version}-${Date.now()}` });
    commit(result.history, approvalEvents);
    setSelectedEntryId(result.entry.id);
  });
  const workflowAction = (action) => run(() => {
    if (!selected) throw new TypeError("Create a policy version before starting its approval workflow.");
    const actor = action === "submit" ? changedBy : reviewer;
    if (!actor.trim() || !rationale.trim()) throw new TypeError("Actor and rationale are required for workflow actions.");
    const result = recordRemediationHandoffPolicyApprovalEvent(approvalEvents, selected, { action, actor: actor.trim(), rationale: rationale.trim() });
    commit(policyHistory, result.events);
  });
  const gate = selected ? evaluateRemediationHandoffPolicyReleaseGate(policyHistory, approvalEvents, selected.policy.id, selected.policy.version) : null;
  return <section className="workbench-section policy-approval-panel" aria-label="Policy approval and release gate">
    <div className="workbench-section-heading"><span>POLICY GOVERNANCE</span><span className="workbench-count">{policyHistory.length}</span></div>
    <h2>Escalation policy approval</h2>
    <p className="workbench-section-intro">Version policy settings, submit them for a separate review, and inspect release eligibility. Records are saved in this Sketchizi document.</p>
    <div className="policy-approval-grid">
      <label>Policy ID<input value={policyId} onChange={(event) => setPolicyId(event.target.value)} disabled={!canEdit} /></label>
      <label>Change owner<input value={changedBy} onChange={(event) => setChangedBy(event.target.value)} disabled={!canEdit} placeholder="Name or reviewer ID" /></label>
      <label>Overdue threshold (days)<input type="number" min="1" max="365" value={overdueDays} onChange={(event) => setOverdueDays(event.target.value)} disabled={!canEdit} /></label>
      <label>Aging threshold (days)<input type="number" min="1" max="365" value={agingDays} onChange={(event) => setAgingDays(event.target.value)} disabled={!canEdit} /></label>
    </div>
    <fieldset className="policy-approval-severities" disabled={!canEdit}>
      <legend>Finding severities</legend>
      {[["error", "Error"], ["warning", "Warning"], ["info", "Info"]].map(([value, label]) => <label key={value}><input type="checkbox" checked={severities.includes(value)} onChange={(event) => setSeverities((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value))} /> {label}</label>)}
    </fieldset>
    <label className="policy-approval-checkbox"><input type="checkbox" checked={rolloutBlockersOnly} onChange={(event) => setRolloutBlockersOnly(event.target.checked)} disabled={!canEdit} /> Only escalate rollout blockers</label>
    <label className="policy-approval-rationale">Change / review rationale<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} disabled={!canEdit} rows={3} placeholder="Explain the change or review decision" /></label>
    <div className="workbench-artifact-actions">
      <button type="button" className="workbench-primary" disabled={!canEdit} onClick={createVersion}>Create policy version</button>
      <button type="button" className="workbench-secondary" disabled={!canEdit || !selected} onClick={() => workflowAction("submit")}>Submit for approval</button>
    </div>
    <label>Policy version<select value={selected?.id || ""} onChange={(event) => setSelectedEntryId(event.target.value)}><option value="">Select a version</option>{sortedEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.policy.id} v{entry.policy.version} — {latestStatus(approvalEvents, entry.id)}</option>)}</select></label>
    {selected && <div className="policy-approval-status" aria-live="polite">
      <strong>{selected.policy.id} v{selected.policy.version}: {gate?.status || "draft"}</strong>
      <p>{gate?.reason || "Create and submit this version for review."}</p>
      <div className="policy-approval-grid"><label>Reviewer<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} disabled={!canEdit} placeholder="Must differ from change owner" /></label></div>
      <div className="workbench-artifact-actions">
        <button type="button" className="workbench-secondary" disabled={!canEdit || gate?.status !== "pending_approval"} onClick={() => workflowAction("approve")}>Approve</button>
        <button type="button" className="workbench-secondary" disabled={!canEdit || gate?.status !== "pending_approval"} onClick={() => workflowAction("reject")}>Reject</button>
      </div>
    </div>}
    <div className="policy-approval-summary" aria-label="Policy approval summary"><span>Versions <strong>{report.policyVersionCount}</strong></span><span>Approved <strong>{report.approvedCount}</strong></span><span>Pending <strong>{report.pendingCount}</strong></span><span>Blocked <strong>{report.blockedCount}</strong></span></div>
    {message && <p role="status" className="workbench-note">{message}</p>}
    <p className="workbench-note">Approval history is document metadata, not proof of external identity, organizational authorization, or deployment. A blocked policy gate does not clear any other rollout blocker.</p>
  </section>;
}
