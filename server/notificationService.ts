import { notifications } from "../drizzle/schema";

/**
 * In-app is the only enabled channel for this MVP. A future email adapter can
 * consume the same delivery shape only after opt-in preferences and a provider
 * contract are introduced.
 */
export type InAppDelivery = {
  userId: number;
  gameId?: number | null;
  type: "game_confirmed" | "waitlist_promoted" | "organizer_update";
  title: string;
  body: string;
};

export function confirmedGameDelivery(userId: number, gameId: number, gameTitle: string, state: "confirmed" | "waitlisted"): InAppDelivery {
  return {
    userId,
    gameId,
    type: "game_confirmed",
    title: state === "confirmed" ? "You’re confirmed" : "You’re on the waitlist",
    body: state === "confirmed" ? `Your place is held for ${gameTitle}.` : `You’re next in line if a place opens for ${gameTitle}.`,
  };
}

export function waitlistPromotionDelivery(userId: number, gameId: number, gameTitle: string): InAppDelivery {
  return { userId, gameId, type: "waitlist_promoted", title: "A place just opened", body: `You’ve moved from the waitlist to confirmed for ${gameTitle}.` };
}

export function organizerUpdateDelivery(userId: number, gameId: number, message: string): InAppDelivery {
  return { userId, gameId, type: "organizer_update", title: "Organizer update", body: message };
}

type NotificationRepository = { insert: Function };

export function persistInAppDeliveries(repository: NotificationRepository, deliveries: InAppDelivery | InAppDelivery[]) {
  return repository.insert(notifications).values(deliveries);
}
