import type {
  AdapterContext,
  ComputerRef,
  ProcessEvent,
  SandboxProvider,
} from "@argo/adapter-kit";
import { redactSecrets } from "@argo/core";
import { shellCommandEnvironment } from "./bot-secrets.js";
import { resolveBotWorkspaceCwd } from "./computer-support.js";
import { findConnectedModelCredential, runModelChoice } from "./model-selection.js";
import type { RunContext } from "./run-context.js";
import { addRunSecrets } from "./run-context.js";
import { resolveModelKey } from "./run-model.js";
import type { ToolHandlers } from "./run-tool-gate.js";
import { postWorkStatus, WORK_STATUS_INTERVAL_MS } from "./work-status.js";

const SUMMARY_MAX = 8_000;
const PROMPT_MAX = 20_000;
/** One sitting. The next call keeps polling the same process instead of starting over. */
const CODING_ALONE_MS = 6 * 60 * 60 * 1000;
const CODING_POLL_MS = 4_000;

const ALONE =
  "Work alone until this is finished. Do not ask the user questions, do not wait for permission, and do not stop to confirm a choice. Decide and continue. If a command fails, fix it and keep going. Stop only when the task is done or you are blocked by something only the user can provide, such as a missing secret. The desktop browser is Chromium; leave its profile in place. If a page shows a CAPTCHA, run argo-captcha or click the challenge yourself and continue. Do not ask the user to solve one.";

/**
 * Finish protocol, after dori-superagent's lanes (https://github.com/sisyphuslabs/dori-superagent,
 * MIT): no "done" without proof. Argo checks for these lines when the session ends.
 */
const FINISH =
  "When you finish, end your last message with these lines:\nREADY: <one line saying what is now true>\nEVIDENCE: <proof, one per line: the test or build command you ran and its result, a commit SHA, a PR or deploy URL, or the files you changed>\nIf you cannot finish, end with BLOCKED: <the one thing only the user can provide> instead. Never write READY without evidence you produced in this session.";

export type CodingVerdict =
  | { kind: "ready"; result: string; evidence: string[] }
  | { kind: "blocked"; reason: string }
  | { kind: "unproven" };

/** Reads the READY / EVIDENCE / BLOCKED lines from the session's final message. */
export function parseCodingVerdict(summary: string): CodingVerdict {
  const lines = summary.split("\n").map((line) => line.trim());
  const blocked = lines.findLast((line) => /^\**BLOCKED\**:/i.test(line));
  const readyIndex = lines.findLastIndex((line) => /^\**READY\**:/i.test(line));
  if (blocked && (readyIndex < 0 || lines.lastIndexOf(blocked) > readyIndex)) {
    return { kind: "blocked", reason: blocked.replace(/^\**BLOCKED\**:\s*/i, "") };
  }
  if (readyIndex < 0) return { kind: "unproven" };
  const result = (lines[readyIndex] ?? "").replace(/^\**READY\**:\s*/i, "");
  const evidence: string[] = [];
  let inEvidence = false;
  for (const line of lines.slice(readyIndex + 1)) {
    const head = line.match(/^\**EVIDENCE\**:\s*(.*)$/i);
    if (head) {
      inEvidence = true;
      if (head[1]) evidence.push(head[1]);
      continue;
    }
    if (inEvidence && line) evidence.push(line.replace(/^[-*•]\s*/, ""));
  }
  if (!result || evidence.length === 0) return { kind: "unproven" };
  return { kind: "ready", result, evidence };
}

/** Minutes of silence before a status note, a second note, and stopping the session. */
export function codingStallMinutes(value = process.env.ARGO_CODING_STALL_MINUTES): number[] {
  const parsed = (value ?? "10,20,40")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  return parsed.length ? parsed : [10, 20, 40];
}

const EVIDENCE_SESSION = `set -u
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "head: $(git log -1 --format='%h %s' 2>/dev/null)"
  git status --porcelain 2>/dev/null | head -40
fi`;

