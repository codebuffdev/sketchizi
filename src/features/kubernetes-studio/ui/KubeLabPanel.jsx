import { kubeLabLessons } from "../practice/kubeLab.js";

export default function KubeLabPanel({ lesson, result, checked, diagramMessage, busy, onLessonChange, onCheck }) {
  return (
    <div className="k8s-lab" role="tabpanel" id="k8s-lab-panel" aria-labelledby="k8s-lab-tab">
      <select aria-label="Practice topic" value={lesson.id} onChange={(event) => onLessonChange(event.target.value)} disabled={busy}>
        {kubeLabLessons.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
      </select>

      <div className="k8s-lab-goal">
        <h3>{lesson.title}</h3>
        <p>{lesson.goal}</p>
      </div>

      {result.nodes && (
        <div className="k8s-lab-graph" aria-label="Practice diagram">
          <div className="k8s-lab-node"><strong>{result.nodes[0].title}</strong><small>{result.nodes[0].detail}</small></div>
          <span className={`k8s-lab-connector${result.connected ? " connected" : ""}`} aria-hidden="true">
            <span>{result.connected ? "→" : "×"}</span>
          </span>
          <div className="k8s-lab-node"><strong>{result.nodes[1].title}</strong><small>{result.nodes[1].detail}</small></div>
        </div>
      )}

      <p className={`k8s-lab-feedback${result.connected ? "" : " warning"}`}>{result.problem || result.summary}</p>

      <div className="k8s-lab-actions">
        <details><summary>Show hint</summary><p>{lesson.hint}</p></details>
        <button type="button" className="k8s-studio-primary" onClick={onCheck} disabled={busy}>Check answer</button>
      </div>

      {checked && (
        <div className={`k8s-lab-answer${result.problem || result.failures.length ? "" : " passed"}`} role="status">
          {result.problem ? <strong>Fix the manifest above and try again.</strong>
            : result.failures.length ? (
              <>
                <strong>Keep going</strong>
                <ul>{result.failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul>
              </>
            ) : <strong>Exercise passed</strong>}
        </div>
      )}

      {diagramMessage && <p className={`k8s-lab-feedback${diagramMessage.error ? " warning" : ""}`} role={diagramMessage.error ? "alert" : "status"}>{diagramMessage.text}</p>}
    </div>
  );
}
