# Changelog

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
