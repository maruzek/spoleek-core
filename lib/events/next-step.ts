import type { Event } from "@/server/db/schema";

export type EventNextStep = {
  tone: "info" | "warning" | "danger";
  title: string;
  description: string;
  /** Which tab the banner's button jumps to; `publish` fires the publish dialog instead. */
  action?: { label: string; target: "audience" | "emails" | "responses" | "publish" };
};

export type EventNextStepInput = {
  event: Pick<Event, "status" | "visibility" | "startsAt" | "rsvpDeadlineAt" | "capacity">;
  counts: { confirmedSeats: number; reserveCount: number };
  /** Members the audience rules resolve to (0 for a targeted event with no rules). */
  eligibleCount: number;
  /** Eligible members who have not answered. */
  notRespondedCount: number;
  /** Invite emails already sent for this event. */
  sentCount: number;
  now?: Date;
};

/**
 * The one banner above the tabs: what should the admin do next with this
 * event? Returns `null` when nothing is worth interrupting for.
 *
 * TODO(martin): decide the priority order. Candidates, roughly from most to
 * least urgent — pick and rank the ones that matter to you:
 *   - draft                      → "Publish when ready" (target: publish)
 *   - targeted + eligibleCount 0 → nobody can see it (target: audience)
 *   - published + sentCount 0    → nobody has been told yet (target: emails)
 *   - reserveCount > 0           → people waiting for a place (target: responses)
 *   - deadline passed, notRespondedCount > 0 → chase or close (target: emails)
 *   - cancelled                  → plain notice, no action
 */
export function getEventNextStep(input: EventNextStepInput): EventNextStep | null {
  void input;
  return null;
}
