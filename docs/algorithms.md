# Algorithms — v0.5.0

所有計算為二維影像量化。所有 mask 先裁切有效 ROI；面積與比例使用 ROI 像素數。無法計算的值輸出 JSON `null`、介面 `—`，不是零。

## Intensity / segmentation

CSV 無表頭、逗號分隔、矩形、有限數值，保留原值。PNG/JPEG 由瀏覽器解碼為 RGB8，intensity=max(R,G,B)，Original 保留解碼後彩色影像。影像 LUT、JPEG 壓縮、EDS 軟體自動對比、標籤與背景會影響結果，優先使用原始 numeric map。

Averaging（v0.3.0）：取閾值前先對 intensity 做局部平均，預設半徑 2 px，可設 0～5，0 為關閉。作法是沿 x、y 各做兩次寬度 `2r+1` 的 box filter（合起來近似三角形權重），視窗在影像邊緣截斷並以實際像素數平均。EDS 元素圖是稀疏的計數點，不平均時單一閾值只會挑出亮點而非區域；平均後才是局部計數密度。平均不受 ROI 限制，只用於決定 mask；Pearson 仍使用原始 intensity。Manual threshold、slider 範圍與 Otsu 都作用在平均後的數值上，因此改變半徑會把該通道切回 Auto。半徑記錄於 `segmentation.<channel>.denoise`；舊版 Session 沒有此欄位，載入時視為 0，數值與舊版相同。內建的合成示範資料為無雜訊參考圖，固定為 0。

Auto：在有效 ROI 內，以 256-bin histogram 計算 Otsu 最大類間變異。Histogram range 取完整 map min/max；threshold 放在最佳 bin 上緣附近。常數 map 的 threshold 等於常數，非反轉 mask 為空。Manual：`intensity > threshold`；Invert：反轉此 predicate，ROI 外一律 false。

依序執行 3×3 majority smooth（選填）、fill holes（從圖邊與 ROI 外背景作 4-neighbor flood fill，選填）、移除面積小於 Min object size 的 4-connected foreground。輸出 mask 為 0/1。

Mn/(Ni+ε) 使用時，兩張圖各自先做相同半徑的平均再相除。Mn/(Ni+ε) 僅用於 Secondary segmentation，不取代 raw Secondary intensity 與 F 的 Pearson 分析。使用時 Mn map 須載入「次要相／添加物」通道，程式計算的是 `Secondary / (Ni + ε)`；ε 預設為 1。ε 使用原始 Ni intensity 單位；低 Ni 區域的 ratio 可能被放大，不能視為完整 MnO₂ 光譜分離。

## Channels / alignment

進入計算的只有三個分析通道：NMC/Ni、次要相／添加物、PVDF/F。SEM/BSE 與「其他元素」僅供顯示，不送入 Worker，對任何指標沒有影響；它們仍須與分析通道同尺寸，否則阻擋分析。

分析通道的影像匯入永遠是逐位元組的整數裁切（`pixelResampling: "none"`）。對位以整數像素平移裁切框完成，不重採樣。

SEM 可重採樣到參考通道的格點。對框選區 `r` 與目標尺寸 `W×H`，兩軸各自處理、先水平後垂直，中間值保留浮點：

- 縮小（輸出 < 輸入）：面積平均。輸出像素 `i` 涵蓋來源區間 `[i·s, (i+1)·s)`，`s = 輸入長度 / 輸出長度`，各來源像素權重為重疊長度 / `s`。
- 放大或等長：像素中心對齊的線性內插，來源位置 `(i+0.5)·s − 0.5`，超出邊界時取邊界像素。

結果四捨五入為 8-bit。`scaleX = W / r.w`、`scaleY = H / r.h`；兩者相差超過 2% 時介面警告。方式記為 `area-average`、`bilinear` 或 `area-average+bilinear`（兩軸方向不同）。重採樣僅限 SEM，其餘通道呼叫即拒絕。

ROI 與尺度校正屬於分析格點：更換或重新裁切既有分析通道、或分析格點尺寸改變時清除；已載入分析通道時，變動 SEM／其他元素不清除。格點尺寸取第一個已載入的分析通道，沒有分析通道時取第一個通道。

## Automatic crop suggestion

只用來預先填入裁切框，使用者仍須確認；不影響任何數值定義。

元素圖報表：像素若 `max(R,G,B) < 70`（深色）或 `max − min > 70`（有彩度）視為「圖內」。先取圖內像素數達最滿一列 80% 的最長連續列，再於這些列中取達 80% 的最長連續欄，如此交替收斂兩輪。結果須寬高各 ≥ 16 px、面積 ≥ 整張 4%、框內「圖內」像素 ≥ 90%，且不等於整張圖；否則視為偵測不到。

