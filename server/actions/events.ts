"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { after } from "next/server";
import { z } from "zod";

import { resolveEventPaymentDetails, type EventPaymentView } from "@/lib/events/payment-plan";
import { responseOwnerOf } from "@/lib/events/responder";
import { canPromote, seatsTaken } from "@/lib/events/rsvp";
import {
  addExternalInviteesSchema,
  eventIdSchema,
  eventIdsSchema,
  eventInputSchema,
  removeExternalInviteeSchema,
  removeResponseSchema,
  respondAsGuestSchema,
  respondToEventSchema,
  respondWithTokenSchema,
  sendEventInviteEmailsSchema,
  setEventAudienceSchema,
  setResponseStandingSchema,
  type EventInput,
} from "@/lib/events/schemas";
import { feeToMinorUnits } from "@/lib/payments";
import { actionClient } from "@/lib/safe-action";
import { authActionClient } from "@/lib/safe-action-auth";
import { slugify } from "@/lib/slugify";
import { db } from "@/server/db";
import {
  eventAudience,
  eventResponses,
  eventRsvpTokens,
  events,
  memberPayments,
} from "@/server/db/schema";
import { sendEventPaymentEmail } from "@/server/lib/events/payment-emails";
import { syncEventPayment, syncEventPaymentsForEvent, type SyncResult } from "@/server/lib/events/payments";
import { EventError, upsertResponse } from "@/server/lib/events/responses";
import { issueRsvpToken, touchRsvpToken } from "@/server/lib/events/tokens";
import { sanitizePolicyHtml } from "@/server/lib/policy-html";
import { consumeRateLimit, getRequestIdentifier } from "@/server/lib/rate-limit";
import { sendEventInvites } from "@/server/notifications/events";
import {
  requireCurrentMember,
  requireEventManagementAccess,
  requireGroupAdminModuleAccess,
  requireEventOwnerAccess,
  requireOrganization,
} from "@/server/queries/access";
import {
  eventPaymentViewColumns,
  getEventById,
  getEventBySlug,
  getEventRecipients,
  listEventsForOwnerPicker,
} from "@/server/queries/events";
import { isEligible } from "@/server/queries/event-eligibility";
import { listAssignableTenantMembers } from "@/server/queries/groups";
import { memberResponder, resolveTokenResponder } from "@/server/queries/responder";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** `slugify(title)` with a numeric suffix on collision, like groups. */
async function ensureUniqueEventSlug(orgId: string, wanted: string, eventId?: string) {
  const base = slugify(wanted) || "event";

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const conditions = [eq(events.orgId, orgId), eq(events.slug, candidate)];
    if (eventId) conditions.push(ne(events.id, eventId));

    const [existing] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(...conditions))
      .limit(1);

    if (!existing) return candidate;
  }

  throw new EventError("SLUG_TAKEN");
}

function ownerIdOf(input: Pick<EventInput, "ownerType" | "ownerCategoryId" | "ownerGroupId">) {
  if (input.ownerType === "group") return input.ownerGroupId ?? null;
  if (input.ownerType === "category") return input.ownerCategoryId ?? null;
  return null;
}

function eventColumns(input: EventInput) {
  return {
    title: input.title.trim(),
    descriptionHtml: input.descriptionHtml ? sanitizePolicyHtml(input.descriptionHtml) : null,
    ownerType: input.ownerType,
    ownerCategoryId: input.ownerType === "category" ? input.ownerCategoryId ?? null : null,
    ownerGroupId: input.ownerType === "group" ? input.ownerGroupId ?? null : null,
    visibility: input.visibility,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    allDay: input.allDay,
    rsvpDeadlineAt: input.rsvpDeadlineAt ?? null,
    capacity: input.capacity ?? null,
    maxGuestsPerResponse: input.maxGuestsPerResponse,
    locationName: input.locationName ?? null,
    locationAddress: input.locationAddress ?? null,
    communicationLink: input.communicationLink ?? null,
    ...priceColumns(input),
  };
}

/**
 * The switch off means "free", whatever the other fields say — the form keeps
 * them so flipping back does not lose the price. Major units in, minor out,
 * like membership fees.
 */
function priceColumns(input: EventInput) {
  if (!input.paid || input.priceAmount == null || !input.priceCurrency) {
    return {
      priceAmount: null,
      priceCurrency: null,
      priceBankAccount: null,
      paymentDueAt: null,
    };
  }
  return {
    priceAmount: feeToMinorUnits(input.priceAmount),
    priceCurrency: input.priceCurrency,
    priceBankAccount: input.priceBankAccount ?? null,
    paymentDueAt: input.paymentDueAt ?? null,
  };
}

