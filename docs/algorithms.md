# Algorithms — v0.1.0

所有計算為二維影像量化。所有 mask 先裁切有效 ROI；面積與比例使用 ROI 像素數。無法計算的值輸出 JSON `null`、介面 `—`，不是零。

## Intensity / segmentation

CSV 無表頭、逗號分隔、矩形、有限數值，保留原值。PNG/JPEG 由瀏覽器解碼為 RGB8，intensity=max(R,G,B)，Original 保留解碼後彩色影像。影像 LUT、JPEG 壓縮、EDS 軟體自動對比、標籤與背景會影響結果，優先使用原始 numeric map。

Auto：在有效 ROI 內，以 256-bin histogram 計算 Otsu 最大類間變異。Histogram range 取完整 map min/max；threshold 放在最佳 bin 上緣附近。常數 map 的 threshold 等於常數，非反轉 mask 為空。Manual：`intensity > threshold`；Invert：反轉此 predicate，ROI 外一律 false。

依序執行 3×3 majority smooth（選填）、fill holes（從圖邊與 ROI 外背景作 4-neighbor flood fill，選填）、移除面積小於 Min object size 的 4-connected foreground。輸出 mask 為 0/1。

Mn/(Ni+ε) 僅用於 Secondary segmentation，不取代 raw Secondary intensity 與 F 的 Pearson 分析。ε 使用原始 Ni intensity 單位；低 Ni 區域的 ratio 可能被放大，不能視為完整 MnO₂ 光譜分離。

## ROI / grid

Rectangle 與 Polygon 判斷 pixel centre `(x+0.5,y+0.5)`。有效 ROI = include 聯集（沒有 include 時為全圖）；選擇 Invert 時反轉 include；最後扣除 exclude 聯集。空 ROI 拒絕分析。

Grid 使用有效 ROI 的 bounding rectangle 切為 3×3、5×5、8×8。每格分母只取有效 ROI 像素；無有效 ROI 的格子不參與 CV。各格等權，SD 為母體 SD，不是 sample SD。`CV = sqrt(mean((f_i − mean(f))²))/mean(f)`，無因次，介面不乘 100。

## Interparticle metrics

`G = ROI ∩ NOT(NMC)`；`S = Secondary ∩ ROI`。

- Interparticle Occupancy = `|S ∩ G| / |G|`
- Targeting Efficiency = `|S ∩ G| / |S|`
- Secondary Area Fraction = `|S| / |ROI|`

S 或 NMC 為空時拒絕分析；G 為空時 Occupancy=null 並警告。不是三維體積分率或孔隙填充。

## Euclidean surface distance

NMC boundary 定義為 mask 內、至少一個 4-neighbor 是背景的像素，圖邊像素也為 boundary。對 boundary pixel centres 採 separable exact squared Euclidean distance transform（Felzenszwalb/Huttenlocher lower envelope），最後開平方。所有 Secondary 像素均參與，包含與 NMC mask 重疊且位於 NMC 內部者。這些像素計算至邊界距離，而不是預設 0。

Mean 為算術平均，median/P90 採 `(N−1)q` 線性插值，20-bin histogram 均分 0 到 max。校正後乘 μm/pixel；分組 `<0.5`、`[0.5,1)`、`[1,2]`、`>2 μm`。未校正時分組 `<1`、`[1,2)`、`[2,3]`、`>3 px`。

ROI 裁切處形成新的 mask boundary，可能影響距離與 coverage；比較時應採一致 ROI 邊界規則。像素中心至像素中心是固定數位幾何約定，不是 continuous physical interface 的 subpixel 距離。

## F / binder

Pearson：有效 ROI raw Secondary element intensity vs raw F intensity；使用 online centred covariance，常數 map 回傳 null。Binary overlap：`F with Secondary = |F ∩ S|/|F|`；`Secondary with F = |F ∩ S|/|S|`。這是 binary Manders-style overlap，不是 intensity-weighted Manders coefficient。

Binder Coverage：Secondary boundary 的所有像素中，最近 F mask pixel centre 距離 `≤ binderRadius` 的比例。F map 缺省回傳 null、不顯示 F KPI；有 F map 但 F mask 為空，coverage=0、F with Secondary=null。不可由 Occupancy 推算，也不是 PVDF 化學鍵結證據。

## Depth

Cross Section：沿所選 X/Y 軸，以有效 ROI bounding extent 作 0–100% 三等分，reverse 決定 Top 的方向。分母為該區有效 ROI 像素；輸出 S/ROI、F/ROI、S∩F/ROI，各區等權 population CV。Top 表示使用者設定方向，不自動識別電極表面或集流體。

## Trace / session

結果與 comparison snapshot 保留版本、日期、原始檔名、尺寸、intensity range、匯入檔 SHA-256（合成資料無原始檔 hash）、ROI、threshold、segmentation、校正與分析設定。Session 包含完整 intensity，圖片另存 embedded PNG；重載重算結果。Analysis JSON 匯出數值及 trace；要重新載入工作專案，使用 Session JSON。

所有計算在本機。Worker 快取 intensity、ROI 與未變更的 mask；每次送回 mask 副本，避免 transferable buffer 使 cache 失效。最新 revision 才可更新畫面，設定變更時清除舊結果。無網路 API、CDN、IndexedDB 或 localStorage；CSP 拒絕外部連線。