const START_SESSION = `set -u
pidfile="$1"
logfile="$2"
shift 2
if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
  echo already
  exit 0
fi
if command -v opencode >/dev/null 2>&1; then bin=opencode
elif command -v kilo >/dev/null 2>&1; then bin=kilo
else echo "coding mode needs OpenCode or Kilo on this computer" >&2; exit 127
fi
if [ -x /usr/local/bin/lightpanda ]; then
  port="\${ARGO_CDP_PORT:-9222}"
  if ! curl -sf -o /dev/null --max-time 0.4 "http://127.0.0.1:$port/json/version"; then
    nohup /usr/local/bin/lightpanda serve --host 127.0.0.1 --port "$port" >/tmp/argo-lightpanda.log 2>&1 &
  fi
fi
: > "$logfile"
nohup "$bin" run --auto --format json "$@" </dev/null >> "$logfile" 2>&1 &
echo $! > "$pidfile"
echo started`;

const POLL_SESSION = `set -u
pidfile="$1"
logfile="$2"
if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then echo ALIVE; else echo DEAD; fi
if [ -f "$logfile" ]; then tail -c 80000 "$logfile"; fi`;

const STOP_SESSION = `set -u
pidfile="$1"
if [ -f "$pidfile" ]; then kill "$(cat "$pidfile")" 2>/dev/null || true; fi`;

/** OpenCode and Kilo (its fork) read these. A saved command secret overrides them. */
const PROVIDER_KEY_ENV: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  xai: ["XAI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
};

/** Opens the OpenCode desktop app, or the CLI in a window on the computer screen. */
export const CODING_SURFACE_LAUNCH = `set -u
if command -v xdotool >/dev/null 2>&1 && DISPLAY="\${DISPLAY:-:1}" xdotool search --name OpenCode >/dev/null 2>&1; then
  DISPLAY="\${DISPLAY:-:1}" xdotool search --name OpenCode windowactivate >/dev/null 2>&1 || true
  if command -v opencode-desktop >/dev/null 2>&1; then echo desktop; else echo cli; fi
  exit 0
fi
if command -v opencode-desktop >/dev/null 2>&1; then
  DISPLAY="\${DISPLAY:-:1}" nohup opencode-desktop >/tmp/argo-opencode-desktop.log 2>&1 &
  echo desktop
  exit 0
fi
if command -v opencode >/dev/null 2>&1; then bin=opencode
elif command -v kilo >/dev/null 2>&1; then bin=kilo
else echo "coding mode needs OpenCode or Kilo on this computer" >&2; exit 127
fi
DISPLAY="\${DISPLAY:-:1}" nohup xterm -T OpenCode -fa Monospace -fs 12 -e "$bin" >/tmp/argo-opencode-cli.log 2>&1 &
echo cli`;

export async function openCodingSurface(
  sandbox: SandboxProvider,
  computer: ComputerRef,
  context: AdapterContext,
  cwd?: string,
): Promise<"desktop" | "cli"> {
  let stdout = "";
  let stderr = "";
  let exitCode = 1;
  const events = sandbox.execute(
    computer,
    { argv: ["bash", "-c", CODING_SURFACE_LAUNCH], cwd, timeoutMs: 20_000 },
    context,
  );
  for await (const event of events) {
    if (event.type === "stdout") stdout += event.data;
    else if (event.type === "stderr") stderr += event.data;
    else if (event.type === "exit") exitCode = event.code;
  }
  const surface = stdout.trim().split("\n").pop()?.trim();
  if (exitCode !== 0 || (surface !== "desktop" && surface !== "cli")) {
    throw new Error(stderr.trim() || "Could not open coding mode");
  }
  return surface;
}

const textOf = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function commandOf(state: Record<string, unknown> | undefined): string {
  const input =
    state?.input && typeof state.input === "object"
      ? (state.input as Record<string, unknown>)
      : undefined;
  return textOf(input?.command) || textOf(input?.cmd) || textOf(state?.command);
}

