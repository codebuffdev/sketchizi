import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCurrentUser, startGoogleSignIn } from "../auth/authClient.js";
import { aiApiRequest, createRequestId } from "./aiApiClient.js";
import { buildDiagramContext } from "./diagramContextBuilder.js";

const TRANSCRIPT_KEY = "sketchizi.aiAsk.transcript.v1";
const BYOK_KEY = "sketchizi.aiAsk.byokKey.v1";
const STARTER_PROMPTS = [
  "Summarize this diagram.",
  "Explain the main data flow.",
  "What architectural risks do you see?",
  "What important components might be missing?",
];
const EMPTY_STATE = { schemaVersion: 1, accountId: null, conversationId: null, messages: [], provider: "builtin", draft: "", pendingRequest: null };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readTranscript() {
  try {
    const value = sessionStorage.getItem(TRANSCRIPT_KEY);
    if (!value) return { ...EMPTY_STATE };
    const parsed = JSON.parse(value);
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.messages)) return { ...EMPTY_STATE };
    return {
      ...EMPTY_STATE,
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : null,
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : null,
      messages: parsed.messages.filter((message) => message && ["user", "assistant"].includes(message.role) && typeof message.text === "string").slice(-60),
      provider: parsed.provider === "byok" ? "byok" : "builtin",
      draft: typeof parsed.draft === "string" ? parsed.draft.slice(0, 4000) : "",
      pendingRequest: parsed.pendingRequest &&
        UUID_PATTERN.test(parsed.pendingRequest.requestId || "") &&
        UUID_PATTERN.test(parsed.pendingRequest.conversationId || "") &&
        typeof parsed.pendingRequest.question === "string" &&
        parsed.pendingRequest.question.length > 0 && parsed.pendingRequest.question.length <= 4000 &&
        ["builtin", "byok"].includes(parsed.pendingRequest.provider) &&
        parsed.conversationId === parsed.pendingRequest.conversationId
        ? {
            requestId: parsed.pendingRequest.requestId,
            conversationId: parsed.pendingRequest.conversationId,
            question: parsed.pendingRequest.question,
            provider: parsed.pendingRequest.provider,
          }
        : null,
    };
  } catch {
    try { sessionStorage.removeItem(TRANSCRIPT_KEY); } catch {}
    return { ...EMPTY_STATE };
  }
}

function writeTranscript(value, pendingRequest = value.pendingRequest || null) {
  try {
    sessionStorage.setItem(TRANSCRIPT_KEY, JSON.stringify({
      schemaVersion: 1,
      accountId: value.accountId,
      conversationId: value.conversationId,
      messages: value.messages.slice(-60),
      provider: value.provider,
      draft: value.draft.slice(0, 4000),
      pendingRequest: pendingRequest ? {
        requestId: pendingRequest.requestId,
        conversationId: pendingRequest.conversationId,
        question: pendingRequest.question.slice(0, 4000),
        provider: pendingRequest.provider,
      } : null,
    }));
    return true;
  } catch {
    return false;
  }
}

function clearAiSession() {
  try { sessionStorage.removeItem(TRANSCRIPT_KEY); } catch {}
  try { sessionStorage.removeItem(BYOK_KEY); } catch {}
}

function readApiKeyForAccount(accountId) {
  try {
    const raw = sessionStorage.getItem(BYOK_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion === 1 && parsed.accountId === accountId && typeof parsed.key === "string") return parsed.key;
    sessionStorage.removeItem(BYOK_KEY);
  } catch {
    try { sessionStorage.removeItem(BYOK_KEY); } catch {}
  }
  return "";
}

