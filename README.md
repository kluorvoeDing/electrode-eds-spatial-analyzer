# Electrode EDS Spatial Analyzer

單檔離線 EDS 二維空間量化工具。下載 `dist/Electrode_EDS_Analyzer.html`，以 Chrome / Edge 開啟。

## 介面語言

預設繁體中文；頂端語言選單可切換 English。按鈕、指標、資訊提示、對話框與狀態訊息同步切換，並保留已載入資料、ROI、設定與分析結果。Session JSON 儲存語言；舊版 Session 未指定語言時沿用當前介面。CSV／Analysis JSON 欄位名稱維持固定，便於後續處理。

## 開發

成品無執行期依賴。開發需 Node 20 以上：

- `npm install`：安裝開發工具（Playwright、Prettier）；另執行一次 `npx playwright install chromium`，或以 `CHROMIUM_EXECUTABLE_PATH` 指向既有 Chromium。
- `npm run build`：把 `src/` 串接成 `dist/Electrode_EDS_Analyzer.html`。來源順序列於 `build.mjs`；版本號取自 `package.json`。
- `npm run test:unit`：數值、裁切／重採樣、語言與管線快取的單元測試。
- `npm run test:browser`：先建置，再以離線 headless Chromium 依序執行 `tests/browser/` 下所有腳本。
- `npm test`：以上兩者。`npm run format`：Prettier。

原始碼為共用全域的 classic script：`src/analysis/core.js`（數值核心，Worker 與主程式共用）、`src/ui/`（語言、影像匯入與對位）、`src/app/`（狀態、Worker 呼叫、版面、各步驟面板、匯入、畫布、結果、Session、匯出、啟動）、`src/workers/worker.js`（訊息收發）。

## 輸入

PNG / JPEG 或無表頭、矩形、有限數值 CSV。所有 channel 必須尺寸相同並事先完成空間對位。CSV 保留原始 intensity；圖片使用 max(R,G,B)，避免純色 EDS 訊號受 luminance 權重影響。彩色 LUT 與圖片壓縮可能改變 intensity，科學分析優先使用 CSV。

含標題、比例尺或報表外框的影像，匯入或貼上時會自動框出有效區域並開啟「裁切與對位確認」；第二個通道起裁切框鎖定為相同尺寸。阻擋計算的問題（例如通道尺寸不一致）顯示在影像上方，並附修正按鈕。分析通道保留裁切區域的原始像素，不拉伸、不自動對位；可用方向鍵或按鈕以整數像素微調位置。

SEM/BSE 只作顯示底圖，不進入任何指標。SEM 倍率與元素圖不同時，在 SEM 的「裁切／確認」框選 EDS 白框內的掃描範圍，工具會把該區縮放為參考通道的尺寸（縮小採面積平均、放大採雙線性內插），並把縮放比例記錄在 Session 與 trace。

## VDI 影像貼上

在 VDI 內複製影像或使用允許的截圖功能，點選工具左側對應通道的「貼上 / Ctrl+V」，再按 Ctrl+V。貼上後先顯示預覽，可拖曳框選或輸入 X／Y／寬／高；尺寸一致時用混合比例檢查參考通道。勾選確認後才匯入，取消不取代既有資料。也可直接點選通道卡片後貼上；文字輸入框仍維持一般貼上操作。

各圖應使用相同顯示倍率、相同掃描範圍與方向。套用參考圖尺寸只設定裁切框寬高，並不重新縮放圖片；尺寸不一致仍阻擋分析。重新裁切或取代既有的分析通道（Ni／次要相／F），或分析格點尺寸改變時，會清除 ROI 與比例尺校正；截圖須重新校正才能以 μm 判讀。SEM 與其他元素僅供顯示，更換時不影響。Session 保存原始貼上影像、裁切座標及人工確認紀錄，Analysis trace 保留來源 hash、裁切資訊與確認時間。

全程本機離線；只接收使用者主動貼上的影像，不解密檔案、不擷取螢幕。VDI 剪貼簿可用性以企業環境設定為準。

## 工作流程

Data → ROI → Segment → Analyze → Compare / Export。所有說明由資訊按鈕提供。結果只有 2D 影像意義，不能直接推論三維、化學鍵結或 cohesive 因果。

私人 repo 不含公司原始實驗圖；synthetic data 僅用於驗證。

## 驗證

詳見 `docs/validation.md` 與 `docs/algorithms.md`。

瀏覽器測試為開發依賴，正式 HTML 不需要。測試輸出寫入 `qa/`（不納入版本控管）；`node tests/synthetic/generate.cjs` 可重建合成 CSV。

Analysis JSON 為結果資料；要重載 maps、ROI、設定、comparison，請使用 **Save Session / Session JSON**。實驗前先以自己的 map 人工確認每個 overlay。
