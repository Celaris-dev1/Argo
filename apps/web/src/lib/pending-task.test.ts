// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { capturePendingTask, takePendingTask } from "./pending-task";

describe("pending homepage task", () => {
  afterEach(() => {
    localStorage.clear();
    history.replaceState(null, "", "/");
  });

  it("keeps ?task= until the first bot takes it, and cleans the address bar", () => {
    history.replaceState(null, "", "/sign-in?task=Find%20a%20flight&x=1");
    capturePendingTask();
    expect(window.location.search).toBe("?x=1");
    expect(takePendingTask()).toBe("Find a flight");
    expect(takePendingTask()).toBeUndefined();
  });

  it("does nothing without a task", () => {
    history.replaceState(null, "", "/sign-in");
    capturePendingTask();
    expect(takePendingTask()).toBeUndefined();
  });
});
