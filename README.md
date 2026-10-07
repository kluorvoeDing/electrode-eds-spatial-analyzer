# Electrode EDS Spatial Analyzer

單檔離線 EDS 二維空間量化工具。下載 `dist/Electrode_EDS_Analyzer.html`，以 Chrome / Edge 開啟。

## 介面語言

預設繁體中文；頂端語言選單可切換 English。按鈕、指標、資訊提示、對話框與狀態訊息同步切換，並保留已載入資料、ROI、設定與分析結果。Session JSON 儲存語言；舊版 Session 未指定語言時沿用當前介面。CSV／Analysis JSON 欄位名稱維持固定，便於後續處理。

## 開發

無執行期依賴。`node build.mjs` 建立正式 HTML；`node --test tests/unit/*.test.cjs` 執行數值驗證。

## 輸入

PNG / JPEG 或無表頭、矩形、有限數值 CSV。所有 channel 必須尺寸相同並事先完成空間對位。CSV 保留原始 intensity；圖片使用 max(R,G,B)，避免純色 EDS 訊號受 luminance 權重影響。彩色 LUT 與圖片壓縮可能改變 intensity，科學分析優先使用 CSV。

含標題、比例尺或報表外框的 PNG，需先裁出各元素圖的同一掃描範圍。SEM 若有 EDS 白框，只使用框內區域並先完成對位；目前工具不會自動裁切或對位。不能只把不同視野拉伸為相同尺寸。

## 工作流程

Data → ROI → Segment → Analyze → Compare / Export。所有說明由資訊按鈕提供。結果只有 2D 影像意義，不能直接推論三維、化學鍵結或 cohesive 因果。

私人 repo 不含公司原始實驗圖；synthetic data 僅用於驗證。

## 驗證

詳見 `docs/validation.md` 與 `docs/algorithms.md`。

開發用瀏覽器測試：安裝 Playwright 後，執行 `node tests/browser/workflow.cjs`、`node tests/browser/imports.cjs`、`node tests/browser/language.cjs`。這些是開發依賴，正式 HTML 不需要。可設定 `CHROMIUM_EXECUTABLE_PATH` 指向既有 Chromium。測試輸出寫入 `qa/`（不納入版本控管）；`node tests/synthetic/generate.cjs` 可重建合成 CSV。

Analysis JSON 為結果資料；要重載 maps、ROI、設定、comparison，請使用 **Save Session / Session JSON**。實驗前先以自己的 map 人工確認每個 overlay。
