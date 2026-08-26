import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// The sidebar nav groups are collapsible client components. Right after a soft
// navigation the toggle may not be hydrated yet, so the first click can be a
// no-op. Retry the group button until the child link is actually revealed.
async function openNavGroup(page: Page, groupName: string, childName: string) {
  const child = page.getByRole("link", { name: childName });
  const button = page.getByRole("button", { name: groupName });
  await expect(button).toBeVisible();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await child.isVisible().catch(() => false)) return;
    await button.click();
    const revealed = await child
      .waitFor({ state: "visible", timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    if (revealed) return;
  }
  await expect(child).toBeVisible();
}

test("plain text becomes an editable and approvable draft without paid services", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Enter Editorial Desk" }).click();
  await expect(
    page.getByRole("heading", { name: "Today’s strongest opportunities" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Styles", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Styles & tone" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Three standard styles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Five tone overlays" })).toBeVisible();
  await expect(page.getByText("maximum draft variants entering review")).toBeVisible();
  await expect(page.getByText(/scoring at least 75/)).toBeVisible();

  await openNavGroup(page, "RSS Feed Sources", "Runs & errors");
  await page.getByRole("link", { name: "Runs & errors" }).click();
  await expect(page.getByRole("heading", { name: "Runs & errors" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What AI work cost this brand" })).toBeVisible();
  await expect(page.getByText("By workflow step")).toBeVisible();
  await expect(page.getByText("By model")).toBeVisible();
  await expect(page.getByText("By source input")).toBeVisible();
  await expect(page.getByText(/paid calls · \d+ ledgered steps/)).toBeVisible();
  await expect(page.getByText("provider_timeout")).toBeVisible();
  await expect(page.getByText("stalled", { exact: true })).toBeVisible();
  await expect(page.getByText(/sk-demo-secret/)).toHaveCount(0);
  await page.getByRole("button", { name: "Queue manual recovery" }).first().click();
  await expect(page).toHaveURL(/recovery=queued/);
  await expect(
    page.getByText("Recovery queued. WF-10 will claim it on the next bounded dispatch poll."),
  ).toBeVisible();
  await expect(page.getByText(/scheduled · attempt 0\/3/).first()).toBeVisible();

  await openNavGroup(page, "Operations", "Performance");
  await page.getByRole("link", { name: "Performance" }).click();
  await expect(
    page.getByRole("heading", { name: "What the content engine delivered" }),
  ).toBeVisible();
  await expect(page.getByText("Healthy feeds", { exact: true })).toBeVisible();
  await expect(page.getByText("Approval rate", { exact: true })).toBeVisible();
  await expect(page.getByText("Rejection reasons", { exact: true })).toBeVisible();
  await expect(page.getByText("IEEE Spectrum Robotics")).toBeVisible();
  await page.getByLabel("Reporting window").selectOption("30d");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/performance\?window=30d/);

  await page.getByRole("link", { name: "Activity & feedback" }).click();
  await expect(page.getByRole("heading", { name: "Activity & feedback" })).toBeVisible();
  await expect(page.getByText("Make the opening more specific to robotics buyers.")).toBeVisible();
  await page.getByLabel("Activity type").selectOption("feedback");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/view=feedback/);
  await expect(page.getByText("Post approved")).toBeVisible();
  await expect(page.getByText("Changes requested")).toBeVisible();
  await expect(page.getByText("Post draft created")).toHaveCount(0);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("link", { name: "Manage team access" }).click();
  await expect(page.getByRole("heading", { name: "Team & access" })).toBeVisible();
  await expect(page.getByText("2 authorized members")).toBeVisible();
  const teammateAccess = page.getByTestId("member-access-40000000-0000-4000-8000-000000000099");
  await teammateAccess.getByLabel("Organization role").selectOption("editor");
  await teammateAccess.getByRole("checkbox").first().uncheck();
  await teammateAccess.getByRole("button", { name: "Save member access" }).click();
  await expect(page).toHaveURL(/saved=40000000-0000-4000-8000-000000000099/);
  await expect(teammateAccess.getByText("Access saved")).toBeVisible();
  await expect(teammateAccess.getByLabel("Organization role")).toHaveValue("editor");
  await expect(teammateAccess.locator('input[name="brandId"]:checked')).toHaveCount(4);

  await page.goto("/settings");
  await page.getByRole("link", { name: "Manage archive controls" }).click();
  await expect(page.getByRole("heading", { name: "Archive controls" })).toBeVisible();
  await page.getByLabel("Active inbox window").selectOption("48");
  await page.getByLabel("Resurfaced review window").selectOption("12");
  await page.getByRole("button", { name: "Save archive controls" }).click();
  await expect(page).toHaveURL(/settings\/archive\?saved=true/);
  await expect(page.getByText("Archive controls saved for Klaank.")).toBeVisible();
  await expect(page.getByLabel("Active inbox window")).toHaveValue("48");
  await expect(page.getByLabel("Resurfaced review window")).toHaveValue("12");
  await page.goto("/archive");
  await expect(page.getByText(/leave the active inbox after 48 hours/)).toBeVisible();
  await expect(page.getByText(/active review window for 12 hours/)).toBeVisible();

  await page.goto("/inputs/new");
  await page.getByLabel("Source title").fill("E2E decision redesign observation");
  await page
    .getByLabel("Original observation, memo, or rough idea")
    .fill(
      "AI operating models become useful when teams redesign decisions, clarify accountability, and measure the consequences instead of automating isolated tasks.",
    );
  await page.getByRole("button", { name: "Add to content inbox" }).click();

  await expect(page.getByRole("heading", { name: "Source normalized and scored" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("link", { name: /Inspect opportunity/ }).click();
  await expect(
    page.getByRole("heading", { name: "Why this opportunity scored here" }),
  ).toBeVisible();
  await expect(page.getByText(/AI operating models become useful/).first()).toBeVisible();
  const researchResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/opportunities\/[^/]+\/research$/.test(response.url()),
  );
  await page.getByRole("button", { name: "Start research" }).click();
  const researchResponse = await researchResponsePromise;
  expect(
    researchResponse.ok(),
    `Research API failed: ${await researchResponse.text()}`,
  ).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Claims ledger" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Development simulation/)).toBeVisible();
  await expect(page.getByText(/fake-research-v1/)).toBeVisible();

  await page.getByLabel("Content style").selectOption("educational_breakdown");
  await expect(
    page.getByText(
      "Extract the strongest learning value and turn it into an explanation, framework, or practical lesson.",
    ),
  ).toBeVisible();
  await page.getByLabel("Tone overlay").selectOption("bold");
  await expect(
    page.getByText(
      "Educational controls the post's strategic structure. Bold controls how that structure sounds. The evidence and brand-safety rules remain unchanged.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate evaluated draft" }).click();
  await expect(page).toHaveURL(/\/posts\//, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Edit without losing the original" })).toBeVisible(
    { timeout: 15_000 },
  );
  await page.getByText("Model provenance").click();
  await expect(page.getByText("fake-editorial-v1")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Three materially different routes" }),
  ).toBeVisible();
  await expect(page.getByText(/All deterministic readiness gates pass/)).toBeVisible();
  await page.getByText(/Claim verification/).click();
  await expect(page.getByText("claim_original1").first()).toBeVisible();

  await page.getByRole("button", { name: "Regenerate component" }).click();
  await expect(page.getByText("Facebook draft · Version 2")).toBeVisible({
    timeout: 15_000,
  });

  await page
    .getByRole("textbox", { name: "Hook", exact: true })
    .fill("A better AI operating model begins with one redesigned decision.");
  await page.getByRole("button", { name: /Save as immutable Version 3/ }).click();
  await expect(page.getByText("Review action persisted with an audit event.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Facebook draft · Version 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version history" })).toBeVisible();
  await expect(page.getByText("Version 1 · initial")).toBeVisible();
  await expect(page.getByText("Version 2 · selective regeneration")).toBeVisible();

  const imageResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && /\/api\/posts\/[^/]+\/images$/.test(response.url()),
  );
  await page.getByTestId("generate-image").click();
  const imageResponse = await imageResponsePromise;
  expect(imageResponse.ok(), `Image API failed: ${await imageResponse.text()}`).toBeTruthy();
  await expect(page.getByTestId("post-image-preview")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Composition template").selectOption("headline_panel");
  const templateResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && /\/api\/posts\/[^/]+\/images$/.test(response.url()),
  );
  await page.getByRole("button", { name: "Apply template only" }).click();
  const templateResponse = await templateResponsePromise;
  expect(
    templateResponse.ok(),
    `Template image API failed: ${await templateResponse.text()}`,
  ).toBeTruthy();
  await expect(page.getByTestId("post-image-preview")).toBeVisible({ timeout: 20_000 });

  const imageDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-image").click();
  expect((await imageDownloadPromise).suggestedFilename()).toMatch(/-image\.png$/);
  const packageDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-package").click();
  expect((await packageDownloadPromise).suggestedFilename()).toMatch(/-package\.zip$/);

  // Reviewers only approve or reject now — Request-changes was removed.
  await expect(page.getByRole("button", { name: "Request changes" })).toHaveCount(0);

  await page.getByRole("button", { name: "Approve post" }).click();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve post" })).toHaveCount(0);
});

test("pasted social content retains its source type and normalized text", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Enter Editorial Desk" }).click();
  await expect(
    page.getByRole("heading", { name: "Today’s strongest opportunities" }),
  ).toBeVisible();
  await page.goto("/inputs/new");

  await page.getByRole("button", { name: "Social post" }).click();
  await page.getByLabel("Source title").last().fill("Responsible AI field observation");
  await page
    .getByLabel("Original post URL (optional)")
    .fill("https://social.example/posts/42?utm_campaign=editorial");
  await page
    .getByLabel("Pasted social content")
    .fill(
      "The strongest AI programs clarify who owns a decision, what evidence changes it, and how the consequence is measured after deployment.",
    );
  await page.getByRole("button", { name: "Add social post" }).click();

  await expect(page.getByRole("heading", { name: "Source extracted and scored" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("link", { name: /Inspect opportunity/ }).click();
  await expect(page.getByText("social content", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("paragraph").filter({ hasText: "The strongest AI programs clarify" }),
  ).toBeVisible();
});

test("a VTT upload retains timecoded transcript content", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Enter Editorial Desk" }).click();
  await expect(
    page.getByRole("heading", { name: "Today’s strongest opportunities" }),
  ).toBeVisible();
  await page.goto("/inputs/new");

  await page
    .getByLabel("Source file")
    .setInputFiles(path.resolve("fixtures/transcripts/accountability-interview.vtt"));
  await page.getByRole("button", { name: "Upload source file" }).click();
  await expect(page.getByRole("heading", { name: "File extracted and scored" })).toBeVisible({
    timeout: 20_000,
  });
  await page
    .getByRole("link", { name: /Inspect opportunity/ })
    .last()
    .click();
  await expect(page.getByText("transcript", { exact: true })).toBeVisible();
});

test("an editor can configure, pause, and resume a multi-brand RSS feed", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Enter Editorial Desk" }).click();
  await expect(
    page.getByRole("heading", { name: "Today’s strongest opportunities" }),
  ).toBeVisible();
  await page.goto("/sources");

  await expect(page.getByRole("heading", { name: "RSS feed control room" })).toBeVisible();
  await page.getByLabel("Feed name").fill("AI governance watch");
  await page.getByLabel("RSS or Atom URL").fill("https://example.com/feed.xml?utm_source=test");
  await page.getByLabel("Feed topic tags").fill("AI governance, operating models");
  await page.getByLabel("Include keywords").first().fill("governance, accountability");
  await page.getByLabel("Exclude keywords").first().fill("sponsored");
  await page.getByRole("checkbox", { name: "Spaarker" }).check();
  await page.getByRole("button", { name: "Save feed policy" }).click();

  await expect(page.getByText("Feed configuration saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI governance watch" })).toBeVisible();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Pause AI governance watch" }).click();
  await expect(page.getByText("Feed paused.")).toBeVisible();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Resume AI governance watch" }).click();
  await expect(page.getByText("Feed resumed.")).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
});
