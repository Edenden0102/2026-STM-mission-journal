import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/600.css";
import "./style.css";
import { jsPDF } from "jspdf";
import {
  MAX_PHOTOS,
  compressPhoto,
  validatePhotos,
  verifyPhotoImages,
} from "./photos.js";
const KEY = "mission-journal-v1";
const pair = () => ({ zh: "", en: "" });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blank = () => ({
  version: 1,
  date: today(),
  activities: pair(),
  photos: [],
  reflections: [pair()],
  prayer: pair(),
  partners: pair(),
});
function validate(d) {
  if (
    !d ||
    d.version !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.date) ||
    !Number.isFinite(Date.parse(d.date)) ||
    !Array.isArray(d.reflections) ||
    d.reflections.length < 1 ||
    d.reflections.length > 100
  )
    throw Error("Invalid draft");
  for (const p of [d.activities, ...d.reflections, d.prayer, d.partners])
    if (
      !p ||
      typeof p.zh !== "string" ||
      typeof p.en !== "string" ||
      p.zh.length > 100000 ||
      p.en.length > 100000
    )
      throw Error("Invalid draft");
  return {
    version: 1,
    date: d.date,
    activities: { ...d.activities },
    photos: validatePhotos(d.photos),
    reflections: d.reflections.map((p) => ({ ...p })),
    prayer: { ...d.prayer },
    partners: { ...d.partners },
  };
}
let draft = blank(),
  initialMessage = "",
  photoBusy = false,
  photoMessage = "",
  storageWarning = "",
  savedStatus = "Draft saved on this device / 草稿保存在本机";
