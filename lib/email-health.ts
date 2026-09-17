/**
 * Turns the last 30 days of email outcomes into one word for the top of the
 * delivery-health page.
 *
 * Thresholds are a product decision, not a technical one. Mailbox providers
 * start to throttle senders somewhere around a 2 % bounce rate and 0.1 %
 * complaint rate; a small club sending a few dozen invites a month will hit
 * "attention" on a single bad address, which is exactly when the admin should
 * look.
 */
export type DeliveryVerdict = {
  level: "healthy" | "watch" | "attention" | "unknown";
  title: string;
  detail: string;
};

export function getDeliveryVerdict(recent: {
  total: number;
  bounced: number;
  complained: number;
  failed: number;
  suppressed: number;
}): DeliveryVerdict {
  if (recent.total === 0) {
    return {
      level: "unknown",
      title: "Nothing sent in the last 30 days",
      detail: "Delivery health is measured on recent mail. Send an invite or a reminder and check back.",
    };
  }

  const problems = recent.bounced + recent.complained + recent.failed + recent.suppressed;
  const problemRate = problems / recent.total;

  if (recent.complained > 0 || problemRate >= 0.05) {
    return {
      level: "attention",
      title: "Delivery needs attention",
      detail:
        recent.complained > 0
          ? "Someone marked an email as spam. Check who, and stop mailing that address."
          : `${problems} of ${recent.total} recent emails did not arrive. Clean up the addresses below before the next send.`,
    };
  }

  if (problemRate >= 0.02) {
    return {
      level: "watch",
      title: "Mostly delivered, a few bounces",
      detail: `${problems} of ${recent.total} recent emails bounced or failed. Fix the addresses so the sender reputation stays clean.`,
    };
  }

  return {
    level: "healthy",
    title: "Delivery is healthy",
    detail: `${recent.total - problems} of ${recent.total} recent emails reached the inbox.`,
  };
}