function timeLabel(value) {
  try { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export default function AiAskPanel({ open, onClose, apiRef, persistSketchNow, saveTimerRef }) {
  const [auth, setAuth] = useState({ status: "loading", user: null, error: "" });
  const [chat, setChat] = useState(() => readTranscript());
  const [pendingRequest, setPendingRequest] = useState(() => chat.pendingRequest || null);
  const [usage, setUsage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [authAttempt, setAuthAttempt] = useState(0);
  const [failedQuestion, setFailedQuestion] = useState("");
  const transcriptRef = useRef(null);
  const hydratedAccountRef = useRef(null);
  const activeAccountRef = useRef(null);

  useEffect(() => {
    if (!chat.accountId && !chat.conversationId && !chat.messages.length && !chat.draft) {
      try { sessionStorage.removeItem(TRANSCRIPT_KEY); } catch {}
      return;
    }
    if (!writeTranscript(chat, pendingRequest)) {
      setAnnouncement("Browser storage is unavailable. This conversation will remain only until this page is closed.");
    }
  }, [chat, pendingRequest]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setPanelError("");
    setAuth({ status: "loading", user: null, error: "" });
    fetchCurrentUser().then(async ({ authenticated, user }) => {
      if (cancelled) return;
      if (!authenticated || !user?.id) {
        clearAiSession();
        activeAccountRef.current = null;
        setPendingRequest(null);
        setFailedQuestion("");
        hydratedAccountRef.current = null;
        setApiKey("");
        setChat({ ...EMPTY_STATE });
        setUsage(null);
        setAuth({ status: "anonymous", user: null, error: "" });
        return;
      }
      activeAccountRef.current = user.id;
      if (hydratedAccountRef.current !== user.id) {
        const stored = readTranscript();
        if (stored.accountId && stored.accountId !== user.id) clearAiSession();
        const next = readTranscript();
        const matchesAccount = next.accountId === user.id;
        const initial = matchesAccount ? { ...next, accountId: user.id } : { ...EMPTY_STATE, accountId: user.id };
        const restoredKey = readApiKeyForAccount(user.id);
        setApiKey(restoredKey);
        setChat(initial);
        setPendingRequest(initial.pendingRequest || null);
        if (initial.pendingRequest) {
          setPanelError("A previous AI request may still be processing. Check its status before submitting another generation.");
        }
        hydratedAccountRef.current = user.id;
        if (!initial.conversationId) {
          try {
            const created = await aiApiRequest("/conversations", { method: "POST", body: {} });
            if (cancelled || activeAccountRef.current !== user.id) return;
            const withConversation = { ...initial, conversationId: created.conversationId };
            setChat(withConversation);
            if (initial.provider === "builtin") setUsage(await aiApiRequest(`/usage?conversationId=${encodeURIComponent(created.conversationId)}`));
          } catch (error) {
            if (!cancelled) setPanelError(error.message || "Could not start an AI conversation.");
          }
        } else {
          try {
            const usageData = await aiApiRequest(`/usage?conversationId=${encodeURIComponent(initial.conversationId)}`);
            if (!cancelled && activeAccountRef.current === user.id) setUsage(usageData);
          } catch (error) {
            if (cancelled) return;
            if (error.status === 404) {
              try {
                const created = await aiApiRequest("/conversations", { method: "POST", body: {} });
                if (cancelled || activeAccountRef.current !== user.id) return;
                setChat({ ...initial, conversationId: created.conversationId, messages: [] });
                if (initial.provider === "builtin") setUsage(await aiApiRequest(`/usage?conversationId=${encodeURIComponent(created.conversationId)}`));
              } catch (createError) {
                setPanelError(createError.message || "Could not restore the AI conversation.");
              }
            } else setPanelError(error.message || "Could not load AI usage.");
          }
        }
      }
      if (!cancelled) setAuth({ status: "authenticated", user, error: "" });
    }).catch((error) => {
      if (!cancelled) setAuth({ status: "unavailable", user: null, error: error.message || "Sign-in status is temporarily unavailable." });
    });
    return () => { cancelled = true; };
  }, [open, authAttempt]);

  useEffect(() => {
    if (!open || auth.status !== "authenticated" || !auth.user?.id || !chat.conversationId || chat.provider !== "builtin") return undefined;
    let cancelled = false;
    aiApiRequest(`/usage?conversationId=${encodeURIComponent(chat.conversationId)}`).then((data) => {
      if (!cancelled && activeAccountRef.current === auth.user.id) setUsage(data);
    }).catch((error) => {
      if (!cancelled && activeAccountRef.current === auth.user.id) setPanelError(error.message || "Could not refresh AI usage.");
    });
    return () => { cancelled = true; };
  }, [open, auth.status, auth.user?.id, chat.conversationId, chat.provider]);

  useEffect(() => {
    const onAuthChanged = (event) => {
      if (event.detail?.authenticated === false || event.detail?.signedOut === true) {
        clearAiSession();
        activeAccountRef.current = null;
        setPendingRequest(null);
        setFailedQuestion("");
        hydratedAccountRef.current = null;
        setApiKey("");
        setUsage(null);
        setChat({ ...EMPTY_STATE });
        setAuth({ status: "anonymous", user: null, error: "" });
      }
    };
    window.addEventListener("sketchizi:auth-changed", onAuthChanged);
    return () => window.removeEventListener("sketchizi:auth-changed", onAuthChanged);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [open, chat.messages, busy]);

  const updateChat = useCallback((updater) => {
    setChat((current) => typeof updater === "function" ? updater(current) : updater);
  }, []);

  const clearTranscript = useCallback(() => {
    if (pendingRequest) return;
    updateChat((current) => ({ ...current, messages: [], draft: "" }));
    setAnnouncement("Conversation messages cleared. Usage allowance is unchanged.");
  }, [pendingRequest, updateChat]);

  const startNewConversation = useCallback(async () => {
    if (busy || pendingRequest || !auth.user?.id) return;
    if (chat.provider === "builtin" && usage && usage.accountRemaining <= 0) {
      setPanelError("The rolling account allowance is exhausted. You can continue when an earlier successful question leaves the 12-hour window.");
      return;
    }
    setBusy(true);
    setPanelError("");
    try {
      const created = await aiApiRequest("/conversations", { method: "POST", body: {} });
      if (activeAccountRef.current !== auth.user.id) return;
      const next = { ...chat, accountId: auth.user.id, conversationId: created.conversationId, messages: [], draft: "" };
      setChat(next);
      setUsage(chat.provider === "builtin" ? await aiApiRequest(`/usage?conversationId=${encodeURIComponent(created.conversationId)}`) : null);
      setAnnouncement("New conversation started.");
    } catch (error) {
      setPanelError(error.message || "Could not start a new conversation.");
    } finally { setBusy(false); }
  }, [auth.user, busy, chat, usage, pendingRequest]);

  const sendQuestion = useCallback(async (value = chat.draft, retryOf = null) => {
    const question = String(value || "").trim();
    if (!question || busy) return;
    if (pendingRequest) {
      setPanelError("Check the previous request's status before submitting another generation.");
      return;
    }
    if (auth.status !== "authenticated" || !auth.user?.id) {
      setPanelError("Sign in with Google before using AI Ask.");
      return;
    }
    if (chat.provider === "byok" && !apiKey.trim()) {
      setPanelError("Enter your Gemini API key to use BYOK.");
      return;
    }
    setBusy(true);
    setPanelError("");
    setFailedQuestion("");
    setPendingRequest(null);
    const requestId = createRequestId();
    const timestamp = new Date().toISOString();
    const userMessage = { role: "user", text: question, timestamp, requestId };
    const baseMessages = retryOf ? chat.messages : [...chat.messages, userMessage];
    updateChat((current) => ({ ...current, draft: retryOf ? current.draft : "", messages: baseMessages }));
    let currentConversationId = chat.conversationId;
    try {
      let conversationId = currentConversationId;
      if (!conversationId) {
        const created = await aiApiRequest("/conversations", { method: "POST", body: {} });
        conversationId = created.conversationId;
        currentConversationId = conversationId;
        if (activeAccountRef.current !== auth.user.id) return;
        updateChat((current) => ({ ...current, accountId: auth.user.id, conversationId }));
      }
      const api = apiRef.current;
      if (!api?.getSceneElements) throw new Error("The canvas is still loading. Wait a moment and try again.");
      const diagramContext = buildDiagramContext(api.getSceneElements());
      const history = chat.messages.slice(-12).map((message) => ({ role: message.role, text: message.text.slice(0, 12000) }));
      const payload = {
        conversationId,
        requestId,
        provider: chat.provider,
        question,
        ...(chat.provider === "byok" ? { apiKey: apiKey.trim() } : {}),
        diagramContext,
        history,
      };
      const requestMetadata = { requestId, question, conversationId, provider: chat.provider };
      setPendingRequest(requestMetadata);
      writeTranscript({ ...chat, accountId: auth.user.id, conversationId, messages: baseMessages, draft: retryOf ? chat.draft : "" }, requestMetadata);
      let response = await aiApiRequest("/chat", { method: "POST", body: payload });
      if (response.status === "processing") {
        const deadline = Date.now() + 55_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          const status = await aiApiRequest(`/requests/${encodeURIComponent(requestId)}`);
          if (activeAccountRef.current !== auth.user.id) return;
          if (status.status === "succeeded") {
            response = { ...status, usage: status.usage || null };
            break;
          }
          if (status.status === "failed") {
            const failure = new Error("The AI generation did not complete successfully. No successful-question allowance was consumed. Retry to submit a new attempt.");
            failure.code = status.code || "generation_failed";
            throw failure;
          }
        }
        if (response.status === "processing") {
          const pending = new Error("This AI request is still processing. You can retry safely; the same request ID will not start a duplicate generation.");
          pending.code = "request_still_processing";
          throw pending;
        }
      }
      if (!response.answer) {
        const unavailable = new Error("The AI request succeeded, but its answer is no longer available in the temporary retry cache. A deliberate retry will be a new request and may consume another successful-question allowance.");
        unavailable.code = "completed_result_not_retained";
        throw unavailable;
      }
      if (activeAccountRef.current !== auth.user.id) return;
      const assistantMessage = { role: "assistant", text: String(response.answer), timestamp: new Date().toISOString(), requestId, question };
      updateChat((current) => ({ ...current, accountId: auth.user.id, conversationId, messages: [...baseMessages, assistantMessage] }));
      setPendingRequest(null);
      if (chat.provider === "builtin") {
        if (response.usage) setUsage(response.usage);
        else {
          try { setUsage(await aiApiRequest(`/usage?conversationId=${encodeURIComponent(conversationId)}`)); }
          catch { setPanelError("Answer received, but current usage could not be refreshed. The allowance is still enforced by the backend."); }
        }
      }
      setAnnouncement("Answer received.");
    } catch (error) {
      if (activeAccountRef.current !== auth.user.id) return;
      if (error.status === 401) {
        clearAiSession();
        activeAccountRef.current = null;
        setPendingRequest(null);
        setFailedQuestion("");
        setApiKey("");
        setUsage(null);
        setChat({ ...EMPTY_STATE });
        setAuth({ status: "anonymous", user: null, error: "" });
        setPanelError("Your sign-in session has expired. Sign in again to continue.");
      } else if (
        error.code === "transport_interrupted" ||
        error.code === "request_still_processing" ||
        [500, 503, 504, 522, 524].includes(error.status) ||
        (error.status === 502 && error.code === "ai_service_unavailable") ||
        (error.status === 409 && ["completed_result_not_retained", "reservation_lost"].includes(error.code))
      ) {
        setPendingRequest({ requestId, question, conversationId: currentConversationId, provider: chat.provider });
        setFailedQuestion("");
        setPanelError("The request outcome is not confirmed. Check its status before submitting another generation.");
      } else {
        setPanelError(error.message || "The AI request failed. Your canvas was not changed.");
        setFailedQuestion(question);
        setPendingRequest(null);
        if (chat.provider === "builtin" && currentConversationId) {
          try { setUsage(await aiApiRequest(`/usage?conversationId=${encodeURIComponent(currentConversationId)}`)); }
          catch { /* Usage is still enforced by PostgreSQL; refresh again when the panel is reopened. */ }
        }
      }
    } finally {
      setBusy(false);
    }
  }, [apiKey, auth, busy, chat, apiRef, updateChat, pendingRequest]);

  const checkPendingRequest = useCallback(async () => {
    if (!pendingRequest || !auth.user?.id || busy) return;
    setBusy(true);
    setPanelError("");
    try {
      const status = await aiApiRequest(`/requests/${encodeURIComponent(pendingRequest.requestId)}`);
      if (activeAccountRef.current !== auth.user.id) return;
      if (status.status === "succeeded" && status.answer) {
        const alreadyDisplayed = chat.messages.some((message) => message.role === "assistant" && message.requestId === pendingRequest.requestId);
        if (!alreadyDisplayed) {
          const answer = { role: "assistant", text: status.answer, timestamp: new Date().toISOString(), requestId: pendingRequest.requestId, question: pendingRequest.question };
          updateChat((current) => ({ ...current, accountId: auth.user.id, conversationId: pendingRequest.conversationId, messages: [...current.messages, answer] }));
        }
        if (pendingRequest.provider === "builtin") {
          try { setUsage(await aiApiRequest(`/usage?conversationId=${encodeURIComponent(pendingRequest.conversationId)}`)); }
          catch { /* The answer remains available; usage will refresh when the panel is reopened. */ }
        }
        setPendingRequest(null);
        setFailedQuestion("");
        setPanelError("");
        setAnnouncement("Answer received.");
      } else if (status.status === "succeeded") {
        setPendingRequest(null);
        setFailedQuestion(pendingRequest.question);
        setPanelError("The request succeeded but its answer is no longer available in the temporary retry cache. A deliberate retry creates a new request and may consume another allowance.");
        if (pendingRequest.provider === "builtin") {
          try { setUsage(await aiApiRequest(`/usage?conversationId=${encodeURIComponent(pendingRequest.conversationId)}`)); } catch {}
        }
      } else if (status.status === "failed") {
        setPendingRequest(null);
        setFailedQuestion(pendingRequest.question);
        setPanelError("The request failed and no successful-question allowance was consumed. You can retry as a new request.");
        if (pendingRequest.provider === "builtin") {
          try { setUsage(await aiApiRequest(`/usage?conversationId=${encodeURIComponent(pendingRequest.conversationId)}`)); } catch {}
        }
      } else {
        setPanelError("The request is still processing. Check status again shortly; do not submit a duplicate generation.");
      }
    } catch (error) {
      if (activeAccountRef.current !== auth.user.id) return;
      if (error.status === 404) {
        setPendingRequest(null);
        setFailedQuestion(pendingRequest.question);
        setPanelError("No accepted request was found. Retrying will submit a new generation.");
        if (pendingRequest.provider === "builtin") {
          try { setUsage(await aiApiRequest(`/usage?conversationId=${encodeURIComponent(pendingRequest.conversationId)}`)); } catch {}
        }
      } else {
        setPanelError(error.message || "Could not check the AI request status. The request has not been resubmitted.");
      }
    } finally {
      setBusy(false);
    }
  }, [pendingRequest, auth.user, busy, chat.messages, updateChat]);

  const beginSignIn = useCallback(async () => {
    setPanelError("");
    const api = apiRef.current;
    if (!api?.getSceneElements || typeof persistSketchNow !== "function") {
      setPanelError("The canvas is still loading. Wait until it is ready, then sign in again so the current diagram can be saved first.");
      return;
    }
    if (saveTimerRef?.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const saved = await persistSketchNow({
      elements: api.getSceneElements(),
      appState: api.getAppState?.() || {},
      files: api.getFiles?.() || {},
    });
    if (!saved) {
      setPanelError("Sketchizi could not save the latest canvas locally, so sign-in was not started. Resolve the storage issue and try again.");
      return;
    }
    const destination = new URL(window.location.href);
    destination.searchParams.set("aiAsk", "1");
    startGoogleSignIn(`${destination.pathname}${destination.search}${destination.hash}`);
  }, [apiRef, persistSketchNow, saveTimerRef]);

  const chooseProvider = (provider) => {
    updateChat((current) => ({ ...current, provider }));
    setPanelError("");
    if (provider === "byok") setUsage(null);
    else if (chat.conversationId) aiApiRequest(`/usage?conversationId=${encodeURIComponent(chat.conversationId)}`).then(setUsage).catch((error) => setPanelError(error.message));
  };

  const updateApiKey = (value) => {
    setApiKey(value);
    try {
      if (value && auth.user?.id) sessionStorage.setItem(BYOK_KEY, JSON.stringify({ schemaVersion: 1, accountId: auth.user.id, key: value }));
      else sessionStorage.removeItem(BYOK_KEY);
    } catch { setPanelError("Browser session storage is unavailable. BYOK key changes will not survive a refresh."); }
  };

  if (!open) return null;

  return (
    <section className="ai-ask-panel" role="dialog" aria-modal="false" aria-labelledby="ai-ask-title">
      <header className="ai-ask-header">
        <div className="ai-ask-heading">
          <span className="ai-ask-mark" aria-hidden="true">✳</span>
          <div><h2 id="ai-ask-title">AI Ask</h2><p>Ask questions about your current diagram</p></div>
        </div>
        <div className="ai-ask-header-actions">
          <button type="button" onClick={clearTranscript} disabled={!chat.messages.length || Boolean(pendingRequest)} title="Clear visible messages" aria-label="Clear conversation messages">Clear</button>
          <button type="button" onClick={startNewConversation} disabled={busy || Boolean(pendingRequest) || auth.status !== "authenticated" || (chat.provider === "builtin" && usage?.accountRemaining <= 0)} title="Start a new conversation" aria-label="New conversation">New</button>
          <button type="button" className="ai-ask-close" onClick={onClose} aria-label="Close AI Ask">×</button>
        </div>
      </header>

      {auth.status === "loading" && <div className="ai-ask-auth-state" role="status">Checking your sign-in session…</div>}
      {auth.status === "unavailable" && <div className="ai-ask-auth-state"><p>{auth.error}</p><button type="button" onClick={() => setAuthAttempt((value) => value + 1)}>Retry</button></div>}
      {auth.status === "anonymous" && (
        <div className="ai-ask-signin-state">
          <div className="ai-ask-signin-icon" aria-hidden="true">✦</div>
          <h3>Sign in to use AI Ask</h3>
          <p>AI Ask requires your existing Google sign-in for both Built-in Gemini and BYOK. Drawing and collaboration remain available without signing in.</p>
          <button className="ai-ask-primary" type="button" onClick={beginSignIn}>Continue with Google</button>
          <p className="ai-ask-muted">Your current canvas is saved before sign-in and restored when you return.</p>
        </div>
      )}

      {auth.status === "authenticated" && (
        <>
          <div className="ai-ask-provider-row">
            <label htmlFor="ai-ask-provider">Provider</label>
            <select id="ai-ask-provider" value={chat.provider} onChange={(event) => chooseProvider(event.target.value)} disabled={busy || Boolean(pendingRequest)}>
              <option value="builtin">Built-in Gemini</option>
              <option value="byok">Bring Your Own Key (BYOK)</option>
            </select>
          </div>
          {chat.provider === "builtin" ? (
            <div className="ai-ask-usage" aria-live="polite">
              {usage ? <>
                <span>Conversation: <strong>{usage.conversationRemaining ?? "—"}</strong> questions left</span>
                <span>Rolling 12 hours: <strong>{usage.accountRemaining ?? "—"}</strong> left</span>
                {usage.nextAvailableAt && usage.accountRemaining <= 0 && <small>Allowance expected to refresh {new Date(usage.nextAvailableAt).toLocaleString()}.</small>}
              </> : <span>Loading usage allowance…</span>}
            </div>
          ) : (
            <div className="ai-ask-byok-settings">
              <label htmlFor="ai-ask-api-key">Gemini API key</label>
              <div className="ai-ask-key-row">
                <input id="ai-ask-api-key" type={showKey ? "text" : "password"} autoComplete="off" spellCheck="false" value={apiKey} onChange={(event) => updateApiKey(event.target.value)} placeholder="Paste your Gemini API key" disabled={busy} />
                <button type="button" onClick={() => setShowKey((value) => !value)}>{showKey ? "Hide" : "Show"}</button>
                <button type="button" onClick={() => updateApiKey("")} disabled={!apiKey || busy}>Clear</button>
              </div>
              <p>Your key is stored in this tab's session storage and sent to Sketchizi's AI backend only to process BYOK requests. It is not intentionally persisted or logged. Session storage is not a secure vault.</p>
            </div>
          )}

          <div className="ai-ask-messages" ref={transcriptRef} aria-label="AI Ask conversation" aria-live="polite">
            {!chat.messages.length ? (
              <div className="ai-ask-empty-state">
                <h3>What would you like to understand?</h3>
                <p>Each question uses a fresh structured snapshot of the entire current canvas. AI Ask is read-only and never edits your diagram.</p>
                <div className="ai-ask-starters">{STARTER_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => sendQuestion(prompt)} disabled={busy || Boolean(pendingRequest)}>{prompt}</button>)}</div>
              </div>
            ) : chat.messages.map((message, index) => (
              <article key={`${message.requestId || message.timestamp || index}-${message.role}-${index}`} className={`ai-ask-message ${message.role}`}>
                <div className="ai-ask-message-role">{message.role === "user" ? "You" : "Gemini"}<time>{timeLabel(message.timestamp)}</time></div>
                <p>{message.text}</p>
                {message.role === "assistant" && message.question && <button type="button" className="ai-ask-retry" onClick={() => sendQuestion(message.question)} disabled={busy || Boolean(pendingRequest)}>Regenerate answer</button>}
              </article>
            ))}
            {busy && <div className="ai-ask-thinking" role="status"><span className="ai-ask-spinner" />Analyzing the current diagram…</div>}
          </div>

          {panelError && <div className="ai-ask-error" role="alert"><span>{panelError}</span>{pendingRequest && auth.status === "authenticated" && <button type="button" onClick={checkPendingRequest} disabled={busy}>Check status</button>}{failedQuestion && auth.status === "authenticated" && <button type="button" onClick={() => sendQuestion(failedQuestion)} disabled={busy || (chat.provider === "byok" && !apiKey.trim())}>Retry question</button>}<button type="button" onClick={() => setPanelError("")} aria-label="Dismiss error">×</button></div>}
          <form className="ai-ask-composer" onSubmit={(event) => { event.preventDefault(); sendQuestion(); }}>
            <label className="ai-ask-sr-only" htmlFor="ai-ask-question">Ask a question about your diagram</label>
            <textarea id="ai-ask-question" value={chat.draft} onChange={(event) => updateChat((current) => ({ ...current, draft: event.target.value.slice(0, 4000) }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendQuestion(); } }} placeholder="Ask about your diagram…" rows={3} maxLength={4000} disabled={busy || Boolean(pendingRequest) || !chat.conversationId || (chat.provider === "builtin" && (usage?.conversationRemaining <= 0 || usage?.accountRemaining <= 0))} />
            <div className="ai-ask-composer-footer"><span>Enter to send · Shift+Enter for a new line</span><button className="ai-ask-primary" type="submit" disabled={busy || Boolean(pendingRequest) || !chat.draft.trim() || !chat.conversationId || (chat.provider === "builtin" && (usage?.conversationRemaining <= 0 || usage?.accountRemaining <= 0))}> {busy ? "Thinking…" : "Ask"} </button></div>
          </form>
          <div className="ai-ask-privacy-note">Diagram content and recent chat are sent to the selected Gemini provider. The AI service stores usage metadata, not prompts, responses, or diagram snapshots.</div>
        </>
      )}
      <span className="ai-ask-sr-only" role="status">{announcement}</span>
    </section>
  );
}
