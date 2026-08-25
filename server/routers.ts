import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import {
  createCommunityReport,
  blockCommunityUser,
  getModerationReports,
  getModerationAudit,
  getCommunityDashboard,
  joinCommunityGroup,
  markNotificationsRead,
  respondToGame,
  reviewCommunityReport,
  assignCommunityReport,
  resolveCommunityReport,
  sendGameUpdate,
  updatePlayerProfile,
} from "./db";
import { archiveOrganizerGame, cancelOrganizerGame, createOrganizerGame, getOrganizerRoster, listOrganizerGames, publishOrganizerGame, updateOrganizerGame } from "./organizerService";
import { acceptGroupInvite, addGameThreadPost, createCommunityGroup, createGroupInvite, listCommunityMembers, listGameThreadPosts, listGroupMembershipRequests, listVisibleGroupMembers, recordAttendance, removeSavedGameForPlayer, requestGroupMembership, reviewGroupMembership, saveGameForPlayer, transferGroupOwnership, updateGroupMemberRole } from "./communityService";
import { bootstrapProjectOwnerAdmin, listAdminUsers, updateUserRole } from "./adminService";
import { getNotificationPreferences, updateNotificationPreferences } from "./notificationPreferences";
import { addVenueSource, addVenueStaff, listVenueReviews, reviewVenueClaim, reviewVenueCorrection, setVenueVerificationState, submitVenueClaim, submitVenueCorrection } from "./venueService";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

