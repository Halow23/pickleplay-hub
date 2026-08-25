import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const userRoles = ["user", "player", "organizer", "moderator", "admin"] as const;
export const gameVisibility = ["public", "private"] as const;
export const gameStatuses = ["draft", "published", "cancelled", "archived"] as const;
export const rsvpStates = ["confirmed", "waitlisted"] as const;
export const groupMembershipRoles = ["member", "moderator", "owner"] as const;
export const groupMembershipStates = ["pending", "active", "denied", "removed"] as const;
export const attendanceStates = ["attended", "no_show", "late_cancel"] as const;
export const notificationTypes = ["game_confirmed", "waitlist_promoted", "organizer_update"] as const;
export const notificationChannels = ["in_app", "email"] as const;
export const notificationDeliveryStates = ["queued", "delivered", "failed", "suppressed"] as const;
export const venueReviewStates = ["open", "reviewing", "accepted", "rejected"] as const;
export const venueVerificationStates = ["unverified", "claimed", "verified"] as const;
export const venueStaffRoles = ["manager", "editor"] as const;

/** Core identity record managed by Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", userRoles).default("player").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const playerProfiles = mysqlTable(
  "player_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("displayName", { length: 120 }).notNull(),
    city: varchar("city", { length: 120 }).notNull().default("Your local area"),
    bio: text("bio"),
    skillBand: varchar("skillBand", { length: 80 }).notNull().default("Finding my starting point"),
    ratingProvenance: mysqlEnum("ratingProvenance", ["none", "self_described", "linked_provider"])
      .default("none")
      .notNull(),
    visibility: mysqlEnum("visibility", ["community", "private"]).default("community").notNull(),
    preferredFormats: varchar("preferredFormats", { length: 180 }).notNull().default("Open play, doubles"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("player_profiles_user_unique").on(table.userId)]
);

export const venues = mysqlTable(
  "venues",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    neighborhood: varchar("neighborhood", { length: 120 }).notNull(),
    city: varchar("city", { length: 120 }).notNull(),
    addressLabel: varchar("addressLabel", { length: 200 }).notNull(),
    courtCount: int("courtCount").notNull().default(1),
    indoor: boolean("indoor").notNull().default(false),
    lighting: boolean("lighting").notNull().default(false),
    visibility: mysqlEnum("visibility", gameVisibility).default("public").notNull(),
    accessibilityNote: varchar("accessibilityNote", { length: 220 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("venues_slug_unique").on(table.slug), index("venues_city_idx").on(table.city)]
);

export const venueSources = mysqlTable("venue_sources", {
  id: int("id").autoincrement().primaryKey(),
  venueId: int("venueId").notNull().references(() => venues.id, { onDelete: "cascade" }),
  sourceLabel: varchar("sourceLabel", { length: 160 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 500 }),
  verifiedAt: timestamp("verifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("venue_sources_venue_idx").on(table.venueId)]);

export const venueClaims = mysqlTable("venue_claims", {
  id: int("id").autoincrement().primaryKey(),
  venueId: int("venueId").notNull().references(() => venues.id, { onDelete: "cascade" }),
  claimantId: int("claimantId").notNull().references(() => users.id, { onDelete: "cascade" }),
  note: varchar("note", { length: 600 }),
  state: mysqlEnum("state", venueReviewStates).notNull().default("open"),
  reviewedBy: int("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("venue_claims_venue_idx").on(table.venueId), index("venue_claims_state_idx").on(table.state)]);

export const venueCorrections = mysqlTable("venue_corrections", {
  id: int("id").autoincrement().primaryKey(),
  venueId: int("venueId").notNull().references(() => venues.id, { onDelete: "cascade" }),
  submittedBy: int("submittedBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  field: varchar("field", { length: 80 }).notNull(),
  proposedValue: varchar("proposedValue", { length: 500 }).notNull(),
  reason: varchar("reason", { length: 600 }),
  state: mysqlEnum("state", venueReviewStates).notNull().default("open"),
  reviewedBy: int("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("venue_corrections_venue_idx").on(table.venueId), index("venue_corrections_state_idx").on(table.state)]);

export const venueStaff = mysqlTable("venue_staff", {
  id: int("id").autoincrement().primaryKey(),
  venueId: int("venueId").notNull().references(() => venues.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", venueStaffRoles).notNull().default("editor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("venue_staff_venue_user_unique").on(table.venueId, table.userId), index("venue_staff_user_idx").on(table.userId)]);

export const communityGroups = mysqlTable(
  "community_groups",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description").notNull(),
    neighborhood: varchar("neighborhood", { length: 120 }).notNull(),
    visibility: mysqlEnum("visibility", gameVisibility).default("public").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("community_groups_slug_unique").on(table.slug), index("community_groups_owner_idx").on(table.ownerId)]
);

export const groupMemberships = mysqlTable(
  "group_memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    groupId: int("groupId").notNull().references(() => communityGroups.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", groupMembershipRoles).default("member").notNull(),
    state: mysqlEnum("state", groupMembershipStates).default("active").notNull(),
    reviewedBy: int("reviewedBy").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewedAt"),
    decisionReason: varchar("decisionReason", { length: 240 }),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("group_memberships_group_user_unique").on(table.groupId, table.userId),
    index("group_memberships_user_idx").on(table.userId),
  ]
);

export const groupInvites = mysqlTable("group_invites", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => communityGroups.id, { onDelete: "cascade" }),
  invitedBy: int("invitedBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }),
  token: varchar("token", { length: 100 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("group_invites_group_idx").on(table.groupId)]);

export const games = mysqlTable(
  "games",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull(),
    organizerId: int("organizerId").notNull().references(() => users.id, { onDelete: "restrict" }),
    venueId: int("venueId").notNull().references(() => venues.id, { onDelete: "restrict" }),
    groupId: int("groupId").references(() => communityGroups.id, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    format: varchar("format", { length: 80 }).notNull(),
    skillBand: varchar("skillBand", { length: 80 }).notNull(),
    capacity: int("capacity").notNull(),
    status: mysqlEnum("status", gameStatuses).default("published").notNull(),
    visibility: mysqlEnum("visibility", gameVisibility).default("public").notNull(),
    beginnerFriendly: boolean("beginnerFriendly").notNull().default(false),
    attendanceNote: varchar("attendanceNote", { length: 240 }).notNull(),
    startsAt: timestamp("startsAt").notNull(),
    endsAt: timestamp("endsAt").notNull(),
    rsvpDeadlineAt: timestamp("rsvpDeadlineAt"),
    cancellationReason: varchar("cancellationReason", { length: 300 }),
    publishedAt: timestamp("publishedAt"),
    cancelledAt: timestamp("cancelledAt"),
    updatedBy: int("updatedBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("games_slug_unique").on(table.slug),
    index("games_venue_idx").on(table.venueId),
    index("games_organizer_idx").on(table.organizerId),
    index("games_start_idx").on(table.startsAt),
  ]
);

export const gamePosts = mysqlTable(
  "game_posts",
  {
    id: int("id").autoincrement().primaryKey(),
    gameId: int("gameId").notNull().references(() => games.id, { onDelete: "cascade" }),
    groupId: int("groupId").references(() => communityGroups.id, { onDelete: "set null" }),
    authorId: int("authorId").notNull().references(() => users.id, { onDelete: "restrict" }),
    headline: varchar("headline", { length: 180 }).notNull(),
    body: text("body").notNull(),
    attendanceExpectations: varchar("attendanceExpectations", { length: 240 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("game_posts_game_unique").on(table.gameId), index("game_posts_group_idx").on(table.groupId)]
);

export const rsvps = mysqlTable(
  "rsvps",
  {
    id: int("id").autoincrement().primaryKey(),
    gameId: int("gameId").notNull().references(() => games.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    state: mysqlEnum("state", rsvpStates).notNull(),
    guestCount: int("guestCount").notNull().default(0),
    idempotencyKey: varchar("idempotencyKey", { length: 100 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("rsvps_game_user_unique").on(table.gameId, table.userId),
    uniqueIndex("rsvps_idempotency_unique").on(table.idempotencyKey),
    index("rsvps_game_state_idx").on(table.gameId, table.state),
    index("rsvps_user_idx").on(table.userId),
  ]
);

export const attendanceRecords = mysqlTable("attendance_records", {
  id: int("id").autoincrement().primaryKey(),
  rsvpId: int("rsvpId").notNull().references(() => rsvps.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", attendanceStates).notNull(),
  recordedBy: int("recordedBy").notNull().references(() => users.id, { onDelete: "restrict" }),
  checkInAt: timestamp("checkInAt"),
  correctionNote: varchar("correctionNote", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("attendance_records_rsvp_unique").on(table.rsvpId), index("attendance_records_recorder_idx").on(table.recordedBy)]);

export const savedGames = mysqlTable("saved_games", {
  id: int("id").autoincrement().primaryKey(),
  gameId: int("gameId").notNull().references(() => games.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("saved_games_game_user_unique").on(table.gameId, table.userId), index("saved_games_user_idx").on(table.userId)]);

export const gameThreads = mysqlTable("game_threads", {
  id: int("id").autoincrement().primaryKey(),
  gameId: int("gameId").notNull().references(() => games.id, { onDelete: "cascade" }),
  authorId: int("authorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: varchar("body", { length: 600 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("game_threads_game_idx").on(table.gameId)]);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    gameId: int("gameId").references(() => games.id, { onDelete: "set null" }),
    type: mysqlEnum("type", notificationTypes).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("notifications_user_created_idx").on(table.userId, table.createdAt)]
);

export const notificationPreferences = mysqlTable("notification_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  inAppEnabled: boolean("inAppEnabled").notNull().default(true),
  emailEnabled: boolean("emailEnabled").notNull().default(false),
  gameUpdatesEnabled: boolean("gameUpdatesEnabled").notNull().default(true),
  waitlistUpdatesEnabled: boolean("waitlistUpdatesEnabled").notNull().default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("notification_preferences_user_unique").on(table.userId)]);

export const notificationOutbox = mysqlTable("notification_outbox", {
  id: int("id").autoincrement().primaryKey(),
  notificationId: int("notificationId").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  state: mysqlEnum("state", notificationDeliveryStates).notNull().default("queued"),
  attempts: int("attempts").notNull().default(0),
  nextAttemptAt: timestamp("nextAttemptAt").defaultNow().notNull(),
  lockedAt: timestamp("lockedAt"),
  lastError: varchar("lastError", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("notification_outbox_notification_unique").on(table.notificationId), index("notification_outbox_state_idx").on(table.state, table.nextAttemptAt)]);

export const notificationDeliveryRecords = mysqlTable("notification_delivery_records", {
  id: int("id").autoincrement().primaryKey(),
  notificationId: int("notificationId").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  channel: mysqlEnum("channel", notificationChannels).notNull(),
  state: mysqlEnum("state", notificationDeliveryStates).notNull(),
  providerReference: varchar("providerReference", { length: 160 }),
  detail: varchar("detail", { length: 500 }),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("notification_delivery_notification_idx").on(table.notificationId), index("notification_delivery_state_idx").on(table.state)]);

export const userBlocks = mysqlTable(
  "user_blocks",
  {
    id: int("id").autoincrement().primaryKey(),
    blockerId: int("blockerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: int("blockedUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 120 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("user_blocks_pair_unique").on(table.blockerId, table.blockedUserId),
    index("user_blocks_blocker_idx").on(table.blockerId),
  ]
);

export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: int("actorId").references(() => users.id, { onDelete: "set null" }),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    subjectType: varchar("subjectType", { length: 80 }).notNull(),
    subjectId: int("subjectId").notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("audit_events_subject_idx").on(table.subjectType, table.subjectId), index("audit_events_actor_idx").on(table.actorId)]
);

export const reports = mysqlTable(
  "reports",
  {
    id: int("id").autoincrement().primaryKey(),
    reporterId: int("reporterId").notNull().references(() => users.id, { onDelete: "cascade" }),
    subjectType: mysqlEnum("subjectType", ["profile", "group", "game", "game_post"]).notNull(),
    subjectId: int("subjectId").notNull(),
    reason: varchar("reason", { length: 120 }).notNull(),
    detail: text("detail"),
    status: mysqlEnum("status", ["open", "reviewing", "closed"]).default("open").notNull(),
    assignedTo: int("assignedTo").references(() => users.id, { onDelete: "set null" }),
    resolutionReason: varchar("resolutionReason", { length: 300 }),
    resolutionNote: varchar("resolutionNote", { length: 600 }),
    sanction: mysqlEnum("sanction", ["none", "warning", "suspension", "ban"]).default("none").notNull(),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("reports_status_idx").on(table.status), index("reports_reporter_idx").on(table.reporterId)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type PlayerProfile = typeof playerProfiles.$inferSelect;
