# Electrode EDS Spatial Analyzer

單檔離線 EDS 二維空間量化工具。下載 `dist/Electrode_EDS_Analyzer.html`，以 Chrome / Edge 開啟。

## 開發

無執行期依賴。`node build.mjs` 建立正式 HTML；`node --test tests/unit/*.test.cjs` 執行數值驗證。

## 輸入

PNG / JPEG 或無表頭、矩形、有限數值 CSV。所有 channel 必須尺寸相同並事先完成空間對位。CSV 保留原始 intensity；圖片使用 max(R,G,B)，避免純色 EDS 訊號受 luminance 權重影響。彩色 LUT 與圖片壓縮可能改變 intensity，科學分析優先使用 CSV。

## 工作流程

Data → ROI → Segment → Analyze → Compare / Export。所有說明由資訊按鈕提供。結果只有 2D 影像意義，不能直接推論三維、化學鍵結或 cohesive 因果。

私人 repo 不含公司原始實驗圖；synthetic data 僅用於驗證。
