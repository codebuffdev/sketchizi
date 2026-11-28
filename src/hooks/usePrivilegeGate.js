import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCurrentUser } from "../features/auth/authClient.js";
import { evaluatePrivilegeGate, resolveUserRole } from "../config/privileges.js";

/**
 * Reusable feature gate. Pass `user` when the caller already has it; otherwise the
 * hook reads the shared, cached current-user request. Usage:
 *   const { check } = usePrivilegeGate();
 *   const { allowed, reason, upgradeTarget } = check("github.privateRepos");
 */
export function usePrivilegeGate({ user: suppliedUser } = {}) {
  const [fetchedUser, setFetchedUser] = useState(null);
  useEffect(() => {
    if (suppliedUser !== undefined) return undefined;
    const controller = new AbortController();
    fetchCurrentUser(controller.signal)
      .then(({ authenticated, user }) => setFetchedUser(authenticated ? user : null))
      .catch(() => setFetchedUser(null));
    return () => controller.abort();
  }, [suppliedUser]);

  const user = suppliedUser !== undefined ? suppliedUser : fetchedUser;
  const role = useMemo(() => resolveUserRole(user), [user]);
  const check = useCallback((feature) => evaluatePrivilegeGate(role, feature), [role]);
  return { role, user, check };
}

export default usePrivilegeGate;
