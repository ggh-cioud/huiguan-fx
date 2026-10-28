import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockMarket } from "./market-fixture";

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  page.on("pageerror", error => { throw error; });
});
async function costs(page: Page) {
  await page.locator(".conversion-costs > summary").click();
  await page.getByLabel("手续费率（%）", { exact: true }).fill("2");
  await page.getByLabel("固定费用（USD）", { exact: true }).fill("10");
  await page.getByLabel("点差（%）", { exact: true }).fill("1");
}

test("current quotes are usable while history details are pending or fail", async ({ page, context }) => {
  const market = await mockMarket(context, { holdDetails: true, failDetails: true });
  await page.goto("/");
  await expect(page.getByTestId("conversion-output")).toHaveText("7,000.00CNY");
  await expect(page.locator(".quote-card").first()).toContainText("7.0000");
  await expect(page.getByText("当前报价已显示，正在补充历史对比…")).toBeVisible();
  market.release();
  await expect(page.getByText("历史对比暂不可用，当前报价不受影响。")).toBeVisible();
  await expect(page.locator(".quote-card").first()).toContainText("7.0000");
  await expect(page.getByRole("button", { name: "复制结果", exact: true })).toBeEnabled();
});

test("fees, spread, target inversion and copied result agree in both languages", async ({ page, context }) => {
  await mockMarket(context); await page.goto("/"); await costs(page);
  await expect(page.getByTestId("conversion-output")).toHaveText("6,722.10CNY");
  await page.getByRole("button", { name: "我希望到账", exact: true }).click();
  await page.getByLabel("目标到账金额 · CNY").fill("6722.1");
  await expect(page.getByTestId("conversion-output")).toHaveText("1,000.00USD");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByLabel("Target amount · CNY")).toHaveValue("6722.1");
  await expect(page.getByLabel("Fee (%)", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: "Copy result", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Estimated payment 1,000.00 USD → Estimated received 6,722.10 CNY");
  expect(copied).toContain("Estimated fees 30.00 USD"); expect(copied).not.toMatch(/\p{Script=Han}/u);
});

test("invalid amounts and fee boundaries show no calculated amount", async ({ page, context }) => {
  await mockMarket(context); await page.goto("/"); await costs(page);
  await page.getByLabel("手续费率（%）", { exact: true }).fill("100");
  await expect(page.getByTestId("conversion-output")).toHaveText("—CNY");
  await expect(page.getByText("费用须为非负数，手续费率与点差须小于 100%。")).toBeVisible();
  await page.getByLabel("手续费率（%）", { exact: true }).fill("0");
  await page.getByLabel("固定费用（USD）", { exact: true }).fill("1001");
  await expect(page.getByText("支付金额不足以扣除费用，或计算超出范围。")).toBeVisible();
  await page.getByLabel("支付金额 · USD").fill("");
  await expect(page.getByRole("button", { name: "复制结果", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "分享查询", exact: true }).click();
  await expect(page.getByText("请先填写有效的查询参数。")).toBeVisible();
});

test("query settings restore after reload without resetting favorites or language", async ({ page, context }) => {
  await mockMarket(context);
  await page.goto("/"); await costs(page);
  await page.getByLabel("支付金额 · USD").fill("2500");
  await page.getByText("90天", { exact: true }).click();
  await page.getByRole("button", { name: "走势货币", exact: true }).click();
  await page.getByRole("option", { name: /EUR/ }).click();
  await page.getByRole("button", { name: "取消欧元自选", exact: true }).click();
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.reload();
  await expect(page.getByLabel("Payment amount · USD")).toHaveValue("2500");
  await expect(page.getByRole("button", { name: "Chart currency", exact: true })).toContainText("EUR");
  await expect(page.getByRole("radio", { name: "90D", exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: "Add Euro to watchlist", exact: true })).toBeVisible();
  await page.locator(".conversion-costs > summary").click();
  await expect(page.getByLabel("Fixed fee (USD)", { exact: true })).toHaveValue("10");
});

test("a copied query restores all settings in a new tab and fetches rates again", async ({ page, context }) => {
  const market = await mockMarket(context); await page.goto("/"); await costs(page);
  await page.getByRole("button", { name: "我希望到账", exact: true }).click();
  await page.getByLabel("目标到账金额 · CNY").fill("6722.1");
  await page.getByText("90天", { exact: true }).click();
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.getByRole("button", { name: "Share query", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(copied); expect(url.search).toBe(""); expect(url.hash).toContain("amount=6722.1"); expect(url.hash).not.toMatch(/rate=|favorites|alerts|AppID/);
  await page.evaluate(() => localStorage.setItem("huiguan.query.v1", JSON.stringify({ amount: "4", days: 7 })));
  const before = market.calls.filter(url => url.includes("view=quotes")).length;
  const other = await context.newPage(); await other.goto(copied);
  await expect(other.getByLabel("Target amount · CNY")).toHaveValue("6722.1");
  await expect(other.getByTestId("conversion-output")).toHaveText("1,000.00USD");
  await expect(other.getByRole("radio", { name: "90D", exact: true })).toBeChecked();
  expect(market.calls.filter(url => url.includes("view=quotes")).length).toBeGreaterThan(before);
  await other.close();
});

test("malformed saved settings and shared values fall back without executing input", async ({ page, context }) => {
  await mockMarket(context);
  await context.addInitScript(() => localStorage.setItem("huiguan.query.v1", "not-json"));
  await page.goto("/#q=1&amount=Infinity&base=%3Cscript%3E&days=3&spreadPercent=100&lang=en");
  await expect(page.getByLabel("Payment amount · USD")).toHaveValue("1000");
  await expect(page.getByRole("button", { name: "Base currency", exact: true })).toContainText("CNY");
  await expect(page.getByRole("radio", { name: "30D", exact: true })).toBeChecked();
  await expect(page.getByTestId("conversion-output")).toHaveText("7,000.00CNY");
});

test("opening a share fragment in the same page fetches fresh quotes", async ({ page, context }) => {
  const market = await mockMarket(context); await page.goto("/");
  await expect(page.getByTestId("conversion-output")).toHaveText("7,000.00CNY");
  const before = market.calls.filter(url => url.includes("view=quotes")).length;
  await page.evaluate(() => { window.location.hash = "q=1&amount=2000&lang=en"; });
  await expect(page.getByLabel("Payment amount · USD")).toHaveValue("2000");
  await expect.poll(() => market.calls.filter(url => url.includes("view=quotes")).length).toBeGreaterThan(before);
  await expect(page.getByTestId("conversion-output")).toHaveText("14,000.00CNY");
});

test("changing base during delayed details never restores the previous base", async ({ page, context }) => {
  const market = await mockMarket(context, { holdDetails: true }); await page.goto("/");
  await expect(page.locator(".quote-card").first()).toContainText("7.0000");
  await page.getByRole("button", { name: "基准货币", exact: true }).click();
  await page.getByRole("option", { name: /USD/ }).click();
  await expect.poll(() => market.calls.some(url => url.includes("base=USD&view=quotes"))).toBe(true);
  market.release();
  await expect(page.getByRole("button", { name: "基准货币", exact: true })).toContainText("USD");
  await expect(page.locator(".quote-card").first()).toContainText("1.1111");
});

test("a failed alert chunk leaves the dashboard and converter usable", async ({ page, context }) => {
  await mockMarket(context);
  await context.route("**/rate-alerts-*.js", route => route.abort("failed"));
  await page.goto("/");
  await expect(page.getByTestId("conversion-output")).toHaveText("7,000.00CNY");
  await page.getByRole("button", { name: /打开汇率提醒/ }).click();
  await expect(page.getByText("提醒未能加载", { exact: true })).toBeVisible();
  await expect(page.getByTestId("conversion-output")).toHaveText("7,000.00CNY");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByLabel("支付金额 · USD").fill("2000");
  await expect(page.getByTestId("conversion-output")).toHaveText("14,000.00CNY");
});

test("CSV remains localized and rate alerts load only when opened", async ({ page, context }) => {
  await mockMarket(context);
  const scripts: string[] = [];
  page.on("request", request => { if (request.resourceType() === "script") scripts.push(request.url()); });
  await page.goto("/");
  await expect(page.getByTestId("conversion-output")).toHaveText("7,000.00CNY");
  expect(scripts.some(url => url.includes("rate-alerts-"))).toBe(false);
  await page.getByRole("button", { name: "Switch to English" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export filtered rates as CSV" }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Currency code"); expect(csv).toContain('"USD","US Dollar","CNY",7,'); expect(csv).not.toMatch(/\p{Script=Han}/u);
  await page.getByRole("button", { name: /Open rate alerts/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(scripts.some(url => url.includes("rate-alerts-"))).toBe(true);
  await page.getByRole("button", { name: "Close rate alerts" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("storage and clipboard denial still allow conversion and manual copying", async ({ page, context }) => {
  await mockMarket(context);
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage denied for test"); } });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("Clipboard denied for test"); } } });
  });
  await page.goto("/");
  await expect(page.getByTestId("conversion-output")).toHaveText("7,000.00CNY");
  await page.getByRole("button", { name: "分享查询", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "分享查询", exact: true })).toHaveValue(/#q=1&/);
});

test("keyboard selection and expanded English converter fit the viewport", async ({ page, context }, testInfo) => {
  await mockMarket(context); await page.goto("/"); await costs(page);
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.getByRole("button", { name: "From currency", exact: true }).click();
  await page.getByRole("combobox", { name: "From currency options", exact: true }).fill("EUR"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "From currency", exact: true })).toContainText("EUR");
  await page.locator("#converter").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("converter-english.png"), fullPage: true });
});
