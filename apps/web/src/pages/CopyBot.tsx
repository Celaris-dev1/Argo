import { Spinner } from "@argo/ui-web";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { rpc } from "../lib/rpc";

/** Copies a published bot into the signed-in account, then opens it. */
export function CopyBotPage() {
  const { t } = useLingui();
  const { statusId = "" } = useParams();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    rpc.bots
      .copyPublished({ statusId })
      .then((bot) => navigate(`/app/${bot.id}`, { replace: true }))
      .catch(() => setFailed(true));
  }, [statusId, navigate]);
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-4 py-12">
      {failed ? (
        <>
          <p className="text-muted-foreground">{t`This bot can no longer be copied.`}</p>
          <Link to="/app" className="text-sm underline">{t`Open Argo`}</Link>
        </>
      ) : (
        <Spinner aria-label={t`Copying`} />
      )}
    </main>
  );
}
