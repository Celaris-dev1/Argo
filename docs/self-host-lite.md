# Lite self-hosting (8 GB Linux)

Runs the complete stack (bots, memory, routines, Team and Private computers, browser,
terminal, coding mode, integrations) on one 8 GB Linux machine.

## Install

```bash
bash infra/compose/install-lite.sh                         # API models only
bash infra/compose/install-lite.sh --local-ai qwen3:1.7b   # plus a local 1–2B model
```

The script builds `argo/app:local` and `argo/computer:local` from this checkout, writes
`infra/compose/.env` with fresh secrets plus `.env.lite.example`, installs the computer firewall
rules, and starts `docker-compose.images.yml` + `docker-compose.lite.yml`.

Building the app image is the heaviest step. Add 4 GB swap first, or build on a bigger machine
and `docker save argo/app:local | ssh box docker load`.

## Memory budget

| Service | Limit |
|---|---|
| postgres (tuned) | 384 MB |
| supervisor | 192 MB |
| api | 640 MB |
| worker | 768 MB |
| web | 256 MB |
| one bot computer | 1.5 GB (`ARGO_COMPUTER_MEMORY`) |
| ollama (optional) | 3 GB (`OLLAMA_MEMORY`) |

About 3.7 GB without a local model. Each extra live computer adds `ARGO_COMPUTER_MEMORY`;
idle computers are suspended.

## Models and custom providers

Settings > Models offers presets for OpenRouter, Venice, Featherless, NanoGPT, Together AI,
DeepInfra, Ollama Cloud, and local Ollama, llama.cpp, LM Studio, and KoboldCpp. Any other
OpenAI-compatible server works by pasting its URL. `MCP_ALLOW_PRIVATE_ENDPOINT=true` (set by the
lite env) lets you use servers on this machine or your LAN.

## Small and open-weight models

- `ARGO_SMALL_MODELS=local` (or exact ids) gives those models about 20 core tools instead of
  90, so a 1–3B model fits its context and calls tools reliably. Override the list with
  `ARGO_SMALL_MODEL_TOOLS`.
- `<think>…</think>` reasoning inlined in the reply (R1 distills, QwQ, many fine-tunes) is
  stripped from what the user sees.
- Pick models whose template supports tool calls (Ollama shows a "tools" tag). On Ollama, use
  Qwen3 1.7B, Llama 3.2 1B or 3B, or Hermes 3, including their abliterated builds. Plain chat
  fine-tunes without tool support can chat but can't use the computer.
- Keep `ARGO_LOCAL_CONTEXT_WINDOW` at 8192–16384 on 8 GB. Larger windows use RAM in the
  KV cache.

## Learning, Coding mode and the memory gate

- **Learned skills.** After a run that used 3 or more tools, the bot's own model reviews the work and may save or update up to two skills marked `learned: true`. It only edits or retires skills it wrote, never yours, never stores secrets, and is skipped for models in `ARGO_SMALL_MODELS`. It costs one extra model call per qualifying run. Settings: `ARGO_SKILL_LEARNING=on|off`, `ARGO_SKILL_LEARNING_MIN_TOOLS=3`.
- **Coding mode proof.** OpenCode is told to finish with `READY:` and `EVIDENCE:` lines, or `BLOCKED:`. The bot gets `verified: true` with the evidence, `blocked` with the missing item, or `verified: false` and an instruction to check the work itself. The branch, last commit and `git status` come back with every result.
- **Stalls.** A session silent for 10 and 20 minutes posts a status note; at 40 minutes it is stopped so it does not hold the computer for the full six hours (`ARGO_CODING_STALL_MINUTES=10,20,40`).
- **Memory gate.** With `ARGO_MIN_FREE_MEMORY_MB=900`, the supervisor refuses to start or wake a computer when the host has less free memory than that, and the bot reports why instead of the machine swapping to a halt. Set 0 to turn it off.

## Ultra-lean: 1 vCPU / 2 GB / 6 GB boxes

For one bot owner on a tiny VPS, using API models only. The bot computer is **headless**: shell,
files, git, gh, uv, Coding mode (OpenCode) and Lightpanda as the page browser. There is no desktop,
no takeover, no screen tools and no local model. Bots are told this (`ARGO_COMPUTER_HEADLESS=1`),
so they are never offered `computer_observe` or `computer_act`.

The small box never builds anything.

1. On a bigger box (8 GB is fine), build and pack the images:
   `bash infra/compose/build-ultra-images.sh` → `argo-ultra-images.tar.gz`
2. If the small box is **IPv6-only**, give it IPv4 egress through a box that has IPv4:
   - on the IPv4 box: `sudo bash infra/compose/ultra-egress.sh server` then
     `sudo bash infra/compose/ultra-egress.sh add-peer ultra1` → `ultra1.conf`
   - IPv4 goes through WireGuard; IPv6 stays native. Open UDP 51820 on the IPv4 box.
3. Copy the tarball, `ultra1.conf` and the `infra/compose` folder to the small box, then:
   `sudo bash install-ultra.sh argo-ultra-images.tar.gz ultra1.conf`

The installer adds 2 GB swap (swappiness 10), sets up the tunnel, caps Docker logs, loads the
images and starts the stack with `docker-compose.ultra.yml` layered on the lite file.

Memory ceilings: postgres 192m · supervisor 128m · api 384m · worker 448m · web 160m · one headless
computer 512m (about 1.8 GB). The memory gate refuses a new computer below 300 MB free.
One computer at a time. Worker concurrency is 1.

For users on IPv4 to reach an IPv6-only box, put it behind Cloudflare (proxied DNS record) or a
reverse proxy on a dual-stack box.

Caveats: Lightpanda supports a subset of what Chromium does over CDP, and some pages will not render
or will not take clicks. Sites that need a real browser need the lite profile.
