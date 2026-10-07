# Validation — v0.1.0

2026-10-07；14/14 numerical tests 通過。兩組離線 Chromium integration workflow 通過，0 page errors，0 external HTTP(S) requests。正式檔為單一 `dist/Electrode_EDS_Analyzer.html`，CSP 拒絕外部連線。

## Numerical ground truth

- A：均勻 tiles，CV=0（浮點容許誤差 1e−12）。
- B：九格中只有一格有 Secondary，CV=√8。
- C：已知 8 pixels / 4 gap pixels / 3 Secondary pixels / 2 gap-Secondary pixels；Occupancy=0.5、Targeting=2/3、area fraction=3/8。
- D：兩個 Secondary boundary pixels、只有一個 F 接觸，radius=0；Binder Coverage=0.5。
- E：1×9、9×1、11×7、4×5 random seeds 的 EDT 每像素對照 brute-force Euclidean distance；absolute error ≤1e−10 px。
- Known distance [1,2,3] px、calibration=0.5 μm/px；mean=1、median=1、P90=1.4 μm。
- ROI 聯集、多邊形、排除、反轉；Otsu；fill holes、remove small objects、threshold invert。
- Cross-section [1,0,0] fractions、Depth CV=√2、reverse orientation。
- Pearson 負相關 r=−1、constant undefined；ratio segmentation 不改變原始元素/F Pearson。
- Invalid CSV、空 masks、空 ROI、F 缺省、Mn ratio。

比例類 ground truth absolute error <1e−10，小於 PRD 的 1% absolute。

## Browser workflow

`tests/browser/workflow.cjs`：直接以 file:// 載入正式 HTML，network offline。Import/Synthetic → Worker segmentation → Analyze → Comparison → Save Session → Reload → Recompute → Cross Section → CSV/JSON/PNG export。矩形／多邊形 exclusions、校正、手動空 mask 拒絕與 Auto 恢復、390px viewport 無整頁水平溢出、invalid CSV 與尺寸不一致阻止分析。

`tests/browser/imports.cjs`：真正匯入 CSV、彩色 PNG、JPEG；PNG 保留原彩色並得到相同 binary metrics；圖片 Session roundtrip；scale-bar 兩點得到 0.5 μm/px；ratio、fill、smooth、min-object 控制；keyboard-focus/click tooltip；缺 F 不顯示 binder KPI；Al collector 與空 ROI 防呆。

Session 重載不採信舊結果，從保存 maps 與參數重新計算。Comparison 數值、手動 cohesive 與 note 一併保存。實際輸出檔已生成並檢查非空，JSON 已解析驗證。

## Performance

Linux executor、headless Chromium 153、2048×2048、五個已載入 channels，synthetic binary distributions：

- 首次自動分割（含資料送至 Worker 與繪圖）：497 ms。
- 快取後手動 threshold preview（含繪圖）：154 ms。
- Analyze（含 trace、結果 render、overlay）：1.604 s；Worker/trace timing 1.305 s。

未變更的 raw data、ROI、mask 由 Worker 快取。首次 preview 未達 <300 ms 目標；manual preview 與 Analyze 達目標。這是指定 executor 的結果，不保證使用者 CPU 或極密 morphology 同等效能。

## Visual verification

Concept：`/workspace/scratch/6226f716c7bb/generated_images/exec-0479059a-bb3a-48bd-b075-62475c5cbbdb.png`，原生 1586×994。實作 screenshot：`qa/final-desktop.png`（1586×994）與 `qa/final-1440.png`；另有 390px responsive screenshot。以 `view_image` 檢視 concept 與實作。

雲端 Browser 的 URL policy 不允許 file://；未繞過其限制。測試在 executor 內獨立 headless Chromium 直接執行自己的 HTML，不讀取任何瀏覽器帳號或雲端 session。Playwright 為開發驗證工具，不是正式產品依賴。

已檢查：

1. Top bar 的名稱與 Import / Save Session / Export / Settings / About copy。
2. 280px workflow、最大中央 image workspace、300px results rail。
3. 13px control typography、白色／中性灰表面、teal accent、無漸層。
4. Button/input 邊框、間距、info control 與 hover/focus/click behavior。
5. Canvas 原圖／mask／overlay、Fit/zoom、資料產生的 histogram/grid。
6. Responsive、scroll、結果收合與 comparison/editor dialog。

修正：小圖 Fit 無法放大、缺字 info glyph 改為 CSS 圓形 i、PNG summary 寬度不足、threshold 長小數、原 PNG color 未保留。

Intentional deviations：使用可追溯合成影像與真实計算 KPI，未使用概念圖內虛構 SEM 與數值；result value 在標籤下方便閱讀；追加 PRD 要求的 ratio、ROI、comparison、depth 與錯誤狀態。Screenshot Linux 字型環境對少數繁中字缺字，Windows/macOS 實際使用系統 Microsoft JhengHei / PingFang TC；正式版不載入外部字型。Above-the-fold copy 依 PRD，沒有 marketing 文案或長篇說明。

介面結構、色彩、控制、字級與互動已按概念與 PRD 驗證；上述差異已明列，不宣稱圖片 pixel-perfect。

## Remaining environment validation

已驗證 Chromium 核心。Windows/macOS 官方 Chrome／Edge 實機、公司 EDS 真實 maps 與儀器 LUT 解讀，尚需目標環境驗證。未以此宣稱 PRD DoD 14 的實機驗收已完成。v0.1.0 為可操作的初始版本；完整 MVP 驗收仍保留這項環境確認。
