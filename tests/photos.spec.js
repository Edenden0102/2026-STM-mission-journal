import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { inflateSync } from "node:zlib";

async function photoFile(
  page,
  {
    name = "landscape.jpg",
    width = 2400,
    height = 1600,
    type = "image/jpeg",
    noise = false,
  } = {},
) {
  const data = await page.evaluate(
    ({ width, height, type, noise }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#719477";
      ctx.fillRect(0, 0, width, height);
      // Distinct borders make accidental cropping visible in a rendered PDF.
      ctx.fillStyle = "#c1d9e9";
      ctx.fillRect(0, 0, width, height / 2);
      ctx.fillStyle = "#f9d36b";
      ctx.fillRect(width * 0.42, height * 0.12, width * 0.16, height * 0.2);
      ctx.fillStyle = "#fff";
      ctx.lineWidth = width * 0.03;
      ctx.strokeRect(width * 0.02, height * 0.02, width * 0.96, height * 0.96);
      if (noise) {
        const pixels = ctx.getImageData(0, 0, width, height);
        let seed = 1;
        for (let i = 0; i < pixels.data.length; i += 4) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          pixels.data[i] = seed & 255;
          pixels.data[i + 1] = (seed >>> 8) & 255;
          pixels.data[i + 2] = (seed >>> 16) & 255;
        }
        ctx.putImageData(pixels, 0, 0);
      }
      return canvas.toDataURL(type, 0.95);
    },
    { width, height, type, noise },
  );
  return {
    name,
    mimeType: type,
    buffer: Buffer.from(data.split(",")[1], "base64"),
  };
}
async function upload(page, files) {
  await page.locator("#photo-files").setInputFiles(files);
  await expect(page.locator("#photo-status")).toContainText("ready");
}
function contentStreams(bytes) {
  const raw = bytes.toString("latin1"),
    streams = [];
  for (const match of raw.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length,
      end = raw.indexOf("endstream", start);
    try {
      const text = inflateSync(bytes.subarray(start, end)).toString("latin1");
      if (text.includes(" cm")) streams.push(text);
    } catch {}
  }
  return streams;
}

test("private uploads resize/compress, restore in drafts, replace without losing captions, and enforce six-photo limit", async ({
  page,
}) => {
  await page.goto("/");
  const external = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173/") &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  const noisy = await photoFile(page, {
    width: 1800,
    height: 1200,
    noise: true,
  });
  const portrait = await photoFile(page, {
    name: "portrait.png",
    type: "image/png",
    width: 1000,
    height: 1800,
  });
  await upload(page, [noisy, portrait]);
  await expect(page.locator(".photo-image")).toHaveCount(2);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mission-journal-v1")),
  );
  expect(stored.photos[0].width).toBeLessThanOrEqual(1280);
  expect(stored.photos[0].height).toBeLessThanOrEqual(1280);
  expect(
    Buffer.from(stored.photos[0].data.split(",")[1], "base64").length,
  ).toBeLessThanOrEqual(164000);
  expect(stored.photos[0].data.length).toBeLessThan(noisy.buffer.length);
  await page.locator("#photos0-zh").fill("与当地朋友同行");
  await page.locator("#photos0-en").fill("Walking with local friends.");
  await page.reload();
  await expect(page.locator(".photo-image")).toHaveCount(2);
  await expect(page.locator("#photos0-zh")).toHaveValue("与当地朋友同行");
  const first = await page.locator(".photo-image").first().getAttribute("src");
  await page.locator('[data-replace-photo="0"]').click();
  await page.locator("#photo-replacement").setInputFiles(portrait);
  await expect(page.locator("#photo-status")).toContainText("ready");
  expect(
    await page.locator(".photo-image").first().getAttribute("src"),
  ).not.toBe(first);
  await expect(page.locator("#photos0-en")).toHaveValue(
    "Walking with local friends.",
  );
  await upload(
    page,
    Array.from({ length: 5 }, (_, i) => ({
      ...portrait,
      name: `extra-${i}.png`,
    })),
  );
  await expect(page.locator(".photo-image")).toHaveCount(6);
  await expect(page.locator("#photo-status")).toContainText("Only 6");
  await expect(page.locator("#add-photos")).toBeDisabled();
  await page.locator('[data-remove-photo="5"]').click();
  await expect(page.locator(".photo-image")).toHaveCount(5);
  await expect(page.locator("#add-photos")).toBeEnabled();
  expect(external).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("photo JSON backup restores pictures/captions; caption translation sends text only; unsupported iPhone image has a clear fallback", async ({
  page,
}) => {
  await page.goto("/");
  const photo = await photoFile(page);
  await upload(page, [photo]);
  await page.locator("#photos0-zh").fill("神的恩典");
  const sent = [];
  await page.route("https://api.mymemory.translated.net/**", (r) => {
    sent.push(r.request().url());
    return r.fulfill({
      json: {
        responseStatus: 200,
        responseData: { translatedText: "God’s grace" },
      },
    });
  });
  await page.locator("#consent").check();
  await page
    .locator('[data-translate="photos"][data-index="0"][data-source="zh"]')
    .click();
  await expect(page.locator("#photos0-en")).toHaveValue("God’s grace");
  expect(new URL(sent[0]).searchParams.get("q")).toBe("神的恩典");
  expect(sent[0]).not.toContain("base64");
  const backupWait = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const backup = await backupWait;
  const content = JSON.parse(await fs.readFile(await backup.path(), "utf8"));
  expect(content.photos[0].data).toMatch(/^data:image\/jpeg;base64,/);
  await page.locator('[data-remove-photo="0"]').click();
  page.on("dialog", (d) => d.accept());
  await page.locator("#file").setInputFiles(await backup.path());
  await expect(page.locator(".photo-image")).toHaveCount(1);
  await expect(page.locator("#photos0-en")).toHaveValue("God’s grace");
  await page.locator("#photo-files").setInputFiles({
    name: "unsupported.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("Not a browser-decodable HEIC image"),
  });
  await expect(page.locator("#photo-status")).toContainText(
    "Export it as JPG or PNG",
  );
  await expect(page.locator(".photo-image")).toHaveCount(1);
  const malicious = {
    ...content,
    photos: [
      { ...content.photos[0], data: "https://example.com/private-image.jpg" },
    ],
  };
  await page.locator("#file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(malicious)),
  });
  await expect(page.locator("#message")).toContainText("Invalid draft");
  await expect(page.locator(".photo-image")).toHaveCount(1);
});

