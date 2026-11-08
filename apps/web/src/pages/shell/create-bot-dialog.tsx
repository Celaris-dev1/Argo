import { Trans, useLingui } from "@lingui/react/macro";
import type { BotAvatarSet, BotKind } from "@argo/contracts";
import {
  BOT_KINDS,
  BOT_NAME_MAX_LENGTH,
  DEFAULT_NEW_BOT_AVATAR_SET,
} from "@argo/contracts";
import {
  newClientId,
  ORGANIC_AVATAR_HEART_FAMILY,
  ORGANIC_AVATAR_LOOKS,
  organicAvatarFamily,
  organicAvatarSampleIdentity,
} from "@argo/core";
import {
  BOT_AVATAR_COLORS,
  BotAvatar,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  parseBotAvatar,
} from "@argo/ui-web";
import { useRef, useState } from "react";
import { errorText } from "../../lib/user-error";
import { BotLookPicker } from "./avatar-studio-popover";

/** One preview identity per organic look, so the dialog can show a body before the bot has an id. */
const ORGANIC_IDENTITIES = ORGANIC_AVATAR_LOOKS.map(
  organicAvatarSampleIdentity,
);

function pick<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)]!;
}

export interface CreateBotDialogInput {
  name: string;
  color: string;
  /** Reserve the logo preview's persistent seed through creation and retries. */
  id?: string;
  avatarSet: BotAvatarSet;
  /** The organic family the preview drew; omitted when a studio shape is picked. */
  avatarFamily?: number;
  description?: string;
  instructions?: string;
}

/** Mounted only while open; the parent unmounts it from `onCancel` or after `onCreate`. */
export function CreateBotDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (input: CreateBotDialogInput) => Promise<void>;
}) {
  const { t } = useLingui();
  const nameRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<BotKind | null>(null);
  const [name, setName] = useState("");
  const [previewId] = useState(() => {
    let id: string;
    do {
      id = `c${newClientId().replaceAll("-", "").slice(0, 24)}`;
    } while (organicAvatarFamily(id) === ORGANIC_AVATAR_HEART_FAMILY);
    return id;
  });
  const [look, setLook] = useState(() => ({
    value: pick(BOT_AVATAR_COLORS),
    identity: pick(ORGANIC_IDENTITIES),
  }));
  const [avatarSet, setAvatarSet] = useState<BotAvatarSet>(
    DEFAULT_NEW_BOT_AVATAR_SET,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed =
    name.trim() || (kind && kind.id !== "custom" ? kind.name : "");

  async function create() {
    if (!trimmed || submitting) return;
    setError(null);
    setSubmitting(true);
    const organic =
      avatarSet === "organic" &&
      parseBotAvatar(look.value).shapeIndex === undefined;
    try {
      await onCreate({
        name: trimmed,
        color: look.value,
        ...(avatarSet === "argo" ? { id: previewId } : {}),
        avatarSet,
        ...(organic
          ? { avatarFamily: organicAvatarFamily(look.identity) }
          : {}),
        ...(kind?.instructions
          ? { description: kind.description, instructions: kind.instructions }
          : {}),
      });
    } catch (err) {
      setError(errorText(err, t`Could not create bot`));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        initialFocus={nameRef}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        data-testid="create-bot-dialog"
      >
        {kind === null ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-center">
                <Trans>What kind of bot?</Trans>
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2" data-testid="bot-kind-grid">
              {BOT_KINDS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-testid={`bot-kind-${option.id}`}
                  onClick={() => {
                    setKind(option);
                    queueMicrotask(() => nameRef.current?.focus());
                  }}
                  className="rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="block text-sm font-medium">
                    {option.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>
                <Trans>Cancel</Trans>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-center">
                <Trans>New bot</Trans>
              </DialogTitle>
            </DialogHeader>
            <div className="flex justify-center py-2">
              <BotAvatar
                color={look.value}
                identity={avatarSet === "argo" ? previewId : look.identity}
                size={96}
                avatarSet={avatarSet}
              />
            </div>
            <Input
              ref={nameRef}
              aria-label={t`Name`}
              placeholder={kind.id === "custom" ? t`Name your Bot` : kind.name}
              value={name}
              maxLength={BOT_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              className="text-center"
            />
            {error ? (
              <p
                role="alert"
                data-testid="create-bot-error"
                className="text-[13px] text-destructive"
              >
                {error}
              </p>
            ) : null}
            <BotLookPicker
              value={look.value}
              identity={avatarSet === "argo" ? previewId : look.identity}
              organicIdentities={ORGANIC_IDENTITIES}
              avatarSet={avatarSet}
              onAvatarSetChange={(set, value) => {
                setAvatarSet(set);
                setLook((current) => ({ ...current, value }));
              }}
              onChange={(value, identity) => {
                setLook((current) => ({
                  value,
                  identity: identity ?? current.identity,
                }));
              }}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setKind(null)}
              >
                <Trans>Back</Trans>
              </Button>
              <Button type="submit" disabled={!trimmed || submitting}>
                <Trans>Create</Trans>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
