// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const accept = vi.hoisted(() => vi.fn());
const loadMe = vi.hoisted(() => vi.fn());

vi.mock("../lib/rpc", () => ({ rpc: { terms: { accept } } }));
vi.mock("../lib/me", () => ({ loadMe }));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@argo/ui-web", () => ({
  Button: (props: ComponentProps<"button">) => <button {...props} />,
  Checkbox: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    id: string;
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

import { TermsGate } from "./TermsGate";

let container: HTMLDivElement;
let root: Root;
const terms = { url: "https://operator.example.test/terms", version: "3" };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  accept.mockReset();
  loadMe.mockReset();
});

async function render() {
  await act(async () => {
    root.render(
      <TermsGate fallback={<p>loading</p>}>
        <p>app</p>
      </TermsGate>,
    );
  });
}

it("opens the app when no terms are pending", async () => {
  loadMe.mockResolvedValue({ pendingTerms: null });
  await render();
  expect(container.textContent).toBe("app");
});

it("opens the app when the lookup fails, since the API enforces the terms", async () => {
  loadMe.mockRejectedValue(new Error("offline"));
  await render();
  expect(container.textContent).toBe("app");
});

it("accepts the shown version only after the user agrees", async () => {
  loadMe.mockResolvedValue({ pendingTerms: terms });
  accept.mockResolvedValue({ ok: true });
  await render();
  const button = container.querySelector("button") as HTMLButtonElement;
  expect(container.querySelector("a")?.getAttribute("href")).toBe(terms.url);
  expect(button.disabled).toBe(true);
  await act(async () => {
    (container.querySelector("input") as HTMLInputElement).click();
  });
  expect(button.disabled).toBe(false);
  await act(async () => {
    button.click();
  });
  expect(accept).toHaveBeenCalledWith({ version: "3" });
  expect(container.textContent).toBe("app");
});