/** Queues the "here is your payment" email for a create / reprice plan. */
function notifyPaymentSync(payment: SyncResult | undefined, rsvpToken?: string | null) {
  if (!payment?.paymentId) return;
  if (payment.plan.kind !== "create" && payment.plan.kind !== "reprice") return;
  const paymentId = payment.paymentId;
  const updated = payment.plan.kind === "reprice";
  after(() => sendEventPaymentEmail(paymentId, { updated, rsvpToken }));
}

/**
 * A priced event must have somewhere for the money to go. Checked when
 * publishing (a draft may be saved without) and again by the sync, which
 * throws the same code if the account disappears later.
 */
function assertBankAccountForPricedEvent(
  organization: { membershipFeeBankAccount: string | null },
  event: { priceAmount: number | null; priceBankAccount: string | null },
) {
  if (event.priceAmount === null) return;
  const { bankAccount } = resolveEventPaymentDetails({
    event: { ...event, paymentDueAt: null, rsvpDeadlineAt: null, startsAt: null },
    orgBankAccount: organization.membershipFeeBankAccount,
    now: new Date(),
  });
  if (!bankAccount) throw new EventError("PAYMENT_BANK_ACCOUNT_MISSING");
}

/** "Name <email>" or bare email, one per line / comma. */
function parseEmailLines(input: string) {
  const out = new Map<string, { email: string; name: string | null }>();

  for (const raw of input.split(/[\n,;]+/)) {
    const line = raw.trim();
    if (!line) continue;

    const angle = line.match(/^(.*?)<([^>]+)>$/);
    const email = (angle ? angle[2] : line).trim().toLowerCase();
    const name = angle ? angle[1]!.trim().replace(/^"|"$/g, "") : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (!out.has(email)) out.set(email, { email, name: name || null });
  }

  return [...out.values()];
}

// ─── Manager actions ────────────────────────────────────────────────────────

export const createEventAction = authActionClient
  .metadata({ actionName: "createEvent" })
  .inputSchema(eventInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireEventOwnerAccess(ctx.viewer, parsedInput.ownerType, ownerIdOf(parsedInput));
    const orgId = context.organization.id;

    const slug = await ensureUniqueEventSlug(orgId, parsedInput.slug);

    const [event] = await db
      .insert(events)
      .values({
        orgId,
        slug,
        ...eventColumns(parsedInput),
        createdByUserId: ctx.auth.user.id,
      })
      .returning({ id: events.id, slug: events.slug });

    return { success: true as const, eventId: event!.id, slug: event!.slug };
  });

export const updateEventAction = authActionClient
  .metadata({ actionName: "updateEvent" })
  .inputSchema(eventInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    if (!parsedInput.id) throw new EventError("NOT_FOUND");

    const { context, event } = await requireEventManagementAccess(ctx.viewer, parsedInput.id);

    // Changing the owner needs access to both sides.
    const ownerChanged =
      event.ownerType !== parsedInput.ownerType ||
      (event.ownerType === "group" ? event.ownerGroupId : event.ownerCategoryId) !==
        ownerIdOf(parsedInput);
    if (ownerChanged) {
      await requireEventOwnerAccess(ctx.viewer, parsedInput.ownerType, ownerIdOf(parsedInput));
    }

    const slug = slugify(parsedInput.slug);
    if (slug !== event.slug) {
      const [taken] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.orgId, context.organization.id),
            eq(events.slug, slug),
            ne(events.id, event.id),
          ),
        )
        .limit(1);

      if (taken) {
        returnValidationErrors(eventInputSchema, {
          slug: { _errors: ["That slug is already in use."] },
        });
      }
    }

    const columns = eventColumns(parsedInput);
    const priceChanged =
      columns.priceAmount !== event.priceAmount ||
      columns.priceCurrency !== event.priceCurrency ||
      columns.priceBankAccount !== event.priceBankAccount;

    // A published event may not be priced without an account to pay into.
    if (priceChanged && event.status === "published") {
      assertBankAccountForPricedEvent(context.organization, columns);
    }

    const notifyPaymentIds = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(events)
        .set({ slug, ...columns })
        .where(eq(events.id, event.id))
        .returning();

      if (!priceChanged) return [];

      // Every yes follows the new price in the same transaction: pending rows
      // re-priced, missing ones created, paid ones untouched.
      const summary = await syncEventPaymentsForEvent(tx, {
        orgId: context.organization.id,
        event: updated!,
      });
      return summary.notifyPaymentIds;
    });

    after(async () => {
      for (const paymentId of notifyPaymentIds) {
        await sendEventPaymentEmail(paymentId, { updated: true });
      }
    });

    return { success: true as const, eventId: event.id, slug };
  });

