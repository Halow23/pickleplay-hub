import { describe, expect, it } from "vitest";
import { canSendDirectMessage, DIRECT_MESSAGE_MAX_LENGTH } from "./directMessageService";

describe("direct message policy", () => {
  it("allows a message between two existing, unblocked players", () => {
    expect(canSendDirectMessage({ senderId: 1, recipientId: 2, recipientExists: true, blockedByRecipient: false })).toEqual({ allowed: true });
  });

  it("rejects messages to a missing player", () => {
    const decision = canSendDirectMessage({ senderId: 1, recipientId: 999, recipientExists: false, blockedByRecipient: false });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain("no longer available");
  });

  it("rejects self-messages", () => {
    const decision = canSendDirectMessage({ senderId: 5, recipientId: 5, recipientExists: true, blockedByRecipient: false });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain("yourself");
  });

  it("rejects messages when the recipient has blocked the sender", () => {
    const decision = canSendDirectMessage({ senderId: 1, recipientId: 2, recipientExists: true, blockedByRecipient: true });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain("not receiving");
  });

  it("caps message length", () => {
    expect(DIRECT_MESSAGE_MAX_LENGTH).toBe(2000);
  });
});
