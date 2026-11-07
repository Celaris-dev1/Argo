import type { TermsOfUse } from "@argo/contracts";
import { Button, Checkbox } from "@argo/ui-web";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { loadMe } from "../lib/me";
import { rpc } from "../lib/rpc";

/**
 * Holds the app until the account accepts the operator's Terms of Use, when the
 * deployment sets them. The API refuses AI requests until then, so a failed lookup
 * here falls through to the app.
 */
export function TermsGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [pending, setPending] = useState<TermsOfUse | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    loadMe()
      .then((me) => me.pendingTerms ?? null)
      .catch(() => null)
      .then((terms) => {
        if (active) setPending(terms);
      });
    return () => {
      active = false;
    };
  }, []);
  if (pending === undefined) return fallback;
  if (pending) return <TermsPrompt terms={pending} onAccepted={() => setPending(null)} />;
  return children;
}

export function TermsPrompt({ terms, onAccepted }: { terms: TermsOfUse; onAccepted: () => void }) {
  const id = useId();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      className="flex min-h-full items-center bg-background px-6 py-12"
      data-argo-surface="terms"
    >
      <form
        className="mx-auto w-full max-w-[440px]"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          rpc.terms.accept({ version: terms.version }).then(onAccepted, (cause: unknown) => {
            setError(cause instanceof Error ? cause.message : String(cause));
            setBusy(false);
          });
        }}
      >
        <h1 className="text-[32px] font-medium text-foreground">
          <Trans>Terms of Use</Trans>
        </h1>
        <label htmlFor={id} className="mt-8 flex items-start gap-3 text-sm text-foreground">
          <Checkbox
            id={id}
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked === true)}
            className="mt-0.5"
          />
          <span>
            <Trans>
              I'm 18 or older and agree to the{" "}
              <a href={terms.url} target="_blank" rel="noreferrer" className="underline">
                Terms of Use
              </a>
              .
            </Trans>
          </span>
        </label>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="mt-8" disabled={!agreed || busy}>
          <Trans>Continue</Trans>
        </Button>
      </form>
    </div>
  );
}
