# Validation

最新驗證見文末「v0.2.0」。以下各節依版本保留原始紀錄；其中引用的 `/workspace/...` 路徑屬當時的建置環境，未隨交接包提供。

## v0.1.0

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

## v0.1.1 語言切換驗證

2026-10-07：15 項數值／語言單元測試通過；原離線 workflow、PNG/JPG/CSV 匯入測試通過。專用語言流程涵蓋四個工作步驟的雙向切換、分析途中切換、state／ROI／遮罩／比較備註保持一致、繁中與英文 Session 還原、舊版 Session 相容、提示與錯誤訊息，以及 1440／1100／390 px 版面無水平溢出。離線 Chromium 153 無外部請求或 page error。既有目標平台實機驗證限制仍適用。

## v0.1.2 匯入相容性

2026-10-07：使用者提供的 SEM／Ni／Fe／F／C PNG 均在離線 Chromium 成功解碼；整張報表尺寸分別為 470×408、261×251、261×255、268×252、265×251，尺寸不一致會阻擋分析並列出提示。強制主解碼器失敗時，FileReader／Image 替代解碼通過；損壞圖片、雙語錯誤、15 項單元測試與既有匯入流程通過。尚未重現使用者 Windows 的原始解碼錯誤，替代解碼器在該環境的效果需實機確認。原始實驗圖未納入 repo。

## v0.1.3 剪貼簿／裁切流程

2026-10-08：16 項單元測試通過，包含整數裁切與 RGBA 精確保留。Linux Chromium 153 的真正剪貼簿 write→Ctrl+V 已測試，不以模擬 paste 事件代替；涵蓋通道選擇、預覽確認、取消／Escape 保留資料、無影像剪貼簿、文字欄位正常貼上、非法裁切、參考尺寸、混合預覽、反向拖曳、重新裁切清除 ROI／校正、Session 保存與還原來源／裁切座標、trace、繁中／English 與 1440／390 px 無水平溢出。原 workflow、PNG/JPG/CSV 匯入、語言切換與替代解碼回歸測試通過，無外部 HTTP 請求或 page error。

另以使用者提供的 Ni／Fe／F 報表 PNG 測試真正的剪貼簿貼上與框選；裁切座標僅用來驗證工具流程與尺寸處理，不代表元素圖已完成科學對位，也未交付其分析結論。原始實驗圖、截圖與 Session 不納入版本庫。實際 Windows／VDI 剪貼簿及倍率仍需工程師環境驗證。

## v0.2.0 重整、缺陷修正與對位

2026-10-14，macOS、Node 24、Playwright 內建 headless Chromium，network offline。34 項單元測試與 8 支瀏覽器腳本全數通過，0 page error、0 外部請求。

重整前先建立基線：v0.1.3 原始碼重新建置與交付 HTML 位元組相同，原 16 項單元測試與 5 支瀏覽器腳本通過。瀏覽器腳本原本的兩處環境相依已修正（寫入 `/workspace/...` 的截圖路徑；`Control+V` 在 macOS 不會貼上，改為 `ControlOrMeta+V`）。之後每一步重整（格式化、拆檔、管線搬移）都以同一組測試確認行為不變。

新增單元測試（18 項）：

- 管線快取：與一次性計算結果一致；只改一個通道的分割參數時其餘通道沿用快取；ROI 改變使全部遮罩失效；更換通道資料；ratio 與 ε 只影響次要相。
- 黏結劑鄰域距離：預設值隨單位切換；自訂值 px↔μm 換算。
- 對位：平移不出界且裁切仍逐位元組相同；同尺寸重採樣等於裁切；面積平均（4→2、3→2、局部區域）；線性內插（2→4、常數影像）；兩軸方向不同；非法輸入；非 SEM 通道拒絕重採樣；長寬比鎖定。
- 語言：原始碼中所有 `t('…')` 字面值皆有繁中對應，所有 `info('…')` 主題皆有雙語說明。

`tests/browser/defects.cjs`：主程式與 Worker 皆為 strict mode；Worker 錯誤後介面恢復且下一次計算正常；ROI／校正清除規則的七種情境；自訂黏結劑距離經設定、變更、清除比例尺的換算與狀態訊息；六種不一致的 Session 被拒絕且工作區不變；未知欄位被捨棄、舊 Session 推定自訂旗標；「重設工作區」雙語文字。

`tests/browser/alignment.cjs`：以 60×40 元素圖與內含 2 倍放大區域的 150×120 SEM 驗證。SEM 尺寸不符時提示並保留 ROI／校正；長寬比鎖定由寬度推得高度；差異檢視在對齊時全為 0、偏移 1 px 後不為 0；按鈕、方向鍵與 Shift 微調；按住顯示參考圖；未鎖定時的 2% 警告；拖曳結束後以精確重採樣重繪；匯入後 SEM 像素與 Ni 完全相同、`importInfo` 欄位正確；**SEM 貼合前後所有指標完全相同**；重開還原框選、重新貼合仍保留 ROI／校正；Session 存檔重載後指標相同；分析通道沒有縮放選項，即使強制設定旗標也只會得到精確裁切；繁中文字與 390 px 無水平溢出。

另以交接包的 Ni／Fe／F／SEM 報表 PNG 走過完整流程（腳本與輸出未納入版本庫）：三張元素圖的掃描區皆為 254×94，裁切後尺寸一致；SEM 框選 Map Data 白框內側（463×173）後縮放為 254×94，比例 ×0.549／×0.543；Fe 放次要相、添加物選 LFP，可完成分析、疊圖顯示於 SEM、Session 存檔與重載。這只驗證軟體流程；裁切座標、未校正的像素距離與自動閾值遮罩都未經科學確認，不構成實驗結論。

`tests/browser/legacy-session.cjs`：由 git tag `v0.1.3` 取出當時的成品 HTML，在其中建立含 CSV 通道、重新裁切的影像通道、矩形與多邊形 ROI、校正、手動設定的黏結劑距離、非預設分割參數與比較項目的工作區並存檔；目前版本可載入該檔，各欄位保留、自訂距離旗標推定為真，且**全部指標與 v0.1.3 的結果完全相同**。沒有該 tag 時此腳本略過。

未重測：2048² 效能數據仍為 v0.1.0 的紀錄。Windows Chrome／Edge 與公司 VDI 實機尚未驗收。
