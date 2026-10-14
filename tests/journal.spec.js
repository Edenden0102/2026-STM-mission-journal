import { test, expect } from "@playwright/test";
test("saves both languages and multiple reflections across reload, with no mobile overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#activities-zh").fill("今天看见神的恩典。");
  await page.locator("#activities-en").fill("We saw God at work today.");
  await page.locator("#add").click();
  await page.locator("#reflections1-zh").fill("第二条分享");
  await page.reload();
  await expect(page.locator("#activities-zh")).toHaveValue(
    "今天看见神的恩典。",
  );
  await expect(page.locator("#activities-en")).toHaveValue(
    "We saw God at work today.",
  );
  await expect(page.locator("#reflections1-zh")).toHaveValue("第二条分享");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("translation failure preserves original and allows manual translation; success never overwrites", async ({
  page,
}) => {
  await page.route("https://api.mymemory.translated.net/**", (r) => r.abort());
  await page.goto("/");
  await page.locator("#activities-zh").fill("神的恩典");
  await page.locator('[data-translate="activities"][data-source="zh"]').click();
  await expect(page.locator("#message")).toContainText("Please allow");
  await page.locator("#consent").check();
  await page.locator('[data-translate="activities"][data-source="zh"]').click();
  await expect(page.locator("#message")).toContainText("unavailable");
  await expect(page.locator("#activities-zh")).toHaveValue("神的恩典");
  await page.locator("#activities-en").fill("God’s grace");
  await page.locator('[data-translate="activities"][data-source="zh"]').click();
  await expect(page.locator("#activities-en")).toHaveValue("God’s grace");
  await page.locator("#activities-en").fill("");
  await page.unroute("https://api.mymemory.translated.net/**");
  await page.route("https://api.mymemory.translated.net/**", (r) =>
    r.fulfill({
      json: {
        responseStatus: 200,
        responseData: { translatedText: "God’s grace" },
      },
    }),
  );
  await page.locator('[data-translate="activities"][data-source="zh"]').click();
  await expect(page.locator("#activities-en")).toHaveValue("God’s grace");
  await expect(page.locator("#activities-zh")).toHaveValue("神的恩典");
});
test("JSON export/import restores draft and rejects invalid file without data loss", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#prayer-zh").fill("请为团队代祷");
  const wait = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const file = await wait;
  await page.locator("#prayer-zh").fill("Changed");
  page.on("dialog", (d) => d.accept());
  await page.locator("#file").setInputFiles(await file.path());
  await expect(page.locator("#prayer-zh")).toHaveValue("请为团队代祷");
  await page.locator("#file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":1}'),
  });
  await expect(page.locator("#message")).toContainText("Invalid draft");
  await expect(page.locator("#prayer-zh")).toHaveValue("请为团队代祷");
});
test("preview excludes guidelines, escapes text, and downloads a multi-page Chinese A4 PDF", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#activities-zh").fill("神的恩典与救恩。\n".repeat(90));
  await page.locator("#activities-en").fill("We prayed with our friends.");
  await page.locator("#reflections0-zh").fill('<script>alert("test")</script>');
  await page.locator("#prayer-zh").fill("愿主保守团队。");
  await expect(page.locator('[data-key="partners"]')).toHaveCount(0);
  await expect(page.locator('[data-translate="partners"]')).toHaveCount(0);
  await page.locator("#preview").click();
  await expect(page.locator("#document")).toContainText("愿主保守团队。");
  await expect(page.locator("#document")).not.toContainText("How did I/we");
  await expect(page.locator("#document script")).toHaveCount(0);
  await expect(page.locator("#document h3").last()).toHaveText(
    "Prayer Partners’ Reflection / 代祷伙伴回应",
  );
  await expect(page.locator(".partner-response")).toContainText(
    "As you read today's sharing, what has God placed on your heart? You may write down your reflections, prayers, or responses below.",
  );
  await expect(page.locator(".partner-response")).toContainText(
    "阅读今天的短宣分享后，神在你心中有什么感动？欢迎在下面写下你的领受、祷告或回应。",
  );
  await expect(page.locator(".writing-line")).toHaveCount(15);
  await page.screenshot({ path: "/tmp/mission-preview.png", fullPage: true });
  const wait = page.waitForEvent("download");
  await page.locator("#pdf").click();
  const file = await wait;
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(await file.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = bytes.toString("latin1");
  const dimensions = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  expect(Number(dimensions[1])).toBeCloseTo(595.28, 1);
  expect(Number(dimensions[2])).toBeCloseTo(841.89, 1);
  expect(bytes.length).toBeLessThan(2000000);
  expect((pdf.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
  await fs.copyFile(await file.path(), "/tmp/mission-test.pdf");
  await expect(page.locator("#pdf-status")).toContainText("PDF downloaded");
  await page.locator("#edit").click();
  await expect(page.locator("#activities-en")).toHaveValue(
    "We prayed with our friends.",
  );
});

// Inspect actual PDF drawing commands: the writing lines must survive export/print.
test("legacy drafts keep their data, but the PDF ends with a half-A4 recipient writing area", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "mission-journal-v1",
      JSON.stringify({
        version: 1,
        date: "2026-10-14",
        activities: { zh: "活动", en: "Activities" },
        reflections: [{ zh: "分享", en: "Reflection" }],
        prayer: { zh: "代祷", en: "Prayer" },
        partners: { zh: "旧草稿内容", en: "Legacy partner text" },
      }),
    ),
  );
  await page.reload();
  await expect(page.locator("#activities-en")).toHaveValue("Activities");
  await expect(page.locator('[data-key="partners"]')).toHaveCount(0);
  await page.locator("#preview").click();
  await expect(page.locator("#document")).not.toContainText(
    "Legacy partner text",
  );
  const downloaded = page.waitForEvent("download");
  await page.locator("#pdf").click();
  const file = await downloaded;
  const fs = await import("node:fs/promises");
  const { inflateSync } = await import("node:zlib");
  const bytes = await fs.readFile(await file.path());
  const raw = bytes.toString("latin1");
  expect((raw.match(/\/Type \/Page\b/g) || []).length).toBe(2);
  const streams = [];
  for (const match of raw.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    try {
      streams.push(inflateSync(bytes.subarray(start, end)).toString("latin1"));
    } catch {}
  }
  const drawing = streams.find((s) => (s.match(/ l\s+S/g) || []).length === 15);
  expect(Boolean(drawing)).toBeTruthy();
  const lines = [
    ...drawing.matchAll(/([\d.]+) ([\d.]+) m\s+([\d.]+) ([\d.]+) l\s+S/g),
  ].map((m) => m.slice(1).map(Number));
  expect(lines).toHaveLength(15);
  for (const [x1, y1, x2, y2] of lines) {
    expect(y1).toBeCloseTo(y2, 5);
    expect(x2 - x1).toBeGreaterThan(490);
    expect(y1).toBeGreaterThan(60);
  }
  const halfA4Points = (Math.abs(lines[0][1] - lines[14][1]) / 14) * 15;
  expect(halfA4Points).toBeCloseTo(841.89 / 2, 1);
  await fs.copyFile(await file.path(), "/tmp/mission-partner-response.pdf");
  await page.locator("#edit").click();
  const backupWait = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const backup = JSON.parse(
    await fs.readFile(await (await backupWait).path(), "utf8"),
  );
  expect(backup.partners.en).toBe("Legacy partner text");
});
