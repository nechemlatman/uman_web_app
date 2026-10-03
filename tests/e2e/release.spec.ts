import { test, expect } from "@playwright/test";
import { fixture, login, signIn, eventId, event } from "./fixture";

for (const count of [0, 2])
  test(`event chooser remains available with ${count} events`, async ({
    page,
  }) => {
    const f = await fixture(page);
    f.records.events = count
      ? [
          event,
          {
            ...event,
            id: "66666666-6666-4666-8666-666666666666",
            name: "Second event",
          },
        ]
      : [];
    await signIn(page);
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.locator(".event-picker")).toBeVisible();
    await expect(page.locator(".event-card")).toHaveCount(count);
  });

test("Kyiv datetime input rejects gaps, resolves repeated hours and preserves edits", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  await page.goto(`/e/${eventId}/task/new`);
  await page.locator("#field-title").fill("Timezone verification");
  const deadline = page.getByLabel("Deadline (Europe/Kyiv)", { exact: true });
  await deadline.fill("2027-03-28T03:30");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("#field-due_date_utc-error")).toContainText(
    "does not exist",
  );
  expect(f.calls.filter((c) => c.name === "save_task")).toHaveLength(0);
  await deadline.fill("2027-10-31T03:30");
  const occurrence = page.getByRole("combobox", {
    name: "Deadline (Europe/Kyiv) · Time occurrence",
  });
  await expect(occurrence).toBeVisible();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("#field-due_date_utc-error")).toContainText(
    "occurs twice",
  );
  await occurrence.selectOption("2027-10-31T01:30:00.000Z");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Timezone verification", exact: true }),
  ).toBeVisible();
  expect(
    f.calls.find((c) => c.name === "save_task")?.body.p_fields,
  ).toMatchObject({ due_date_utc: "2027-10-31T01:30:00.000Z" });
  await expect(
    page.getByRole("button", { name: "Print current page", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("dd").filter({ hasText: "31 Oct 2027, 03:30 · Europe/Kyiv" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(deadline).toHaveValue("2027-10-31T03:30");
  await page.locator("#field-title").fill("Timezone retained");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Timezone retained", exact: true }),
  ).toBeVisible();
  expect(
    f.calls.filter((c) => c.name === "save_task").at(-1)?.body.p_fields,
  ).toMatchObject({ due_date_utc: "2027-10-31T01:30:00.000Z" });
  await page.goto(`/e/${eventId}/task`);
  await expect(
    page.getByRole("button", { name: "Print current page", exact: true }),
  ).toBeVisible();
});
