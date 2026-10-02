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
      await page.screenshot({
        path: "test-results/dashboard-" + width + "-en.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "עברית", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "test-results/dashboard-" + width + "-he.png",
        fullPage: true,
      });
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

test("accommodation warning requires explicit review before saving", async ({
  page,
}) => {
  const f = await fixture(page);
  const bed = "66666666-6666-4666-8666-666666666666";
  f.records.sleeping_places = [
    { ...f.common, id: bed, label: "Bed A", is_active: true },
  ];
  f.state.warnings = true;
  await login(page);
  await page.goto("/e/" + eventId + "/accommodation_assignment/new");
  await page.locator("#field-person_id").selectOption(personId);
  await page.locator("#field-sleeping_place_id").selectOption(bed);
  await page.locator("#field-start_date").fill("2027-09-01");
  await page.locator("#field-end_date").fill("2027-09-05");
  await page.locator("#field-status").selectOption("ACTIVE");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create", exact: true }),
  ).toBeDisabled();
  expect(
    f.calls.filter((c) => c.name === "save_accommodation_assignment"),
  ).toHaveLength(0);
  await page
    .getByLabel("I reviewed the warnings and want to keep this assignment.")
    .check();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Stay assignments", exact: true }),
  ).toBeVisible();
  expect(f.records.accommodation_assignments[0].person_id).toBe(personId);
});

test("transport passenger assignment preserves chosen trip and participant", async ({
  page,
}) => {
  const f = await fixture(page);
  const trip = "77777777-7777-4777-8777-777777777777";
  f.records.trips = [
    {
      ...f.common,
      id: trip,
      origin: "Airport",
      destination: "Uman",
      status: "PLANNED",
    },
  ];
  await login(page);
  await page.goto("/e/" + eventId + "/trip_passenger/new");
  await page.locator("#field-person_id").selectOption(personId);
  await page.locator("#field-trip_id").selectOption(trip);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Passenger manifest", exact: true }),
  ).toBeVisible();
  expect(f.records.trip_passengers[0]).toMatchObject({
    person_id: personId,
    trip_id: trip,
    passenger_status: "ASSIGNED",
  });
});

test("payment submits exact decimal strings and remains immutable", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  await page.goto("/e/" + eventId + "/payment/new");
  await page.locator("#field-person_id").selectOption(personId);
  await page.locator("#field-amount").fill("1234.5678");
  await page.locator("#field-currency").fill("USD");
  await page.locator("#field-payment_date").fill("2027-09-01");
  await page.locator("#field-reference").fill("Browser receipt");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser receipt", exact: true }),
  ).toBeVisible();
  expect(
    (
      f.calls.find((c) => c.name === "save_payment")?.body.p_fields as Record<
        string,
        unknown
      >
    ).amount,
  ).toBe("1234.5678");
  await expect(
    page.getByRole("link", { name: "Edit", exact: true }),
  ).toHaveCount(0);
});

test("event access disappears when membership is revoked", async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Command center", exact: true }),
  ).toBeVisible();
  f.state.denied = true;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No events available", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add participant", exact: true }),
  ).toHaveCount(0);
});

test("sign out clears access and restores the login screen", async ({
  page,
}) => {
  await fixture(page);
  await login(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.goto("/e/" + eventId + "/person");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("realtime changes refresh the list without navigation and preserve an open draft", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  await page.goto("/e/" + eventId + "/person");
  await expect(
    page.getByText("Live updates connected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browser Participant", exact: true }),
  ).toBeVisible();
  f.records.people[0].first_name = "Second manager";
  f.notify("people");
  await expect(
    page.getByRole("link", { name: "Second manager Participant", exact: true }),
  ).toBeVisible();
  await page.goto("/e/" + eventId + "/person/" + personId + "/edit");
  await page.locator("#field-first_name").fill("Unsaved local edit");
  f.records.people[0].first_name = "External update";
  f.notify("people");
  await expect
    .poll(() => f.calls.filter((c) => c.name === "read_person").length)
    .toBeGreaterThan(1);
  await expect(page.locator("#field-first_name")).toHaveValue(
    "Unsaved local edit",
  );
});

test("an offline edit stays in the form and logout requires acknowledging unsaved input", async ({
  page,
  context,
}) => {
  await fixture(page);
  await login(page);
  await page.goto("/e/" + eventId + "/person/" + personId + "/edit");
  await page.locator("#field-first_name").fill("Offline draft");
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#field-first_name")).toHaveValue("Offline draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator("#field-first_name")).toHaveValue("Offline draft");
  await context.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
});

test("mobile Hebrew menu opens and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await login(page);
  await page.getByRole("button", { name: "עברית", exact: true }).click();
  await expect(page.locator("#event-navigation")).not.toBeVisible();
  await page.getByRole("button", { name: "עוד", exact: true }).click();
  await expect(page.locator("#event-navigation")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#event-navigation")).not.toBeVisible();
});