export const publishEventAction = authActionClient
  .metadata({ actionName: "publishEvent" })
  .inputSchema(eventIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { context, event } = await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);
    assertBankAccountForPricedEvent(context.organization, event);
    await db.update(events).set({ status: "published" }).where(eq(events.id, event.id));
    return { success: true as const };
  });

export const cancelEventAction = authActionClient
  .metadata({ actionName: "cancelEvent" })
  .inputSchema(eventIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { event } = await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, event.id));
    return { success: true as const };
  });

export const deleteEventAction = authActionClient
  .metadata({ actionName: "deleteEvent" })
  .inputSchema(eventIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { event } = await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);
    await db.update(events).set({ deletedAt: new Date() }).where(eq(events.id, event.id));
    return { success: true as const };
  });

/**
 * Bulk soft-delete from the list. Access is checked per event, so a selection
 * that mixes in one event the caller cannot manage fails as a whole rather
 * than silently skipping it.
 */
export const deleteEventsAction = authActionClient
  .metadata({ actionName: "deleteEvents" })
  .inputSchema(eventIdsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const ids: string[] = [];
    for (const eventId of parsedInput.eventIds) {
      const { event } = await requireEventManagementAccess(ctx.viewer, eventId);
      ids.push(event.id);
    }
    await db.update(events).set({ deletedAt: new Date() }).where(inArray(events.id, ids));
    return { success: true as const, deleted: ids.length };
  });

/**
 * Everything the audience dialog can pick from. Fetched on open rather than
 * with the page: the member list is the biggest payload on the route and most
 * visits never touch it.
 */
export const loadEventAudienceOptionsAction = authActionClient
  .metadata({ actionName: "loadEventAudienceOptions" })
  .inputSchema(z.object({ eventId: z.string().uuid().optional() }))
  .action(async ({ parsedInput, ctx }) => {
    // No event yet while the create wizard is open: any event manager may look.
    const context = parsedInput.eventId
      ? (await requireEventManagementAccess(ctx.viewer, parsedInput.eventId)).context
      : await requireGroupAdminModuleAccess(ctx.viewer);
    const orgId = context.organization.id;
    const [picker, members] = await Promise.all([
      listEventsForOwnerPicker(orgId),
      listAssignableTenantMembers(orgId),
    ]);
    return {
      categories: picker.categories,
      groups: picker.groups,
      members: members
        .filter((m) => m.status === "active")
        .map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, email: m.email })),
    };
  });

/** Replaces the full rule list. External rules are managed by `addExternalInviteesAction`. */
export const setEventAudienceAction = authActionClient
  .metadata({ actionName: "setEventAudience" })
  .inputSchema(setEventAudienceSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { context, event } = await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);
    const orgId = context.organization.id;

    await db.transaction(async (tx) => {
      await tx
        .delete(eventAudience)
        .where(and(eq(eventAudience.eventId, event.id), ne(eventAudience.kind, "external")));

      const rows = parsedInput.rules
        .filter((rule) => rule.kind !== "external")
        .map((rule) => ({
          orgId,
          eventId: event.id,
          kind: rule.kind,
          groupId: rule.kind === "group" ? rule.groupId : null,
          categoryId: rule.kind === "category" ? rule.categoryId : null,
          memberId: rule.kind === "member" ? rule.memberId : null,
        }));

      if (rows.length > 0) {
        await tx.insert(eventAudience).values(rows).onConflictDoNothing();
      }
    });

    return { success: true as const };
  });

export const addExternalInviteesAction = authActionClient
  .metadata({ actionName: "addExternalInvitees" })
  .inputSchema(addExternalInviteesSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { context, event } = await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);
    const orgId = context.organization.id;
    const parsed = parseEmailLines(parsedInput.emails);

    if (parsed.length === 0) return { success: true as const, added: 0 };

    await db.transaction(async (tx) => {
      await tx
        .insert(eventAudience)
        .values(
          parsed.map((entry) => ({
            orgId,
            eventId: event.id,
            kind: "external" as const,
            externalEmail: entry.email,
            externalName: entry.name,
          })),
        )
        .onConflictDoNothing();

      for (const entry of parsed) {
        await issueRsvpToken({ eventId: event.id, orgId, externalEmail: entry.email }, tx);
      }
    });

    return { success: true as const, added: parsed.length };
  });

