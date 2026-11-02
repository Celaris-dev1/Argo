# Lite self-hosting (8 GB Linux)

Runs the complete stack (bots, memory, routines, Team and Private computers, browser,
terminal, coding mode, integrations) on one 8 GB Linux machine.

## Install

```bash
bash infra/compose/install-lite.sh                         # API models only
bash infra/compose/install-lite.sh --local-ai qwen3:1.7b   # plus a local 1–2B model
```

The script builds `rakazo/app:local` and `rakazo/computer:local` from this checkout, writes
`infra/compose/.env` with fresh secrets plus `.env.lite.example`, installs the computer firewall
rules, and starts `docker-compose.images.yml` + `docker-compose.lite.yml`.

Building the app image is the heaviest step. Add 4 GB swap first, or build on a bigger machine
and `docker save rakazo/app:local | ssh box docker load`.

## Memory budget

| Service | Limit |
|---|---|
| postgres (tuned) | 384 MB |
| supervisor | 192 MB |
| api | 640 MB |
| worker | 768 MB |
| web | 256 MB |
| one bot computer | 1.5 GB (`RAKAZO_COMPUTER_MEMORY`) |
| ollama (optional) | 3 GB (`OLLAMA_MEMORY`) |

About 3.7 GB without a local model. Each extra live computer adds `RAKAZO_COMPUTER_MEMORY`;
idle computers are suspended.

## Models and custom providers

Settings > Models offers presets for OpenRouter, Venice, Featherless, NanoGPT, Together AI,
DeepInfra, Ollama Cloud, and local Ollama, llama.cpp, LM Studio, and KoboldCpp. Any other
OpenAI-compatible server works by pasting its URL. `MCP_ALLOW_PRIVATE_ENDPOINT=true` (set by the
lite env) lets you use servers on this machine or your LAN.

## Small and open-weight models

- `RAKAZO_SMALL_MODELS=local` (or exact ids) gives those models about 20 core tools instead of
  90, so a 1–3B model fits its context and calls tools reliably. Override the list with
  `RAKAZO_SMALL_MODEL_TOOLS`.
- `<think>…</think>` reasoning inlined in the reply (R1 distills, QwQ, many fine-tunes) is
  stripped from what the user sees.
- Pick models whose template supports tool calls (Ollama shows a "tools" tag). On Ollama, use
  Qwen3 1.7B, Llama 3.2 1B or 3B, or Hermes 3, including their abliterated builds. Plain chat
  fine-tunes without tool support can chat but can't use the computer.
- Keep `RAKAZO_LOCAL_CONTEXT_WINDOW` at 8192–16384 on 8 GB. Larger windows use RAM in the
  KV cache.

## Learning, Coding mode and the memory gate

- **Learned skills.** After a run that used 3 or more tools, the bot's own model reviews the work and may save or update up to two skills marked `learned: true`. It only edits or retires skills it wrote, never yours, never stores secrets, and is skipped for models in `RAKAZO_SMALL_MODELS`. It costs one extra model call per qualifying run. Settings: `RAKAZO_SKILL_LEARNING=on|off`, `RAKAZO_SKILL_LEARNING_MIN_TOOLS=3`.
- **Coding mode proof.** OpenCode is told to finish with `READY:` and `EVIDENCE:` lines, or `BLOCKED:`. The bot gets `verified: true` with the evidence, `blocked` with the missing item, or `verified: false` and an instruction to check the work itself. The branch, last commit and `git status` come back with every result.
- **Stalls.** A session silent for 10 and 20 minutes posts a status note; at 40 minutes it is stopped so it does not hold the computer for the full six hours (`RAKAZO_CODING_STALL_MINUTES=10,20,40`).
- **Memory gate.** With `RAKAZO_MIN_FREE_MEMORY_MB=900`, the supervisor refuses to start or wake a computer when the host has less free memory than that, and the bot reports why instead of the machine swapping to a halt. Set 0 to turn it off.