/** One OpenCode JSON event, as a status line and the latest reply text. */
export function codingEventUpdate(line: string): { status?: string; summary?: string } {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return {};
  let event: unknown;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return {};
  }
  if (!event || typeof event !== "object") return {};
  const record = event as Record<string, unknown>;
  const part =
    record.part && typeof record.part === "object"
      ? (record.part as Record<string, unknown>)
      : undefined;
  const type = String(part?.type ?? record.type ?? "");
  if (
    type === "step-start" ||
    type === "step_start" ||
    type === "step-finish" ||
    type === "step_finish"
  ) {
    return {};
  }
  const text = textOf(part?.text);
  if ((type === "text" || type === "text-delta") && text) return { summary: text };
  if (type === "tool" || type.includes("tool")) {
    const tool = String(part?.tool ?? record.tool ?? record.name ?? "tool");
    const state =
      part?.state && typeof part.state === "object"
        ? (part.state as Record<string, unknown>)
        : undefined;
    const command = commandOf(state);
    if (command && /bash|shell|terminal/i.test(tool)) return { status: `Running: ${command}` };
    const title = textOf(state?.title) || textOf(part?.title) || textOf(record.title);
    const detail = (command || title).replace(/\s+/g, " ").trim();
    return { status: detail ? `${tool}: ${detail}` : tool };
  }
  if (type === "error" || type === "session.error") {
    const message =
      textOf(record.error) || textOf(record.message) || textOf(part?.error) || "failed";
    return { status: `error: ${message}` };
  }
  return {};
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

async function codingProviderEnv(
  ctx: RunContext,
): Promise<{ env: Record<string, string>; model?: string }> {
  const choice = runModelChoice(ctx.run, ctx.bot);
  const provider = choice.modelProvider?.trim();
  const modelId = choice.modelId?.trim();
  const names = provider ? PROVIDER_KEY_ENV[provider] : undefined;
  if (!provider || !modelId || !names) return { env: {} };
  try {
    const credential = await findConnectedModelCredential(
      ctx.deps.prisma,
      ctx.deps.secretStore,
      ctx.run,
      provider,
      modelId,
    );
    const resolved = await resolveModelKey(
      ctx.deps,
      ctx.run.userId,
      ctx.run.spaceId,
      credential,
      provider,
      modelId,
      (values) => addRunSecrets(ctx, values),
    );
    const apiKey = resolved.apiKey?.trim();
    if (!apiKey) return { env: {} };
    addRunSecrets(ctx, [apiKey]);
    const env: Record<string, string> = {};
    for (const name of names) env[name] = apiKey;
    const model = modelId.includes("/") ? modelId : `${provider}/${modelId}`;
    return { env, model };
  } catch {
    return { env: {} };
  }
}