/** Drops an external invitee and their token. Their response, if any, stays. */
export const removeExternalInviteeAction = authActionClient
  .metadata({ actionName: "removeExternalInvitee" })
  .inputSchema(removeExternalInviteeSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { event } = await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);
    const email = parsedInput.externalEmail.toLowerCase();

    await db.transaction(async (tx) => {
      await tx
        .delete(eventAudience)
        .where(
          and(
            eq(eventAudience.eventId, event.id),
            eq(eventAudience.kind, "external"),
            sql`lower(${eventAudience.externalEmail}) = ${email}`,
          ),
        );
      await tx
        .delete(eventRsvpTokens)
        .where(
          and(
            eq(eventRsvpTokens.eventId, event.id),
            sql`lower(${eventRsvpTokens.externalEmail}) = ${email}`,
          ),
        );
    });

    return { success: true as const };
  });

export const setResponseStandingAction = authActionClient
  .metadata({ actionName: "setResponseStanding" })
  .inputSchema(setResponseStandingSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { event } = await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);

    const payment = await db.transaction(async (tx) => {
      // Same lock as the RSVP path, so a promotion cannot race a new yes.
      await tx.select({ id: events.id }).from(events).where(eq(events.id, event.id)).for("update");

      const [response] = await tx
        .select()
        .from(eventResponses)
        .where(and(eq(eventResponses.eventId, event.id), eq(eventResponses.id, parsedInput.responseId)))
        .limit(1);

      if (!response) throw new EventError("NOT_FOUND");

      if (parsedInput.standing === "confirmed") {
        const others = await tx
          .select({
            answer: eventResponses.answer,
            standing: eventResponses.standing,
            guestCount: eventResponses.guestCount,
          })
          .from(eventResponses)
          .where(and(eq(eventResponses.eventId, event.id), ne(eventResponses.id, response.id)));

        if (!canPromote({ capacity: event.capacity, seatsTaken: seatsTaken(others), response })) {
          throw new EventError("CAPACITY_EXCEEDED");
        }
      }

      const [updated] = await tx
        .update(eventResponses)
        .set({
          standing: parsedInput.standing,
          confirmedByUserId: parsedInput.standing === "confirmed" ? ctx.auth.user.id : null,
        })
        .where(eq(eventResponses.id, response.id))
        .returning();

      // Promotion charges, demotion cancels (or flags a paid row for refund).
      return syncEventPayment(tx, {
        orgId: event.orgId,
        event,
        response: updated!,
        responseId: updated!.id,
      });
    });

    notifyPaymentSync(payment);

    return { success: true as const };
  });

export const removeResponseAction = authActionClient
  .metadata({ actionName: "removeResponse" })
  .inputSchema(removeResponseSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { event } = await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);

    await db.transaction(async (tx) => {
      // Sync before the delete: the FK sets `response_id` null afterwards and
      // the live row could no longer be found. A pending payment is cancelled,
      // a paid one becomes refund_due and survives the delete.
      await syncEventPayment(tx, {
        orgId: event.orgId,
        event,
        response: null,
        responseId: parsedInput.responseId,
      });

      await tx
        .delete(eventResponses)
        .where(and(eq(eventResponses.eventId, event.id), eq(eventResponses.id, parsedInput.responseId)));
    });

    return { success: true as const };
  });

/**
 * Dry run returns the count for the confirm dialog; the real run sends. Same
 * recipient function both times, so what the manager approved is what goes.
 */
export const sendEventInviteEmailsAction = authActionClient
  .metadata({ actionName: "sendEventInviteEmails" })
  .inputSchema(sendEventInviteEmailsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { context, event } = await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);
    const recipients = (await getEventRecipients(context.organization.id, event.id))[parsedInput.filter];

    if (parsedInput.dryRun) {
      return { success: true as const, dryRun: true as const, recipientCount: recipients.length };
    }

    await sendEventInvites({
      organization: context.organization,
      event,
      recipients,
      actorUserId: ctx.auth.user.id,
    });

    return { success: true as const, dryRun: false as const, recipientCount: recipients.length };
  });

// ─── Response actions ───────────────────────────────────────────────────────

