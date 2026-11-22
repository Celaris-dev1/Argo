import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

test("a bot's public page shows its purpose, finished work and shared results", async ({
  page,
}, testInfo) => {
  const at = "2026-11-20T10:00:00.000Z";
  await page.route("**/api/v1/status/abcdef1234", (route) =>
    route.fulfill({
      json: {
        botName: "Chief",
        color: "#7c3aed",
        avatarSet: "organic",
        working: true,
        description: "Researches markets and writes cited briefs.",
        completed: 42,
        shared: [{ id: "share1", title: "Fact-check the AI security brief", at }],
        tasks: [{ title: "Compare laptop prices", at }],
      },
    }),
  );
  await page.goto("/s/abcdef1234");

  await expect(page.getByRole("heading", { name: "Chief" })).toBeVisible();
  await expect(page.getByText("Researches markets and writes cited briefs.")).toBeVisible();
  await expect(page.getByText("42 tasks finished")).toBeVisible();
  await expect(page.getByText("Working now")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Fact-check the AI security brief/ }),
  ).toHaveAttribute("href", "/r/share1");
  await expect(page.getByText("Compare laptop prices")).toBeVisible();
  await expect(page.getByRole("link", { name: "Made with Argo" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Create your bot" })).toHaveAttribute(
    "href",
    "/sign-up",
  );
  await captureScreenshot(page, testInfo, "bot-public-page");
});
