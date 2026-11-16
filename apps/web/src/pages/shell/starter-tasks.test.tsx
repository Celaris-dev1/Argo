// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StarterTasks } from "./starter-tasks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("StarterTasks", () => {
  it("hands the tapped task to the composer", () => {
    const onPick = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    act(() => createRoot(host).render(<StarterTasks starters={["One", "Two"]} onPick={onPick} />));
    const buttons = host.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    act(() => buttons[1]!.click());
    expect(onPick).toHaveBeenCalledWith("Two");
  });

  it("renders nothing without starters", () => {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => createRoot(host).render(<StarterTasks starters={[]} onPick={() => {}} />));
    expect(host.querySelector("[data-testid=starter-tasks]")).toBeNull();
  });
});
