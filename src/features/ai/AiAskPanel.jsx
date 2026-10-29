import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCurrentUser, startGoogleSignIn } from "../auth/authClient.js";
import { aiApiRequest, aiApiRequestWithTimeout, createRequestId } from "./aiApiClient.js";
import { buildDiagramContext } from "./diagramContextBuilder.js";
import { appendAssistantOnce, classifyChatFailure, classifyRequestStatus, classifyStatusLookupError, shouldShowRequestRecoveryNotice, upsertUserMessage } from "./aiRequestLifecycle.js";

const TRANSCRIPT_KEY = "sketchizi.aiAsk.transcript.v1";
const BYOK_KEY = "sketchizi.aiAsk.byokKey.v1";
const STARTER_PROMPTS = [
  "Summarize this diagram.",
  "Explain the main data flow.",
  "What architectural risks do you see?",
  "What important components might be missing?",
];
const EMPTY_STATE = { schemaVersion: 1, accountId: null, conversationId: null, messages: [], provider: "builtin", draft: "", pendingRequest: null, retryAttempt: null, newAnswerQuestion: null };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readTranscript() {
  try {
    const value = sessionStorage.getItem(TRANSCRIPT_KEY);
    if (!value) return { ...EMPTY_STATE };
    const parsed = JSON.parse(value);
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.messages)) return { ...EMPTY_STATE };
    const messages = parsed.messages
      .filter((message) => message && ["user", "assistant"].includes(message.role) && typeof message.text === "string")
      .slice(-60)
      .map((message) => ({
        ...message,
        messageId: typeof message.messageId === "string" && message.messageId.length <= 100
          ? message.messageId
          : (typeof message.requestId === "string" ? message.requestId : String(message.timestamp || createRequestId())),
      }));
    const rawPending = parsed.pendingRequest;
    const pendingMessageId = typeof rawPending?.messageId === "string"
      ? rawPending.messageId
      : (messages.find((message) => message.role === "user" && message.requestId === rawPending?.requestId)?.messageId || rawPending?.requestId);
    const pendingRequest = rawPending &&
      UUID_PATTERN.test(rawPending.requestId || "") &&
      UUID_PATTERN.test(rawPending.conversationId || "") &&
      typeof rawPending.question === "string" &&
      rawPending.question.length > 0 && rawPending.question.length <= 4000 &&
      ["builtin", "byok"].includes(rawPending.provider) &&
      parsed.conversationId === rawPending.conversationId
      ? {
          requestId: rawPending.requestId,
          messageId: typeof pendingMessageId === "string" ? pendingMessageId : rawPending.requestId,
          conversationId: rawPending.conversationId,
          question: rawPending.question,
          provider: rawPending.provider,
          sameIdRecoveryAvailable: rawPending.sameIdRecoveryAvailable === true,
        }
      : null;
    const rawRetry = parsed.retryAttempt;
    const retryAttempt = rawRetry && UUID_PATTERN.test(rawRetry.requestId || "") &&
      typeof rawRetry.messageId === "string" && rawRetry.messageId.length <= 100 &&
      typeof rawRetry.question === "string" && rawRetry.question.length > 0 && rawRetry.question.length <= 4000 &&
      (rawRetry.conversationId == null || UUID_PATTERN.test(rawRetry.conversationId)) &&
      ["builtin", "byok"].includes(rawRetry.provider) && typeof rawRetry.reuseRequestId === "boolean"
      ? {
          requestId: rawRetry.requestId,
          messageId: rawRetry.messageId,
          conversationId: rawRetry.conversationId || null,
          question: rawRetry.question,
          provider: rawRetry.provider,
          reuseRequestId: rawRetry.reuseRequestId,
          outcomeUnknown: rawRetry.outcomeUnknown === true,
        }
      : null;
    return {
      ...EMPTY_STATE,
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : null,
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : null,
      messages,
      provider: parsed.provider === "byok" ? "byok" : "builtin",
      draft: typeof parsed.draft === "string" ? parsed.draft.slice(0, 4000) : "",
      pendingRequest,
      retryAttempt,
      newAnswerQuestion: typeof parsed.newAnswerQuestion === "string" && parsed.newAnswerQuestion.length <= 4000 ? parsed.newAnswerQuestion : null,
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
      retryAttempt: value.retryAttempt ? {
        requestId: value.retryAttempt.requestId,
        messageId: value.retryAttempt.messageId,
        conversationId: value.retryAttempt.conversationId,
        question: value.retryAttempt.question.slice(0, 4000),
        provider: value.retryAttempt.provider,
        reuseRequestId: value.retryAttempt.reuseRequestId === true,
        outcomeUnknown: value.retryAttempt.outcomeUnknown === true,
      } : null,
      newAnswerQuestion: value.newAnswerQuestion || null,
      pendingRequest: pendingRequest ? {
        requestId: pendingRequest.requestId,
        messageId: pendingRequest.messageId,
        conversationId: pendingRequest.conversationId,
        question: pendingRequest.question.slice(0, 4000),
        provider: pendingRequest.provider,
        sameIdRecoveryAvailable: pendingRequest.sameIdRecoveryAvailable === true,
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


function renderInlineMarkdown(text, keyPrefix = "inline") {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  const parts = String(text).split(pattern);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (!part) return null;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <del key={key}>{part.slice(2, -2)}</del>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return part;
  });
}

