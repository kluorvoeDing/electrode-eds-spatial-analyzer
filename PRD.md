# PRD — Electrode EDS Spatial Analyzer

- **產品名稱**：Electrode EDS Spatial Analyzer
- **建議 GitHub Repo**：`electrode-eds-spatial-analyzer`
- **文件版本**：v0.1
- **日期**：2026-10-07
- **產品型態**：單檔、離線、瀏覽器執行的 `.html`
- **主要使用情境**：鋰離子電池正極 EDS mapping 影像之材料分布、NMC 顆粒間區域佔據與 PVDF 共定位量化

---

## 1. 產品目標

建立一個**不需安裝、不需連網、不需 Python、不需伺服器**的 EDS 影像定量工具。

使用者只需開啟：

`Electrode_EDS_Analyzer.html`

即可載入 EDS mapping、建立 segmentation mask、計算材料空間分布指標，並匯出分析結果。

產品核心用途不是「看 EDS 圖」，而是回答以下研究問題：

1. 小粒徑次要相材料是否均勻分散於 NMC955 主相之間？
2. 次要相是否優先存在於 NMC 顆粒間區域，而非形成自身團聚？
3. 次要相與 PVDF binder 是否具有空間共定位關係？
4. Top view 與 cross-section 是否存在面內或厚度方向偏析？
5. 上述影像指標是否與正極極層 cohesive 強度具有關聯？

---

## 2. 產品原則

### 2.1 離線優先

所有分析必須在瀏覽器本機完成。

**不得：**

- 呼叫外部 API
- 上傳圖片
- 依賴 CDN
- 要求登入
- 要求後端服務
- 要求 Python / Node.js 才能使用正式版工具

開發階段可使用 Node.js、Vite 或其他工具，但正式交付物必須能封裝為**單一 HTML 檔**。

### 2.2 簡單操作

核心流程固定為：

**Import → Segment → Analyze → Compare / Export**

使用者不應需要理解影像處理演算法才能完成分析。

### 2.3 UI 保持簡約

畫面中只持續顯示：

- 功能名稱
- 必要輸入
- 當前設定
- 關鍵結果
- 錯誤或警告

所有說明性文字、分析原理、參數建議、判讀提示均放入 **Hover Tooltip / Help Popover**。

避免在主介面堆疊長段說明文字。

### 2.4 可追溯

任何結果都必須能追溯至：

- 原始檔案
- ROI
- Threshold
- Mask 設定
- Pixel / μm calibration
- 分析參數
- 工具版本

分析匯出時必須一併記錄。

---

# 3. 使用者與典型工作流程

## 3.1 主要使用者

材料研發、電池研發、SEM/EDS 分析工程師。

預設使用環境：

- Windows / macOS
- Chrome / Edge
- 公司內網或完全離線環境
- 主要使用滑鼠操作
- 桌面螢幕優先

不以手機操作為主要目標。

---

## 3.2 標準工作流程

### Step 1 — Import

建立一個 Sample，例如：

`NMC955 + 15% TiO2`

指定：

- View：Top View / Cross Section
- SEM/BSE image
- Ni map
- Secondary-phase map
- F map（選填）
- 其他元素 map（選填）

支援拖放。

### Step 2 — Calibration / ROI

使用者可以：

- 選擇分析 ROI
- 排除不需要分析的區域
- 手動設定 μm/pixel
- 或以「點選 scale bar 兩端 + 輸入實際長度」完成 calibration

未 calibration 時仍允許 pixel-based analysis，但所有距離結果以 px 呈現。

### Step 3 — Segmentation

對各 channel 建立 mask：

- NMC mask
- Secondary-phase mask
- PVDF/F mask

提供：

- Auto threshold
- Manual threshold slider
- Invert
- Small-object removal
- Fill holes
- Overlay preview

所有 segmentation 必須可視化疊圖確認。

### Step 4 — Analyze

按一次 **Analyze** 計算核心 KPI。

### Step 5 — Compare / Export

可將分析結果加入 Comparison。

匯出：

- CSV
- JSON
- Analysis overlay PNG
- Session / Project JSON

---

# 4. 輸入資料

## 4.1 MVP 必須支援

### Image

- PNG
- JPG / JPEG

### Numeric map

- CSV intensity matrix

CSV 為優先科學輸入格式。

---

## 4.2 後續版本

視實際 EDS 匯出格式再評估：

- TIFF
- 16-bit image
- vendor-specific format
- raw spectrum map

