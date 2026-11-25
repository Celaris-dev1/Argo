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

/** The shared page as a Markdown file, named after its prompt. */
export function shareMarkdown(share: RunShare): { name: string; text: string } {
  const slug =
    share.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "report";
  return {
    name: `${slug}.md`,
    text: `# ${share.prompt}\n\n${share.result}\n\n---\nMade with Argo · https://argoai.top\n`,
  };
}

function download(share: RunShare) {
  const { name, text } = shareMarkdown(share);
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
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
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => share.data && download(share.data)}>
              <Trans>Download</Trans>
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Trans>Print</Trans>
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">
            <Trans>Made with Argo</Trans>
          </p>
        </>
      )}
      <footer className="flex flex-wrap gap-2 border-t border-border pt-6 print:hidden">
        <Button render={<Link to="/sign-up" />}>
          <Trans>Get your own bot</Trans>
        </Button>
        <Button
          variant="ghost"
          render={
            <a href="https://github.com/celaris-dev1/argo" target="_blank" rel="noreferrer" />
          }
        >
          <Trans>Star on GitHub</Trans>
        </Button>
      </footer>
    </main>
  );
}
