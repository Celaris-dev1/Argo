import { beforeEach, expect, it, vi } from "vitest";

const native = vi.hoisted(() => {
  const listeners = new Set<(state: string) => void>();
  return {
    alert: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ ok: true })),
    openURL: vi.fn(() => Promise.resolve()),
    listeners,
    appState: {
      addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      }),
    },
  };
});

vi.mock("react-native", () => ({
  Alert: { alert: native.alert },
  AppState: native.appState,
  Linking: { openURL: native.openURL },
}));
vi.mock("./api", () => ({ rpc: native.rpc }));

import { promptTerms } from "./terms";

type Button = { text: string; onPress?: () => void };
const buttons = (call = 0) => native.alert.mock.calls[call]?.[2] as Button[];
const press = (text: string, call = 0) =>
  buttons(call)
    .find((b) => b.text === text)
    ?.onPress?.();

beforeEach(() => {
  native.alert.mockReset();
  native.rpc.mockClear();
  native.listeners.clear();
});

it("accepts the shown version", () => {
  promptTerms({ url: "https://operator.example.test/terms", version: "a" });
  press("Agree");
  expect(native.rpc).toHaveBeenCalledWith("terms/accept", { version: "a" });
});

it("asks once per version until the user defers", () => {
  const terms = { url: "https://operator.example.test/terms", version: "b" };
  promptTerms(terms);
  promptTerms(terms);
  expect(native.alert).toHaveBeenCalledTimes(1);
  press("Not now");
  promptTerms(terms);
  expect(native.alert).toHaveBeenCalledTimes(2);
});

it("asks again after the user returns from reading the terms", () => {
  promptTerms({ url: "https://operator.example.test/terms", version: "c" });
  press("Read");
  expect(native.openURL).toHaveBeenCalledWith("https://operator.example.test/terms");
  for (const listener of [...native.listeners]) listener("active");
  expect(native.alert).toHaveBeenCalledTimes(2);
});
