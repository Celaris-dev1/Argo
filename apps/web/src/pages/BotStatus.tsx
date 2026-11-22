import type { BotStatus } from "@argo/contracts";
import { BotStatusSchema } from "@argo/contracts";
import { Spinner } from "@argo/ui-web";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

async function loadStatus(id: string): Promise<BotStatus | null> {
  const response = await fetch(`/api/v1/status/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(String(response.status));
  return BotStatusSchema.parse(await response.json());
}

/** A bot's public profile: what it is for, what it finished recently and what its owner shared. */
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
          <header className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-foreground">{status.data.botName}</h1>
            {status.data.description ? (
              <p className="text-[14px] text-foreground">{status.data.description}</p>
            ) : null}
            {status.data.completed > 0 ? (
              <p className="text-[13px] text-muted-foreground">
                <Plural
                  value={status.data.completed}
                  one="# task finished"
                  other="# tasks finished"
                />
              </p>
            ) : null}
          </header>
          {status.data.shared.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[14px] font-medium text-foreground">
                <Trans>Shared results</Trans>
              </h2>
              <ul className="divide-y divide-border rounded-xl border border-border text-[14px]">
                {status.data.shared.map((share) => (
                  <li key={share.id}>
                    <Link
                      to={`/r/${encodeURIComponent(share.id)}`}
                      className="flex justify-between gap-4 px-3 py-2 hover:bg-muted"
                    >
                      <span className="text-foreground">{share.title}</span>
                      <time className="shrink-0 text-muted-foreground" dateTime={share.at}>
                        {i18n.date(share.at, { month: "short", day: "numeric" })}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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
          <Link to="/" className="text-[13px] text-muted-foreground hover:text-foreground">
            <Trans>Made with Argo</Trans>
          </Link>
        </>
      )}
    </main>
  );
}
