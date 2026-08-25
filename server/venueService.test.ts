import { describe, expect, it } from "vitest";
import { verificationStateAfterClaimReview } from "./venueService";

describe("venue verification state policy", () => {
  it("marks an accepted member claim as claimed without treating it as a verified source", () => {
    expect(verificationStateAfterClaimReview("unverified", "accepted")).toBe("claimed");
    expect(verificationStateAfterClaimReview("verified", "accepted")).toBe("claimed");
  });

  it("does not change public provenance when a claim is only being reviewed or is rejected", () => {
    expect(verificationStateAfterClaimReview("unverified", "reviewing")).toBe("unverified");
    expect(verificationStateAfterClaimReview("verified", "rejected")).toBe("verified");
  });
});