/** Portal: a signed-in member answering for themselves. */
export const respondToEventAction = authActionClient
  .metadata({ actionName: "respondToEvent" })
  .inputSchema(respondToEventSchema)
  .action(async ({ parsedInput, ctx }) => {
    const member = await requireCurrentMember(ctx.viewer);
    const orgId = member.orgId;

    const row = await getEventById(orgId, parsedInput.eventId);
    if (!row || row.event.status === "draft") throw new EventError("NOT_FOUND");
    const { event } = row;

    if (!(await isEligible(orgId, member.id, event))) {
      throw new EventError("NOT_ELIGIBLE");
    }

    const result = await db.transaction((tx) =>
      upsertResponse(tx, {
        orgId,
        eventId: event.id,
        responder: responseOwnerOf(memberResponder(member)),
        answer: parsedInput.answer,
        guestCount: parsedInput.guestCount,
      }),
    );

    notifyPaymentSync(result.payment);

    return {
      success: true as const,
      standing: result.response.standing,
      payment: await livePaymentFor(result.payment),
    };
  });

/** Token link: shadow members, non-activated members, external invitees. */
export const respondWithTokenAction = actionClient
  .metadata({ actionName: "respondWithToken" })
  .inputSchema(respondWithTokenSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();
    // A dead link is refused here; a closed RSVP is refused by `upsertResponse`.
    const resolved = await resolveTokenResponder(organization.id, parsedInput.token, new Date());
    if (!resolved) throw new EventError("TOKEN_INVALID");
    const { event, responder } = resolved;

    const result = await db.transaction(async (tx) => {
      const upserted = await upsertResponse(tx, {
        orgId: event.orgId,
        eventId: event.id,
        responder: responseOwnerOf(responder),
        answer: parsedInput.answer,
        guestCount: parsedInput.guestCount,
      });
      await touchRsvpToken(responder.tokenId, tx);
      return upserted;
    });

    notifyPaymentSync(result.payment, parsedInput.token);

    return {
      success: true as const,
      standing: result.response.standing,
      payment: await livePaymentFor(result.payment),
    };
  });

/**
 * The payment card's data straight after an RSVP, so the portal and token
 * pages can show it without a reload. Null when the plan left nothing live.
 */
async function livePaymentFor(sync: SyncResult | undefined): Promise<EventPaymentView | null> {
  if (!sync?.paymentId) return null;
  if (sync.plan.kind === "cancel") return null;

  const [row] = await db
    .select(eventPaymentViewColumns)
    .from(memberPayments)
    .where(eq(memberPayments.id, sync.paymentId))
    .limit(1);

  return row ?? null;
}

const GUEST_RSVP_SCOPE = "event_guest_rsvp";
const GUEST_RSVP_WINDOW_MS = 60 * 60 * 1000;
const GUEST_RSVP_PER_IP = 10;
const GUEST_RSVP_PER_EVENT = 200;

/**
 * Public events only. Rate-limited per caller and per event before any DB
 * write: the form takes a name and email from anyone. Returns a token so the
 * guest can change their answer later; no email is sent.
 */
export const respondAsGuestAction = actionClient
  .metadata({ actionName: "respondAsGuest" })
  .inputSchema(respondAsGuestSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();
    const row = await getEventBySlug(organization.id, parsedInput.eventSlug);

    if (!row || row.event.visibility !== "public" || row.event.status === "draft") {
      throw new EventError("NOT_FOUND");
    }

    const [perIp, perEvent] = await Promise.all([
      consumeRateLimit({
        scope: GUEST_RSVP_SCOPE,
        identifier: await getRequestIdentifier(),
        limit: GUEST_RSVP_PER_IP,
        windowMs: GUEST_RSVP_WINDOW_MS,
      }),
      consumeRateLimit({
        scope: GUEST_RSVP_SCOPE,
        identifier: `event:${row.event.id}`,
        limit: GUEST_RSVP_PER_EVENT,
        windowMs: GUEST_RSVP_WINDOW_MS,
      }),
    ]);

    if (!perIp.allowed || !perEvent.allowed) throw new EventError("RATE_LIMITED");

    // A signed-in member answering on the public page still counts as a guest
    // by email; the portal is where their member row lives.
    const email = parsedInput.email.trim().toLowerCase();

    const { result, token } = await db.transaction(async (tx) => {
      const upserted = await upsertResponse(tx, {
        orgId: organization.id,
        eventId: row.event.id,
        responder: { guestEmail: email, guestName: parsedInput.name.trim() },
        answer: parsedInput.answer,
        guestCount: parsedInput.guestCount,
      });
      const issued = await issueRsvpToken(
        { eventId: row.event.id, orgId: organization.id, externalEmail: email },
        tx,
      );
      return { result: upserted, token: issued };
    });

    notifyPaymentSync(result.payment, token);

    return {
      success: true as const,
      standing: result.response.standing,
      token,
      payment: await livePaymentFor(result.payment),
    };
  });