function MarkdownResponse({ content }) {
  const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let listType = null;
  let codeLines = null;
  let tableRows = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blocks.length}`}>{paragraph.map((line, i) => <span key={i}>{i > 0 && <br />}{renderInlineMarkdown(line, `p-${blocks.length}-${i}`)}</span>)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    blocks.push(<Tag key={`list-${blocks.length}`}>{listItems.map((item, i) => <li key={i}>{renderInlineMarkdown(item, `list-${blocks.length}-${i}`)}</li>)}</Tag>);
    listItems = [];
    listType = null;
  };
  const flushTable = () => {
    if (!tableRows?.length) return;
    const rows = tableRows.filter((row) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row));
    const cells = rows.map((row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
    if (cells.length) blocks.push(<div className="ai-ask-table-wrap" key={`table-${blocks.length}`}><table><thead><tr>{cells[0].map((cell, i) => <th key={i}>{renderInlineMarkdown(cell, `th-${i}`)}</th>)}</tr></thead><tbody>{cells.slice(1).map((row, ri) => <tr key={ri}>{cells[0].map((_, ci) => <td key={ci}>{renderInlineMarkdown(row[ci] || "", `td-${ri}-${ci}`)}</td>)}</tr>)}</tbody></table></div>);
    tableRows = null;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (codeLines) {
      if (/^\s*```/.test(line)) {
        blocks.push(<pre key={`code-${blocks.length}`}><code>{codeLines.join("\n")}</code></pre>);
        codeLines = null;
      } else codeLines.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) { flushParagraph(); flushList(); flushTable(); codeLines = []; continue; }
    if (tableRows && line.includes("|")) { flushParagraph(); flushList(); tableRows.push(line); continue; }
    if (tableRows) flushTable();
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    if (/^\s*\|?.+\|.+\|?\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      flushParagraph(); flushList(); tableRows = [line, lines[i + 1]]; i += 1; continue;
    }
    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) { flushParagraph(); flushList(); blocks.push(<hr key={`hr-${blocks.length}`} />); continue; }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) { flushParagraph(); flushList(); const Tag = `h${heading[1].length}`; blocks.push(<Tag key={`h-${blocks.length}`}>{renderInlineMarkdown(heading[2], `h-${blocks.length}`)}</Tag>); continue; }
    const item = line.match(/^\s*(?:[-+*])\s+(.+)$/) || line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (item) {
      flushParagraph();
      const nextType = /^\s*\d+[.)]\s+/.test(line) ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType; listItems.push(item[1]); continue;
    }
    flushList();
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) { flushParagraph(); blocks.push(<blockquote key={`quote-${blocks.length}`}>{renderInlineMarkdown(quote[1], `quote-${blocks.length}`)}</blockquote>); continue; }
    paragraph.push(line);
  }
  flushParagraph(); flushList(); flushTable();
  if (codeLines) blocks.push(<pre key={`code-${blocks.length}`}><code>{codeLines.join("\n")}</code></pre>);
  return <div className="ai-ask-markdown">{blocks}</div>;
}

function withRequestDiagnostics(message, error) {
  const details = [];
  if (Number.isInteger(error?.status)) details.push(`HTTP ${error.status}`);
  if (typeof error?.code === "string" && error.code) details.push(`code ${error.code}`);
  if (typeof error?.requestId === "string" && error.requestId) details.push(`request ID ${error.requestId}`);
  return details.length ? `${message} (${details.join(" · ")})` : message;
}