MVP 不為了支援所有廠牌格式犧牲單檔與易用性。

---

## 4.3 輸入要求

同一分析組的影像原則上必須：

- 相同 Field of View
- 相同 pixel dimension
- 相同 orientation
- 已由 EDS 軟體完成 channel registration

若尺寸不同，MVP：

**阻止分析並提示使用者先取得相同尺寸的 map。**

MVP 不自動做影像 registration，以避免產生不可察覺的空間誤差。

---

# 5. 材料角色定義

工具內避免只使用「Secondary phase」而沒有說明。

UI 使用：

**Secondary phase / Additive**

Tooltip：

> 指相對於 NMC 主相所添加的次要材料，例如 TiO₂、ZrO₂、MnO₂、Al₂O₃ 或 LFP。本名稱描述配方角色，不代表必然形成獨立晶體第二相。

---

# 6. 核心分析指標

## 6.1 Local Area Fraction CV

目的：

量化次要相在整個分析區域中的面內分布均勻程度。

將 ROI 切分為固定網格，每格計算：

`f_i = Secondary phase area / Tile area`

計算：

`CV = SD(f_i) / Mean(f_i)`

判讀：

- CV 越低：局部分布差異越小
- CV 越高：存在局部富集或空缺

### 使用者設定

MVP 提供：

- Grid：3×3 / 5×5 / 8×8
- 預設：5×5

Advanced 設定可加入固定 μm tile size。

---

## 6.2 Interparticle Gap Occupancy

目的：

量化次要相是否位於 NMC 顆粒間區域。

定義：

`Analysis ROI = 使用者指定的有效極層區`

`Interparticle region = Analysis ROI - NMC mask`

`Gap Occupancy = Secondary pixels inside interparticle region / Interparticle-region pixels`

注意：

此指標描述的是**二維影像中的 NMC 顆粒間區域佔據率**，不可直接宣稱為三維孔隙填充率。

UI 正式名稱建議：

**Interparticle Occupancy**

Tooltip 再說明常簡稱 Gap Occupancy。

---

## 6.3 Secondary-phase Targeting Efficiency

目的：

判斷添加的次要相有多少比例實際位於預期區域。

`Targeting Efficiency = Secondary pixels inside interparticle region / Total secondary pixels`

用途：

區分：

- 添加量很多但位置錯誤
- 添加量相同但更集中於 NMC 顆粒間

---

## 6.4 NMC Surface Proximity

目的：

量化次要相與 NMC 表面的空間距離。

對所有 Secondary-phase pixels 計算至最近 NMC mask 邊界的 Euclidean distance。

輸出：

- Mean distance
- Median distance
- P90 distance
- 距離分布 histogram
- `<0.5 μm`
- `0.5–1 μm`
- `1–2 μm`
- `>2 μm`

若未 calibration，改以 pixel distance。

演算法應採用可重現的 2D Euclidean Distance Transform。

---

## 6.5 PVDF / F Colocalization

此功能只有載入 F map 時啟用。

### A. Pearson correlation

以原始或標準化 intensity map 計算：

- Secondary element intensity vs F intensity

用途：

判斷兩個 signal 是否具整體像素相關。

不得單獨作為「PVDF 覆蓋」的證據。

### B. Manders-style overlap

在 threshold 後的 mask 上計算：

- F located with Secondary
- Secondary located with F

分開呈現兩個方向。

### C. Secondary Surface Binder Coverage

此指標為本產品最重要的 binder 指標。

流程：

1. 找出 Secondary-phase mask perimeter
2. 建立距離 Secondary surface 的鄰域
3. 判斷鄰域中是否存在 F mask
4. 計算：

`Binder Coverage = Secondary perimeter with nearby F / Total Secondary perimeter`

鄰域距離：

- 有 calibration：預設 0.5 μm
- 無 calibration：預設 3 px
- 使用者可修改

此指標不可由 Gap Occupancy 推算，必須獨立量測。

---

## 6.6 Cross-section Depth Uniformity

只在 View = Cross Section 時啟用。

將電極厚度方向正規化為 0–100%。

至少分為：

- Top
- Middle
- Bottom

分別計算：

- Secondary area fraction
- F area fraction
- Secondary/F overlap

並輸出 Depth CV。

目的：

偵測：

- 次要相沉降
- binder migration
- 靠近 current collector / surface 的偏析

MVP 可先使用三等分。

---

# 7. 特殊材料分析規則

