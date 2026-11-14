import type { RunShare } from "@argo/contracts";
import { RunShareSchema } from "@argo/contracts";
import { Button, Spinner } from "@argo/ui-web";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

async function loadShare(id: string): Promise<RunShare | null> {
  const response = await fetch(`/api/v1/shares/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(String(response.status));
  return RunShareSchema.parse(await response.json());
}

/** A run its owner chose to publish: what was asked, what the bot did, and the result. */
export function SharedRunPage() {
  const { t } = useLingui();
  const { shareId = "" } = useParams();
  const share = useQuery({ queryKey: ["run-share", shareId], queryFn: () => loadShare(shareId) });
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-10">
      {share.isPending ? (
        <Spinner aria-label={t`Loading`} />
      ) : !share.data ? (
        <p className="text-muted-foreground">
          {share.error ? t`Could not load this page.` : t`This link is no longer shared.`}
        </p>
      ) : (
        <>
          <header className="space-y-2">
            <p className="text-[13px] text-muted-foreground">{share.data.botName}</p>
            <h1 className="text-xl font-semibold text-foreground">{share.data.prompt}</h1>
          </header>
          {share.data.steps.length > 0 ? (
            <ol className="space-y-1 rounded-xl border border-border p-3 text-[13px]">
              {share.data.steps.map((step, index) => (
                <li key={`${step.label}-${index}`} className="flex gap-2">
                  <span aria-hidden="true">{step.outcome === "success" ? "✓" : "⊘"}</span>
                  <span className="text-foreground">{step.label}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <article className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {share.data.result}
          </article>
        </>
      )}
      <footer className="border-t border-border pt-6">
        <Button render={<Link to="/sign-up" />}>
          <Trans>Get your own bot</Trans>
        </Button>
      </footer>
    </main>
  );
}
