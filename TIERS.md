# Argo tiers (one codebase, picked at install)

| Tier | Price | Computer image | How to run |
|---|---|---|---|
| Free | $0, self-host | any | Use any profile below on your own box (Apache-2.0, keep NOTICE) |
| Scout | $7/mo | argo/computer:headless (Lightpanda, ~672 MB cap) | infra/compose/install-ultra.sh (headless). Known bug: Lightpanda drops the page between CDP connections. Fix pending (switch to chrome-headless). |
| Navigator | $15/mo | argo/computer:navigator (chrome-headless-shell, amd64 only, ~430 MB measured) | install-ultra.sh with PAGE_BROWSER=chrome (commit 01f3c9d, 1aa9d04) |
| Crew | $35/mo | argo/computer:slim (full desktop, live screen + takeover, ~700 MB measured, 1.5 GB cap) | infra/compose/install-lite.sh (docker-compose.lite.yml) |

Build computer images on a big box with infra/compose/build-ultra-images.sh, then docker save/load onto small boxes. Small boxes never build.
Measured density on 8 GB: 6 Navigators or 3 Crews. Argo stack idle ~920 MB.