## 7.1 MnO₂

NMC955 本身含 Mn。

因此禁止預設：

`Mn signal = MnO₂`

工具應顯示 Warning Tooltip：

> NMC 主相本身含 Mn。若以 Mn map 識別 MnO₂，需使用 Mn/Ni ratio、背景扣除或其他可區分方法；單純 Mn threshold 可能造成高估。

MVP 可提供：

**Ratio Map = Mn / (Ni + ε)**

再由 ratio map segmentation。

---

## 7.2 Al₂O₃

Cross section 中可能同時存在 Al current collector。

分析 Al₂O₃ 時必須允許使用者：

- 限定 Electrode ROI
- 排除 collector region

Tooltip：

> Al map 可能同時包含 Al current collector 訊號。必須先排除集流體後再建立 Al₂O₃ mask。

---

## 7.3 TiO₂ / ZrO₂ / LFP

Ti、Zr、Fe 相對適合作為次要相 tracer。

仍不可假設所有元素訊號都等同於完整顆粒體積。

---

# 8. UI / UX 規格

## 8.1 設計風格

風格：

- 極簡
- 工程工具感
- 高資訊密度但不擁擠
- 中性灰階
- 單一 Accent color
- 避免漸層、裝飾性圖示、卡片氾濫

優先參考：

現代桌面科學分析軟體，而不是 Dashboard。

---

## 8.2 主畫面

建議三區：

### Top Bar

僅保留：

- App Name
- Project / Sample name
- Import
- Save Session
- Export
- Settings
- About

### Left Panel — Workflow

寬度約 260–300 px。

Step navigation：

1. Data
2. ROI
3. Segment
4. Analyze

只顯示當前步驟必要設定。

### Center — Image Workspace

最大畫面區域。

功能：

- Image
- Zoom
- Pan
- ROI
- Mask overlay
- Channel switch
- Opacity slider

### Right Panel — Results

可收合。

顯示：

- KPI
- Histogram
- Distribution preview
- Comparison

若未分析則保持空白或收合，不顯示教學文字。

---

# 9. Tooltip / AI 提示規則

## 9.1 基本規則

所有：

- 原理解釋
- 參數建議
- 判讀說明
- 注意事項
- 材料特殊限制
- 「為什麼要做」

全部使用 Tooltip / Popover。

主介面不得長期顯示說明段落。

---

## 9.2 Trigger

桌面：

- Hover
- Keyboard focus

必要時：

- `?`
- `ⓘ`

圖示不超過一種風格。

---

## 9.3 Tooltip 結構

一般 Tooltips：

**一句話，最多 2–3 行。**

需要更多說明時：

Hover 顯示短版  
Click `ⓘ` 顯示 Popover 詳細版。

---

## 9.4 AI 字樣

正式工具 MVP **不需要 AI runtime**。

所有提示均為內建規則式說明文字。

介面不得讓使用者誤以為：

- 圖片被傳送至 AI
- 分析由 LLM 判讀
- 結果為 AI 推測

若未來加入 AI interpretation，必須獨立成 optional module，不得影響離線核心功能。

---

# 10. Segmentation UX

每個 Channel 使用相同操作模式。

例如 Secondary Phase：

`Auto | Manual`

Manual：

- Threshold slider
- Min object size
- Fill hole
- Smooth

畫面即時 overlay。

顯示：

- 原始 map
- Binary mask
- Overlay

快捷切換：

`Original / Mask / Overlay`

---

# 11. ROI

MVP：

- Rectangle
- Polygon
- Full image

功能：

- Add ROI
- Clear
- Invert
- Exclude region

Cross section 必須允許排除：

- current collector
- mounting resin
- image label / scale bar
- electrode exterior

---

# 12. Results UI

主結果優先顯示：

1. Uniformity CV
2. Interparticle Occupancy
3. Targeting Efficiency
4. NMC Surface Proximity
5. Binder Coverage（有 F map）
6. Depth CV（cross section）

每個 KPI：

- Value
- Unit
- `ⓘ`

不要預設顯示「Good / Bad」。

避免工具自行下材料性能結論。

可以顯示：

`Lower / Higher means ...`

但只放在 Tooltip。

---

# 13. Comparison

分析完成後可：

**Add to Comparison**

Comparison table：

| Sample | Uniformity CV | Gap Occupancy | Targeting | Median Distance | Binder Coverage | Depth CV |
|---|---:|---:|---:|---:|---:|---:|

使用者可另外輸入：

