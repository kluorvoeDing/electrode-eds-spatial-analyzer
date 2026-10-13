# Changelog

## v0.2.0 — 2026-10-14

### 對位

- 裁切對話框新增整數像素平移微調（按鈕、方向鍵；Shift 為 10 px），分析通道仍不重採樣。
- 預覽新增「差異」檢視與「按住顯示參考圖」，與原有混合比例並列。
- SEM/BSE 可框選掃描區後縮放貼合參考通道（僅限 SEM；SEM 只作顯示底圖、不進入指標）。縮放以純 JS 計算，比例與方式記錄於 Session 與 trace。
- 尺寸不一致的訊息在 SEM 倍率不同時提示改用「裁切／確認」。

### 修正

- Worker 層級錯誤不再讓介面停在計算中；等待中的請求會結束並顯示錯誤。
- 檔案匯入與貼上裁切改用同一套 ROI／校正清除規則：更換分析通道或分析格點尺寸改變時清除；僅供顯示的通道不影響。
- 設定比例尺不再覆蓋自訂的黏結劑鄰域距離，改為依比例換算。
- Session 載入前先完整驗證與解碼，失敗時不更動目前工作區；內嵌 PNG 尺寸須與通道相符，未知欄位捨棄。
- 程式實際以 strict mode 執行（原本 `'use strict'` 因串接位置而無效）。
- 「清除本機資料」改名為「重設工作區」。

### 開發

- `src/app.js` 依職責拆為 `src/app/*.js`，以 Prettier 格式化；建置仍為串接成單檔 HTML，成品無新增依賴。
- Worker 的快取與分割流程移入 `Core.createPipeline()`，與單元測試共用同一實作。
- 版本號只定義於 `package.json`，建置時注入。
- Playwright、Prettier 列為 devDependencies 並附 lockfile；`npm test` 一次執行單元與瀏覽器測試。
- 測試：單元 16 → 34 項；瀏覽器 5 → 8 支（新增 `defects`、`alignment`、`legacy-session`）。

### Known limitations

- v0.1.0 所列限制仍適用。
- 裁切後比例尺已不在圖內，尺度校正仍須手動輸入 μm/pixel，或由原圖比例尺換算。
- 格式化後成品 HTML 約 148 KB（v0.1.3 為 100 KB），未做壓縮。
- 本版於 macOS headless Chromium 驗證；Windows／VDI 實機仍待驗收。

## v0.1.3 — 2026-10-08

- 各通道新增 Ctrl+V 影像貼上，支援 VDI 複製影像與截圖。
- 貼上後先預覽、拖曳框選或輸入像素座標，人工確認後才取代資料；PNG 檔案也可重新裁切。
- 同尺寸參考通道的混合預覽，尺寸不一致仍阻擋分析；裁切不重新取樣。
- 取消保留原資料；重新裁切／取代既有通道清除舊 ROI 與校正。
- Session 保存來源影像與裁切資訊，trace 保留來源與裁切 hash／人工確認紀錄。
- 真實 Ctrl+V、精確裁切、對話框、文字貼上、Session 與離線整合驗證通過。

## v0.1.2 — 2026-10-07

- 圖片主解碼器失敗時，改以 FileReader／Image 離線讀取；錯誤包含檔名與中文處理提示。
- 通道顯示像素尺寸；尺寸不一致時列出各圖大小及裁切／對位提醒。
- 使用使用者提供的五張 PNG 驗證成功解碼與尺寸防呆（原始圖未加入版本庫）。

## v0.1.1 — 2026-10-07

- 新增頂端繁體中文／English 切換，預設繁體中文；涵蓋工作流程、指標、說明、對話框與狀態訊息。
- 切換保留資料、ROI、參數、分析結果及比較備註；Session 保存語言並相容舊版。
- 新增語言單元及離線瀏覽器測試；CSV／Analysis JSON 欄位與數值算法維持原定義。

## v0.1.0 — 2026-10-07

- 單檔 HTML、離線執行；PNG / JPEG / numeric CSV 多通道輸入。
- Rectangle / Polygon / inverted / exclusion ROI，手動與點選 scale-bar 校正。
- Otsu / manual threshold、invert、fill holes、small-object removal、3×3 smoothing，original/mask/overlay。
- Local Area Fraction CV、Interparticle Occupancy、Targeting、exact Euclidean surface proximity、Pearson、binary directional overlap、independent Binder Coverage、Cross Section 三區分析。
- Mn/Ni ratio segmentation、Mn / Al 材料提示與空 mask / ROI / 尺寸 / CSV 防呆。
- Comparison 與 cohesive / peel / note 欄位；CSV、Analysis JSON、PNG、完整 Session JSON 重載。
- Worker intensity / ROI / mask 快取；trace 包含參數、原始檔 SHA-256 與工具版本。
- Synthetic ground truth 與離線 Chromium integration 驗證。

### Known limitations

- 只量化 2D。圖片 intensity 可能受 LUT、JPEG 壓縮、對比與背景影響；raw CSV 優先。
- 不做 channel registration、TIFF/16-bit、光譜解混、cohesive 因果推論或自動電極／集流體識別。
- Mn/Ni 是探索 proxy；低 Ni 區 ratio 放大須另行驗證。
- ROI 裁切形成新 boundary。距離定義為 pixel-centre to boundary-pixel-centre。
- 首次 2048² 五通道自動分割約 497 ms，高於 300 ms 目標；快取後手動 threshold 約 154 ms。效能取決於 CPU、資料及 morphology。
- Session 包含完整 maps，大圖 JSON 的匯出／載入會耗記憶體。
- 已於 Linux headless Chromium 153 驗證；Windows/macOS 的 Chrome／Edge 實機及公司實際 EDS map 尚需使用者環境驗證。
