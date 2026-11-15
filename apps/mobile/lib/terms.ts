import type { TermsOfUse } from "@argo/contracts";
import { Alert, AppState, Linking } from "react-native";
import { rpc } from "./api";
import { t } from "./i18n";

let showing: string | null = null;

/**
 * Asks once per launch for the operator's Terms of Use. The API refuses AI requests until
 * they are accepted, so "Not now" only defers the question to the next inbox load.
 */
export function promptTerms(terms: TermsOfUse): void {
  if (showing === terms.version) return;
  showing = terms.version;
  const show = () =>
    Alert.alert(t("Terms of Use"), t("I'm 18 or older and agree to the Terms of Use."), [
      { text: t("Not now"), style: "cancel", onPress: () => (showing = null) },
      {
        text: t("Read"),
        onPress: () => {
          // Ask again once the user comes back from the browser.
          const subscription = AppState.addEventListener("change", (state) => {
            if (state !== "active") return;
            subscription.remove();
            show();
          });
          void Linking.openURL(terms.url).catch(() => {
            subscription.remove();
            show();
          });
        },
      },
      {
        text: t("Agree"),
        style: "default",
        isPreferred: true,
        onPress: () => {
          void rpc("terms/accept", { version: terms.version }).catch(() => {
            showing = null;
          });
        },
      },
    ]);
  show();
}
