import { test, expect } from "@playwright/test";
import { fixture, login, eventId, personId } from "./fixture";

test("manager creates a person and retains their draft through a conflict", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  await page.goto("/e/" + eventId + "/person/new");
  await page.locator("#field-first_name").fill("New browser person");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New browser person", exact: true }),
  ).toBeVisible();
  expect(f.calls.filter((c) => c.name === "save_person")).toHaveLength(1);
  await page.goto("/e/" + eventId + "/person/" + personId + "/edit");
  await page.locator("#field-first_name").fill("My retained draft");
  f.records.people[0].phone = "123456789";
  f.state.conflict = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#field-first_name")).toHaveValue(
    "My retained draft",
  );
  await page.getByRole("button", { name: /Compare/ }).click();
  await page
    .getByRole("button", { name: /Use latest version as base/ })
    .click();
  await expect(page.locator("#field-phone")).toHaveValue("123456789");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "My retained draft Participant",
      exact: true,
    }),
  ).toBeVisible();
});

test("task creation uses the server mutation contract", async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await page.goto("/e/" + eventId + "/task/new");
  await page.locator("#field-title").fill("Prepare airport pickup");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Prepare airport pickup", exact: true }),
  ).toBeVisible();
  expect(f.calls.find((c) => c.name === "save_task")?.body.p_event_id).toBe(
    eventId,
  );
});

for (const width of [1440, 768, 390])
  test(
    "responsive English and Hebrew dashboard at " + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await fixture(page);
      await login(page);
      await expect(
        page.getByRole("heading", { name: "Command center", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "עברית", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.goto("/e/" + eventId + "/person");
      await expect(
        page.getByRole("link", { name: "Browser Participant", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    },
  );
