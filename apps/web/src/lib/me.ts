import type { Me } from "@argo/contracts";
import { peekInitialBootstrap } from "./bootstrap";
import { rpc } from "./rpc";

/** The signed-in account, from the startup bootstrap when it is still fresh. */
export function loadMe(): Promise<Me> {
  const primed = peekInitialBootstrap();
  if (!primed) return rpc.me();
  return primed.then(
    (bootstrap) => bootstrap.me,
    () => rpc.me(),
  );
}