function communityError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  community: router({
    dashboard: publicProcedure.query(async ({ ctx }) => getCommunityDashboard(ctx.user)),
    rsvp: protectedProcedure
      .input(z.object({ gameId: z.number().int().positive(), action: z.enum(["join", "leave"]), idempotencyKey: z.string().trim().min(12).max(100).optional() }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await respondToGame(ctx.user.id, input.gameId, input.action, input.idempotencyKey);
        } catch (error) {
          return communityError(error);
        }
      }),
    joinGroup: protectedProcedure
      .input(z.object({ groupId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await joinCommunityGroup(ctx.user.id, input.groupId);
        } catch (error) {
          return communityError(error);
        }
      }),
    updateProfile: protectedProcedure
      .input(z.object({
        displayName: z.string().trim().min(2).max(120),
        city: z.string().trim().min(2).max(120),
        bio: z.string().trim().max(480).optional(),
        skillBand: z.string().trim().min(2).max(80),
        ratingProvenance: z.enum(["none", "self_described", "linked_provider"]),
        visibility: z.enum(["community", "private"]),
        preferredFormats: z.string().trim().min(2).max(180),
      }))
      .mutation(async ({ ctx, input }) => updatePlayerProfile(ctx.user.id, input)),
    report: protectedProcedure
      .input(z.object({
        subjectType: z.enum(["profile", "group", "game", "game_post"]),
        subjectId: z.number().int().positive(),
        reason: z.string().trim().min(2).max(120),
        detail: z.string().trim().max(600).optional(),
      }))
      .mutation(async ({ ctx, input }) => createCommunityReport(ctx.user.id, input)),
    blockUser: protectedProcedure
      .input(z.object({ blockedUserId: z.number().int().positive(), reason: z.string().trim().max(120).optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await blockCommunityUser(ctx.user.id, input.blockedUserId, input.reason);
        } catch (error) {
          return communityError(error);
        }
      }),
    moderationReports: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await getModerationReports(ctx.user.role);
      } catch (error) {
        return communityError(error);
      }
    }),
    moderationAudit: protectedProcedure.query(async ({ ctx }) => {
      try { return await getModerationAudit(ctx.user.role); } catch (error) { return communityError(error); }
    }),
    reviewReport: protectedProcedure
      .input(z.object({ reportId: z.number().int().positive(), status: z.enum(["reviewing", "closed"]) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await reviewCommunityReport(ctx.user.role, input.reportId, input.status);
        } catch (error) {
          return communityError(error);
        }
      }),
    assignReport: protectedProcedure.input(z.object({ reportId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { return await assignCommunityReport(ctx.user, input.reportId); } catch (error) { return communityError(error); }
    }),
    resolveReport: protectedProcedure.input(z.object({ reportId: z.number().int().positive(), resolutionReason: z.string().trim().min(3).max(300), resolutionNote: z.string().trim().max(600).optional(), sanction: z.enum(["none", "warning", "suspension", "ban"]) })).mutation(async ({ ctx, input }) => {
      try { return await resolveCommunityReport(ctx.user, input); } catch (error) { return communityError(error); }
    }),
    organizerUpdate: protectedProcedure
      .input(z.object({ gameId: z.number().int().positive(), message: z.string().trim().min(3).max(500) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await sendGameUpdate(ctx.user, input.gameId, input.message);
        } catch (error) {
          return communityError(error);
        }
      }),
    markNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => markNotificationsRead(ctx.user.id)),
    notificationPreferences: protectedProcedure.query(async ({ ctx }) => getNotificationPreferences(ctx.user.id)),
    updateNotificationPreferences: protectedProcedure.input(z.object({ inAppEnabled: z.boolean(), emailEnabled: z.boolean(), gameUpdatesEnabled: z.boolean(), waitlistUpdatesEnabled: z.boolean() })).mutation(async ({ ctx, input }) => updateNotificationPreferences(ctx.user.id, input)),
    members: protectedProcedure.query(async ({ ctx }) => listCommunityMembers(ctx.user.id)),
    groupMembers: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).query(async ({ ctx, input }) => { try { return await listVisibleGroupMembers(ctx.user.id, input.groupId); } catch (error) { return communityError(error); } }),
    createGroup: protectedProcedure.input(z.object({ name: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(1600), neighborhood: z.string().trim().min(2).max(120), visibility: z.enum(["public", "private"]) })).mutation(async ({ ctx, input }) => { try { return await createCommunityGroup(ctx.user, input); } catch (error) { return communityError(error); } }),
    requestGroupMembership: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { try { return await requestGroupMembership(ctx.user.id, input.groupId); } catch (error) { return communityError(error); } }),
    saveGame: protectedProcedure.input(z.object({ gameId: z.number().int().positive(), saved: z.boolean() })).mutation(async ({ ctx, input }) => input.saved ? saveGameForPlayer(ctx.user.id, input.gameId) : removeSavedGameForPlayer(ctx.user.id, input.gameId)),
    postGameThread: protectedProcedure.input(z.object({ gameId: z.number().int().positive(), body: z.string().trim().min(1).max(600) })).mutation(async ({ ctx, input }) => { try { return await addGameThreadPost(ctx.user.id, input.gameId, input.body); } catch (error) { return communityError(error); } }),
    gameThread: protectedProcedure.input(z.object({ gameId: z.number().int().positive() })).query(async ({ ctx, input }) => { try { return await listGameThreadPosts(ctx.user.id, input.gameId); } catch (error) { return communityError(error); } }),
    acceptGroupInvite: protectedProcedure.input(z.object({ token: z.string().trim().min(8).max(100) })).mutation(async ({ ctx, input }) => { try { return await acceptGroupInvite(ctx.user.id, input.token); } catch (error) { return communityError(error); } }),
    submitVenueClaim: protectedProcedure.input(z.object({ venueId: z.number().int().positive(), note: z.string().trim().max(600).optional() })).mutation(async ({ ctx, input }) => { try { return await submitVenueClaim(ctx.user, input.venueId, input.note); } catch (error) { return communityError(error); } }),
    submitVenueCorrection: protectedProcedure.input(z.object({ venueId: z.number().int().positive(), field: z.string().trim().min(2).max(80), proposedValue: z.string().trim().min(1).max(500), reason: z.string().trim().max(600).optional() })).mutation(async ({ ctx, input }) => { try { return await submitVenueCorrection(ctx.user, input); } catch (error) { return communityError(error); } }),
  }),
  organizer: router({
    games: protectedProcedure.query(async ({ ctx }) => {
      try { return await listOrganizerGames(ctx.user); } catch (error) { return communityError(error); }
    }),
    createGame: protectedProcedure
      .input(z.object({ venueId: z.number().int().positive(), groupId: z.number().int().positive().nullable().optional(), title: z.string().trim().min(3).max(180), description: z.string().trim().min(3).max(2000), format: z.string().trim().min(2).max(80), skillBand: z.string().trim().min(2).max(80), capacity: z.number().int().min(1).max(200), visibility: z.enum(["public", "private"]), beginnerFriendly: z.boolean(), attendanceNote: z.string().trim().min(3).max(240), startsAt: z.number().int().positive(), endsAt: z.number().int().positive(), rsvpDeadlineAt: z.number().int().positive().nullable().optional(), publish: z.boolean().default(false) }))
      .mutation(async ({ ctx, input }) => {
        try { const { publish, startsAt, endsAt, rsvpDeadlineAt, ...rest } = input; return await createOrganizerGame(ctx.user, { ...rest, startsAt: new Date(startsAt), endsAt: new Date(endsAt), rsvpDeadlineAt: rsvpDeadlineAt ? new Date(rsvpDeadlineAt) : null }, publish); } catch (error) { return communityError(error); }
      }),
    updateGame: protectedProcedure
      .input(z.object({ gameId: z.number().int().positive(), venueId: z.number().int().positive(), groupId: z.number().int().positive().nullable().optional(), title: z.string().trim().min(3).max(180), description: z.string().trim().min(3).max(2000), format: z.string().trim().min(2).max(80), skillBand: z.string().trim().min(2).max(80), capacity: z.number().int().min(1).max(200), visibility: z.enum(["public", "private"]), beginnerFriendly: z.boolean(), attendanceNote: z.string().trim().min(3).max(240), startsAt: z.number().int().positive(), endsAt: z.number().int().positive(), rsvpDeadlineAt: z.number().int().positive().nullable().optional() }))
      .mutation(async ({ ctx, input }) => { try { const { gameId, startsAt, endsAt, rsvpDeadlineAt, ...rest } = input; return await updateOrganizerGame(ctx.user, gameId, { ...rest, startsAt: new Date(startsAt), endsAt: new Date(endsAt), rsvpDeadlineAt: rsvpDeadlineAt ? new Date(rsvpDeadlineAt) : null }); } catch (error) { return communityError(error); } }),
    publishGame: protectedProcedure.input(z.object({ gameId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { try { return await publishOrganizerGame(ctx.user, input.gameId); } catch (error) { return communityError(error); } }),
    cancelGame: protectedProcedure.input(z.object({ gameId: z.number().int().positive(), reason: z.string().trim().min(3).max(300) })).mutation(async ({ ctx, input }) => { try { return await cancelOrganizerGame(ctx.user, input.gameId, input.reason); } catch (error) { return communityError(error); } }),
    archiveGame: protectedProcedure.input(z.object({ gameId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { try { return await archiveOrganizerGame(ctx.user, input.gameId); } catch (error) { return communityError(error); } }),
    roster: protectedProcedure.input(z.object({ gameId: z.number().int().positive() })).query(async ({ ctx, input }) => { try { return await getOrganizerRoster(ctx.user, input.gameId); } catch (error) { return communityError(error); } }),
    membershipRequests: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).query(async ({ ctx, input }) => { try { return await listGroupMembershipRequests(ctx.user, input.groupId); } catch (error) { return communityError(error); } }),
    reviewMembership: protectedProcedure.input(z.object({ membershipId: z.number().int().positive(), decision: z.enum(["active", "denied"]), reason: z.string().trim().max(240).optional() })).mutation(async ({ ctx, input }) => { try { return await reviewGroupMembership(ctx.user, input.membershipId, input.decision, input.reason); } catch (error) { return communityError(error); } }),
    transferOwnership: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), successorUserId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { try { return await transferGroupOwnership(ctx.user, input.groupId, input.successorUserId); } catch (error) { return communityError(error); } }),
    updateMemberRole: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), memberUserId: z.number().int().positive(), role: z.enum(["member", "moderator"]) })).mutation(async ({ ctx, input }) => { try { return await updateGroupMemberRole(ctx.user, input.groupId, input.memberUserId, input.role); } catch (error) { return communityError(error); } }),
    createGroupInvite: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), email: z.string().trim().email().optional() })).mutation(async ({ ctx, input }) => { try { return await createGroupInvite(ctx.user, input.groupId, input.email); } catch (error) { return communityError(error); } }),
    attendance: protectedProcedure.input(z.object({ rsvpId: z.number().int().positive(), status: z.enum(["attended", "no_show", "late_cancel"]), correctionNote: z.string().trim().max(300).optional() })).mutation(async ({ ctx, input }) => { try { return await recordAttendance(ctx.user, input.rsvpId, input.status, input.correctionNote); } catch (error) { return communityError(error); } }),
  }),
  admin: router({
    bootstrap: protectedProcedure.mutation(async ({ ctx }) => { try { return await bootstrapProjectOwnerAdmin(ctx.user); } catch (error) { return communityError(error); } }),
    users: protectedProcedure.query(async ({ ctx }) => { try { return await listAdminUsers(ctx.user); } catch (error) { return communityError(error); } }),
    updateUserRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["player", "organizer", "moderator", "admin"]) })).mutation(async ({ ctx, input }) => { try { return await updateUserRole(ctx.user, input.userId, input.role); } catch (error) { return communityError(error); } }),
    venueReviews: protectedProcedure.query(async ({ ctx }) => { try { return await listVenueReviews(ctx.user); } catch (error) { return communityError(error); } }),
    reviewVenueClaim: protectedProcedure.input(z.object({ claimId: z.number().int().positive(), state: z.enum(["reviewing", "accepted", "rejected"]) })).mutation(async ({ ctx, input }) => { try { return await reviewVenueClaim(ctx.user, input.claimId, input.state); } catch (error) { return communityError(error); } }),
    reviewVenueCorrection: protectedProcedure.input(z.object({ correctionId: z.number().int().positive(), state: z.enum(["reviewing", "accepted", "rejected"]) })).mutation(async ({ ctx, input }) => { try { return await reviewVenueCorrection(ctx.user, input.correctionId, input.state); } catch (error) { return communityError(error); } }),
    setVenueVerification: protectedProcedure.input(z.object({ venueId: z.number().int().positive(), verificationState: z.enum(["unverified", "claimed", "verified"]) })).mutation(async ({ ctx, input }) => { try { return await setVenueVerificationState(ctx.user, input.venueId, input.verificationState); } catch (error) { return communityError(error); } }),
    addVenueStaff: protectedProcedure.input(z.object({ venueId: z.number().int().positive(), userId: z.number().int().positive(), role: z.enum(["manager", "editor"]) })).mutation(async ({ ctx, input }) => { try { return await addVenueStaff(ctx.user, input.venueId, input.userId, input.role); } catch (error) { return communityError(error); } }),
    addVenueSource: protectedProcedure.input(z.object({ venueId: z.number().int().positive(), sourceLabel: z.string().trim().min(2).max(160), sourceUrl: z.string().trim().url().max(500).optional() })).mutation(async ({ ctx, input }) => { try { return await addVenueSource(ctx.user, input.venueId, input.sourceLabel, input.sourceUrl); } catch (error) { return communityError(error); } }),
  }),
});

export type AppRouter = typeof appRouter;
