import { useMemo, useState } from "react";
import { findRecommendationPosition } from "../validation/recommendationLayout.js";
import { buildDesignImprovementReview } from "../validation/designImprovementReview.js";
import { calculateDesignQualityScore } from "../validation/designQualityScore.js";
import { buildDesignCompletenessReport } from "../validation/designCompletenessReport.js";
import { validateDesignTemplate, inferDesignRole } from "../validation/templateValidator.js";
import { getDesignTemplate } from "../templates/templateRegistry.js";
import { recommendDesignNextSteps } from "../validation/designRecommendations.js";

export default function DesignValidationDialog({ open, onClose, apiRef, profile, diagnostics, onSelectFinding }) {
  const [revision, setRevision] = useState(0);
  const [pendingRecommendation, setPendingRecommendation] = useState(null);
  const [pendingCompletenessAction, setPendingCompletenessAction] = useState(null);
  const [recommendationFeedback, setRecommendationFeedback] = useState("");
  const result = useMemo(() => {
    if (Array.isArray(diagnostics)) return diagnostics;
    const elements = apiRef.current?.getSceneElements?.() || [];
    return validateDesignTemplate(elements, profile);
  }, [apiRef, profile, revision, diagnostics]);
  const template = profile?.templateId ? getDesignTemplate(profile.templateId) : null;
  const currentElements = apiRef.current?.getSceneElements?.() || [];
  const recommendations = useMemo(
    () => recommendDesignNextSteps(currentElements, profile, result),
    [apiRef, profile, result, revision, diagnostics]
  );
  const improvementReview = useMemo(
    () => buildDesignImprovementReview(result, recommendations),
    [result, recommendations]
  );
  const qualityScore = useMemo(
    () => calculateDesignQualityScore(result, recommendations),
    [result, recommendations]
  );
  const completenessReport = useMemo(
    () => buildDesignCompletenessReport(template, result, currentElements, profile),
    [template, result, currentElements, profile, revision]
  );
  const errors = result.filter((item) => item.severity === "error").length;

  const applyCompletenessAction = () => {
    if (!pendingCompletenessAction) return;
    const api = apiRef.current;
    if (!api?.getSceneElements || !api?.updateScene) {
      setRecommendationFeedback("The canvas is not ready. Close this dialog and try again.");
      setPendingCompletenessAction(null);
      return;
    }

    const role = pendingCompletenessAction.role;
    const elements = api.getSceneElements() || [];
    const position = findRecommendationPosition(elements, { width: 180, height: 80, gap: 48 });
    const id = globalThis.crypto?.randomUUID?.() || `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const element = {
      id,
      type: "rectangle",
      x: position.x,
      y: position.y,
      width: 180,
      height: 80,
      angle: 0,
      strokeColor: "currentColor",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 2 ** 31),
      version: 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      customData: { designRole: role, role, createdFrom: "completeness-report" },
      text: role,
      fontSize: 20,
      fontFamily: 5,
      textAlign: "center",
      verticalAlign: "middle",
    };
    api.updateScene({ elements: [...elements, element] });
    api.updateScene({ appState: { selectedElementIds: { [id]: true } } });
    setRecommendationFeedback(`Added a ${role} component. Review its position and label on the canvas.`);
    setPendingCompletenessAction(null);
    setRevision((value) => value + 1);
  };

  const applyRecommendation = () => {
    if (!pendingRecommendation) return;
    const api = apiRef.current;
    if (!api?.getSceneElements || !api?.updateScene) {
      setRecommendationFeedback("The canvas is not ready. Close this dialog and try again.");
      setPendingRecommendation(null);
      return;
    }
    const elements = api.getSceneElements() || [];
    const recommendation = pendingRecommendation;
    if (recommendation.type === "component") {
      const position = findRecommendationPosition(elements, { width: 180, height: 80, gap: 48 });
      const id = globalThis.crypto?.randomUUID?.() || `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const element = {
        id,
        type: "rectangle",
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        angle: 0,
        strokeColor: "#1e1e1e",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 2000000000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2000000000),
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        customData: { design: { role: recommendation.role } },
        text: recommendation.role,
        fontSize: 20,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
      };
      api.updateScene({ elements: [...elements, element] });
      api.updateScene({ appState: { selectedElementIds: { [id]: true } } });
      setRecommendationFeedback(`Added a ${recommendation.role} component. Review its position and label on the canvas.`);
      setRevision((value) => value + 1);
    } else if (recommendation.type === "connection") {
      const candidates = elements.filter((element) => element && !element.isDeleted && ["rectangle", "ellipse", "diamond", "polygon", "image", "frame"].includes(element.type));
      const sourceCandidates = candidates.filter((element) => inferDesignRole(element, elements) === recommendation.from);
      const targetCandidates = candidates.filter((element) => inferDesignRole(element, elements) === recommendation.to);
      const connectedPairs = new Set(elements.filter((element) => element && !element.isDeleted && ["arrow", "line"].includes(element.type))
        .map((edge) => `${edge.startBinding?.elementId}->${edge.endBinding?.elementId}`));
      let pair = null;
      for (const source of sourceCandidates) {
        for (const target of targetCandidates) {
          if (!connectedPairs.has(`${source.id}->${target.id}`)) { pair = { source, target }; break; }
        }
        if (pair) break;
      }
      if (!pair) {
        setRecommendationFeedback("No unconnected pair of these roles is available. Recheck the canvas and recommendations.");
      } else {
        api.updateScene({ appState: { selectedElementIds: { [pair.source.id]: true, [pair.target.id]: true } } });
        setRecommendationFeedback(`Selected the ${recommendation.from} and ${recommendation.to} components. Draw a connector between them to complete this suggested relationship.`);
      }
    }
    setPendingRecommendation(null);
  };
  const warnings = result.filter((item) => item.severity === "warning").length;

  return (
    <div className="design-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="design-dialog design-validation-dialog" role="dialog" aria-modal="true" aria-labelledby="design-validation-title">
        <header className="design-dialog-header">
          <div>
            <p className="design-dialog-eyebrow">DESIGN QUALITY</p>
            <h2 id="design-validation-title">Design validation</h2>
            <p>{template ? `${template.name} · ${profile.ruleMode} rules` : "Freeform design · no template constraints"}</p>
          </div>
          <button type="button" className="design-dialog-close" onClick={onClose} aria-label="Close design validation">×</button>
        </header>
        <div className="design-validation-summary">
          <span className={errors ? "design-validation-count has-errors" : "design-validation-count"}>{errors} errors</span>
          <span className={warnings ? "design-validation-count has-warnings" : "design-validation-count"}>{warnings} warnings</span>
          <span className="design-validation-count">{result.length} findings</span>
        </div>
        <section className="design-quality-score" aria-label="Design quality score">
          <div className="design-quality-score__heading">
            <div>
              <h3>Design quality score</h3>
              <p>Validation progress, scored with explicit rules. Suggestions are tracked separately.</p>
            </div>
            <div className="design-quality-score__value" aria-live="polite">
              <strong>{qualityScore.score}</strong><span>/100</span>
              <small>{qualityScore.label}</small>
            </div>
          </div>
          <div className="design-quality-score__track" role="progressbar" aria-label="Design quality score"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={qualityScore.score}>
            <span style={{ width: `${qualityScore.score}%` }} />
          </div>
          <p className="design-quality-score__counts">
            {qualityScore.counts.error} errors · {qualityScore.counts.warning} warnings · {qualityScore.counts.info} informational findings · {qualityScore.recommendationsCount} suggested improvements
          </p>
          <details className="design-quality-score__rules">
            <summary>How this score is calculated</summary>
            <p>Starts at 100. Each error deducts 15 points and each warning deducts 5 points. Total deductions are capped at 60. Informational findings and suggested improvements do not reduce the score.</p>
          </details>
        </section>
        <section className="design-completeness-report" aria-labelledby="design-completeness-title">
          <div className="design-completeness-report__heading">
            <div>
              <h3 id="design-completeness-title">Design completeness</h3>
              <p>Required template roles and relationships, checked separately from the quality score.</p>
            </div>
            <span className={`design-completeness-status ${completenessReport.status}`}>
              {completenessReport.status === "complete" ? "Requirements met" : "Needs review"}
            </span>
          </div>
          <div className="design-completeness-report__summary">
            <span><strong>{completenessReport.summary.completeRoles}/{completenessReport.summary.requiredRoles}</strong> required roles present</span>
            <span><strong>{completenessReport.summary.relationshipsNeedingReview}</strong> relationship issues</span>
            <span><strong>{completenessReport.summary.validationFindings}</strong> validation findings</span>
          </div>
          {completenessReport.roles.length ? (
            <div className="design-completeness-report__group">
              <h4>Required components / roles</h4>
              <ul>
                {completenessReport.roles.map((item) => (
                  <li key={item.role} className={`design-completeness-item ${item.complete ? "complete" : "missing"}`}>
                    <span aria-hidden="true">{item.complete ? "✓" : "!"}</span>
                    <span>{item.role}</span>
                    <small>{item.presentCount}/{item.requiredCount} present</small>
                    {!item.complete ? (
                      <button type="button" className="design-recommendation-action"
                        onClick={() => { setRecommendationFeedback(""); setPendingCompletenessAction({ role: item.role }); }}>
                        Add component…
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="design-completeness-report__empty">This template has no explicit required-role checklist.</p>
          )}
          {completenessReport.relationships.length ? (
            <div className="design-completeness-report__group">
              <h4>Expected relationships</h4>
              <ul>
                {completenessReport.relationships.map((item) => (
                  <li key={item.label} className={`design-completeness-item ${item.status}`}>
                    <span aria-hidden="true">{item.status === "needs-review" ? "!" : item.status === "not-assessed" ? "—" : "•"}</span>
                    <span>{item.label}</span>
                    <small>{item.status === "not-assessed" ? "Not assessed" : item.status === "needs-review" ? "Needs review" : "No reported issue"}</small>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="design-completeness-report__empty">This template has no explicit expected-relationship checklist.</p>
          )}
          <details className="design-completeness-report__note">
            <summary>What this report means</summary>
            <p>{completenessReport.note}</p>
          </details>
        </section>
        {improvementReview.total ? (
          <section className="design-improvement-review" aria-labelledby="design-improvement-review-title">
            <div className="design-improvement-review-heading">
              <div>
                <h3 id="design-improvement-review-title">Improvement review</h3>
                <p>Work from high priority to low. Recommendations are advisory; decide what fits your design.</p>
              </div>
              <span>{improvementReview.total} items</span>
            </div>
            <div className="design-improvement-priority-summary">
              <span className="priority-high">{improvementReview.counts.high} high</span>
              <span className="priority-medium">{improvementReview.counts.medium} medium</span>
              <span className="priority-low">{improvementReview.counts.low} low</span>
            </div>
            <ol className="design-improvement-review-list">
              {improvementReview.items.map((item, index) => (
                <li key={item.id} className={`design-improvement-item priority-${item.priority}`}>
                  <span className="design-improvement-number">{index + 1}</span>
                  <div className="design-improvement-copy">
                    <div className="design-improvement-title-row">
                      <strong>{item.title}</strong>
                      <span className={`design-improvement-priority-label priority-${item.priority}`}>{item.priority}</span>
                    </div>
                    <p>{item.detail}</p>
                    <small>Next step: {item.nextAction}</small>
                    {item.source === "finding" && item.elementId && onSelectFinding ? (
                      <button type="button" className="design-recommendation-action" onClick={() => onSelectFinding(item.sourceItem)}>Locate finding</button>
                    ) : null}
                    {item.source === "recommendation" ? (
                      <button type="button" className="design-recommendation-action" onClick={() => { setRecommendationFeedback(""); setPendingRecommendation(item.sourceItem); }}>
                        {item.sourceItem.type === "component" ? "Add component…" : "Prepare connection…"}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {result.length ? (
          <ul className="design-diagnostics-list">
            {result.map((item, index) => (
              <li key={`${item.code}-${item.elementId || index}`} className={`design-diagnostic ${item.severity}`}>
                {item.elementId && onSelectFinding ? (
                  <button
                    type="button"
                    className="design-diagnostic-select"
                    onClick={() => onSelectFinding(item)}
                    title="Select this element on the canvas"
                  >
                    <span className="design-diagnostic-severity">{item.severity}</span>
                    <span className="design-diagnostic-content">
                      <span>{item.message}</span>
                      {item.suggestions?.length ? (
                        <span className="design-diagnostic-suggestions">
                          {item.suggestions.map((suggestion) => <span key={suggestion}>{suggestion}</span>)}
                        </span>
                      ) : null}
                    </span>
                    <span aria-hidden="true" className="design-diagnostic-action">Locate</span>
                  </button>
                ) : (
                  <>
                    <span className="design-diagnostic-severity">{item.severity}</span>
                    <span className="design-diagnostic-content">
                      <span>{item.message}</span>
                      {item.suggestions?.length ? (
                        <span className="design-diagnostic-suggestions">
                          {item.suggestions.map((suggestion) => <span key={suggestion}>{suggestion}</span>)}
                        </span>
                      ) : null}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="design-validation-empty"><span aria-hidden="true">✓</span><strong>{template ? "No template violations found" : "Ready for freeform design"}</strong><p>{template ? "The current diagram satisfies the rules checked by this template." : "Choose a template to enable domain-specific design checks."}</p></div>
        )}
        {recommendations.length ? (
          <section className="design-recommendations" aria-labelledby="design-recommendations-title">
            <div className="design-recommendations-heading">
              <h3 id="design-recommendations-title">Recommended next steps</h3>
              <p>Suggestions only. Sketchizi will not change the canvas automatically.</p>
            </div>
            <ul className="design-recommendations-list">
              {recommendations.map((item) => (
                <li key={item.id} className="design-recommendation">
                  <span className="design-recommendation-kind">{item.type === "component" ? "COMPONENT" : "CONNECTION"}</span>
                  <div className="design-recommendation-copy">
                    <strong>{item.title}</strong>
                    <p>{item.message}</p>
                    <small>{item.reason}</small>
                    <button type="button" className="design-recommendation-action" onClick={() => { setRecommendationFeedback(""); setPendingRecommendation(item); }}>
                      {item.type === "component" ? "Add component…" : "Prepare connection…"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {recommendationFeedback ? <p className="design-recommendation-feedback" role="status">{recommendationFeedback}</p> : null}
        {pendingCompletenessAction ? (
        <div className="design-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingCompletenessAction(null); }}>
          <section className="design-confirm-dialog design-completeness-confirm" role="dialog" aria-modal="true" aria-labelledby="design-completeness-confirm-title">
            <h3 id="design-completeness-confirm-title">Add missing component?</h3>
            <p>This will add a new <strong>{pendingCompletenessAction.role}</strong> shape to the canvas. It will not create any connectors automatically.</p>
            <p>Review the position and label after adding it. You can undo the change in the editor.</p>
            <div className="design-confirm-actions">
              <button type="button" className="design-button-secondary" onClick={() => setPendingCompletenessAction(null)}>Cancel</button>
              <button type="button" className="design-button-primary" onClick={applyCompletenessAction}>Add component</button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingRecommendation ? (
          <div className="design-recommendation-confirm-backdrop" role="presentation">
            <section className="design-recommendation-confirm" role="alertdialog" aria-modal="true" aria-labelledby="design-recommendation-confirm-title">
              <h3 id="design-recommendation-confirm-title">Confirm suggested change</h3>
              <p>{pendingRecommendation.type === "component"
                ? `Add a new rectangle labelled '${pendingRecommendation.role}' to the current canvas? Existing elements will be preserved.`
                : `Select the existing '${pendingRecommendation.from}' and '${pendingRecommendation.to}' components so you can draw the suggested connector manually? No connector will be created automatically.`}</p>
              <div className="design-recommendation-confirm-actions">
                <button type="button" className="design-secondary-button" onClick={() => setPendingRecommendation(null)}>Cancel</button>
                <button type="button" className="design-primary-button" onClick={applyRecommendation}>Confirm</button>
              </div>
            </section>
          </div>
        ) : null}
        <footer className="design-dialog-footer">
          <span>Validation is based on the current canvas.</span>
          <div>
            <button type="button" className="design-secondary-button" onClick={() => setRevision((value) => value + 1)}>Recheck</button>
            <button type="button" className="design-primary-button" onClick={onClose}>Done</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
