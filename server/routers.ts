import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import {
  createCommunityReport,
  blockCommunityUser,
  getModerationReports,
  getCommunityDashboard,
  joinCommunityGroup,
  markNotificationsRead,
  respondToGame,
  reviewCommunityReport,
  sendGameUpdate,
  updatePlayerProfile,
} from "./db";
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
      .input(z.object({ gameId: z.number().int().positive(), action: z.enum(["join", "leave"]) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await respondToGame(ctx.user.id, input.gameId, input.action);
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
    reviewReport: protectedProcedure
      .input(z.object({ reportId: z.number().int().positive(), status: z.enum(["reviewing", "closed"]) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await reviewCommunityReport(ctx.user.role, input.reportId, input.status);
        } catch (error) {
          return communityError(error);
        }
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
  }),
});

export type AppRouter = typeof appRouter;