- Cohesive
- Peel strength
- Recipe note

MVP 不需要自動統計推論。

P1 可加入：

- scatter plot
- Pearson / Spearman correlation
- cohesive vs image KPI

---

# 14. 匯出

## 14.1 CSV

包含：

- Sample
- View
- Metrics
- Calibration
- Threshold
- ROI
- Parameters

---

## 14.2 JSON

完整 session：

- image metadata
- channel names
- user parameters
- ROI coordinates
- segmentation parameters
- results

可重新載入工具。

---

## 14.3 PNG

可匯出：

- Original + mask overlay
- ROI
- scale
- Sample name
- selected KPI

避免把大量文字塞入圖片。

---

# 15. 錯誤防呆

必須處理：

- Channel image size 不一致
- ROI 為空
- Secondary mask = 0
- NMC mask = 0
- F map 未載入
- Calibration 不存在
- Threshold 導致 >95% image 被判為單一 phase
- CSV row/column mismatch
- 非數值 CSV
- Mn map 直接用於 MnO₂
- Al cross section 未排除 current collector

錯誤訊息保持短：

`NMC mask is empty. Adjust threshold.`

詳細原因放 Tooltip / Details。

---

# 16. 科學性限制

工具顯示的分析均屬：

**2D spatial image quantification**

不得自動宣稱：

- 3D pore filling
- 真實體積分率
- binder 化學鍵結
- cohesive 提升因果
- 次要相已滲入 NMC secondary particle 內部

所有因果關係需另外由實驗驗證。

---

# 17. MVP 範圍

## P0 — 必須完成

- Single offline HTML
- PNG/JPG/CSV
- Multi-channel import
- ROI
- Pixel / μm calibration
- Auto/manual threshold
- Mask overlay
- Local Area Fraction CV
- Interparticle Occupancy
- Targeting Efficiency
- Euclidean surface distance
- F / Secondary colocalization
- Binder Coverage
- Cross-section 3-zone depth analysis
- Comparison table
- CSV / JSON / PNG export
- Save / Load session
- Tooltips
- No external network request

---

## P1 — 後續

- Moran's I
- Agglomerate size distribution
- Nearest-neighbor distribution
- TIFF / 16-bit support
- Image registration
- Automatic electrode boundary detection
- scatter plots
- cohesive correlation
- batch analysis
- more robust Mn/Ni spectral separation
- project report generation

---

# 18. 技術架構

## 18.1 正式版

建議：

- HTML
- CSS
- Vanilla JavaScript
- Canvas API
- Web Workers

避免大型 framework。

原因：

- 單檔封裝容易
- 離線
- 依賴少
- 長期維護容易
- 公司電腦容易使用

---

## 18.2 計算

重計算項目放 Web Worker：

- threshold
- mask operation
- distance transform
- tile statistics
- colocalization

避免 UI freeze。

---

## 18.3 Local data

不得預設寫入網路。

可使用：

- in-memory
- File API
- Blob download
- Optional IndexedDB

若使用 IndexedDB，需提供：

`Clear Local Data`

---

# 19. 效能目標

Chrome / Edge：

- 2048 × 2048 × 5 channels 可順暢操作
- Threshold preview < 300 ms 為目標
- Analyze < 3 s 為目標
- 不因一次分析造成頁面長時間無回應

大圖需顯示 progress。

---

# 20. Validation / 測試

必須建立 synthetic test images。

例如：

### Test A

均勻棋盤分布：

預期 CV 接近 0。

### Test B

Secondary 全部集中左上角：

CV 顯著升高。

### Test C

已知 NMC mask 與 Secondary mask：

Gap Occupancy 可人工計算。

工具結果需在容許誤差內。

### Test D

Secondary perimeter 有 50% 接觸 F：

Binder Coverage 應接近 50%。

### Test E

已知 pixel distance：

Distance Transform 結果與人工值一致。

面積比例類 metric 目標：

**與人工 ground truth 誤差 ≤ 1% absolute**  
在 synthetic binary mask 條件下。

---

# 21. GitHub 版本控管

## 21.1 Repo

建議建立：

`electrode-eds-spatial-analyzer`

建議一開始設為：

**Private**

原因：

工具可能包含公司研究 workflow、內部分析方法或測試資料。

---

## 21.2 初始結構

