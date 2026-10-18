/** Keep advisory diagnostics visually distinct from conditions that actually block execution. */
export function partitionSimulationDiagnostics(diagnostics = []) {
  const blocking = [];
  const warnings = [];
  const info = [];
  for (const item of Array.isArray(diagnostics) ? diagnostics : []) {
    if (item?.severity === "blocker" || item?.severity === "error") blocking.push(item);
    else if (item?.severity === "warning") warnings.push(item);
    else info.push(item);
  }
  return { blocking, warnings, info };
}
