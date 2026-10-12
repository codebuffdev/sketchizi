import { useCallback, useEffect, useRef, useState } from "react";

function SharePeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="collaboration-share-header-icon">
      <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19c.4-3.2 2.2-5 5.5-5s5.1 1.8 5.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17.5" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16.1 14.2c2.5.1 4 1.5 4.4 3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.4 14.6 5.2-5.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="m7.2 17.8-1.1 1.1a3.5 3.5 0 0 1-5-5l3.1-3.1a3.5 3.5 0 0 1 5 0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="m16.8 6.2 1.1-1.1a3.5 3.5 0 0 1 5 5l-3.1 3.1a3.5 3.5 0 0 1-5 0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="collaboration-share-brand-icon">
      <circle cx="16" cy="16" r="14" fill="#25D366" />
      <path d="M11.7 10.3c.3-.7.7-.8 1.3-.8h1c.3 0 .6.2.7.5l1.4 3.3c.1.3.1.6-.1.9l-.9 1.1c-.2.2-.2.5 0 .8.8 1.4 2 2.5 3.4 3.3.3.2.6.1.8-.1l1-1.1c.2-.2.5-.3.8-.1l3.2 1.5c.3.1.5.4.4.8-.2 1-.7 1.8-1.5 2.2-.8.5-1.9.6-3 .3-2-.6-4.1-1.9-6-3.7-1.8-1.8-3.1-3.8-3.7-5.7-.4-1.1-.3-2.3.2-3.2Z" fill="#fff" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="collaboration-share-brand-icon">
      <rect x="3" y="5" width="26" height="22" rx="3" fill="#fff" stroke="#d7d7d7" strokeWidth="1" />
      <path d="M5 8.5 16 17l11-8.5V24a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" fill="#f1f3f4" />
      <path d="m4.8 8 11.2 9 11.2-9" fill="none" stroke="#EA4335" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8.5 12.2 14" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
      <path d="m19.8 14 7.2-5.5" fill="none" stroke="#34A853" strokeWidth="2" strokeLinecap="round" />
      <path d="m5 24 7.2-6" fill="none" stroke="#FBBC04" strokeWidth="2" strokeLinecap="round" />
      <path d="m19.8 18 7.2 6" fill="none" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="collaboration-share-brand-icon">
      <circle cx="16" cy="16" r="14" fill="#229ED9" />
      <path d="m8 15.4 15.2-6c.8-.3 1.4.2 1.1 1.1l-4.1 12.4c-.3.9-.9 1.1-1.6.5l-3.7-2.8-2.1 2c-.2.2-.4.3-.7.3l.3-4.1 7.5-6.8c.3-.3-.1-.4-.5-.2l-9.3 5.8-4-.9c-.9-.3-.9-.9-.1-1.3Z" fill="#fff" />
    </svg>
  );
}

function buildShareMessage(sessionName, link) {
  const name = String(sessionName || "").trim();
  return `${name ? `Join my Sketchizi collaboration: ${name}` : "Join my Sketchizi collaboration:"}\n\n${link}`;
}

function openExternalShare(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function CollaborationShare({ link, sessionName, showToast, compact = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const message = buildShareMessage(sessionName, link);
  const emailSubject = "Join my Sketchizi collaboration";
  const emailBody = `I'd like you to join my Sketchizi collaboration.\n\nOpen this link to join:\n\n${link}`;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copied");
      close();
    } catch {
      showToast("Clipboard access was denied. Copy the link manually.", "error");
    }
  };

  const shareWhatsApp = () => {
    openExternalShare(`https://wa.me/?text=${encodeURIComponent(message)}`);
    close();
  };

  const shareTelegram = () => {
    openExternalShare(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message.replace(`\n\n${link}`, ""))}`);
    close();
  };

  const shareEmail = () => {
    const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(gmailComposeUrl, "_blank", "noopener,noreferrer");
    close();
  };

  return (
    <div className={`collaboration-share-container${compact ? " collaboration-share-container-compact" : ""}`} ref={containerRef}>
      <button
        type="button"
        className="collaboration-share-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Share{compact ? "" : " collaboration"}
      </button>
      {open && (
        <div className="collaboration-share-panel" role="dialog" aria-label="Share collaboration">
          <div className="collaboration-share-heading">
            <SharePeopleIcon />
            <div>
              <strong>Share collaboration</strong>
              <span>Invite others to join this collaboration</span>
            </div>
          </div>

          <button type="button" className="collaboration-share-copy" onClick={copyLink}>
            <span className="collaboration-share-copy-leading"><LinkIcon /></span>
            <span className="collaboration-share-copy-label">Copy Link</span>
            <span className="collaboration-share-copy-action"><CopyIcon /></span>
          </button>

          <div className="collaboration-share-services">
            <button type="button" className="collaboration-share-service-whatsapp" onClick={shareWhatsApp} aria-label="Share through WhatsApp">
              <WhatsAppIcon />
              <span>WhatsApp</span>
            </button>
            <button type="button" className="collaboration-share-service-email" onClick={shareEmail} aria-label="Share through Email">
              <EmailIcon />
              <span>Email</span>
            </button>
            <button type="button" className="collaboration-share-service-telegram" onClick={shareTelegram} aria-label="Share through Telegram">
              <TelegramIcon />
              <span>Telegram</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
