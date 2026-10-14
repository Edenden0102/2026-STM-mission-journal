# Mission Journal | 短宣每日分享

A free, mobile-friendly Chinese–English daily journal for the **2026 Golden Triangle STM** team in Thailand. No account, paid API, extension, or app installation is needed. The sage, cream, and white website runs entirely in the browser.

## Publish on GitHub Pages — no programming required

The website files must first be saved to the `main` branch of **Edenden0102/2026-STM-mission-journal**. If these changes are provided as a pull request, open that pull request on GitHub and click **Merge pull request**, then **Confirm merge**. The steps below publish those saved files; local workspace changes do not appear on GitHub automatically.

1. Sign in to GitHub and open the **2026-STM-mission-journal** repository.
2. For free hosting, use a **public repository**. If necessary, open **Settings → General → Danger Zone → Change repository visibility → Make public**. Only website source files should be committed: never upload private journal JSON files or PDFs to the repository.
3. Open the repository's **Settings** tab. Choose **Pages** from the left menu (under “Code and automation”).
4. Under **Build and deployment**, change **Source** to **GitHub Actions**. No custom domain is required.
5. Open the **Actions** tab and choose **Deploy Mission Journal** on the left. If GitHub asks you to enable workflows, enable them. Click **Run workflow**, leave the branch as **main**, and click the green **Run workflow** button.
6. Wait a few minutes. Open the latest run and check that both **build** and **deploy** have green check marks. If the run failed before you selected GitHub Actions in Pages settings, repeat step 5.
7. Return to **Settings → Pages**. GitHub displays the published website address. Click **Visit site** and try writing a short Chinese and English update and downloading its PDF.
8. Share that single website link with the team. The expected address for this repository is `https://edenden0102.github.io/2026-STM-mission-journal/`, but use the address GitHub actually displays after successful deployment.

Future changes saved to `main` deploy automatically. Readers do **not** need a GitHub account. Each person has their **own** device-local draft; the shared link does not synchronize entries between teammates. To combine contributions, exchange text or exported JSON files privately.

## Write and share an update

1. Choose the date. Write today's activities in the Chinese or English box.
2. Add up to six photos under **Today's Photos / 今日照片**, immediately after activities. Preview, remove, or replace any photo and add optional Chinese/English captions. Caption translation works like the other text fields.
3. Write reflections; use **Add Reflection / 添加分享** for separate contributions. The four bilingual writing invitations are optional and are excluded from the PDF.
4. Add prayer requests. The final PDF section is for prayer partners to complete after reading; the STM team does not fill it in.
5. Enter the other language yourself, or select the translation consent checkbox and press the relevant **中文 → English** or **English → 中文** button. Review and edit translations before sharing.
6. Select **Preview & export PDF / 预览并导出 PDF**. Use **Back to editing** to correct anything. Select **Download PDF** when ready.
7. On iPhone, open the browser's download and use **Share → Save to Files** if needed. On Android, check **Downloads**. Send the saved PDF to prayer partners through your usual messaging app.

The PDF is A4 with both languages, date, activities, photos and bilingual captions, team reflections, prayer requests, a final “Prayer Partners’ Reflection / 代祷伙伴回应” section, page numbers, and Chinese-capable fonts bundled with the website. Empty journal language fields are marked “Not provided / 未填写”; optional empty photo captions are omitted. Long entries continue onto additional pages. The final recipient section starts on its own page, includes a fixed Chinese–English invitation, and reserves half an A4 page (148.5 mm) with 15 subtle writing lines. These lines are actual PDF drawing commands and remain when printed, regardless of browser background-printing settings. PDF pages use high-resolution raster text to preserve Chinese rendering across PDF viewers; PDF text is not selectable or searchable. The preview lets you check content; final A4 pagination is applied during export.

## Photos

