const SCORE_START = 100;
const MAX_DEDUCTION = 60;
const ERROR_DEDUCTION = 15;
const WARNING_DEDUCTION = 5;

function normalizeSeverity(value) {
  return String(value || "").toLowerCase();
}

function scoreLabel(score) {
  if (score >= 90) return "Strong";
  if (score >= 75) return "Good progress";
  if (score >= 50) return "Needs attention";
  return "Early draft";
}

/**
 * Calculates a transparent, capped quality score from validation diagnostics.
 * Advisory recommendations are deliberately excluded from deductions.
 */
export function calculateDesignQualityScore(diagnostics = [], recommendations = []) {
  const safeDiagnostics = Array.isArray(diagnostics) ? diagnostics : [];
  const safeRecommendations = Array.isArray(recommendations) ? recommendations : [];

  const counts = { error: 0, warning: 0, info: 0, other: 0 };
  const rawDeductions = [];

  for (const diagnostic of safeDiagnostics) {
    const severity = normalizeSeverity(diagnostic?.severity ?? diagnostic?.level);
    if (severity === "error" || severity === "critical") {
      counts.error += 1;
      rawDeductions.push({
        severity: "error",
        reason: diagnostic?.message || diagnostic?.title || "Validation error",
        points: ERROR_DEDUCTION,
      });
    } else if (severity === "warning" || severity === "warn") {
      counts.warning += 1;
      rawDeductions.push({
        severity: "warning",
        reason: diagnostic?.message || diagnostic?.title || "Validation warning",
        points: WARNING_DEDUCTION,
      });
    } else if (severity === "info" || severity === "information") {
      counts.info += 1;
    } else {
      counts.other += 1;
    }
  }

  const uncappedDeduction = rawDeductions.reduce((sum, item) => sum + item.points, 0);
  const deduction = Math.min(MAX_DEDUCTION, uncappedDeduction);
  const score = Math.max(0, SCORE_START - deduction);

  return {
    score,
    label: scoreLabel(score),
    counts,
    deductions: rawDeductions,
    uncappedDeduction,
    appliedDeduction: deduction,
    deductionCap: MAX_DEDUCTION,
    rules: {
      startingScore: SCORE_START,
      errorPoints: ERROR_DEDUCTION,
      warningPoints: WARNING_DEDUCTION,
      maximumDeduction: MAX_DEDUCTION,
      recommendationsAffectScore: false,
    },
    recommendationsCount: safeRecommendations.length,
    totalFindings: safeDiagnostics.length,
  };
}

export { scoreLabel };