/** OpenCode (or Kilo, if that binary is what is installed) does the software work. */
export const codingTools: ToolHandlers = {
  async code(ctx, call) {
    const { deps, run, bot, context } = ctx;
    const { name, args } = call;
    const prompt = String(args.prompt ?? args.task ?? "").trim();
    if (!prompt) return call.finish({ error: "prompt is required" });
    if (prompt.length > PROMPT_MAX) {
      return call.finish({ error: `prompt is longer than ${PROMPT_MAX} characters` });
    }
    const requestedModel = args.model ? String(args.model).trim() : "";
    const cwd = resolveBotWorkspaceCwd(
      ctx.computer.mode,
      bot.id,
      args.cwd ? String(args.cwd) : undefined,
    );
    const headline = prompt.split("\n", 1)[0] ?? "software task";
    await postWorkStatus(ctx, `Coding — ${headline}`);
    const commandEnvironment = await shellCommandEnvironment({
      prisma: deps.prisma,
      secretStore: deps.secretStore,
      scope: run,
      registerRedactions: (values) => addRunSecrets(ctx, values),
    });
    const provider = await codingProviderEnv(ctx);
    const model = requestedModel || provider.model;
    const env = { ...provider.env, ...commandEnvironment.env, OPENCODE_DISABLE_AUTOUPDATE: "1" };
    ctx.computer.checkpoint.markDirty();
    const computer = await ctx.computer.get("tool", name);
    const surface = await openCodingSurface(deps.sandbox, computer, context, cwd).catch(
      () => undefined,
    );
    if (surface) {
      await postWorkStatus(
        ctx,
        surface === "desktop" ? "Coding — OpenCode desktop" : "Coding — OpenCode CLI",
      );
    }
    const pidfile = `/tmp/argo-code-${bot.id}.pid`;
    const logfile = `/tmp/argo-code-${bot.id}.log`;
    const task = `${ALONE}\n\n${FINISH}\n\n${prompt}`;
    let summary = "";
    let lastStatus = "";
    let parsedMark = "";
    let stderr = "";
    const takeChunk = (chunk: string) => {
      let fresh = chunk;
      if (parsedMark) {
        const at = chunk.lastIndexOf(parsedMark);
        fresh = at >= 0 ? chunk.slice(at + parsedMark.length) : chunk;
      }
      if (chunk) parsedMark = chunk.slice(-200);
      let pending = "";
      const lines = fresh.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const update = codingEventUpdate(line);
        if (update.summary) summary = update.summary;
        if (!update.status || update.status === lastStatus) continue;
        lastStatus = update.status;
        void postWorkStatus(ctx, `Coding — ${update.status}`);
      }
      if (pending.trim()) {
        const update = codingEventUpdate(pending);
        if (update.summary) summary = update.summary;
      }
    };
    const runShort = async (argv: string[], withEnv: boolean) => {
      let stdout = "";
      let err = "";
      let code = 1;
      const events: AsyncIterable<ProcessEvent> = deps.sandbox.execute(
        computer,
        {
          argv,
          cwd,
          ...(withEnv ? { env, unsetEnv: commandEnvironment.unsetEnv } : {}),
          timeoutMs: 20_000,
        },
        context,
      );
      for await (const event of events) {
        if (event.type === "stdout") stdout += event.data;
        else if (event.type === "stderr") err += event.data;
        else if (event.type === "exit") code = event.code;
      }
      return { stdout, stderr: err, code };
    };
    const pulse = setInterval(() => {
      void postWorkStatus(
        ctx,
        lastStatus ? `Still working — Coding — ${lastStatus}` : "Still working — Coding",
        { keepActivity: true },
      );
    }, WORK_STATUS_INTERVAL_MS);
    pulse.unref?.();
    const stop = () =>
      runShort(["bash", "-c", STOP_SESSION, "argo-code-stop", pidfile], false).catch(
        () => undefined,
      );
    const onAbort = () => {
      void stop();
    };
    context.signal.addEventListener("abort", onAbort, { once: true });
    let alive = true;
    let stalled = false;
    const stallMinutes = codingStallMinutes();
    let lastBody = "";
    let lastProgressAt = Date.now();
    let stallNotes = 0;
    try {
      const started = await runShort(
        [
          "bash",
          "-c",
          START_SESSION,
          "argo-code-start",
          pidfile,
          logfile,
          ...(model ? ["--model", model] : []),
          task,
        ],
        true,
      );
      if (started.code !== 0) {
        return call.finish({
          error: redactSecrets(
            started.stderr || started.stdout || "coding mode failed",
            ctx.secrets,
          ),
        });
      }
      const deadline = Date.now() + CODING_ALONE_MS;
      while (Date.now() < deadline) {
        if (context.signal.aborted) break;
        const polled = await runShort(
          ["bash", "-c", POLL_SESSION, "argo-code-poll", pidfile, logfile],
          false,
        );
        stderr = polled.stderr;
        const body = polled.stdout.replace(/^(ALIVE|DEAD)\n?/, "");
        alive = polled.stdout.startsWith("ALIVE");
        takeChunk(body);
        if (!alive) break;
        // A quiet session gets a note at each threshold and is stopped at the last one, so a
        // hung agent never holds the computer for the whole six-hour sitting.
        const tail = body.slice(-400);
        if (tail !== lastBody) {
          lastBody = tail;
          lastProgressAt = Date.now();
          stallNotes = 0;
        } else {
          const quietMinutes = (Date.now() - lastProgressAt) / 60_000;
          const due = stallMinutes.filter((m) => quietMinutes >= m).length;
          if (due >= stallMinutes.length) {
            stalled = true;
            await stop();
            alive = false;
            break;
          }
          if (due > stallNotes) {
            stallNotes = due;
            void postWorkStatus(ctx, `Coding — no output for ${Math.floor(quietMinutes)} min`);
          }
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, CODING_POLL_MS);
          if (context.signal.aborted) {
            clearTimeout(timer);
            resolve();
            return;
          }
          context.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : "coding mode failed",
        ctx.secrets,
      );
      return call.finish({ error: message });
    } finally {
      clearInterval(pulse);
      context.signal.removeEventListener("abort", onAbort);
    }
    if (context.signal.aborted) {
      return call.finish({ error: "Coding mode was stopped." });
    }
    const safeSummary = redactSecrets(summary, ctx.secrets);
    const safeError = redactSecrets(stderr, ctx.secrets);
    const workspace = alive
      ? ""
      : redactSecrets(
          (await runShort(["bash", "-c", EVIDENCE_SESSION], false).catch(() => undefined))
            ?.stdout ?? "",
          ctx.secrets,
        ).trim();
    if (stalled) {
      return call.finish({
        ok: false,
        stalled: true,
        summary: clip(safeSummary, SUMMARY_MAX),
        ...(workspace ? { workspace: clip(workspace, 2_000) } : {}),
        note: `Coding mode printed nothing for ${stallMinutes[stallMinutes.length - 1]} minutes and was stopped. Check the workspace, then call code again with a narrower instruction that continues from there. Ask the user only if something only they can provide is missing.`,
      });
    }
    if (alive) {
      return call.finish({
        ok: true,
        running: true,
        summary: clip(safeSummary, SUMMARY_MAX),
        note: "Coding mode is still working on its own. Call code again with continue. Do not message the user and do not ask them anything.",
      });
    }
    if (lastStatus.startsWith("error:")) {
      return call.finish({
        ok: false,
        error: clip(safeError || lastStatus || safeSummary || "coding mode failed", 2_000),
        summary: clip(safeSummary, SUMMARY_MAX),
        note: "It stopped on its own. If this is something you can fix without the user, call code again and tell it to continue. Do not ask the user.",
      });
    }
    const verdict = parseCodingVerdict(safeSummary);
    const proof = workspace ? { workspace: clip(workspace, 2_000) } : {};
    if (verdict.kind === "blocked") {
      return call.finish({
        ok: false,
        blocked: verdict.reason,
        summary: clip(safeSummary, SUMMARY_MAX),
        ...proof,
        note: "Coding mode stopped because it needs something only the user can provide. Ask the user for exactly that, then call code again to continue.",
      });
    }
    if (verdict.kind === "unproven") {
      return call.finish({
        ok: true,
        verified: false,
        summary: clip(safeSummary, SUMMARY_MAX),
        ...proof,
        note: "Coding mode finished without a READY line and evidence. Before you tell the user it is done, check it yourself: read the changed files and run the tests or build. If something is missing, call code again to finish it. Do not redo the same edits.",
      });
    }
    return call.finish({
      ok: true,
      verified: true,
      result: verdict.result,
      evidence: verdict.evidence.slice(0, 12),
      summary: clip(safeSummary, SUMMARY_MAX),
      ...proof,
      note: "Coding mode finished with evidence. Read the files it changed before you answer, and give the user the result with its evidence. Do not redo the same edits, and do not ask the user a question the work already answered.",
    });
  },
};
