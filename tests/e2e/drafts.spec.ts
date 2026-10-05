import { test, expect } from "@playwright/test";
import { fixture, login, eventId } from "./fixture";

test("phone-only person is searchable, retains conflicts, and completes", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  await page.goto(`/e/${eventId}/person/new`);
  await page.locator("#field-phone").fill("0501234567");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "0501234567", exact: true }),
  ).toBeVisible();
  const row = f.records.people.find((r) => r.phone === "0501234567")!;
  expect(row.first_name || null).toBeNull();
  await page.goto(`/e/${eventId}/person`);
  await page.getByRole("searchbox").fill("0501234567");
  await expect(
    page.locator("a.record-title").filter({ hasText: "0501234567" }),
  ).toBeVisible();
  await page.goto(`/e/${eventId}/person/${row.id}/edit`);
  await page.locator("#field-first_name").fill("Completed identity");
  f.state.conflict = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#field-first_name")).toHaveValue(
    "Completed identity",
  );
  await page.getByRole("button", { name: /Compare/ }).click();
  await page
    .getByRole("button", { name: /Use latest version as base/ })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Completed identity", exact: true }),
  ).toBeVisible();
});

test("blank person is rejected, notes-only person gets a safe title", async ({
  page,
}) => {
  const f = await fixture(page);
  await login(page);
  await page.goto(`/e/${eventId}/person/new`);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  expect(f.calls.filter((c) => c.name === "save_person")).toHaveLength(0);
  await page.locator("#field-notes").fill("Call the contact tomorrow");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Unnamed person", exact: true }),
  ).toBeVisible();
});

for (const [kind, field, content] of [
  ["task", "description", "Arrange an extra key"],
  ["apartment_issue", "description", "Check the leaking tap"],
  ["driver", "phone_number", "0507654321"],
  ["vehicle", "license_plate", "TEST-123"],
])
  test(`minimal ${kind} capture does not invent required business values`, async ({
    page,
  }) => {
    const f = await fixture(page);
    await login(page);
    await page.goto(`/e/${eventId}/${kind}/new`);
    await page.locator(`#field-${field}`).fill(content);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: content, exact: true }),
    ).toBeVisible();
    const call = f.calls.find((c) => c.name === `save_${kind}`)!;
    expect(call).toBeTruthy();
    if (kind === "vehicle") expect(f.records.vehicles[0].capacity).toBeNull();
    if (["driver", "vehicle"].includes(kind)) {
      expect(
        f.records[kind === "driver" ? "drivers" : "vehicles"][0].status,
      ).toBe("UNAVAILABLE");
      await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
    }
  });

for (const width of [1440, 768, 390])
  test(`partial records and unnamed structure in both languages at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const f = await fixture(page);
    const apt = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      room = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    f.records.apartments = [{ ...f.common, id: apt, name: null }];
    f.records.rooms = [
      { ...f.common, id: room, apartment_id: apt, name_or_number: null },
    ];
    f.records.sleeping_places = [
      {
        ...f.common,
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        room_id: room,
        type: null,
        bed_code: null,
        label: null,
        is_active: false,
        listed_price: null,
      },
    ];
    await login(page);
    for (const lang of ["en", "he"]) {
      if (lang === "he")
        await page.getByRole("button", { name: "עברית", exact: true }).click();
      await page.goto(`/e/${eventId}/availability`);
      await expect(page.locator(".stay-bed")).toHaveCount(1);
      await expect(page.locator(".stay-board")).not.toContainText("null");
      await expect(
        page.getByRole("link", {
          name: lang === "en" ? "Untitled apartment" : "דירה ללא שם",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/draft-board-${width}-${lang}.png`,
        fullPage: true,
      });
      await page.goto(`/e/${eventId}/vehicle/new`);
      await expect(page.locator("#field-capacity")).toHaveValue("");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/draft-form-${width}-${lang}.png`,
        fullPage: true,
      });
    }
  });

test("realtime completes a partial identity without navigation", async ({
  page,
}) => {
  const f = await fixture(page);
  f.records.people[0].first_name = "";
  f.records.people[0].last_name = "";
  f.records.people[0].phone = "0501112233";
  await login(page);
  await page.goto(`/e/${eventId}/person`);
  await expect(
    page.locator("a.record-title").filter({ hasText: "0501112233" }),
  ).toBeVisible();
  await expect(
    page.getByText("Live updates connected", { exact: true }),
  ).toBeVisible();
  f.records.people[0].hebrew_first_name = "משה";
  f.notify("people");
  await expect(
    page.locator("a.record-title").filter({ hasText: "משה" }),
  ).toBeVisible();
});
