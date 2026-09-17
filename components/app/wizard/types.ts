/** What the footer needs to know about the active step; nothing else. */
export type StepGate = {
  /** Cannot advance at all, and why. */
  blocked?: { reason: string };
  /** Async work is running inside the step; advancing would abandon it. */
  busy?: boolean;
  /** Advancing is allowed but loses something; confirm names the cost. */
  pending?: { summary: string; detail: string };
};