SEM 白框：列亮度取中央 60% 欄位的平均。自影像中心向外找第一條「亮線」：該列比向內 2 px 的列亮至少 40，且比向外 2 px 的列亮至少 40，或向外已是頁面底色（≥ 225）。上下兩條線找到後，以同樣方式在兩線之間找左右線。四條線都找到且間距 ≥ 18 px 時，回傳線內側的矩形。亮度階梯（例如樹脂與極層交界）不符合「細線」條件。

鎖定尺寸時，裁切框取分析格點尺寸，中心對準偵測到的區域（偵測不到則對準影像中心或先前的裁切），並限制在影像內。

分析格點：已載入通道依尺寸分組，取含分析通道最多者，同數時取通道總數較多者。匯入某通道時不計該通道本身。

## Scale bar

比例尺在裁切視窗的原圖上量測（v0.3.0），因為裁切後它已不在影像內。偵測：在裁切框以外的列，找出亮底上最長的深色水平線（長度 ≥ 12 px 且 ≤ 影像寬度的 90%、不貼影像邊緣、厚度 ≤ 6 px）。兩端有向上或向下的刻度時，長度取兩端刻度中心的距離；沒有刻度的實心線取全長。使用者輸入圖上標示的長度後，`μm/pixel = 長度 / 像素數`；也可以自行點選兩端。量測的不確定度約 ±1 px（50 px 的比例尺約 ±2%）。分析通道不重採樣，所以原圖的 μm/pixel 就是分析格點的 μm/pixel。SEM 會被重採樣，不提供此量測。比例尺的端點與長度記錄於 `importInfo.scaleBar`，重新裁切同一通道時沿用。重新裁切同一張原圖不改變 μm/pixel，尺度保留；換成另一張影像且未輸入長度時，尺度清除。

## Element view

僅為顯示。底圖為 SEM（與格點同尺寸時），否則為黑色。每個勾選的元素圖以其像素 `max(R,G,B)/255` 乘以透明度滑桿的兩倍（上限 1）作為混合權重，顏色取該像素色相的全亮度；CSV 通道使用固定色調。

## ROI / grid

Rectangle 與 Polygon 判斷 pixel centre `(x+0.5,y+0.5)`。有效 ROI = include 聯集（沒有 include 時為全圖）；選擇 Invert 時反轉 include；最後扣除 exclude 聯集。空 ROI 拒絕分析。

Grid 使用有效 ROI 的 bounding rectangle 切為 3×3、5×5、8×8；第 g 格的邊界為 `origin + floor(g × size / grid)`，結果中的每格帶有 `x0, y0, x1, y1`（右、下邊界不含），畫面上的網格直接使用這些值。每格分母只取有效 ROI 像素；無有效 ROI 的格子不參與 CV。各格等權，SD 為母體 SD，不是 sample SD。`CV = sqrt(mean((f_i − mean(f))²))/mean(f)`，無因次，介面不乘 100。

每格另外輸出與全區相同定義、但只計入該格像素的數值（v0.3.0）：`secondaryPixels`、`interparticleOccupancy`、`targetingEfficiency`、`distanceMedian`、`distanceMean`、`binderCoverage`。距離使用全圖的距離場，不會把格子邊界當成沒有顆粒；分母為 0 時為 `null`。CV 是各格之間的差異，沒有單格的值。格子越小，像素越少，數值越不穩定。

## Per-element distribution (v0.4.0)

次要相、F、C 各自輸出 `results.elements.<secondary|f|c>`（沒有該通道時為 `null`）：

- `areaFraction = |E ∩ ROI| / |ROI|`；`pixels = |E ∩ ROI|`。
- `uniformityCV`：各格 `|E ∩ tile| / |ROI ∩ tile|` 的母體 CV，與既有 Uniformity CV 相同定義；次要相的值等於 `uniformityCV`。
- `columns[g]`、`rows[g]`：第 g 欄（列）所有格子合併的 `Σ|E| / Σ|ROI|`，即以像素加權，不是各格比例的平均；該欄（列）沒有 ROI 像素時為 `null`，不當作 0。
- `columnCV`、`rowCV`：上述非空值的母體 CV，對應左右與上下方向的差異。截面影像以 Y 為厚度方向時，`rows` 即沿厚度的比例（影像上方為第 1 列，與 `depthReverse` 無關，截面時圖名標示「影像上方 → 下方」；Top／Middle／Bottom 表則依設定方向）。
- `betweenParticles = |E ∩ G| / |E|`，次要相的值等於 Targeting Efficiency。
- 每格新增 `fPixels`、`fFraction`、`cPixels`、`cFraction`；截面三層新增 `cFraction` 與 `depth.cCV`。
- `thirds`（v0.4.1）：`columns`、`rows` 各三個值，為影像左／中／右與上／中／下三段的 `|E| / |ROI|`；`columnCV`、`rowCV` 為三值的母體 CV。分段方式與 Depth 完全相同（ROI bounding extent、像素中心、`floor(norm × 3)`），因此 `thirds.rows` 等於 `depthAxis = 'y'` 且不反轉時的 `depth.zones`，`thirds.columns` 等於 `depthAxis = 'x'` 時的值（單元測試核對）。三等分不隨網格大小改變。