export default function AiAskPanel({ open, onClose, apiRef, persistSketchNow, saveTimerRef }) {
  const [auth, setAuth] = useState({ status: "loading", user: null, error: "" });
  const [chat, setChat] = useState(() => readTranscript());
  const [pendingRequest, setPendingRequest] = useState(() => chat.pendingRequest || null);
  const [usage, setUsage] = useState(null);
  const [usageStatus, setUsageStatus] = useState("loading");
  const [usageError, setUsageError] = useState("");
  const [conversationStatus, setConversationStatus] = useState("idle");
  const [conversationError, setConversationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyApplied, setKeyApplied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [authAttempt, setAuthAttempt] = useState(0);
  const [newAnswerQuestion, setNewAnswerQuestion] = useState(() => chat.newAnswerQuestion || "");
  const transcriptRef = useRef(null);
  const hydratedAccountRef = useRef(null);
  const activeAccountRef = useRef(null);
  const requestInFlightRef = useRef(false);
  const usageRequestSequenceRef = useRef(0);
  const conversationCreationRef = useRef(null);

  useEffect(() => {
    if (open) setProviderSettingsOpen(false);
  }, [open]);

  const refreshUsage = useCallback(async (conversationId, accountId = activeAccountRef.current) => {
    if (!conversationId) {
      setUsage(null);
      setUsageStatus("idle");
      setUsageError("");
      return null;
    }
    const sequence = ++usageRequestSequenceRef.current;
    setUsageStatus("loading");
    setUsageError("");
    try {
      const data = await aiApiRequestWithTimeout(`/usage?conversationId=${encodeURIComponent(conversationId)}`, {}, 15000);
      if (sequence !== usageRequestSequenceRef.current || activeAccountRef.current !== accountId) return null;
      setUsage(data);
      setUsageStatus("loaded");
      setUsageError("");
      return data;
    } catch (error) {
      if (sequence !== usageRequestSequenceRef.current || activeAccountRef.current !== accountId) return null;
      setUsage(null);
      setUsageStatus("error");
      const message = error.code === "request_timeout"
        ? "Loading the usage allowance timed out. Check the connection and retry."
        : (error.message || "Could not load the current usage allowance.");
      setUsageError(withRequestDiagnostics(message, error));
      return null;
    }
  }, []);

  const ensureConversation = useCallback((accountId, existingConversationId = null) => {
    if (existingConversationId) {
      setConversationStatus("ready");
      setConversationError("");
      return Promise.resolve(existingConversationId);
    }
    const inFlight = conversationCreationRef.current;
    if (inFlight?.accountId === accountId) return inFlight.promise;

    setConversationStatus("creating");
    setConversationError("");
    const entry = { accountId, promise: null };
    const promise = aiApiRequestWithTimeout("/conversations", { method: "POST", body: {} }, 12000)
      .then((created) => {
        const conversationId = created?.conversationId;
        if (!UUID_PATTERN.test(conversationId || "")) {
          throw new Error("The AI service returned an invalid conversation ID.");
        }
        if (activeAccountRef.current === accountId) {
          setChat((current) => current.accountId === accountId && !current.conversationId
            ? { ...current, accountId, conversationId }
            : current);
          setConversationStatus("ready");
          setConversationError("");
        }
        return conversationId;
      })
      .catch((error) => {
        if (activeAccountRef.current === accountId) {
          setConversationStatus("error");
          setConversationError(withRequestDiagnostics(error.message || "Could not prepare your AI conversation.", error));
        }
        throw error;
      })
      .finally(() => {
        if (conversationCreationRef.current === entry) conversationCreationRef.current = null;
      });
    entry.promise = promise;
    conversationCreationRef.current = entry;
    return promise;
  }, []);

  useEffect(() => {
    if (!chat.accountId && !chat.conversationId && !chat.messages.length && !chat.draft && !chat.retryAttempt && !newAnswerQuestion) {
      try { sessionStorage.removeItem(TRANSCRIPT_KEY); } catch {}
      return;
    }
    if (!writeTranscript({ ...chat, newAnswerQuestion }, pendingRequest)) {
      setAnnouncement("Browser storage is unavailable. This conversation will remain only until this page is closed.");
    }
  }, [chat, pendingRequest, newAnswerQuestion]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    setPanelError("");
    setAuth({ status: "loading", user: null, error: "" });

    fetchCurrentUser(controller.signal).then(({ authenticated, user }) => {
      if (cancelled) return;
      if (!authenticated || !user?.id) {
        clearAiSession();
        activeAccountRef.current = null;
        conversationCreationRef.current = null;
        setPendingRequest(null);
        setNewAnswerQuestion("");
        hydratedAccountRef.current = null;
        setApiKey("");
        setKeyApplied(false);
        setChat({ ...EMPTY_STATE });
        setUsage(null);
        setUsageStatus("idle");
        setUsageError("");
        setConversationStatus("idle");
        setConversationError("");
        setAuth({ status: "anonymous", user: null, error: "" });
        return;
      }

      activeAccountRef.current = user.id;
      let conversationId = chat.accountId === user.id ? chat.conversationId : null;
      if (hydratedAccountRef.current !== user.id) {
        const stored = readTranscript();
        if (stored.accountId && stored.accountId !== user.id) clearAiSession();
        const next = readTranscript();
        const matchesAccount = next.accountId === user.id;
        const initial = matchesAccount ? { ...next, accountId: user.id } : { ...EMPTY_STATE, accountId: user.id };
        conversationId = initial.conversationId;
        const restoredKey = readApiKeyForAccount(user.id);
        setApiKey(restoredKey);
        setKeyApplied(Boolean(restoredKey));
        setChat(initial);
        setPendingRequest(initial.pendingRequest || null);
        setNewAnswerQuestion(initial.newAnswerQuestion || "");
        if (initial.pendingRequest) {
          setPanelError("A previous AI request may still be processing. Check its status before submitting another generation.");
        }
        hydratedAccountRef.current = user.id;
      }

      // Render the authenticated experience immediately after session validation.
      // Conversation creation is independent and has its own finite timeout.
      setAuth({ status: "authenticated", user, error: "" });
      if (conversationId) {
        setConversationStatus("ready");
        setConversationError("");
      } else {
        ensureConversation(user.id).catch(() => {});
      }
    }).catch((error) => {
      if (!cancelled && error.name !== "AbortError") {
        setAuth({ status: "unavailable", user: null, error: error.message || "Sign-in status is temporarily unavailable." });
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, authAttempt, ensureConversation]);

  useEffect(() => {
    if (!open || auth.status !== "authenticated" || !auth.user?.id) return undefined;
    if (chat.provider !== "builtin") {
      usageRequestSequenceRef.current += 1;
      setUsage(null);
      setUsageStatus("idle");
      setUsageError("");
      return undefined;
    }
    if (!chat.conversationId) {
      setUsage(null);
      setUsageStatus("idle");
      setUsageError("");
      return undefined;
    }
    refreshUsage(chat.conversationId, auth.user.id);
    return () => { usageRequestSequenceRef.current += 1; };
  }, [open, auth.status, auth.user?.id, chat.conversationId, chat.provider, refreshUsage]);

  useEffect(() => {
    const onAuthChanged = (event) => {
      if (event.detail?.authenticated === false || event.detail?.signedOut === true) {
        clearAiSession();
        activeAccountRef.current = null;
        conversationCreationRef.current = null;
        setConversationStatus("idle");
        setConversationError("");
        setPendingRequest(null);
        hydratedAccountRef.current = null;
        setApiKey("");
        setKeyApplied(false);
        setUsage(null);
        setUsageStatus("idle");
        setUsageError("");
        setNewAnswerQuestion("");
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
    if (pendingRequest || busy) return;
    updateChat((current) => ({ ...current, messages: [], draft: "", retryAttempt: null, newAnswerQuestion: null }));
    setNewAnswerQuestion("");
    setPanelError("");
    setAnnouncement("Conversation messages cleared. Usage allowance is unchanged.");
  }, [pendingRequest, busy, updateChat]);

  const startNewConversation = useCallback(async () => {
    if (busy || pendingRequest || !auth.user?.id) return;
    if (chat.provider === "builtin" && usage && usage.accountRemaining <= 0) {
      setPanelError("The rolling account allowance is exhausted. You can continue when an earlier successful question leaves the 12-hour window.");
      return;
    }
    setBusy(true);
    setPanelError("");
    setNewAnswerQuestion("");
    try {
      setConversationStatus("creating");
      const createdConversationId = await aiApiRequestWithTimeout("/conversations", { method: "POST", body: {} }, 12000).then((created) => created.conversationId);
      if (activeAccountRef.current !== auth.user.id) return;
      setConversationStatus("ready");
      setConversationError("");
      setChat((current) => ({
        ...current,
        accountId: auth.user.id,
        conversationId: createdConversationId,
        messages: [],
        draft: "",
        retryAttempt: null,
        newAnswerQuestion: null,
      }));
      setAnnouncement("New conversation started.");
    } catch (error) {
      setConversationStatus("error");
      setConversationError(withRequestDiagnostics(error.message || "Could not start a new conversation.", error));
      setPanelError(withRequestDiagnostics(error.message || "Could not start a new conversation.", error));
    } finally { setBusy(false); }
  }, [auth.user, busy, chat.provider, usage, pendingRequest]);

  const sendQuestion = useCallback(async (value = chat.draft, options = {}) => {
    const question = String(value || "").trim();
    const recoveryRequest = options.recoveryRequest || null;
    const retryAttempt = options.retryAttempt || null;
    if (!question || busy || requestInFlightRef.current) return;
    // Enforce the known built-in quota at the action boundary as well as in the UI.
    // This prevents starter prompts, keyboard submission, or future controls from
    // submitting a request when the account allowance is exhausted.
    if (chat.provider === "builtin" && usageStatus === "loaded" &&
        (usage?.accountRemaining <= 0 || usage?.conversationRemaining <= 0)) {
      setPanelError(usage?.accountRemaining <= 0
        ? "The built-in AI rolling 12-hour account allowance is exhausted. You can use built-in AI again when a slot becomes available."
        : "This conversation has used its question allowance. Start a new conversation when your account allowance permits.");
      return;
    }
    if (pendingRequest && !recoveryRequest) {
      setPanelError("Check the previous request's status before submitting another generation.");
      return;
    }
    if (recoveryRequest && pendingRequest?.requestId !== recoveryRequest.requestId) return;
    if (auth.status !== "authenticated" || !auth.user?.id) {
      setPanelError("Sign in with Google before using AI Ask.");
      return;
    }
    if (chat.provider === "byok" && (!keyApplied || !apiKey.trim())) {
      setPanelError("Enter your Gemini API key to use BYOK.");
      return;
    }

    requestInFlightRef.current = true;
    setBusy(true);
    setPanelError("");
    setNewAnswerQuestion("");
    const requestId = recoveryRequest
      ? recoveryRequest.requestId
      : (retryAttempt?.reuseRequestId ? retryAttempt.requestId : createRequestId());
    const messageId = recoveryRequest?.messageId || retryAttempt?.messageId || requestId;
    const replaceMessageId = recoveryRequest?.messageId || retryAttempt?.messageId || null;
    const timestamp = new Date().toISOString();
    const userMessage = { role: "user", text: question, timestamp, requestId, messageId };
    const baseMessages = upsertUserMessage(chat.messages, userMessage, replaceMessageId);
    updateChat((current) => ({
      ...current,
      accountId: auth.user.id,
      draft: recoveryRequest || retryAttempt ? current.draft : "",
      retryAttempt: null,
      newAnswerQuestion: null,
      messages: upsertUserMessage(current.messages, userMessage, replaceMessageId),
    }));
    if (!recoveryRequest) setPendingRequest(null);
    let currentConversationId = recoveryRequest?.conversationId || retryAttempt?.conversationId || chat.conversationId;
    let submittedToChat = false;

    try {
      let conversationId = currentConversationId;
      if (!conversationId) {
        conversationId = await ensureConversation(auth.user.id);
        currentConversationId = conversationId;
        if (activeAccountRef.current !== auth.user.id) return;
        updateChat((current) => ({ ...current, accountId: auth.user.id, conversationId }));
      }
      const api = apiRef.current;
      if (!api?.getSceneElements) throw new Error("The canvas is still loading. Wait a moment and try again.");
      const diagramContext = buildDiagramContext(api.getSceneElements());
      const history = chat.messages
        .filter((message) => !(message.role === "user" && (message.messageId === messageId || message.requestId === retryAttempt?.requestId)))
        .slice(-12)
        .map((message) => ({ role: message.role, text: message.text.slice(0, 12000) }));
      const payload = {
        conversationId,
        requestId,
        provider: chat.provider,
        question,
        ...(chat.provider === "byok" ? { apiKey: apiKey.trim() } : {}),
        diagramContext,
        history,
      };
      const requestMetadata = {
        requestId,
        messageId,
        question,
        conversationId,
        provider: chat.provider,
        sameIdRecoveryAvailable: false,
      };
      setPendingRequest(requestMetadata);
      writeTranscript({
        ...chat,
        accountId: auth.user.id,
        conversationId,
        messages: baseMessages,
        draft: recoveryRequest || retryAttempt ? chat.draft : "",
        retryAttempt: null,
        newAnswerQuestion: null,
      }, requestMetadata);

      // From this point a gateway/upstream interruption may happen after reservation.
      submittedToChat = true;
      let response = await aiApiRequest("/chat", { method: "POST", body: payload });
      if (response.status === "processing") {
        const deadline = Date.now() + 55_000;
        let completed = false;
        while (Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          let status;
          try {
            status = await aiApiRequest(`/requests/${encodeURIComponent(requestId)}`);
          } catch (statusError) {
            if (statusError.status === 401 || (statusError.status === 404 && statusError.code === "request_not_found")) throw statusError;
            // GET status lookups are safe to repeat. A temporary lookup failure
            // must not cause a new generation or be treated as terminal.
            continue;
          }
          if (activeAccountRef.current !== auth.user.id) return;
          const requestState = classifyRequestStatus(status);
          if (requestState === "succeeded_with_answer") {
            response = { ...status, usage: status.usage || null };
            completed = true;
            break;
          }
          if (requestState === "succeeded_without_answer") {
            const unavailable = new Error("The request succeeded, but the answer is no longer retained by this service instance.");
            unavailable.status = 409;
            unavailable.code = "completed_result_not_retained";
            throw unavailable;
          }
          if (requestState === "failed_confirmed" || requestState === "outcome_unknown") {
            const uncertain = requestState === "outcome_unknown";
            const failure = new Error(uncertain
              ? "The request reservation expired before its final outcome could be recorded. The provider outcome is uncertain."
              : "The AI generation failed. No successful-question allowance was recorded.");
            failure.status = 409;
            failure.code = uncertain ? "reservation_expired" : "request_already_failed";
            failure.providerFailureCode = status.code;
            throw failure;
          }
          if (requestState !== "pending") {
            const unknown = new Error("The AI service returned an unrecognized request status.");
            unknown.status = 502;
            unknown.code = "unknown_request_status";
            throw unknown;
          }
        }
        if (!completed) {
          const pending = new Error("The request is still processing or its latest status is unavailable. Check status before attempting recovery.");
          pending.code = "request_still_processing";
          throw pending;
        }
      }
      if (!response.answer) {
        const unavailable = new Error("The request succeeded, but the answer is no longer retained by this service instance.");
        unavailable.status = 409;
        unavailable.code = "completed_result_not_retained";
        throw unavailable;
      }
      if (activeAccountRef.current !== auth.user.id) return;
      const assistantMessage = {
        role: "assistant",
        provider: chat.provider,
        text: String(response.answer),
        timestamp: new Date().toISOString(),
        requestId,
        messageId: requestId,
        question,
      };
      updateChat((current) => ({
        ...current,
        accountId: auth.user.id,
        conversationId,
        retryAttempt: null,
        newAnswerQuestion: null,
        messages: appendAssistantOnce(current.messages, assistantMessage),
      }));
      setPendingRequest(null);
      setNewAnswerQuestion("");
      if (chat.provider === "builtin") {
        if (response.usage) {
          setUsage(response.usage);
          setUsageStatus("loaded");
          setUsageError("");
        } else {
          await refreshUsage(conversationId, auth.user.id);
        }
      }
      setPanelError("");
      setAnnouncement("Answer received.");
    } catch (error) {
      if (activeAccountRef.current !== auth.user.id) return;
      const failureKind = classifyChatFailure(error, submittedToChat);
      if (failureKind === "authentication") {
        clearAiSession();
        activeAccountRef.current = null;
        setPendingRequest(null);
        setApiKey("");
        setKeyApplied(false);
        setUsage(null);
        setUsageStatus("idle");
        setUsageError("");
        setChat({ ...EMPTY_STATE });
        setAuth({ status: "anonymous", user: null, error: "" });
        setPanelError("Your sign-in session has expired. Sign in again to continue.");
      } else if (failureKind === "succeeded_without_answer") {
        setPendingRequest(null);
        setNewAnswerQuestion(question);
        updateChat((current) => ({ ...current, retryAttempt: null, newAnswerQuestion: question }));
        setPanelError("The backend recorded this generation as successful, but its answer is no longer available in the short-lived in-memory result cache. No automatic retry was started. Generating a new answer is a new request and may use another allowance.");
        if (chat.provider === "builtin" && currentConversationId) await refreshUsage(currentConversationId, auth.user.id);
      } else if (failureKind === "confirmed_failure") {
        setPendingRequest(null);
        setNewAnswerQuestion("");
        updateChat((current) => ({
          ...current,
          retryAttempt: {
            requestId,
            messageId,
            question,
            conversationId: currentConversationId || null,
            provider: chat.provider,
            reuseRequestId: false,
            outcomeUnknown: false,
          },
        }));
        const failureCode = error.providerFailureCode || error.code;
        const actionableMessage = failureCode === "provider_rate_limited"
          ? "The AI provider has temporarily reached its token-per-minute limit. Wait a short while before retrying. No successful-question allowance was consumed."
          : failureCode === "context_too_large"
            ? "This diagram and conversation are too large for one AI request. Try asking about a smaller part of the diagram. No successful-question allowance was consumed."
            : failureCode === "provider_configuration_error" || failureCode === "provider_auth_failed"
              ? "The AI provider rejected its credentials. The service administrator needs to check the provider configuration. No successful-question allowance was consumed."
              : failureCode === "provider_timeout"
                ? "The AI provider took too long to respond. Try again shortly. No successful-question allowance was consumed."
                : error.message || "The AI provider could not complete this request. You can retry this question without adding another message bubble.";
        setPanelError(withRequestDiagnostics(actionableMessage, error));
        if (chat.provider === "builtin" && currentConversationId) await refreshUsage(currentConversationId, auth.user.id);
      } else if (failureKind === "unknown" || failureKind === "reservation_expired") {
        if (failureKind === "reservation_expired") {
          setPendingRequest(null);
          setNewAnswerQuestion("");
          updateChat((current) => ({
            ...current,
            retryAttempt: {
              requestId,
              messageId,
              question,
              conversationId: currentConversationId || null,
              provider: chat.provider,
              reuseRequestId: false,
              outcomeUnknown: true,
            },
          }));
          setPanelError("The reservation expired before completion could be recorded. The backend cannot confirm whether the provider finished. No automatic retry was started; generating a new attempt may call the provider again.");
          if (chat.provider === "builtin" && currentConversationId) await refreshUsage(currentConversationId, auth.user.id);
        } else {
          const pending = {
            requestId,
            messageId,
            question,
            conversationId: currentConversationId,
            provider: chat.provider,
            sameIdRecoveryAvailable: error.status === 404 && error.code === "request_not_found",
          };
          setPendingRequest(pending);
          updateChat((current) => ({ ...current, retryAttempt: null }));
          setPanelError(withRequestDiagnostics(pending.sameIdRecoveryAvailable
            ? "The status endpoint cannot currently find this request record. That does not prove the original POST never reached the service. Retrying with the same ID reuses a durable reservation if it still exists, but cannot rule out a duplicate if that record was lost. Continue only if you accept that uncertainty."
            : "The request outcome is not confirmed. Check status before submitting another generation.", error));
        }
      } else {
        setPendingRequest(null);
        setNewAnswerQuestion("");
        updateChat((current) => ({
          ...current,
          retryAttempt: {
            requestId,
            messageId,
            question,
            conversationId: currentConversationId || null,
            provider: chat.provider,
            reuseRequestId: true,
            outcomeUnknown: false,
          },
        }));
        setPanelError(withRequestDiagnostics(error.message || "The request was rejected before it was accepted. You can retry without creating a duplicate question message.", error));
        if (chat.provider === "builtin" && currentConversationId) await refreshUsage(currentConversationId, auth.user.id);
      }
    } finally {
      requestInFlightRef.current = false;
      setBusy(false);
    }
  }, [apiKey, keyApplied, auth, busy, chat, apiRef, updateChat, pendingRequest, refreshUsage, ensureConversation, usage, usageStatus]);

  const checkPendingRequest = useCallback(async () => {
    if (!pendingRequest || !auth.user?.id || busy || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setBusy(true);
    setPanelError("");
    try {
      const status = await aiApiRequest(`/requests/${encodeURIComponent(pendingRequest.requestId)}`);
      if (activeAccountRef.current !== auth.user.id) return;
      const requestState = classifyRequestStatus(status);
      if (requestState === "succeeded_with_answer") {
        const answer = {
          role: "assistant",
          provider: pendingRequest.provider,
          text: status.answer,
          timestamp: new Date().toISOString(),
          requestId: pendingRequest.requestId,
          messageId: pendingRequest.requestId,
          question: pendingRequest.question,
        };
        updateChat((current) => ({
          ...current,
          accountId: auth.user.id,
          conversationId: pendingRequest.conversationId,
          retryAttempt: null,
          newAnswerQuestion: null,
          messages: appendAssistantOnce(current.messages, answer),
        }));
        setPendingRequest(null);
        setNewAnswerQuestion("");
        setPanelError("");
        setAnnouncement("Answer received.");
        if (pendingRequest.provider === "builtin") await refreshUsage(pendingRequest.conversationId, auth.user.id);
      } else if (requestState === "succeeded_without_answer") {
        setPendingRequest(null);
        setNewAnswerQuestion(pendingRequest.question);
        updateChat((current) => ({ ...current, retryAttempt: null, newAnswerQuestion: pendingRequest.question }));
        setPanelError("The request succeeded, so its usage was recorded, but the answer is no longer available in the in-memory cache. A new generation is a separate request and may consume another allowance.");
        if (pendingRequest.provider === "builtin") await refreshUsage(pendingRequest.conversationId, auth.user.id);
      } else if (requestState === "outcome_unknown") {
        setPendingRequest(null);
        setNewAnswerQuestion("");
        updateChat((current) => ({
          ...current,
          retryAttempt: {
            requestId: pendingRequest.requestId,
            messageId: pendingRequest.messageId || pendingRequest.requestId,
            question: pendingRequest.question,
            conversationId: pendingRequest.conversationId,
            provider: pendingRequest.provider,
            reuseRequestId: false,
            outcomeUnknown: true,
          },
        }));
        setPanelError("The reservation expired before completion could be recorded. The provider outcome is uncertain. A new attempt may call Gemini again; it will not be submitted automatically.");
        if (pendingRequest.provider === "builtin") await refreshUsage(pendingRequest.conversationId, auth.user.id);
      } else if (requestState === "failed_confirmed") {
        setPendingRequest(null);
        setNewAnswerQuestion("");
        updateChat((current) => ({
          ...current,
          retryAttempt: {
            requestId: pendingRequest.requestId,
            messageId: pendingRequest.messageId || pendingRequest.requestId,
            question: pendingRequest.question,
            conversationId: pendingRequest.conversationId,
            provider: pendingRequest.provider,
            reuseRequestId: false,
            outcomeUnknown: false,
          },
        }));
        setPanelError("The backend confirms this generation failed and did not record a successful question. Retry to start a new attempt using the existing question bubble.");
        if (pendingRequest.provider === "builtin") await refreshUsage(pendingRequest.conversationId, auth.user.id);
      } else if (requestState === "pending") {
        setPanelError("The request is still processing. Check its status again shortly; no new generation was submitted.");
      } else {
        setPanelError("The service returned an unknown request state. The existing request has not been resubmitted.");
      }
    } catch (error) {
      if (activeAccountRef.current !== auth.user.id) return;
      const lookupFailure = classifyStatusLookupError(error);
      if (lookupFailure === "request_not_found") {
        setPendingRequest({ ...pendingRequest, sameIdRecoveryAvailable: true });
        setPanelError("The status lookup cannot find a request record. Its outcome remains unknown. Retrying with the same ID reuses an existing reservation if one remains, but cannot rule out a duplicate if that record was lost.");
      } else if (lookupFailure === "authentication") {
        setPanelError(withRequestDiagnostics("Your sign-in session expired while checking the request. Sign in again before recovering it.", error));
      } else {
        setPanelError(withRequestDiagnostics(error.message || "Could not check the AI request status. No request was resubmitted.", error));
      }
    } finally {
      requestInFlightRef.current = false;
      setBusy(false);
    }
  }, [pendingRequest, auth.user, busy, updateChat, refreshUsage]);

  const beginSignIn = useCallback(async () => {
    if (signInBusy) return;
    setSignInBusy(true);
    setPanelError("");
    try {
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
      await startGoogleSignIn(`${destination.pathname}${destination.search}${destination.hash}`);
    } catch (error) {
      setPanelError(error.message || "Sketchizi services are starting. Please try again.");
    } finally {
      setSignInBusy(false);
    }
  }, [apiRef, persistSketchNow, saveTimerRef, signInBusy]);

  const chooseProvider = (provider) => {
    updateChat((current) => ({ ...current, provider }));
    setPanelError("");
    if (provider === "byok") {
      usageRequestSequenceRef.current += 1;
      setUsage(null);
      setUsageStatus("idle");
      setUsageError("");
    } else if (chat.conversationId && auth.user?.id) {
      refreshUsage(chat.conversationId, auth.user.id);
    }
  };

  const updateApiKey = (value) => {
    setApiKey(value);
    setKeyApplied(false);
    // Editing the field revokes the previously applied key immediately.
    try { sessionStorage.removeItem(BYOK_KEY); } catch {}
    setPanelError("");
  };

  const applyApiKey = () => {
    const value = apiKey.trim();
    if (!value) {
      setPanelError("Paste your Gemini API key, then select Use key.");
      setKeyApplied(false);
      return;
    }
    if (!auth.user?.id) {
      setPanelError("Sign in before using a Gemini API key.");
      return;
    }
    try {
      sessionStorage.setItem(BYOK_KEY, JSON.stringify({ schemaVersion: 1, accountId: auth.user.id, key: value }));
      setApiKey(value);
      setKeyApplied(true);
      setPanelError("");
      setAnnouncement("Gemini API key is ready for BYOK requests.");
    } catch {
      setKeyApplied(false);
      setPanelError("Browser session storage is unavailable. The key was not activated; allow session storage and try again.");
    }
  };

  const removeApiKey = () => {
    try { sessionStorage.removeItem(BYOK_KEY); } catch {}
    setApiKey("");
    setKeyApplied(false);
    setShowKey(false);
    setPanelError("");
    setAnnouncement("Gemini API key removed from this tab's session.");
  };

  const copyAssistantResponse = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedMessageId(message.messageId || message.requestId || String(message.timestamp || "response"));
      window.setTimeout(() => setCopiedMessageId(""), 1800);
    } catch {
      setPanelError("Could not copy the response. Check clipboard permissions and try again.");
    }
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

      {auth.status === "loading" && <div className="ai-ask-auth-state" role="status">Connecting to Sketchizi services and checking your sign-in session…</div>}
      {auth.status === "unavailable" && <div className="ai-ask-auth-state"><p>{auth.error}</p><button type="button" onClick={() => setAuthAttempt((value) => value + 1)}>Retry</button></div>}
      {auth.status === "anonymous" && (
        <div className="ai-ask-signin-state">
          <div className="ai-ask-signin-icon" aria-hidden="true">✦</div>
          <h3>Sign in to use AI Ask</h3>
          <p>AI Ask requires your existing Google sign-in. Choose included AI access or use your own Gemini API key (BYOK). Drawing and collaboration remain available without signing in.</p>
          <button className="ai-ask-primary" type="button" onClick={beginSignIn} disabled={signInBusy}>{signInBusy ? "Starting Sketchizi services…" : "Continue with Google"}</button>
          <p className="ai-ask-muted">Your current canvas is saved before sign-in and restored when you return.</p>
        </div>
      )}

      {auth.status === "authenticated" && (
        <>
          <div className={`ai-ask-provider-disclosure ${providerSettingsOpen ? "is-open" : ""}`}>
            <button type="button" className="ai-ask-provider-summary" aria-expanded={providerSettingsOpen} aria-controls="ai-ask-provider-settings" onClick={() => setProviderSettingsOpen((value) => !value)}>
              <span className={`ai-ask-provider-status ${chat.provider === "byok" && !keyApplied ? "is-warning" : "is-ready"}`} aria-hidden="true">{chat.provider === "byok" && !keyApplied ? "!" : "✓"}</span>
              <span className="ai-ask-provider-summary-text"><strong>{chat.provider === "byok" ? "Bring Your Own Key (BYOK)" : "Sketchizi AI"}</strong><small>{chat.provider === "byok" ? (keyApplied ? "Gemini · Key ready" : "Gemini · API key required") : "Included AI access"}</small></span>
              <span className="ai-ask-provider-manage">{providerSettingsOpen ? "Done" : "Manage"}</span>
              <span className="ai-ask-provider-chevron" aria-hidden="true">⌄</span>
            </button>
            {providerSettingsOpen && <div className="ai-ask-provider-settings" id="ai-ask-provider-settings">
              <div className="ai-ask-provider-row">
                <label htmlFor="ai-ask-provider">Provider</label>
                <select id="ai-ask-provider" value={chat.provider} onChange={(event) => chooseProvider(event.target.value)} disabled={busy || Boolean(pendingRequest)}>
                  <option value="builtin">Sketchizi AI (included)</option>
                  <option value="byok">Bring Your Own Key (BYOK)</option>
                </select>
              </div>
              {chat.provider === "builtin" ? (
                <div className="ai-ask-usage" aria-live="polite">
                  {!chat.conversationId && conversationStatus === "creating" && <span>Preparing your AI conversation…</span>}
                  {!chat.conversationId && conversationStatus === "error" && <><span>Could not prepare your AI conversation: {conversationError || "Please try again."}</span><button type="button" onClick={() => ensureConversation(auth.user.id).catch(() => {})} disabled={busy}>Retry conversation</button></>}
                  {chat.conversationId && usageStatus === "loading" && <span>Loading usage allowance…</span>}
                  {chat.conversationId && usageStatus === "error" && <><span>Usage allowance unavailable: {usageError || "Could not load usage."}</span><button type="button" onClick={() => refreshUsage(chat.conversationId, auth.user.id)} disabled={busy || !chat.conversationId}>Retry usage</button></>}
                  {chat.conversationId && usageStatus === "idle" && <span>Usage allowance will load when ready.</span>}
                  {chat.conversationId && usageStatus === "loaded" && usage && <>
                    <span>Conversation: <strong>{usage.conversationRemaining ?? "—"}</strong> questions left</span>
                    <span>Rolling 12 hours: <strong>{usage.accountRemaining ?? "—"}</strong> left</span>
                    {usage.accountRemaining <= 0 && <div className="ai-ask-quota-exhausted" role="status">
                      <strong>Built-in AI allowance exhausted</strong>
                      <span>Your 10-question rolling 12-hour account limit has been reached. You still have questions left in this conversation, but the account limit takes priority. You can use built-in AI again when a slot becomes available.</span>
                      {usage.nextAvailableAt && <small>Next question expected to be available: {new Date(usage.nextAvailableAt).toLocaleString()}.</small>}
                    </div>}
                  </>}
                </div>
              ) : (
                <div className="ai-ask-byok-settings">
                  <label htmlFor="ai-ask-api-key">Gemini API key</label>
                  <div className="ai-ask-key-row"><input id="ai-ask-api-key" type={showKey ? "text" : "password"} autoComplete="off" spellCheck="false" value={apiKey} onChange={(event) => updateApiKey(event.target.value)} placeholder="Paste your Gemini API key" disabled={busy} /><button type="button" onClick={() => setShowKey((value) => !value)}>{showKey ? "Hide" : "Show"}</button></div>
                  <div className="ai-ask-key-actions"><button className="ai-ask-primary" type="button" onClick={applyApiKey} disabled={!apiKey.trim() || busy}>{keyApplied ? "Key ready" : "Use key"}</button><button type="button" onClick={removeApiKey} disabled={!apiKey && !keyApplied}>Remove key</button></div>
                  <p>{keyApplied ? "Key ready for BYOK requests. It is stored in this tab's session storage and sent to Sketchizi's AI backend only for BYOK requests." : "Paste your Gemini API key and select Use key before sending a BYOK question."} Session storage is not a secure vault; the key is removed when you select Remove key or the tab session ends. Removing it does not cancel a request already sent.</p>
                </div>
              )}
            </div>}
          </div>

          <div className="ai-ask-messages" ref={transcriptRef} aria-label="AI Ask conversation" aria-live="polite">
            {!chat.messages.length ? (
              <div className="ai-ask-empty-state">
                <h3>What would you like to understand?</h3>
                <p>Each question uses a fresh structured snapshot of the entire current canvas. AI Ask is read-only and never edits your diagram.</p>
                <div className="ai-ask-starters">{STARTER_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => sendQuestion(prompt)} disabled={busy || Boolean(pendingRequest) || (chat.provider === "builtin" && usageStatus === "loaded" && (usage?.accountRemaining <= 0 || usage?.conversationRemaining <= 0))}>{prompt}</button>)}</div>
              </div>
            ) : chat.messages.map((message, index) => (
              <article key={`${message.requestId || message.timestamp || index}-${message.role}-${index}`} className={`ai-ask-message ${message.role}`}>
                <div className="ai-ask-message-role"><span className="ai-ask-message-author">{message.role === "user" ? "You" : <><span className="ai-ask-assistant-mark" aria-hidden="true">✳</span>{message.provider === "byok" ? "Gemini" : "AI Ask"}</>}</span><time>{timeLabel(message.timestamp)}</time></div>
                {message.role === "assistant" ? <MarkdownResponse content={message.text} /> : <div className="ai-ask-user-text">{message.text}</div>}
                {message.role === "assistant" && <div className="ai-ask-message-actions"><button type="button" onClick={() => copyAssistantResponse(message)} title="Copy response">{copiedMessageId === (message.messageId || message.requestId || String(message.timestamp || "response")) ? "Copied" : "Copy"}</button>{message.question && <button type="button" onClick={() => sendQuestion(message.question)} disabled={busy || Boolean(pendingRequest)} title="Generate another answer to this question">Regenerate</button>}</div>}
              </article>
            ))}
            {busy && <div className="ai-ask-thinking" role="status"><span className="ai-ask-spinner" />Analyzing the current diagram…</div>}
          </div>

          {shouldShowRequestRecoveryNotice({ panelError, pendingRequest, busy, retryAttempt: chat.retryAttempt, newAnswerQuestion }) && <div className="ai-ask-error" role="alert">
            <span>{panelError || (pendingRequest ? "An earlier request has not reached a confirmed final state." : chat.retryAttempt?.outcomeUnknown ? "The previous request's final provider outcome is uncertain." : newAnswerQuestion ? "The previous generation succeeded, but its answer is not retained." : "This question can be retried.")}</span>
            {pendingRequest && auth.status === "authenticated" && <button type="button" onClick={checkPendingRequest} disabled={busy}>Check status</button>}
            {pendingRequest?.sameIdRecoveryAvailable && auth.status === "authenticated" && <button type="button" onClick={() => sendQuestion(pendingRequest.question, { recoveryRequest: pendingRequest })} disabled={busy || (pendingRequest.provider === "byok" && !apiKey.trim())}>Retry with same request ID</button>}
            {chat.retryAttempt && auth.status === "authenticated" && !(chat.provider === "builtin" && usageStatus === "loaded" && usage?.accountRemaining <= 0) && <button type="button" onClick={() => sendQuestion(chat.retryAttempt.question, { retryAttempt: chat.retryAttempt })} disabled={busy || !chat.conversationId || (chat.provider === "byok" && (!keyApplied || !apiKey.trim()))}>{chat.retryAttempt.outcomeUnknown ? "Generate new attempt" : chat.retryAttempt.reuseRequestId ? "Retry request" : "Retry question"}</button>}
            {newAnswerQuestion && auth.status === "authenticated" && !(chat.provider === "builtin" && usageStatus === "loaded" && usage?.accountRemaining <= 0) && <button type="button" onClick={() => sendQuestion(newAnswerQuestion)} disabled={busy || Boolean(pendingRequest) || (chat.provider === "byok" && (!keyApplied || !apiKey.trim()))}>Generate a new answer</button>}
            <button type="button" onClick={() => setPanelError("")} aria-label="Dismiss error">×</button>
          </div>}
          <form className="ai-ask-composer" onSubmit={(event) => { event.preventDefault(); sendQuestion(); }}>
            <label className="ai-ask-sr-only" htmlFor="ai-ask-question">Ask a question about your diagram</label>
            <textarea id="ai-ask-question" value={chat.draft} onChange={(event) => updateChat((current) => ({ ...current, draft: event.target.value.slice(0, 4000) }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendQuestion(); } }} placeholder="Ask about your diagram…" rows={3} maxLength={4000} disabled={busy || Boolean(pendingRequest) || !chat.conversationId || (chat.provider === "builtin" && (usage?.conversationRemaining <= 0 || usage?.accountRemaining <= 0))} />
            <div className="ai-ask-composer-footer"><span>Enter to send · Shift+Enter for a new line</span><button className="ai-ask-primary" type="submit" disabled={busy || Boolean(pendingRequest) || !chat.draft.trim() || !chat.conversationId || (chat.provider === "builtin" && (usage?.conversationRemaining <= 0 || usage?.accountRemaining <= 0))}> {busy ? "Thinking…" : "Ask"} </button></div>
          </form>
          <div className="ai-ask-privacy-note">Diagram content and recent chat are sent to {chat.provider === "byok" ? "Gemini using your key" : "Sketchizi AI"}. The AI service stores usage metadata, not prompts, responses, or diagram snapshots.</div>
        </>
      )}
      <span className="ai-ask-sr-only" role="status">{announcement}</span>
    </section>
  );
}
