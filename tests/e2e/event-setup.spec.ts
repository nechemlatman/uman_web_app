import { test, expect } from "@playwright/test";
import { fixture, login, eventId } from "./fixture";
for (const width of [1440, 390])
  for (const language of ["en", "he"])
    test(`create event ${language} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const f = await fixture(page);
      await login(page);
      await page.goto("/events");
      await page
        .getByRole("link", { name: "Create event", exact: true })
        .click();
      if (language === "he")
        await page.getByRole("button", { name: "עברית", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        language === "he" ? "rtl" : "ltr",
      );
      await page.locator("#event-name").fill("New Web event");
      await page.locator("#event-hebrew_name").fill("אירוע חדש");
      await page.locator("#event-start_date").fill("2027-09-01");
      await page.locator("#event-end_date").fill("2027-09-10");
      await expect(page.locator("#event-base_currency")).toHaveValue("USD");
      await expect(page.locator("#event-start_date")).toHaveAttribute(
        "type",
        "date",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/event-create-${width}-${language}.png`,
        fullPage: true,
      });
      await page.locator("form button.primary").click();
      await expect(page).toHaveURL(/\/e\/[0-9a-f-]+$/);
      const call = f.calls.find((c) => c.name === "web_create_event");
      expect(call?.body.p_fields).toMatchObject({
        name: "New Web event",
        hebrew_name: "אירוע חדש",
        year: null,
        start_date: "2027-09-01",
        end_date: "2027-09-10",
        base_currency: "USD",
      });
      await page.goto("/events");
      await expect(
        page.getByRole("link", {
          name: language === "he" ? /אירוע חדש/ : /New Web event/,
        }),
      ).toBeVisible();
    });
test("uncertain creation retries the same immutable request without duplication", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  await page.goto("/events/new");
  await page.locator("#event-name").fill("Retry-safe event");
  f.state.createUncertain = true;
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page.getByText(/Creation may have succeeded/)).toBeVisible();
  await expect(page.locator("#event-name")).toBeDisabled();
  await expect(page).toHaveURL(/\/events\/new$/);
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#event-name")).toHaveValue("Retry-safe event");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page).toHaveURL(/\/e\/[0-9a-f-]+$/);
  const calls = f.calls.filter((c) => c.name === "web_create_event");
  expect(calls).toHaveLength(2);
  expect(calls[0].body).toEqual(calls[1].body);
  expect(
    f.records.events.filter((e) => e.name === "Retry-safe event"),
  ).toHaveLength(1);
});
test("empty event selection guides eligible managers and blocks unprovisioned users", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  f.records.events = [];
  await page.goto("/events");
  await expect(
    page.getByText("Create an event to start planning."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create event", exact: true }).click();
  await expect(page.locator("#event-name")).toBeVisible();
  f.state.canCreate = false;
  await page.reload();
  await expect(page.getByText(/Event creation requires/)).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await page.goto("/events");
  await expect(
    page.getByRole("link", { name: "Create event", exact: true }),
  ).toHaveCount(0);
});
test("date validation blocks invalid ranges without a server write", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  await page.goto("/events/new");
  await page.locator("#event-name").fill("Dates");
  await page.locator("#event-start_date").fill("2027-09-10");
  await page.locator("#event-end_date").fill("2027-09-10");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(
    page.getByText("End date must be after start date."),
  ).toBeVisible();
  expect(f.calls.filter((c) => c.name === "web_create_event")).toHaveLength(0);
});
test("Settings retains date draft on CAS and clears optional metadata", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  await page.goto("/e/" + eventId + "/settings");
  await page.locator("#event-end_date").fill("2027-09-12");
  await page.locator("#event-hebrew_name").fill("");
  await page.locator("#event-year").fill("");
  await expect(
    page.getByText(/Changing these dates does not change existing assignments/),
  ).toBeVisible();
  f.records.events[0].description = "Another manager note";
  f.state.conflict = true;
  await page.locator("form button.primary").click();
  await page.getByRole("button", { name: /Compare/ }).click();
  await page
    .getByRole("button", { name: /Use latest version as base/ })
    .click();
  await expect(page.locator("#event-end_date")).toHaveValue("2027-09-12");
  await expect(page.locator("#event-description")).toHaveValue(
    "Another manager note",
  );
  await page.locator("form button.primary").click();
  await expect(
    page.getByText("Saved successfully", { exact: true }),
  ).toBeVisible();
  expect(f.records.events[0]).toMatchObject({
    end_date: "2027-09-12",
    hebrew_name: null,
    year: null,
  });
  expect(f.calls.some((c) => c.name === "save_accommodation_assignment")).toBe(
    false,
  );
});
test("anonymous create route returns to login", async ({ page }) => {
  await fixture(page);
  await page.goto("/events/new");
  await expect(
    page.getByRole("button", { name: /Sign in|כניסה/, exact: true }),
  ).toBeVisible();
});
