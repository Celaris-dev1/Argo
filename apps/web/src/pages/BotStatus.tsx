import type { BotStatus } from "@argo/contracts";
import { BotStatusSchema } from "@argo/contracts";
import { BotAvatar, buttonVariants, Spinner } from "@argo/ui-web";
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
  const day = (at: string) => i18n.date(at, { month: "short", day: "numeric" });
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-4 py-12">
      {status.isPending ? (
        <Spinner aria-label={t`Loading`} />
      ) : !status.data ? (
        <p className="text-muted-foreground">
          {status.error ? t`Could not load this page.` : t`This link is no longer shared.`}
        </p>
      ) : (
        <>
          <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
            <BotAvatar
              color={status.data.color}
              avatarSet={status.data.avatarSet}
              identity={statusId}
              status={status.data.working ? "running" : undefined}
              size={88}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="text-2xl font-semibold text-foreground">{status.data.botName}</h1>
              {status.data.description ? (
                <p className="text-[15px] text-foreground">{status.data.description}</p>
              ) : null}
              <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground sm:justify-start">
                {status.data.working ? (
                  <span className="flex items-center gap-1.5 text-success">
                    <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden />
                    <Trans>Working now</Trans>
                  </span>
                ) : null}
                {status.data.completed > 0 ? (
                  <span>
                    <Plural
                      value={status.data.completed}
                      one="# task finished"
                      other="# tasks finished"
                    />
                  </span>
                ) : null}
              </p>
            </div>
          </header>

          {status.data.shared.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-[14px] font-medium text-foreground">
                <Trans>Shared results</Trans>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {status.data.shared.map((share) => (
                  <li key={share.id}>
                    <Link
                      to={`/r/${encodeURIComponent(share.id)}`}
                      className="flex h-full flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 text-[14px] transition-colors hover:bg-muted"
                    >
                      <span className="font-medium text-card-foreground">{share.title}</span>
                      <time className="text-[12px] text-muted-foreground" dateTime={share.at}>
                        {day(share.at)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {status.data.tasks.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-[14px] font-medium text-foreground">
                <Trans>Recent tasks</Trans>
              </h2>
              <ol className="divide-y divide-border rounded-xl border border-border bg-card text-[14px]">
                {status.data.tasks.map((task, index) => (
                  <li
                    key={`${task.at}-${index}`}
                    className="flex justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="min-w-0 text-card-foreground">{task.title}</span>
                    <time className="shrink-0 text-muted-foreground" dateTime={task.at}>
                      {day(task.at)}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
            <Link to="/" className="text-[13px] text-muted-foreground hover:text-foreground">
              <Trans>Made with Argo</Trans>
            </Link>
            <Link to="/sign-up" className={buttonVariants({ size: "sm" })}>
              <Trans>Create your bot</Trans>
            </Link>
          </footer>
        </>
      )}
    </main>
  );
}
