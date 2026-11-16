import { SecretStoreUnavailableError } from "@argo/adapter-kit";
import { hasValidBearerToken } from "@argo/core";
import type { Hono } from "hono";
import { mountGithubWebhookRoute } from "./github-webhook.js";
import { readBoundedBody } from "./http-body.js";
import type { WebhookDeps, WebhookSecretCache } from "./webhook-inbound.js";
import {
  deliverWebhookEvent,
  formatWebhookPrompt,
  loadWebhookTarget,
  parseWebhookPayload,
  WEBHOOK_MAX_BODY_BYTES,
} from "./webhook-inbound.js";

export {
  formatGithubEventPrompt,
  githubEventName,
  githubWebhookPath,
  hasValidGithubSignature,
} from "./github-webhook.js";
export {
  formatUntrustedDeliveryPayload,
  formatWebhookPrompt,
  WEBHOOK_MAX_BODY_BYTES,
  WEBHOOK_SECRET_KIND,
  type WebhookDeps,
  type WebhookEvents,
  type WebhookTarget,
} from "./webhook-inbound.js";

/**
 * Bearer, or HTTP Basic with the secret as the password. Inbound-email services and
 * other no-code senders can only put credentials in the URL (https://any:SECRET@host/…).
 */
export function hasValidWebhookAuth(authorization: string | undefined, expected: string): boolean {
  if (authorization?.slice(0, 6).toLowerCase() === "basic ") {
    let decoded = "";
    try {
      decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
    } catch {
      return false;
    }
    const colon = decoded.indexOf(":");
    return colon >= 0 && hasValidBearerToken(`Bearer ${decoded.slice(colon + 1)}`, expected);
  }
  return hasValidBearerToken(authorization, expected);
}

/** Form posts (inbound email, simple form tools) become flat text fields; files are dropped. */
async function readWebhookPayload(raw: string, contentType: string | undefined) {
  const type = contentType?.toLowerCase() ?? "";
  if (
    type.startsWith("application/x-www-form-urlencoded") ||
    type.startsWith("multipart/form-data")
  ) {
    try {
      const form = await new Response(raw, {
        headers: { "content-type": contentType! },
      }).formData();
      const fields: Record<string, unknown> = {};
      for (const [key, value] of form) if (typeof value === "string") fields[key] = value;
      return fields;
    } catch {
      return { text: raw.trim() };
    }
  }
  return parseWebhookPayload(raw, contentType);
}

export function webhookPath(botId: string): string {
  return `/api/v1/bots/${botId}/webhook`;
}

export function mountWebhookHttpRoutes(app: Hono, deps: WebhookDeps) {
  const secretCache: WebhookSecretCache = new Map();

  app.post("/api/v1/bots/:botId/webhook", async (c) => {
    const unauthorized = () => c.json({ error: "Unauthorized" }, 401);

    // Reject oversized bodies before target lookup so size limits do not reveal active bots.
    const raw = await readBoundedBody(c.req.raw, WEBHOOK_MAX_BODY_BYTES);
    if (raw === null) {
      return c.json({ error: "Payload too large" }, 413);
    }

    let target: Awaited<ReturnType<typeof loadWebhookTarget>>;
    try {
      target = await loadWebhookTarget(deps, secretCache, c.req.param("botId"));
    } catch (error) {
      if (error instanceof SecretStoreUnavailableError) {
        return c.json({ error: "Service unavailable" }, 503);
      }
      throw error;
    }

    // Same 401 for missing bot, missing secret, and bad bearer so bot ids are not enumerable.
    if (!target || !hasValidWebhookAuth(c.req.header("authorization"), target.expected)) {
      return unauthorized();
    }

    const payload = await readWebhookPayload(raw, c.req.header("content-type"));
    const eventPrompt = formatWebhookPrompt(payload);

    const webhookRoutines = await deps.prisma.routine.findMany({
      where: {
        botId: target.bot.id,
        spaceId: target.bot.spaceId,
        active: true,
        webhookEnabled: true,
      },
      select: {
        id: true,
        name: true,
        prompt: true,
        modelProvider: true,
        modelId: true,
        thinkingLevel: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    // A payload id often names the resource, not the delivery, so only byte-identical retries collapse.
    const idempotencyKey =
      c.req.header("idempotency-key")?.trim() ||
      c.req.header("x-idempotency-key")?.trim() ||
      c.req.header("webhook-id")?.trim() ||
      c.req.header("svix-id")?.trim() ||
      (typeof payload.id === "string" || typeof payload.event_id === "string" ? raw : "") ||
      undefined;

    return c.json(
      await deliverWebhookEvent(deps, target, {
        prompt: eventPrompt,
        routines: webhookRoutines,
        source: "webhook",
        idempotencyKey,
      }),
    );
  });

  mountGithubWebhookRoute(app, deps, secretCache);
}
