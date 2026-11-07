# Computer images

One codebase; pick the computer image at install time.

| Image | Browser | Install |
|---|---|---|
| `argo/computer:scout` (default) | Lightpanda, no screen, lightest | `build-ultra-images.sh`, then `install-ultra.sh` |
| `argo/computer:navigator` | chrome-headless-shell, no screen, amd64 only | `PAGE_BROWSER=chrome build-ultra-images.sh`, then `install-ultra.sh` |
| `argo/computer:slim` | Full desktop with live screen and takeover | `infra/compose/install-lite.sh` |

Build images on a larger machine with `infra/compose/build-ultra-images.sh`, copy the archive, and
run `install-ultra.sh` on the small one, which uses whichever computer image the archive contains.
