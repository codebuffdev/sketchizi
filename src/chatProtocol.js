export const MAX_CHAT_TEXT_LENGTH = 4000;
export const MAX_CHAT_HISTORY = 500;

export function filterAuthorizedChatHistory(messages, clientId, isHost) {
  return (Array.isArray(messages) ? messages : []).filter((item) =>
    item.audience === "everyone" || (isHost || item.conversationId === clientId),
  );
}

export function normalizeChatText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= MAX_CHAT_TEXT_LENGTH ? text : null;
}

export function isSupportedChatAudience(value) {
  return value === "everyone" || value === "host";
}

export function resolveChatRecipients({ audience, isHost, senderId, hostId, requestedRecipientId = "", connectedParticipantIds = [], presentParticipantIds = connectedParticipantIds }) {
  const connected = new Set(connectedParticipantIds);
  const present = new Set(presentParticipantIds);
  if (!connected.has(senderId) || !isSupportedChatAudience(audience)) return { error: "Invalid sender or audience." };
  if (audience === "everyone") {
    return { recipientIds: new Set(connected), conversationId: null };
  }
  if (isHost) {
    if (!requestedRecipientId || requestedRecipientId === senderId || requestedRecipientId === hostId || !connected.has(requestedRecipientId) || !present.has(requestedRecipientId)) {
      return { error: "Choose a connected participant for the private reply." };
    }
    return { recipientIds: new Set([senderId, requestedRecipientId]), conversationId: requestedRecipientId };
  }
  // Participants can only start/reply in their own host conversation. A client
  // supplied recipient is rejected rather than trusted, even if it names the host.
  if (requestedRecipientId) return { error: "Private messages can only be sent to the host." };
  if (!hostId || !connected.has(hostId)) return { error: "The host is not connected." };
  return { recipientIds: new Set([senderId, hostId]), conversationId: senderId };
}

export function findNewUnreadChatMessages(messages, previousIds, selfId) {
  return (Array.isArray(messages) ? messages : []).filter((message) =>
    message?.id && !previousIds.has(message.id) && message.senderId !== selfId && !message.__history,
  );
}

export function removeReadChatMessageIds(unreadIds, readIds) {
  const next = new Set(unreadIds);
  for (const id of readIds) next.delete(id);
  return next;
}

export function makeChatHistoryEntry(message) {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    audience: message.audience,
    conversationId: message.conversationId ?? null,
    text: message.text,
    timestamp: message.timestamp,
  };
}