畫面上的趨勢圖直接使用這些值：每一條細線是一列（欄）各格的 `fraction`，粗線是 `columns`（`rows`）。

次要相為選填（v0.4.0）。沒有次要相時，次要相相關的全區與每格數值（面積比例、CV、Occupancy、Targeting、距離、Binder Coverage、Pearson、overlap）皆為 `null`，F 與 C 照常計算；主相仍為必填，且次要相、F、C 至少需有一個。C 遮罩超過 ROI 95% 時警告。C 訊號也可能來自 PVDF 與 LFP 碳包覆，C 的分布不等同於導電碳的分布。

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

`binderRadius` 預設 3 px（未校正）或 0.5 μm（已校正）。使用者未更動時，隨校正狀態切換預設值；已自訂時，設定比例尺以 `半徑 × μm/px` 換算為 μm，清除比例尺以 `半徑 ÷ μm/px` 換算回 px，比例尺數值改變但單位不變時保留原值。換算結果取 6 位有效數字。

## Depth

介面自 v0.4.1 起不再提供厚度方向與反轉的選項，改以影像位置顯示左中右與上中下三等分（`thirds`）；`depthAxis`、`depthReverse` 仍保存在 Session，`depth` 與 CSV 的 `DepthCV`、`FDepthCV`、`CDepthCV`、`DepthZones` 照舊依這兩個設定計算，舊專案的匯出值不變。

Cross Section：沿所選 X/Y 軸，以有效 ROI bounding extent 作 0–100% 三等分，reverse 決定 Top 的方向。分母為該區有效 ROI 像素；輸出 S/ROI、F/ROI、S∩F/ROI，各區等權 population CV。Top 表示使用者設定方向，不自動識別電極表面或集流體。

## Trace / session

結果與 comparison snapshot 保留版本、日期、原始檔名、尺寸、intensity range、匯入檔 SHA-256（合成資料無原始檔 hash）、ROI、threshold、segmentation、校正與分析設定。Session 包含完整 intensity，圖片另存 embedded PNG；重載重算結果。Session 維持 `schemaVersion: 1`；v0.4.0 新增 `c` 通道與 `seg.c`（舊 Session 沒有時使用目前預設值，平均半徑 2 px），v0.3.0 新增選填欄位 `seg.<channel>.denoise` 與 `importInfo.scaleBar`；v0.2.0 新增欄位（`settings.binderRadiusCustom`、`importInfo` 的縮放資訊）皆為選填。載入時先驗證全部欄位並解碼內嵌 PNG，確認其實際尺寸與通道尺寸相符後才取代目前工作區；未知欄位捨棄。Analysis JSON 匯出數值及 trace；要重新載入工作專案，使用 Session JSON。

所有計算在本機。Worker 的流程實作於 `Core.createPipeline()`，快取 intensity、ROI 與未變更的 mask（ROI 改變時全部重算；分割參數改變時只重算該通道；ratio／ε 只影響次要相）；Worker 層級錯誤會結束所有等待中的請求。每次送回 mask 副本，避免 transferable buffer 使 cache 失效。最新 revision 才可更新畫面，設定變更時清除舊結果。無網路 API、CDN、IndexedDB 或 localStorage；CSP 拒絕外部連線。

## Report figure / comparison chart (v0.5.0)

報告圖寬 `180 mm × 300 dpi = 2126 px`，文字 7–10 pt，PNG 於 IHDR 之後寫入 `pHYs`（11811 px/m）。遮罩面板：灰階底圖（與格點同尺寸的 SEM，否則為主相圖），主相與該元素遮罩以固定透明度上色；影像小於面板時以整數倍、不內插放大，大於面板時以平滑縮小。欄（列）剖面圖的點為該欄（列）各格面積比例的平均，誤差線為樣本標準差（n−1），n 為該欄（列）有分析像素的格數；與畫面上以像素加權的整欄比例略有不同，圖說已註明。圖說的方法取自 `results.trace`（各通道閾值方式、平均半徑、網格、μm/px、是否限定範圍、版本、日期）。

格子偏小：有分析像素的格子，其像素數的中位數小於 600 時提示。這是經驗門檻，用來提醒每格可能只容納少數顆粒；254×94 的影像在 8×8 時每格約 373 像素（提示），5×5 時約 955 像素（不提示）。

比較圖：縱軸為各樣品 `elements.<key>` 的面積比例、`uniformityCV` 或 `thirds` CV；橫軸為樣品順序或比較表中輸入的實驗值。實驗值僅接受純數字（`[-+]?\d+(\.\d*)?([eE][-+]?\d+)?` 等），其餘列為無法讀取。n ≥ 4 才計算 Pearson r（與 F 共定位相同的實作），不做回歸。