```text
electrode-eds-spatial-analyzer/
├─ README.md
├─ PRD.md
├─ LICENSE                 # Private 階段可不放
├─ src/
│  ├─ index.html
│  ├─ app.js
│  ├─ styles.css
│  ├─ analysis/
│  ├─ ui/
│  └─ workers/
├─ tests/
│  ├─ synthetic/
│  └─ unit/
├─ docs/
│  ├─ algorithms.md
│  └─ validation.md
├─ dist/
│  └─ Electrode_EDS_Analyzer.html
└─ CHANGELOG.md
```

正式 Release 只需要使用：

`dist/Electrode_EDS_Analyzer.html`

---

# 22. Git workflow

建議：

- `main`：可使用版本
- Feature branch：每個功能獨立
- Pull Request 後 merge
- Tag：
  - `v0.1.0`
  - `v0.2.0`
  - `v1.0.0`

每次 Release 必須更新：

- CHANGELOG
- dist HTML
- version number

---

# 23. Definition of Done — MVP

只有以下條件全部成立才視為完成：

1. 關閉網路後仍可完整使用。
2. `dist` 只有一個正式 HTML 即可運作。
3. DevTools Network 不產生外部 request。
4. 可完成 Import → Segment → Analyze → Export。
5. 可量化至少：
   - Uniformity CV
   - Interparticle Occupancy
   - Targeting Efficiency
   - NMC Surface Proximity
   - Binder Coverage
6. Cross section 可做三區 depth analysis。
7. 所有 mask 均有 overlay 可人工確認。
8. 所有科學指標有固定公式與 unit。
9. Synthetic validation 通過。
10. CSV / JSON 可正確匯出。
11. Session 可儲存並重新載入。
12. 所有長說明均以 Tooltip / Popover 呈現。
13. 主畫面無長篇 help text。
14. Chrome / Edge 可正常使用。
15. GitHub repo 已建立並具版本紀錄。

---

# 24. Work Mode 執行順序

切換至 Work Mode 後，依序執行：

### Phase 1 — Repo / Scaffold

1. 在 GitHub 建立 private repo：
   `electrode-eds-spatial-analyzer`
2. 放入本 PRD 為 `PRD.md`
3. 建立 README、src、tests、docs、dist
4. 建立最小可執行 HTML shell

### Phase 2 — Core UI

完成：

- Layout
- Import
- Canvas
- ROI
- Tooltip system
- Channel manager

先確認操作流程，再開始分析演算法。

### Phase 3 — Segmentation

完成：

- threshold
- binary mask
- morphology
- overlay

### Phase 4 — Quantification

依序實作：

1. Local Area Fraction CV
2. Interparticle Occupancy
3. Targeting Efficiency
4. Distance Transform
5. F colocalization
6. Binder Coverage
7. Cross-section Depth CV

### Phase 5 — Validation

使用 synthetic dataset 驗證數值。

不得只用肉眼確認。

### Phase 6 — Compare / Export

完成：

- Comparison
- CSV
- JSON
- PNG
- Save / Load session

### Phase 7 — Single-file Build

將正式版打包成：

`dist/Electrode_EDS_Analyzer.html`

確認沒有任何 CDN / external request。

### Phase 8 — Release

建立：

`v0.1.0`

附：

- Release notes
- Known limitations
- Validation status

---

# 25. Work Mode 起始指令

可將本 PRD 與以下指令一起交給 Work Mode：

> 依照 `PRD.md` 建立 Electrode EDS Spatial Analyzer。  
> 不重新規劃產品方向，依 PRD 的 Phase 1 → Phase 8 執行。  
> UI 必須保持簡約，所有原理、建議與說明文字使用 tooltip / popover，不要堆疊在主畫面。  
> 正式產品必須是完全離線、單一 HTML，不呼叫任何外部 API 或 CDN。  
> 先建立 GitHub private repo `electrode-eds-spatial-analyzer` 並以 Git 做版本控管，再開始開發。  
> 每個主要 Phase 完成後執行測試並 commit；不要以功能存在取代數值 validation。  
> MVP 完成標準以 PRD 的 Definition of Done 為準。

---

# 26. 核心研究模型

工具只負責量化，不預設證明因果。

研究假設應以獨立指標驗證：

`Secondary distribution uniformity`  
↓  
`Interparticle targeting`  
↓  
`PVDF / Secondary spatial association`  
↓  
`Electrode cohesive`

其中：

**Interparticle Occupancy 上升不代表 Binder Coverage 必然上升。**

兩者必須分別量測，再與 cohesive 結果建立相關性或後續因果驗證。