test("storage failure warns without losing current photos or preventing a full backup", async ({
  page,
}) => {
  await page.goto("/");
  const photo = await photoFile(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await upload(page, [photo]);
  await expect(page.locator("#storage-warning")).toContainText(
    "Device storage is full or unavailable",
  );
  await expect(page.locator("#saved")).toContainText("Draft not saved");
  await expect(page.locator(".photo-image")).toHaveCount(1);
  const backupWait = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const backup = await backupWait;
  expect(
    JSON.parse(await fs.readFile(await backup.path(), "utf8")).photos,
  ).toHaveLength(1);
});

test("PDF contains six uncropped compressed photos in order, bilingual captions, and final printable writing lines", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const fixtures = [];
  for (let i = 0; i < 6; i++)
    fixtures.push(
      await photoFile(page, {
        name: `photo-${i}.jpg`,
        width: i % 2 ? 900 : 1800,
        height: i % 2 ? 1800 : 900,
        noise: i === 0,
      }),
    );
  await upload(page, fixtures);
  await page.locator("#activities-en").fill("Activities before photos.");
  for (let i = 0; i < 6; i++) {
    await page.locator(`#photos${i}-zh`).fill(`照片 ${i + 1}：感恩神的带领。`);
    await page
      .locator(`#photos${i}-en`)
      .fill(`Photo ${i + 1}: Thankful for God’s guidance.`);
  }
  await page
    .locator("#photos5-en")
    .fill("A longer bilingual caption is never truncated. ".repeat(30));
  await page.locator("#reflections0-en").fill("Reflections after photos.");
  await expect(page.locator("main > section h2")).toHaveText([
    "Date 日期",
    "Today's Activities 当日主要行程",
    "Today's Photos 今日照片",
    "Reflections 今日分享",
    "Prayer Requests 代祷事项",
    "Prayer Partners’ Reflection 代祷伙伴回应",
  ]);
  await page.locator("#preview").click();
  await expect(page.locator("#document h3")).toHaveText([
    "Date | 日期",
    "Today's Activities | 当日主要行程",
    "Today's Photos / 今日照片",
    "Reflections | 今日分享",
    "Prayer Requests | 代祷事项",
    "Prayer Partners’ Reflection / 代祷伙伴回应",
  ]);
  await expect(page.locator(".preview-gallery img")).toHaveCount(6);
  await expect(page.locator(".preview-gallery")).toContainText(
    "照片 1：感恩神的带领。",
  );
  const wait = page.waitForEvent("download");
  await page.locator("#pdf").click();
  const file = await wait;
  const bytes = await fs.readFile(await file.path());
  const raw = bytes.toString("latin1");
  expect(bytes.length).toBeLessThan(2200000);
  const streams = contentStreams(bytes);
  const drawing = streams.at(-1);
  expect((drawing.match(/ l\s+S/g) || []).length).toBe(15);
  const placements = [];
  for (const stream of streams)
    for (const match of stream.matchAll(
      /([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s+\/I\d+ Do/g,
    )) {
      const [w, h, x, y] = match.slice(1).map(Number);
      if (w < 500 && h < 500) placements.push({ w, h, x, y });
    }
  expect(placements).toHaveLength(6);
  for (let i = 0; i < 6; i++) {
    const p = placements[i];
    expect(p.w / p.h).toBeCloseTo(i % 2 ? 0.5 : 2, 1);
    expect(p.x).toBeGreaterThan(40);
    expect(p.y).toBeGreaterThan(40);
    expect(p.x + p.w).toBeLessThan(555);
    expect(p.y + p.h).toBeLessThan(810);
  }
  const path = `/tmp/mission-photos-${testInfo.project.name}.pdf`;
  await fs.copyFile(await file.path(), path);
  console.log(
    `${testInfo.project.name} six-photo PDF: ${Math.round(bytes.length / 1024)} KB`,
  );
});

test("camera orientation is honored and compression removes EXIF metadata", async ({
  page,
}) => {
  await page.goto("/");
  const file = await photoFile(page, { width: 1200, height: 600 });
  // JPEG APP1: little-endian EXIF orientation 6 (90 degrees clockwise).
  const exif = Buffer.from(
    "45786966000049492a0008000000010012010300010000000600000000000000",
    "hex",
  );
  const marker = Buffer.alloc(4);
  marker[0] = 0xff;
  marker[1] = 0xe1;
  marker.writeUInt16BE(exif.length + 2, 2);
  file.buffer = Buffer.concat([
    file.buffer.subarray(0, 2),
    marker,
    exif,
    file.buffer.subarray(2),
  ]);
  await upload(page, [file]);
  const photo = await page.evaluate(
    () => JSON.parse(localStorage.getItem("mission-journal-v1")).photos[0],
  );
  expect(photo.width).toBe(600);
  expect(photo.height).toBe(1200);
  expect(
    Buffer.from(photo.data.split(",")[1], "base64").includes(
      Buffer.from("Exif"),
    ),
  ).toBeFalsy();
});
