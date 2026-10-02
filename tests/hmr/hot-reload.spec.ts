import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fixture, login } from "../e2e/fixture";
test("hot-reloading event context does not duplicate the root or crash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await fixture(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Command center", exact: true }),
  ).toBeVisible();
  const path = ".local/hmr-test/src/app/event.tsx",
    source = await readFile(path, "utf8");
  const updated = page.waitForResponse((r) =>
    r.url().includes("/src/app/event.tsx?t="),
  );
  await writeFile(path, source + "\n// Isolated hot-reload regression check\n");
  await updated;
  await page.waitForTimeout(1000);
  await expect(
    page.getByRole("heading", { name: "Command center", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
