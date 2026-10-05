import { test, expect, type Page } from "@playwright/test";
import { fixture, login, eventId, personId } from "./fixture";
const ids = Array.from(
  { length: 12 },
  (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, "0")}`,
);
async function populated(page: Page) {
  const f = await fixture(page),
    c = f.common;
  f.records.people.push({
    ...c,
    id: ids[0],
    first_name: "",
    last_name: "",
    phone: "0501234567",
    status: "ACTIVE",
  });
  f.records.flights = [
    {
      ...c,
      id: ids[1],
      flight_number: "LY 101",
      airline: "El Al",
      departure_airport: "TLV",
      arrival_airport: "RMO",
      direction: "INBOUND",
      status: "DELAYED",
      scheduled_departure_utc: "2027-09-01T08:00:00Z",
      scheduled_arrival_utc: "2027-09-01T11:00:00Z",
      delay_minutes: 35,
    },
  ];
  f.records.flight_passengers = [
    {
      ...c,
      id: ids[2],
      flight_id: ids[1],
      person_id: personId,
      status: "CONFIRMED",
    },
  ];
  f.records.drivers = [
    { ...c, id: ids[3], full_name: "David Driver", status: "AVAILABLE" },
  ];
  f.records.vehicles = [
    { ...c, id: ids[4], name: "Blue van", capacity: 8, status: "AVAILABLE" },
  ];
  f.records.trips = [
    {
      ...c,
      id: ids[5],
      origin: "Airport",
      destination: "Uman",
      status: "CONFIRMED",
      direction: "INBOUND",
      driver_id: ids[3],
      vehicle_id: ids[4],
      scheduled_departure_utc: "2027-09-01T12:00:00Z",
    },
  ];
  f.records.trip_passengers = [
    {
      ...c,
      id: ids[6],
      trip_id: ids[5],
      person_id: personId,
      passenger_status: "CONFIRMED",
    },
  ];
  f.records.apartments = [{ ...c, id: ids[7], name: "Central apartment" }];
  f.records.rooms = [
    { ...c, id: ids[8], name_or_number: "Room 12", apartment_id: ids[7] },
  ];
  f.records.sleeping_places = [
    {
      ...c,
      id: ids[9],
      room_id: ids[8],
      bed_code: "12A",
      type: "REGULAR_BED",
      is_active: true,
      listed_price: "400.1234",
    },
  ];
  f.records.accommodation_assignments = [
    {
      ...c,
      id: ids[10],
      person_id: personId,
      sleeping_place_id: ids[9],
      status: "ACTIVE",
      agreed_price: "300.1234",
      start_date: "2027-09-01",
      end_date: "2027-09-10",
    },
  ];
  f.records.tasks = [
    {
      ...c,
      id: ids[11],
      title: "Confirm airport pickup",
      priority: "CRITICAL",
      status: "NEW",
      assignee_id: personId,
      due_date_utc: "2020-01-01T08:00:00Z",
    },
    {
      ...c,
      id: crypto.randomUUID(),
      title: null,
      description: "Waiting for keys",
      priority: "MEDIUM",
      status: "WAITING",
    },
  ];
  f.records.apartment_issues = [
    {
      ...c,
      id: crypto.randomUUID(),
      title: null,
      description: "Water leak in kitchen",
      apartment_id: ids[7],
      reporter_id: personId,
      priority: "HIGH",
      status: "OPEN",
    },
  ];
  f.records.payments = [
    {
      ...c,
      id: crypto.randomUUID(),
      person_id: personId,
      amount: "9007199254740993.1234",
      currency: "USD",
      payment_date: "2027-09-01",
      reference: "Receipt P-1",
    },
  ];
  f.records.expenses = [
    {
      ...c,
      id: crypto.randomUUID(),
      original_amount: "12.3400",
      original_currency: "EUR",
      expense_date: "2027-09-01",
      description: "Airport parking",
    },
  ];
  f.state.summary = {
    counts: { people: 2, tasks: 2, issues: 1, assignments: 1 },
    alerts: [],
    schedule: [],
    finance: {
      payments: "9007199254740993.1234",
      expenses: "0.0000",
      currency: "USD",
      unconverted: 1,
    },
  };
  await login(page);
  return f;
}

test("participant filters, contextual actions and realtime reflect actual relations", async ({
  page,
}) => {
  const f = await populated(page);
  await page.goto(`/e/${eventId}/people`);
  await expect(page.locator(".participant-row")).toHaveCount(2);
  await expect(page.locator(".participant-row").first()).toContainText(
    "Delayed",
  );
  await page.getByLabel("Filter", { exact: true }).selectOption("noFlight");
  await expect(page.locator(".participant-row")).toHaveCount(1);
  await expect(page.locator(".participant-row")).toContainText("0501234567");
  await page.locator(".context-actions summary").click();
  await page.getByRole("link", { name: "Assign flight", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`flight_passenger/new\\?person_id=${ids[0]}`),
  );
  await expect(page.locator("#field-person_id")).toHaveValue(ids[0]);
  await page.goto(`/e/${eventId}/people`);
  await page.getByLabel("Filter", { exact: true }).selectOption("noStay");
  await expect(page.locator(".participant-row")).toHaveCount(1);
  f.records.accommodation_assignments.push({
    ...f.common,
    id: crypto.randomUUID(),
    person_id: ids[0],
    status: "TEMPORARY",
    sleeping_place_id: ids[9],
  });
  f.notify("accommodation_assignments");
  await expect(page.getByText("No matches", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Filter", exact: true })
    .selectOption("all");
  await expect(
    page.locator(".participant-row").filter({ hasText: "0501234567" }),
  ).toContainText("Temporary");
});

test("participant 360 joins flights, trips, room, exact price and source payments", async ({
  page,
}) => {
  await populated(page);
  await page.goto(`/e/${eventId}/person/${personId}`);
  await expect(
    page.getByRole("heading", { name: "Operational profile", exact: true }),
  ).toBeVisible();
  const profile = page.locator(".profile-grid");
  for (const text of [
    "LY 101",
    "Airport",
    "Central apartment",
    "Room 12",
    "300.1234",
    "9007199254740993.1234",
    "Confirm airport pickup",
  ])
    await expect(profile).toContainText(text);
  await expect(page.locator("#profile-finance")).toContainText("No debt");
});

test("travel resources and task/issue filters retain safe editing paths", async ({
  page,
}) => {
  await populated(page);
  await page.goto(`/e/${eventId}/travel`);
  await expect(page.locator(".ops-card")).toContainText("35");
  await page
    .getByRole("button", { name: "Ground transport", exact: true })
    .click();
  await expect(page.locator(".ops-card")).toContainText("David Driver");
  await expect(page.locator(".ops-card")).toContainText("Blue van");
  await page
    .getByRole("button", { name: "Drivers & vehicles", exact: true })
    .click();
  await expect(page.locator(".resource-row")).toHaveCount(2);
  await page.goto(`/e/${eventId}/tasks`);
  await page.getByLabel("Filter", { exact: true }).selectOption("overdue");
  await expect(page.locator(".ops-card")).toHaveCount(1);
  await expect(page.locator(".ops-card")).toContainText(
    "Confirm airport pickup",
  );
  await page.locator(".context-actions summary").click();
  await page
    .locator(".context-actions")
    .getByRole("link", { name: "Edit", exact: true })
    .click();
  await expect(page.locator("#field-status")).toHaveValue("NEW");
  await page.goto(`/e/${eventId}/issues`);
  await page.getByLabel("Priority", { exact: true }).selectOption("urgent");
  await expect(page.locator(".ops-card")).toContainText("Central apartment");
  await page.getByLabel("Filter", { exact: true }).selectOption("RESOLVED");
  await expect(page.locator(".ops-card")).toHaveCount(0);
});

test("finance shows exact authoritative totals and separate original currencies", async ({
  page,
}) => {
  await populated(page);
  await page.goto(`/e/${eventId}/finance`);
  await expect(page.locator(".workspace-metrics")).toContainText(
    "9007199254740993.1234 USD",
  );
  await expect(page.locator(".ledger-list")).toHaveCount(2);
  await expect(page.locator(".ledger-list").last()).toContainText(
    "12.3400 EUR",
  );
  await expect(
    page.getByRole("link", { name: "Record expense", exact: true }),
  ).toBeVisible();
});

test("sidebar and dashboard lead to operational screens; empty modules offer creation", async ({
  page,
}) => {
  await fixture(page);
  await login(page);
  for (const path of ["people", "travel", "tasks", "issues", "finance"])
    await expect(
      page.locator(`.sidebar a[href="/e/${eventId}/${path}"]`),
    ).toBeVisible();
  await page
    .getByRole("link", { name: "Travel operations", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Travel operations", exact: true }),
  ).toBeVisible();
  for (const path of ["tasks", "issues", "finance"]) {
    await page.goto(`/e/${eventId}/${path}`);
    await expect(page.locator(".workspace-empty").first()).toContainText(
      "Start with what you know",
    );
  }
});

for (const width of [1440, 768, 390])
  test(`operational workspace English and Hebrew at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await populated(page);
    for (const lang of ["en", "he"]) {
      if (lang === "he")
        await page.getByRole("button", { name: "עברית", exact: true }).click();
      for (const path of [
        "people",
        "travel",
        "tasks",
        "issues",
        "finance",
        `person/${personId}`,
      ]) {
        await page.goto(`/e/${eventId}/${path}`);
        await expect(
          page.locator(".workspace-metrics, .profile-grid").first(),
        ).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          lang === "he" ? "rtl" : "ltr",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `test-results/workspace-${path.split("/")[0]}-${width}-${lang}.png`,
          fullPage: true,
        });
      }
    }
  });

test("failed relationship reads cannot produce false unassigned states", async ({
  page,
}) => {
  await populated(page);
  await page.route("**/rest/v1/flight_passengers*", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "Permission denied" }),
    }),
  );
  await page.goto(`/e/${eventId}/people`);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".participant-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
});

test("participant absence filters include people beyond the first page", async ({
  page,
}) => {
  const f = await fixture(page);
  f.records.people = Array.from({ length: 41 }, (_, i) => ({
    ...f.common,
    id: crypto.randomUUID(),
    first_name: `Participant ${i}`,
    last_name: "",
    status: "ACTIVE",
  }));
  await login(page);
  await page.goto(`/e/${eventId}/people`);
  await page
    .getByRole("combobox", { name: "Filter", exact: true })
    .selectOption("noFlight");
  await expect(page.locator(".participant-row")).toHaveCount(41);
  await expect(
    page.getByRole("link", { name: "Participant 40", exact: true }),
  ).toBeVisible();
});
