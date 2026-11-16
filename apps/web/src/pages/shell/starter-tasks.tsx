import { Button } from "@argo/ui-web";

/** One-tap first tasks shown above the composer while a chat is still empty. */
export function StarterTasks({
  starters,
  onPick,
}: {
  starters: readonly string[];
  onPick: (text: string) => void;
}) {
  if (starters.length === 0) return null;
  return (
    <div
      className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap justify-center gap-2 px-6 pb-3"
      data-testid="starter-tasks"
    >
      {starters.map((text) => (
        <Button
          key={text}
          type="button"
          variant="outline"
          size="sm"
          className="h-auto max-w-full rounded-full px-3 py-1.5 text-left text-[13px] font-normal whitespace-normal"
          onClick={() => onPick(text)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
}
