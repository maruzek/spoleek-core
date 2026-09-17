import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  GlobeIcon,
  HelpCircleIcon,
  WebhookIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, StatDescription, StatGroup, StatIndicator, StatLabel, StatValue } from "@/components/ui/stat";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { getDeliveryVerdict } from "@/lib/email-health";
import { cn } from "@/lib/utils";
import type { OrganizationEmailHealth, ProviderEmailHealth } from "@/server/queries/email-health";

const VERDICT_ICON = {
  healthy: CheckCircle2Icon,
  watch: AlertTriangleIcon,
  attention: AlertTriangleIcon,
  unknown: HelpCircleIcon,
} as const;

const VERDICT_TONE = {
  healthy: "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300",
  watch: "border-orange-500/30 bg-orange-500/5 text-orange-800 dark:text-orange-300",
  attention: "border-destructive/30 bg-destructive/5 text-destructive",
  unknown: "",
} as const;

function statusVariant(status: string) {
  switch (status) {
    case "verified":
    case "enabled":
    case "delivered":
      return "success" as const;
    case "pending":
    case "not_started":
    case "temporary_failure":
    case "delivery_delayed":
      return "warning" as const;
    case "failed":
    case "disabled":
    case "bounced":
    case "complained":
      return "error" as const;
    default:
      return "default" as const;
  }
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

/**
 * Two halves. The top half is this organization's own record, which any org
 * admin may see. The bottom half is what Resend says about the shared sending
 * account, and the page only receives it for system admins.
 */
export function EmailHealth({
  organization,
  provider,
}: {
  organization: OrganizationEmailHealth;
  provider: ProviderEmailHealth | null;
}) {
  const verdict = getDeliveryVerdict(organization.recent);
  const VerdictIcon = VERDICT_ICON[verdict.level];
  const { recent, allTime } = organization;
  const recentProblems = recent.bounced + recent.complained + recent.failed + recent.suppressed;

  return (
    <div className="flex flex-col gap-8">
      <Alert className={cn(VERDICT_TONE[verdict.level])}>
        <VerdictIcon />
        <AlertTitle className="text-base">{verdict.title}</AlertTitle>
        <AlertDescription className="text-current/80">{verdict.detail}</AlertDescription>
      </Alert>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold">Last 30 days</h2>
          <p className="text-sm text-muted-foreground">Outbound email recorded by Spoleek for this organization.</p>
        </div>
        <StatGroup columns={4}>
          <Stat>
            <StatLabel>Sent</StatLabel>
            <StatValue>{recent.total}</StatValue>
            <StatDescription>{allTime.total} all time</StatDescription>
          </Stat>
          <Stat>
            <StatLabel>Delivered</StatLabel>
            <StatValue tone={recent.delivered > 0 ? "success" : "default"}>{recent.delivered}</StatValue>
            <StatDescription>
              {recent.sent > 0 ? `${recent.sent} accepted, no delivery event yet` : "confirmed by the provider"}
            </StatDescription>
          </Stat>
          <Stat>
            <StatLabel>Problems</StatLabel>
            <StatValue tone={recentProblems > 0 ? "danger" : "default"}>{recentProblems}</StatValue>
            <StatDescription>
              {recentProblems > 0
                ? [
                    recent.bounced > 0 && `${recent.bounced} bounced`,
                    recent.complained > 0 && `${recent.complained} complained`,
                    recent.failed > 0 && `${recent.failed} failed`,
                    recent.suppressed > 0 && `${recent.suppressed} suppressed`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "nothing bounced, failed or was reported"}
            </StatDescription>
          </Stat>
          <Stat>
            <StatLabel>Problem rate</StatLabel>
            <StatValue
              tone={
                organization.recentProblemRate === null
                  ? "default"
                  : organization.recentProblemRate >= 5
                    ? "danger"
                    : organization.recentProblemRate >= 2
                      ? "warning"
                      : "success"
              }
            >
              {organization.recentProblemRate === null ? "—" : `${organization.recentProblemRate}%`}
            </StatValue>
            <StatDescription>providers throttle senders above roughly 2%</StatDescription>
          </Stat>
        </StatGroup>
      </section>

      {provider ? <ProviderSection provider={provider} /> : null}
    </div>
  );
}

function ProviderSection({ provider }: { provider: ProviderEmailHealth }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Sending account</h2>
        <p className="text-sm text-muted-foreground">
          Live from the Resend API. Shared by every organization on this instance, so only system admins see it.
        </p>
      </div>

      {!provider.configured ? (
        <Alert>
          <HelpCircleIcon />
          <AlertTitle>Resend is not configured</AlertTitle>
          <AlertDescription>Set RESEND_API_KEY to read domain and webhook status here.</AlertDescription>
        </Alert>
      ) : provider.error !== null ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Resend did not answer</AlertTitle>
          <AlertDescription>{provider.error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <StatGroup variant="strip" columns={4}>
            <Stat>
              <StatLabel>Domains</StatLabel>
              <StatValue>{provider.domains.length}</StatValue>
              <StatIndicator variant="icon">
                <GlobeIcon />
              </StatIndicator>
              <StatDescription>
                {provider.domains.filter((d) => d.status === "verified").length} verified
              </StatDescription>
            </Stat>
            <Stat>
              <StatLabel>Webhooks</StatLabel>
              <StatValue>{provider.webhooks.length}</StatValue>
              <StatIndicator variant="icon">
                <WebhookIcon />
              </StatIndicator>
              <StatDescription>
                {provider.webhooks.filter((w) => w.status === "enabled").length} enabled — these feed the statuses above
              </StatDescription>
            </Stat>
            <Stat>
              <StatLabel>Recent emails</StatLabel>
              <StatValue>{provider.recentSample}</StatValue>
              <StatIndicator variant="icon">
                <ActivityIcon />
              </StatIndicator>
              <StatDescription>most recent across the whole account</StatDescription>
            </Stat>
            <Stat>
              <StatLabel>Delivered</StatLabel>
              <StatValue tone="success">{provider.recentByLastEvent.delivered ?? 0}</StatValue>
              <StatDescription>
                {Object.entries(provider.recentByLastEvent)
                  .filter(([event]) => event !== "delivered")
                  .map(([event, n]) => `${n} ${humanize(event)}`)
                  .join(" · ") || "every recent email landed"}
              </StatDescription>
            </Stat>
          </StatGroup>

          <div className="grid gap-4 md:grid-cols-2">
            {provider.domains.map((domain) => (
              <Card key={domain.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {domain.name}
                    <Status variant={statusVariant(domain.status)}>
                      <StatusIndicator />
                      <StatusLabel>{humanize(domain.status)}</StatusLabel>
                    </Status>
                  </CardTitle>
                  <CardDescription>Region {domain.region}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {domain.records.map((record) => (
                      <li
                        key={`${record.record}-${record.name}`}
                        className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">
                            {record.record} <span className="font-normal text-muted-foreground">· {record.type}</span>
                          </p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{record.name}</p>
                        </div>
                        <Status variant={statusVariant(record.status)}>
                          <StatusIndicator />
                          <StatusLabel>{humanize(record.status)}</StatusLabel>
                        </Status>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Webhooks</CardTitle>
                <CardDescription>Resend calls these when an email bounces, is delivered or is reported.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {provider.webhooks.length === 0 ? (
                  <p className="px-4 pb-2 text-sm text-muted-foreground">
                    None registered — statuses in Spoleek will stay at &ldquo;sent&rdquo;.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {provider.webhooks.map((hook) => (
                      <li key={hook.id} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs">{hook.endpoint}</p>
                          <p className="text-xs text-muted-foreground">
                            {hook.events.length} event{hook.events.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <Status variant={statusVariant(hook.status)}>
                          <StatusIndicator />
                          <StatusLabel>{hook.status}</StatusLabel>
                        </Status>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
