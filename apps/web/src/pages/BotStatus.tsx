import type { BotStatus } from "@argo/contracts";
import { BotStatusSchema } from "@argo/contracts";
import { Spinner } from "@argo/ui-web";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

async function loadStatus(id: string): Promise<BotStatus | null> {
  const response = await fetch(`/api/v1/status/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(String(response.status));
  return BotStatusSchema.parse(await response.json());
}

/** A bot's published status: the titles of what it finished recently. */
export function BotStatusPage() {
  const { t, i18n } = useLingui();
  const { statusId = "" } = useParams();
  const status = useQuery({
    queryKey: ["bot-status", statusId],
    queryFn: () => loadStatus(statusId),
  });
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-10">
      {status.isPending ? (
        <Spinner aria-label={t`Loading`} />
      ) : !status.data ? (
        <p className="text-muted-foreground">
          {status.error ? t`Could not load this page.` : t`This link is no longer shared.`}
        </p>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-foreground">{status.data.botName}</h1>
          <ol className="divide-y divide-border rounded-xl border border-border text-[14px]">
            {status.data.tasks.map((task, index) => (
              <li key={`${task.at}-${index}`} className="flex justify-between gap-4 px-3 py-2">
                <span className="text-foreground">{task.title}</span>
                <time className="shrink-0 text-muted-foreground" dateTime={task.at}>
                  {i18n.date(task.at, { month: "short", day: "numeric" })}
                </time>
              </li>
            ))}
          </ol>
          <p className="text-[13px] text-muted-foreground">
            <Trans>Made with Argo</Trans>
          </p>
        </>
      )}
    </main>
  );
}