- Choose JPG/JPEG, PNG, or WebP. HEIC/HEIF (common iPhone originals) works only when the browser can decode it; otherwise the app asks for JPG or PNG. No remote image converter is used. Your phone may automatically supply a compatible image from its photo picker.
- Photos are processed sequentially on the device to reduce memory use, contained without cropping, and converted to JPEG. The longest edge is at most 1280 pixels, with a target maximum of 160 KB per compressed photo. Compression removes embedded EXIF/location metadata and honors native camera orientation. Original photos are not changed. Files larger than 40 MB or 60 megapixels are rejected with a message.
- The A4 PDF uses a two-column gallery before reflections, with full landscape/portrait images and both caption languages. Long captions continue below the gallery without truncation. Photos remain compressed JPEGs inside the PDF, instead of large PNG screenshots. PDF size depends on the number of pages and entry length; the six-photo stress-test PDF was approximately 641 KB.
- Photos are stored in the same local draft and included as compressed image data in JSON exports. Earlier drafts without photos still import normally. Import checks that image data is local JPEG data and actually decodes. The JSON file limit remains 5 MB.
- If device storage is full or disabled, editing and exporting still work, but new changes are not safely saved. The app displays a warning; **export a JSON backup before reloading**, or remove photos to reduce the draft size. This warning also applies to lengthy text drafts.
- Photos are never uploaded to GitHub, MyMemory, or another server. Only caption text is sent when you explicitly allow and click automatic translation. Keep your JSON backups and PDFs private.

## Drafts and privacy

- Edits save automatically to this browser's local storage. No public database or application server receives journal entries.
- Browser privacy modes, storage restrictions, clearing browser data, or changing devices can remove drafts. If storage is unavailable, the app shows a warning and keeps editing available.
- Use **Export draft** regularly to save a JSON backup. Keep it private, just like the PDF. **Import draft** validates a backup and asks before replacing the current draft. Export the current draft first if you need to keep it.
- Import/export and PDF generation happen locally. An imported file is treated as text, not executable HTML.
- Optional automatic translation uses the free **MyMemory** public translation API. Only after consent and a translation click does the selected source text leave the device. MyMemory's own retention and usage terms apply; avoid submitting sensitive information. No API key is required. Network access, daily quotas, provider availability, and browser CORS restrictions can prevent translation.
- Automatic translation accepts up to 450 characters per request. Longer entries can always be translated manually. Existing originals and nonempty translation fields are never overwritten. A provider failure clearly offers manual translation.
- GitHub hosts public application files, not journal entries. No analytics are included. Fonts and PDF code are bundled; no external font or PDF CDN is needed.

## Development

Requirements: Node.js 24 LTS and npm. Use the existing checkout; cloud tasks already run in isolation and do not need a worktree.

```sh
cd /workspace/2026-STM-mission-journal
npm ci --cache /tmp/mission-npm-cache
npm run dev -- --port 5173
```

Production build: `npm run build` creates `dist/`, using relative asset URLs for GitHub Pages subpaths. `npm run preview -- --port 4173` serves that build locally. No `.env` file, secrets, backend, or paid service is required.

Browser tests:

```sh
# In the prepared cloud workspace, reuse its installed Chromium:
CHROMIUM_PATH=/usr/bin/chromium npm test

# On a different machine, install Playwright's browser once:
npx playwright install chromium
npm test
```

The test runner starts the development server automatically. Tests run in desktop and touch-enabled mobile Chromium viewports and exercise layout, photo uploads/removal/replacement, the six-photo limit, compression, camera orientation, local-only requests, image-inclusive JSON backups, caption translation, storage failure warnings, photo placement/aspect ratios in PDF drawing commands, printable half-page writing space, local draft restoration, multiple reflections, translation failure and a mocked successful response, originals preserved, JSON round trips and invalid imports, escaped preview content, guidelines exclusion, and multi-page A4 PDF download. Generated artifacts are ignored by Git.

Current validation: production build passed; 20 desktop/mobile Chromium tests passed; exported Chinese photo gallery and recipient writing page were visually inspected. Actual iPhone Safari/Android hardware testing and live MyMemory translation remain separate checks. Cloud egress initially blocked MyMemory and Playwright downloads; the installed `/usr/bin/chromium` supports the tested workflow without a browser download.

## Open-source components

Vite, Playwright, jsPDF, and Fontsource Noto Sans SC are installed from npm with a committed lockfile. Noto Sans SC is licensed under SIL Open Font License 1.1; its license is included in `public/noto-sans-sc-LICENSE.txt` and copied into the deployed site. Dependency licenses remain in their respective packages.
