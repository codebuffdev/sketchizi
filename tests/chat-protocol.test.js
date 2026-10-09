import test from "node:test";
import assert from "node:assert/strict";
import { filterAuthorizedChatHistory, normalizeChatText, isSupportedChatAudience, makeChatHistoryEntry, MAX_CHAT_TEXT_LENGTH, resolveChatRecipients, findNewUnreadChatMessages, removeReadChatMessageIds } from "../src/chatProtocol.js";

const history = [
  { id: "b1", audience: "everyone", conversationId: null, text: "hello" },
  { id: "p1", audience: "host", conversationId: "participant-a", text: "private A" },
  { id: "p2", audience: "host", conversationId: "participant-b", text: "private B" },
];

test("broadcast history is visible to all room participants, private history is scoped", () => {
  assert.deepEqual(filterAuthorizedChatHistory(history, "participant-a", false).map((item) => item.id), ["b1", "p1"]);
  assert.deepEqual(filterAuthorizedChatHistory(history, "participant-b", false).map((item) => item.id), ["b1", "p2"]);
  assert.deepEqual(filterAuthorizedChatHistory(history, "host-id", true).map((item) => item.id), ["b1", "p1", "p2"]);
});

test("chat text is trimmed and bounded", () => {
  assert.equal(normalizeChatText("  hello  "), "hello");
  assert.equal(normalizeChatText("  \n "), null);
  assert.equal(normalizeChatText("x".repeat(MAX_CHAT_TEXT_LENGTH + 1)), null);
  assert.equal(normalizeChatText(42), null);
});

test("only supported audience values are accepted", () => {
  assert.equal(isSupportedChatAudience("everyone"), true);
  assert.equal(isSupportedChatAudience("host"), true);
  assert.equal(isSupportedChatAudience("room"), false);
  assert.equal(isSupportedChatAudience("private"), false);
});

test("history entries contain only the supported message model", () => {
  const entry = makeChatHistoryEntry({ id: "m1", senderId: "p1", senderName: "Alex", audience: "host", conversationId: "p1", text: "secret", timestamp: 123, injected: "ignored" });
  assert.deepEqual(entry, { id: "m1", senderId: "p1", senderName: "Alex", audience: "host", conversationId: "p1", text: "secret", timestamp: 123 });
  assert.equal("injected" in entry, false);
});


test("new eligible incoming messages become unread while own and initial-history messages are excluded", () => {
  const previous = new Set(["old"]);
  const added = findNewUnreadChatMessages([
    { id: "old", senderId: "other" },
    { id: "incoming", senderId: "other" },
    { id: "own", senderId: "self" },
    { id: "history", senderId: "other", __history: true },
  ], previous, "self");
  assert.deepEqual(added.map((message) => message.id), ["incoming"]);
});

test("only actually visible unread messages are marked read", () => {
  assert.deepEqual([...removeReadChatMessageIds(new Set(["one", "two", "three"]), ["two"])].sort(), ["one", "three"]);
});

test("host private delivery targets only the selected connected participant and host", () => {
  const result = resolveChatRecipients({ audience: "host", isHost: true, senderId: "host", hostId: "host", requestedRecipientId: "p1", connectedParticipantIds: ["host", "p1", "p2"] });
  assert.equal(result.conversationId, "p1");
  assert.deepEqual([...result.recipientIds].sort(), ["host", "p1"]);
});

test("participants cannot forge a private recipient or message another participant", () => {
  const forged = resolveChatRecipients({ audience: "host", isHost: false, senderId: "p1", hostId: "host", requestedRecipientId: "p2", connectedParticipantIds: ["host", "p1", "p2"] });
  assert.match(forged.error, /only be sent to the host/i);
  const spoofHost = resolveChatRecipients({ audience: "host", isHost: false, senderId: "p1", hostId: "host", requestedRecipientId: "host", connectedParticipantIds: ["host", "p1", "p2"] });
  assert.match(spoofHost.error, /only be sent to the host/i);
});

test("participant host-only message and everyone broadcast retain expected delivery", () => {
  const privateMessage = resolveChatRecipients({ audience: "host", isHost: false, senderId: "p1", hostId: "host", connectedParticipantIds: ["host", "p1", "p2"] });
  assert.equal(privateMessage.conversationId, "p1");
  assert.deepEqual([...privateMessage.recipientIds].sort(), ["host", "p1"]);
  const broadcast = resolveChatRecipients({ audience: "everyone", isHost: false, senderId: "p1", hostId: "host", connectedParticipantIds: ["host", "p1", "p2"] });
  assert.equal(broadcast.conversationId, null);
  assert.deepEqual([...broadcast.recipientIds].sort(), ["host", "p1", "p2"]);
});


test("host cannot privately target a connected socket without active participant presence", () => {
  const result = resolveChatRecipients({ audience: "host", isHost: true, senderId: "host", hostId: "host", requestedRecipientId: "p1", connectedParticipantIds: ["host", "p1"], presentParticipantIds: ["host"] });
  assert.match(result.error, /connected participant/i);
});
