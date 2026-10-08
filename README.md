# Electrode EDS Spatial Analyzer

單檔離線 EDS 二維空間量化工具。下載 `dist/Electrode_EDS_Analyzer.html`，以 Chrome / Edge 開啟。

## 介面語言

預設繁體中文；頂端語言選單可切換 English。按鈕、指標、資訊提示、對話框與狀態訊息同步切換，並保留已載入資料、ROI、設定與分析結果。Session JSON 儲存語言；舊版 Session 未指定語言時沿用當前介面。CSV／Analysis JSON 欄位名稱維持固定，便於後續處理。

## 開發

無執行期依賴。`node build.mjs` 建立正式 HTML；`node --test tests/unit/*.test.cjs` 執行數值驗證。

## 輸入

PNG / JPEG 或無表頭、矩形、有限數值 CSV。所有 channel 必須尺寸相同並事先完成空間對位。CSV 保留原始 intensity；圖片使用 max(R,G,B)，避免純色 EDS 訊號受 luminance 權重影響。彩色 LUT 與圖片壓縮可能改變 intensity，科學分析優先使用 CSV。

含標題、比例尺或報表外框的 PNG，可使用通道的「裁切／確認」框選有效影像。SEM 若有 EDS 白框，只保留框內的相同掃描範圍。工具保留裁切區域的原始像素，不拉伸、不自動對位。

## VDI 影像貼上

在 VDI 內複製影像或使用允許的截圖功能，點選工具左側對應通道的「貼上 / Ctrl+V」，再按 Ctrl+V。貼上後先顯示預覽，可拖曳框選或輸入 X／Y／寬／高；尺寸一致時用混合比例檢查參考通道。勾選確認後才匯入，取消不取代既有資料。也可直接點選通道卡片後貼上；文字輸入框仍維持一般貼上操作。

各圖應使用相同顯示倍率、相同掃描範圍與方向。套用參考圖尺寸只設定裁切框寬高，並不重新縮放圖片；尺寸不一致仍阻擋分析。重新裁切或取代既有通道會清除 ROI 與比例尺校正；截圖須重新校正才能以 μm 判讀。Session 保存原始貼上影像、裁切座標及人工確認紀錄，Analysis trace 保留來源 hash、裁切資訊與確認時間。

全程本機離線；只接收使用者主動貼上的影像，不解密檔案、不擷取螢幕。VDI 剪貼簿可用性以企業環境設定為準。

## 工作流程

Data → ROI → Segment → Analyze → Compare / Export。所有說明由資訊按鈕提供。結果只有 2D 影像意義，不能直接推論三維、化學鍵結或 cohesive 因果。

私人 repo 不含公司原始實驗圖；synthetic data 僅用於驗證。

## 驗證

詳見 `docs/validation.md` 與 `docs/algorithms.md`。

開發用瀏覽器測試：安裝 Playwright 後，執行 `node tests/browser/workflow.cjs`、`node tests/browser/imports.cjs`、`node tests/browser/language.cjs`、`node tests/browser/image-fallback.cjs`、`node tests/browser/clipboard-crop.cjs`。這些是開發依賴，正式 HTML 不需要。可設定 `CHROMIUM_EXECUTABLE_PATH` 指向既有 Chromium。測試輸出寫入 `qa/`（不納入版本控管）；`node tests/synthetic/generate.cjs` 可重建合成 CSV。

Analysis JSON 為結果資料；要重載 maps、ROI、設定、comparison，請使用 **Save Session / Session JSON**。實驗前先以自己的 map 人工確認每個 overlay。