try {
  const saved = localStorage.getItem(KEY);
  if (saved) draft = validate(JSON.parse(saved));
} catch {
  initialMessage =
    "Saved draft could not be restored. Import a backup if available. / 无法恢复草稿，请导入备份。";
}
const labels = {
  activities: "Today's Activities | 当日主要行程",
  photos: "Today's Photos / 今日照片",
  reflections: "Reflections | 今日分享",
  prayer: "Prayer Requests | 代祷事项",
  partners: "Prayer Partners’ Reflection / 代祷伙伴回应",
};
const partnerInvitation = {
  en: "As you read today's sharing, what has God placed on your heart? You may write down your reflections, prayers, or responses below.",
  zh: "阅读今天的短宣分享后，神在你心中有什么感动？欢迎在下面写下你的领受、祷告或回应。",
};
const guidelines = [
  [
    "我（们）看见神在祂救恩计划中怎样工作？",
    "How did I/we see God at work in His plan of salvation?",
  ],
  [
    "我（们）透过哪些人、事看见神的工作？",
    "Through what people or experiences did I/we see His work?",
  ],
  ["我（们）对此有什么回应或感受？", "How did I/we respond to what we saw?"],
  [
    "我（们）领受到神呼召我（们）作出什么回应或生命更新？",
    "What response or transformation is God calling me/us to?",
  ],
];
const esc = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function inputs(key, p, index = "") {
  const id = key + index;
  const isCaption = key === "photos";
  return `<div class="pair"><label for="${id}-zh">中文${isCaption ? "说明（可选）" : ""} <span>Chinese · original or translation</span><textarea id="${id}-zh" data-key="${key}" data-index="${index}" data-lang="zh" placeholder="${isCaption ? "照片说明（可选）…" : "在这里写下今天的故事…"}">${esc(p.zh)}</textarea></label><label for="${id}-en">English${isCaption ? " caption (optional)" : ""} <span>英文 · original or translation</span><textarea id="${id}-en" data-key="${key}" data-index="${index}" data-lang="en" placeholder="${isCaption ? "Photo caption (optional)…" : "Write today's story here…"}">${esc(p.en)}</textarea></label></div><div class="translate"><button type="button" data-translate="${key}" data-index="${index}" data-source="zh">中文 → English</button><button type="button" data-translate="${key}" data-index="${index}" data-source="en">English → 中文</button></div>`;
}
function photosSection() {
  return `<section id="photos-section"><div class="section-title"><b>03</b><h2>Today's Photos <span>今日照片</span></h2></div><p class="hint">Up to 6 photos. Resized privately on this device; originals stay on your phone. JPG, PNG, and HEIC/HEIF where your browser supports them. / 最多6张。照片在本机缩小压缩，原图仍留在手机。支持 JPG、PNG，以及浏览器可打开的 HEIC/HEIF。</p><p class="hint">Photos are never sent for translation. Only captions are sent when you allow and request translation. / 照片不会发送以翻译；仅在您同意并点击翻译时发送说明文字。</p><button id="add-photos" type="button">＋ Add Photos / 添加照片 (${draft.photos.length}/6)</button><input hidden id="photo-files" type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic,.heif,.webp"><input hidden id="photo-replacement" type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic,.heif,.webp"><p id="photo-status" role="status">${esc(photoMessage)}</p><p id="storage-warning" role="alert">${esc(storageWarning)}</p><div class="photo-list">${draft.photos.map((photo, i) => `<article class="photo-card"><div class="photo-heading"><h3>Photo ${i + 1} / 照片 ${i + 1}</h3><div><button data-replace-photo="${i}" type="button">Replace / 替换</button><button data-remove-photo="${i}" type="button">Remove / 移除</button></div></div><img class="photo-image" src="${photo.data}" alt="Photo ${i + 1} / 照片 ${i + 1}" width="${photo.width}" height="${photo.height}">${inputs("photos", photo.caption, i)}</article>`).join("")}</div></section>`;
}
function photosPreview(photos) {
  if (!photos.length) return `<p class="hint">No photos added / 未添加照片</p>`;
  return `<div class="preview-gallery">${photos.map((photo, i) => `<figure><img src="${photo.data}" alt="Photo ${i + 1} / 照片 ${i + 1}" width="${photo.width}" height="${photo.height}"><figcaption><small>${i + 1}. Photo / 照片</small>${photo.caption.zh ? `<p lang="zh">${esc(photo.caption.zh)}</p>` : ""}${photo.caption.en ? `<p>${esc(photo.caption.en)}</p>` : ""}</figcaption></figure>`).join("")}</div>`;
}
function setPhotoBusy(busy) {
  photoBusy = busy;
  document.querySelector("#add-photos").disabled =
    busy || draft.photos.length >= MAX_PHOTOS;
  document.querySelector("#import-json").disabled = busy;
  document.querySelector("#preview").disabled = busy;
  document
    .querySelectorAll("[data-replace-photo],[data-remove-photo]")
    .forEach((button) => (button.disabled = busy));
}
function bindPhotos() {
  const files = document.querySelector("#photo-files"),
    replacement = document.querySelector("#photo-replacement");
  document.querySelector("#add-photos").onclick = () => files.click();
  files.onchange = () => processPhotos([...files.files]);
  document.querySelectorAll("[data-replace-photo]").forEach(
    (button) =>
      (button.onclick = () => {
        replacement.dataset.index = button.dataset.replacePhoto;
        replacement.click();
      }),
  );
  replacement.onchange = () =>
    processPhotos([...replacement.files], Number(replacement.dataset.index));
  document.querySelectorAll("[data-remove-photo]").forEach(
    (button) =>
      (button.onclick = () => {
        draft.photos.splice(Number(button.dataset.removePhoto), 1);
        photoMessage = "Photo removed / 照片已移除";
        render();
        save();
      }),
  );
}
async function processPhotos(files, replaceIndex) {
  if (!files.length || photoBusy) return;
  setPhotoBusy(true);
  const currentDraft = draft;
  const replacing = Number.isInteger(replaceIndex);
  const room = replacing ? 1 : MAX_PHOTOS - draft.photos.length;
  const selected = files.slice(0, room);
  const notices =
    files.length > room
      ? [
          "Only 6 photos are allowed; extra files were not added. / 最多6张，未添加多余照片。",
        ]
      : [];
  let added = 0;
  try {
    for (const [i, file] of selected.entries()) {
      document.querySelector("#photo-status").textContent =
        `Preparing photo ${i + 1}/${selected.length}… / 正在处理照片…`;
      try {
        const photo = await compressPhoto(file);
        if (draft !== currentDraft) break;
        if (replacing)
          draft.photos[replaceIndex] = {
            ...photo,
            caption: draft.photos[replaceIndex].caption,
          };
        else draft.photos.push({ ...photo, caption: pair() });
        added++;
      } catch (error) {
        notices.push(error.message);
      }
    }
    photoMessage = [
      added
        ? `${added} photo(s) ready / ${added} 张照片已就绪`
        : "No photos changed / 照片未更改",
      ...notices,
    ].join(" ");
  } finally {
    photoBusy = false;
    render();
    save();
  }
}
function render() {
  const consent = document.querySelector("#consent")?.checked ?? false;
  document.querySelector("#app").innerHTML =
    `<header><div class="brand">✦ &nbsp; GOLDEN TRIANGLE · THAILAND · 2026</div><h1>Mission Journal<span lang="zh">短宣每日分享</span></h1><p>A little space to notice God’s work.<br>记录恩典，与代祷伙伴同行。</p></header><main><div class="toolbar"><span id="saved" role="status">${esc(savedStatus)}</span><div><button id="export-json">Export draft / 导出</button><button id="import-json">Import draft / 导入</button><input hidden type="file" id="file" accept="application/json,.json"></div></div><div class="privacy"><strong>Your journal stays with you. / 日志留在您的设备。</strong><p>No account or public storage. Export a backup before changing devices or clearing browser data. Optional translation sends only the selected text to MyMemory, a third-party free service. / 无需登录。请导出备份。可选翻译会将所选文字发送至第三方 MyMemory 服务。</p><label class="consent"><input type="checkbox" id="consent"> Allow selected text to be sent for translation / 同意发送所选文字以翻译</label></div><p id="message" role="status" aria-live="polite">${esc(initialMessage)}</p><section><div class="section-title"><b>01</b><h2>Date <span>日期</span></h2></div><label for="date">Journal date / 分享日期</label><input type="date" id="date" value="${draft.date}" required></section><section><div class="section-title"><b>02</b><h2>Today's Activities <span>当日主要行程</span></h2></div>${inputs("activities", draft.activities)}</section>${photosSection()}<section><div class="section-title"><b>04</b><h2>Reflections <span>今日分享</span></h2></div><details open><summary>Writing invitations / 分享指引 <small>Optional · 不必逐题回答</small></summary><ol>${guidelines.map(([z, e]) => `<li><span lang="zh">${z}</span><span>${e}</span></li>`).join("")}</ol><p class="hint">These invitations will not appear in your PDF. / 指引不会出现在 PDF 中。</p></details><div id="reflections">${draft.reflections.map((p, i) => `<article><div class="reflection-heading"><h3>Reflection ${i + 1} / 分享 ${i + 1}</h3>${draft.reflections.length > 1 ? `<button data-remove="${i}">Remove / 移除</button>` : ""}</div>${inputs("reflections", p, i)}</article>`).join("")}</div><button id="add">＋ Add Reflection / 添加分享</button></section><section><div class="section-title"><b>05</b><h2>Prayer Requests <span>代祷事项</span></h2></div>${inputs("prayer", draft.prayer)}</section><section><div class="section-title"><b>06</b><h2>Prayer Partners’ Reflection <span>代祷伙伴回应</span></h2></div><p class="hint">For prayer partners reading the PDF. A bilingual invitation and half a page of writing lines are included automatically; the STM team does not need to fill this in. / 此栏供阅读 PDF 的代祷伙伴回应，自动附上双语邀请和半页书写横线，短宣队无需填写。</p></section><div class="finish"><p>Ready to share the day’s story? / 准备分享今天的故事？</p><button class="primary" id="preview">Preview & export PDF / 预览并导出 PDF</button></div><footer>Made for prayer, reflection, and connection.<br>2026 Golden Triangle STM · 金三角短宣</footer></main><dialog id="preview-dialog"><div class="dialog-actions"><button id="edit">← Back to editing / 返回编辑</button><button class="primary" id="pdf">Download PDF / 下载 PDF</button></div><p class="hint">Review below. To change text, return to editing. / 请检查内容，修改请返回编辑。</p><div id="document"></div><p id="pdf-status" role="status"></p></dialog>`;
  bind();
  document.querySelector("#consent").checked = consent;
  setPhotoBusy(photoBusy);
}
function message(s) {
  document.querySelector("#message").textContent = s;
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
    savedStatus = "Saved on this device / 已保存到本机";
    storageWarning = "";
  } catch {
    savedStatus =
      "Draft not saved — export a JSON backup / 草稿未保存，请导出备份";
    storageWarning =
      "Device storage is full or unavailable. Current photos and text remain here, but may be lost on reload. Export a JSON backup now, or remove photos to save a smaller draft. / 设备存储已满或不可用。照片和文字仍在当前页面，刷新可能丢失。请立即导出 JSON 备份，或移除照片以减小草稿。";
  }
  document.querySelector("#saved").textContent = savedStatus;
  document.querySelector("#storage-warning").textContent = storageWarning;
}
function getPair(k, i) {
  if (k === "photos") return draft.photos[Number(i)]?.caption;
  return k === "reflections" ? draft.reflections[Number(i)] : draft[k];
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function bind() {
  document.querySelectorAll("textarea").forEach((el) =>
    el.addEventListener("input", () => {
      getPair(el.dataset.key, el.dataset.index)[el.dataset.lang] = el.value;
      save();
    }),
  );
  document.querySelector("#date").onchange = (e) => {
    if (e.target.value) {
      draft.date = e.target.value;
      save();
    }
  };
  document.querySelector("#add").onclick = () => {
    if (draft.reflections.length >= 100)
      return message("Maximum 100 reflections. / 最多100条分享。");
    draft.reflections.push(pair());
    render();
    save();
    document
      .querySelector(`#reflections${draft.reflections.length - 1}-zh`)
      .focus();
  };
  document.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        const i = Number(b.dataset.remove);
        if (
          (draft.reflections[i].zh || draft.reflections[i].en) &&
          !confirm("Remove this reflection? / 删除这条分享？")
        )
          return;
        draft.reflections.splice(i, 1);
        render();
        save();
      }),
  );
  document
    .querySelectorAll("[data-translate]")
    .forEach((b) => (b.onclick = () => translate(b)));
  document.querySelector("#export-json").onclick = () =>
    download(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
      `mission-journal-${draft.date}.json`,
    );
  document.querySelector("#import-json").onclick = () =>
    document.querySelector("#file").click();
  bindPhotos();
  document.querySelector("#file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (f.size > 5e6) throw Error();
      const next = validate(JSON.parse(await f.text()));
      await verifyPhotoImages(next.photos);
      if (
        !confirm(
          "Replace the current draft with this file? Export your current draft first if needed. / 用此文件替换当前草稿？",
        )
      )
        return;
      draft = next;
      render();
      save();
      message("Draft imported, including photos / 草稿及照片已导入");
    } catch {
      message(
        "Invalid draft file. Your current draft was kept. / 文件无效，当前草稿未更改。",
      );
    } finally {
      e.target.value = "";
    }
  };
  document.querySelector("#preview").onclick = () => {
    document.querySelector("#document").innerHTML = previewHtml();
    document.querySelector("#preview-dialog").showModal();
  };
  document.querySelector("#edit").onclick = () =>
    document.querySelector("#preview-dialog").close();
  document.querySelector("#pdf").onclick = exportPdf;
}
async function translate(b) {
  if (!document.querySelector("#consent").checked)
    return message(
      "Please allow third-party translation above, or enter a translation manually. / 请先同意第三方翻译，或手动填写。",
    );
  const p = getPair(b.dataset.translate, b.dataset.index),
    from = b.dataset.source,
    to = from === "zh" ? "en" : "zh",
    original = p[from],
    target = p[to];
  if (!original.trim())
    return message("Write the source text first. / 请先填写原文。");
  if (target.trim())
    return message(
      "The translation field already has text. Edit it manually; existing text is preserved. / 翻译栏已有文字，请手动编辑。",
    );
  if (original.length > 450)
    return message(
      "Free translation supports up to 450 characters at a time. Please translate this longer entry manually. / 免费翻译每次最多450字符，长篇请手动翻译。",
    );
  b.disabled = true;
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(original)}&langpair=${from === "zh" ? "zh-CN" : "en"}|${to === "zh" ? "zh-CN" : "en"}`,
      { signal: controller.signal },
    );
    if (!r.ok) throw Error();
    const data = await r.json();
    const result = data.responseData?.translatedText;
    if (
      data.responseStatus !== 200 ||
      typeof result !== "string" ||
      !result.trim() ||
      data.quotaFinished
    )
      throw Error();
    if (
      p[from] !== original ||
      p[to] !== target ||
      getPair(b.dataset.translate, b.dataset.index) !== p
    )
      return message(
        "Entry changed during translation. Please try again. / 内容已更改，请重试。",
      );
    p[to] = result;
    document.querySelector(
      `#${b.dataset.translate}${b.dataset.index}-${to}`,
    ).value = result;
    save();
    message(
      "Translation added. Please review accuracy before sharing. / 已添加翻译，请检查准确性。",
    );
  } catch {
    message(
      "Automatic translation is unavailable. Your original is safe; enter the translation manually. / 自动翻译暂不可用，原文已保留，请手动填写翻译。",
    );
  } finally {
    clearTimeout(timer);
    b.disabled = false;
  }
}
function previewHtml() {
  const content = (p) =>
    `<div class="preview-pair"><p lang="zh">${esc(p.zh || "（未填写）")}</p><p>${esc(p.en || "(Not provided)")}</p></div>`;
  return `<div class="paper-header"><small>MISSION JOURNAL · DAILY UPDATE</small><h2>2026 Golden Triangle STM — Daily Update</h2><h2 lang="zh">2026 金三角短宣每日分享</h2></div><h3>Date | 日期</h3><p>${draft.date}</p>${Object.entries(
    labels,
  )
    .map(
      ([k, l]) =>
        `<h3>${l}</h3>${k === "photos" ? photosPreview(draft.photos) : k === "partners" ? `<div class="partner-response"><p>${esc(partnerInvitation.en)}</p><p lang="zh">${partnerInvitation.zh}</p><div class="writing-space" aria-label="Blank writing space for prayer partners / 代祷伙伴书写空间">${Array.from({ length: 15 }, () => `<div class="writing-line"></div>`).join("")}</div></div>` : k === "reflections" ? draft.reflections.map((p, i) => `<h4>${i + 1}. 分享 / Reflection</h4>${content(p)}`).join("") : content(draft[k])}`,
    )
    .join("")}`;
}
async function exportPdf() {
  const snapshot = validate(JSON.parse(JSON.stringify(draft)));
  const b = document.querySelector("#pdf"),
    status = document.querySelector("#pdf-status");
  b.disabled = true;
  status.textContent = "Preparing Chinese fonts & PDF… / 正在准备字体和 PDF…";
  try {
    const all =
      [
        snapshot.activities,
        ...snapshot.photos.map((p) => p.caption),
        ...snapshot.reflections,
        snapshot.prayer,
      ]
        .map((p) => p.zh + p.en)
        .join("") +
      Object.values(labels).join("") +
      "2026 金三角短宣每日分享日期未填写分享 No photos added / 未添加照片 Caption continues below / 说明见后文 Photo caption / 照片说明" +
      partnerInvitation.en +
      partnerInvitation.zh;
    await document.fonts.load('400 24px "Noto Sans SC"', all);
    await document.fonts.ready;
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    await verifyPhotoImages(snapshot.photos);
    const W = 1240,
      H = 1754,
      M = 100;
    let pagePhotos = [];
    let canvas,
      ctx,
      y,
      page = 0;
    function newPage() {
      canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      y = M;
      pagePhotos = [];
      page++;
    }
    function finish() {
      ctx.font = '20px "Noto Sans SC",sans-serif';
      ctx.fillStyle = "#68766b";
      ctx.fillText(`2026 Golden Triangle STM · ${snapshot.date}`, M, H - 60);
      ctx.fillText(String(page), W - M - 25, H - 60);
      if (page > 1) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
      // Keep photo JPEGs compressed instead of flattening them into large PNG pages.
      for (const photo of pagePhotos) {
        pdf.addImage(
          photo.data,
          "JPEG",
          (photo.x / W) * 210,
          (photo.y / H) * 297,
          (photo.width / W) * 210,
          (photo.height / H) * 297,
        );
      }
    }
    function line(s, size = 25, color = "#263a2e") {
      if (y + size * 1.7 > H - 120) {
        finish();
        newPage();
      }
      ctx.font = `${size}px "Noto Sans SC",sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(s, M, y + size);
      y += size * 1.65;
    }
    function text(s, size = 25, color) {
      for (const paragraph of s.split("\n")) {
        let row = "";
        ctx.font = `${size}px "Noto Sans SC",sans-serif`;
        for (const char of paragraph) {
          if (ctx.measureText(row + char).width > W - 2 * M && row) {
            line(row, size, color);
            row = "";
          }
          row += char;
        }
        line(row, size, color);
      }
    }
    function heading(s) {
      if (y + 150 > H - 120) {
        finish();
        newPage();
      }
      y += 25;
      text(s, 29, "#536b59");
      y += 8;
    }
    async function drawPhotos(photos) {
      if (!photos.length) {
        heading(labels.photos);
        text("No photos added / 未添加照片", 23, "#68766b");
        return;
      }
      // A generous two-column gallery. Full images are contained, never cropped.
      // Each row reserves room for both captions and remains within the print margins.
      finish();
      newPage();
      heading(labels.photos);
      const gap = 30,
        columnWidth = (W - 2 * M - gap) / 2;
      const imageHeight = 390;
      function captionLines(s) {
        const result = [];
        ctx.font = '23px "Noto Sans SC",sans-serif';
        // Wrap English at words and Chinese at characters; split very long words safely.
        for (const paragraph of s.split("\n")) {
          let row = "";
          for (const token of paragraph.match(
            /[A-Za-z0-9’'’-]+|[^A-Za-z0-9’'’-]/gu,
          ) || [""]) {
            if (ctx.measureText(row + token).width <= columnWidth) {
              row += token;
              continue;
            }
            if (row) {
              result.push(row.trimEnd());
              row = "";
            }
            for (const char of token) {
              if (ctx.measureText(row + char).width > columnWidth && row) {
                result.push(row);
                row = "";
              }
              row += char;
            }
          }
          if (row.trim()) result.push(row.trimEnd());
        }
        return result;
      }
      for (let i = 0; i < photos.length; i += 2) {
        const entries = photos.slice(i, i + 2).map((photo) => ({
          photo,
          lines: [
            ...captionLines(photo.caption.zh),
            ...captionLines(photo.caption.en),
          ],
        }));
        // Very long captions continue as text after the gallery without truncation.
        const longest = Math.max(
          ...entries.map((entry) => Math.min(entry.lines.length, 10)),
        );
        const rowHeight = imageHeight + 60 + longest * 36;
        if (y + rowHeight > H - 120) {
          finish();
          newPage();
          heading(labels.photos);
        }
        const rowY = y;
        entries.forEach(({ photo, lines }, col) => {
          const x = M + col * (columnWidth + gap);
          ctx.fillStyle = "#f4f6ef";
          ctx.fillRect(x, rowY, columnWidth, imageHeight);
          const scale = Math.min(
            columnWidth / photo.width,
            imageHeight / photo.height,
          );
          const width = photo.width * scale,
            height = photo.height * scale;
          pagePhotos.push({
            data: photo.data,
            x: x + (columnWidth - width) / 2,
            y: rowY + (imageHeight - height) / 2,
            width,
            height,
          });
          ctx.font = '20px "Noto Sans SC",sans-serif';
          ctx.fillStyle = "#68766b";
          ctx.fillText(
            `${i + col + 1}. Photo / 照片`,
            x,
            rowY + imageHeight + 29,
          );
          ctx.font = '23px "Noto Sans SC",sans-serif';
          ctx.fillStyle = "#263a2e";
          if (lines.length <= 10)
            lines.forEach((s, n) =>
              ctx.fillText(s, x, rowY + imageHeight + 64 + n * 36),
            );
          else
            ctx.fillText(
              "Caption continues below / 说明见后文",
              x,
              rowY + imageHeight + 64,
            );
        });
        y = rowY + rowHeight;
      }
      for (const [index, photo] of photos.entries()) {
        if (
          captionLines(photo.caption.zh).length +
            captionLines(photo.caption.en).length >
          10
        ) {
          heading(`${index + 1}. Photo caption / 照片说明`);
          if (photo.caption.zh) text(photo.caption.zh);
          if (photo.caption.en) text(photo.caption.en);
        }
      }
      y += 20;
    }
    newPage();
    text("2026 Golden Triangle STM — Daily Update", 34, "#536b59");
    text("2026 金三角短宣每日分享", 32, "#536b59");
    heading("Date | 日期");
    text(snapshot.date);
    for (const [k, l] of Object.entries(labels)) {
      if (k === "partners") continue;
      if (k === "photos") {
        await drawPhotos(snapshot.photos);
        continue;
      }
      heading(l);
      const pairs = k === "reflections" ? snapshot.reflections : [snapshot[k]];
      pairs.forEach((p, i) => {
        if (k === "reflections")
          text(`${i + 1}. 分享 / Reflection`, 23, "#68766b");
        text(p.zh || "（未填写）");
        y += 8;
        text(p.en || "(Not provided)");
        y += 18;
      });
    }
    // Keep the recipient invitation and its writing area together on a final page.
    finish();
    newPage();
    heading(labels.partners);
    // Wrap the fixed English invitation at word boundaries.
    let invitationRow = "";
    ctx.font = '25px "Noto Sans SC",sans-serif';
    for (const word of partnerInvitation.en.split(" ")) {
      const candidate = invitationRow ? `${invitationRow} ${word}` : word;
      if (ctx.measureText(candidate).width > W - 2 * M && invitationRow) {
        line(invitationRow);
        invitationRow = word;
      } else {
        invitationRow = candidate;
      }
    }
    line(invitationRow);
    y += 12;
    text(partnerInvitation.zh);
    y += 25;
    const writingTop = (y / H) * 297;
    const writingHeight = 148.5; // Half of an A4 page, never collapsed by pagination.
    finish();
    // PDF drawing commands print independently of browser background settings.
    pdf.setDrawColor(190, 200, 186);
    pdf.setLineWidth(0.15);
    for (let i = 1; i <= 15; i++) {
      const lineY = writingTop + (i * writingHeight) / 15;
      pdf.line((M / W) * 210, lineY, ((W - M) / W) * 210, lineY);
    }
    download(pdf.output("blob"), `mission-journal-${snapshot.date}.pdf`);
    status.textContent =
      "PDF downloaded. On iPhone, use the download or Share menu to save to Files. / PDF 已下载；iPhone 可通过分享菜单保存到文件。";
  } catch (e) {
    console.error(e);
    status.textContent =
      "PDF could not be generated. Please try again; your draft is preserved. / PDF 生成失败，请重试，草稿已保留。";
  } finally {
    b.disabled = false;
  }
}
render();
