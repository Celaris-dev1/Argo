const KEY = "argo.pendingTask";

/** Keeps a job typed on the homepage (`?task=`) until the first bot exists to receive it. */
export function capturePendingTask(location: Location = window.location): void {
  const url = new URL(location.href);
  const task = url.searchParams.get("task")?.trim().slice(0, 500);
  if (!task) return;
  try {
    localStorage.setItem(KEY, task);
  } catch {}
  url.searchParams.delete("task");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Returns the saved job once and forgets it. */
export function takePendingTask(): string | undefined {
  try {
    const task = localStorage.getItem(KEY)?.trim();
    localStorage.removeItem(KEY);
    return task || undefined;
  } catch {
    return undefined;
  }
}
