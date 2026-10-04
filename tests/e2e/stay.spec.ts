import { test, expect } from "@playwright/test";
import { fixture, login, eventId, personId } from "./fixture";
const apt = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  room = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  bed = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  otherBed = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
async function setup(page: Parameters<typeof fixture>[0]) {
  const f = await fixture(page);
  f.records.apartments = [{ ...f.common, id: apt, name: "Central apartment" }];
  f.records.rooms = [
    { ...f.common, id: room, apartment_id: apt, name_or_number: "Room 12" },
  ];
  f.records.sleeping_places = [bed, otherBed].map((id, i) => ({
    ...f.common,
    id,
    room_id: room,
    bed_code: String(12 + i),
    label: i ? "Spare" : "ליד החלון · Window",
    type: "REGULAR_BED",
    is_active: true,
    listed_price: "400.1234",
  }));
  f.records.accommodation_assignments = [
    {
      ...f.common,
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      person_id: personId,
      sleeping_place_id: bed,
      status: "ACTIVE",
      agreed_price: "300.0001",
      start_date: "2027-09-01",
      end_date: "2027-09-10",
    },
  ];
  await login(page);
  await page.goto("/e/" + eventId + "/availability");
  await expect(
    page.getByRole("heading", { name: "Accommodation bed board" }),
  ).toBeVisible();
  return f;
}
for (const width of [1440, 768, 390])
  test("bed board English and Hebrew at " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await expect(page.locator(".stay-bed")).toHaveCount(2);
    await expect(
      page.locator(".stay-board").getByText("800.2468 USD").first(),
    ).toBeVisible();
    for (const lang of ["en", "he"]) {
      if (lang === "he")
        await page.getByRole("button", { name: "עברית", exact: true }).click();
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
        path: `test-results/stay-${width}-${lang}.png`,
        fullPage: true,
      });
    }
  });
test("bulk creation preserves draft through filters and submits exact price", async ({
  page,
}) => {
  const f = await setup(page);
  await page
    .getByRole("button", { name: "Add several beds", exact: true })
    .click();
  await page.getByLabel("Number of beds", { exact: true }).fill("3");
  await page.getByLabel("Starting number / code", { exact: true }).fill("A01");
  await page
    .getByRole("form")
    .getByLabel(/Listed bed price/)
    .fill("123.4567");
  await page.getByRole("searchbox").fill("No matching bed");
  await expect(
    page.getByLabel("Starting number / code", { exact: true }),
  ).toHaveValue("A01");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("form")).toHaveCount(0);
  await page.getByRole("searchbox").fill("");
  await expect(page.locator(".stay-bed")).toHaveCount(5);
  expect(
    f.calls.find((c) => c.name === "web_create_beds")?.body.p_listed_price,
  ).toBe("123.4567");
  expect(f.records.sleeping_places.slice(2).map((r) => r.bed_code)).toEqual([
    "A01",
    "A02",
    "A03",
  ]);
  expect(f.calls.some((c) => c.name === "save_payment")).toBe(false);
});
test("manager moves, cancels and deactivates beds through RPCs", async ({
  page,
}) => {
  const f = await setup(page);
  await page
    .getByRole("button", { name: "Move assignment", exact: true })
    .click();
  await page.locator("#move-bed").selectOption(otherBed);
  await page
    .getByRole("form")
    .getByRole("button", { name: "Move assignment", exact: true })
    .click();
  await expect(page.getByRole("form")).toHaveCount(0);
  await expect(
    page
      .locator(".stay-bed")
      .filter({ has: page.getByRole("link", { name: "Bed 13", exact: true }) })
      .getByText("Browser Participant", { exact: true }),
  ).toBeVisible();
  expect(f.records.accommodation_assignments[0].status).toBe("CANCELLED");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Cancel assignment", exact: true })
    .click();
  await expect(page.locator(".stay-occupant")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Deactivate bed", exact: true })
    .first()
    .click();
  await expect(page.locator(".state-inactive")).toHaveCount(1);
});
test("bed and assignment realtime changes reconcile without navigation", async ({
  page,
}) => {
  const f = await setup(page);
  await expect(
    page.getByText("Live updates connected", { exact: true }),
  ).toBeVisible();
  f.records.sleeping_places[0].bed_code = "12A";
  f.notify("sleeping_places");
  await expect(
    page.getByRole("link", { name: "Bed 12A", exact: true }),
  ).toBeVisible();
  f.records.accommodation_assignments[0].status = "CANCELLED";
  f.notify("accommodation_assignments");
  await expect(page.locator(".stay-occupant")).toHaveCount(0);
  await expect(page.locator(".state-available")).toHaveCount(2);
});
test("bed price conflict retains the manager draft", async ({ page }) => {
  const f = await setup(page);
  await page.goto("/e/" + eventId + "/sleeping_place/" + bed + "/edit");
  await page.locator("#field-listed_price").fill("275.1234");
  f.state.conflict = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#field-listed_price")).toHaveValue("275.1234");
  await page.getByRole("button", { name: /Compare/ }).click();
  await page
    .getByRole("button", { name: /Use latest version as base/ })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#field-listed_price")).toHaveCount(0);
  expect(
    f.records.sleeping_places.find((r) => r.id === bed)?.listed_price,
  ).toBe("275.1234");
});
