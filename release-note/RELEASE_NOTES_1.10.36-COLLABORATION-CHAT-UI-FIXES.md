# Sketchizi 1.10.36 — Collaboration Chat UI Fixes

## Scope

This release fixes only chat unread/read behavior and the host's private-message audience selector.

## Changes

- Incoming messages are tracked as unread until their message card is actually visible in the open chat viewport. The Chat button badge reflects unread messages while the panel is closed.
- The chat auto-scroll and “new messages” action no longer clear unread state blindly; visible-message observation marks messages read.
- The host composer offers Everyone and Participant. A connected participant must be selected for private delivery; the host is not listed as a recipient.
- Participants retain Everyone and Host only. The server derives role and room membership from its existing connection state and rejects client-supplied recipient IDs from participants.
- Private conversations remain isolated by the existing conversation ID. Chat remains in-memory and session-scoped.

## Validation

Focused protocol tests cover unread eligibility/read-state helpers, host recipient isolation, participant-to-host privacy, forged recipient rejection, and broadcast recipients. Production build and live browser tests must be reported separately according to the execution environment.
