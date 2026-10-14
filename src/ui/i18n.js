'use strict';
let language = 'zh-Hant';
const UI_ZH = {
  'Electrode EDS Analyzer': '電極 EDS 空間分析',
  Import: '匯入',
  'Save Session': '儲存專案',
  Export: '匯出',
  Settings: '設定',
  About: '關於',
  'Sample name': '樣品名稱',
  'Display channel': '顯示通道',
  Data: '資料',
  ROI: '分析區域',
  Segment: '影像分割',
  Analyze: '分析',
  Original: '原圖',
  Mask: '遮罩',
  Overlay: '遮罩疊圖',
  Elements: '元素疊圖',
  Opacity: '透明度',
  'Overlay opacity': '疊圖透明度',
  Zoom: '縮放',
  Fit: '符合視窗',
  Pan: '平移',
  'Toggle results': '收合／展開結果',
  'Import map': '匯入影像',
  Close: '關閉',
  Ready: '就緒',
  'SEM / BSE': 'SEM / BSE 影像',
  'NMC / Ni': 'NMC 主相 / Ni',
  'Secondary phase / Additive': '次要相／添加物',
  'PVDF / F': 'PVDF 黏結劑 / F',
  'Other element': '其他元素',
  View: '觀察方向',
  'Top View': '表面',
  'Cross Section': '截面',
  Additive: '添加物',
  Other: '其他',
  Remove: '移除',
  'Load Session': '載入專案',
  Synthetic: '合成範例',
  Rectangle: '矩形',
  Polygon: '多邊形',
  Draw: '繪製',
  'Exclude region': '排除區域',
  'Finish Polygon': '完成多邊形',
  Cancel: '取消',
  'Full image': '全圖',
  Clear: '清除',
  'Invert ROI': '反轉分析區域',
  Exclude: '排除',
  Include: '包含',
  Calibration: '尺度校正',
  'Scale bar length (μm)': '比例尺長度（μm）',
  'Select scale bar endpoints': '點選比例尺兩端',
  Segmentation: '影像分割',
  Channel: '通道',
  Auto: '自動',
  Manual: '手動',
  Threshold: '閾值',
  'Threshold slider': '閾值滑桿',
  Invert: '反轉',
  'Fill holes': '填補孔洞',
  Smooth: '平滑',
  'Min object size (px)': '最小物件面積（像素）',
  'Ratio map': '比例圖',
  Analysis: '分析設定',
  Grid: '網格',
  'Binder neighborhood': '黏結劑鄰域距離',
  'Depth axis': '厚度方向',
  'Y (vertical)': 'Y（垂直）',
  'X (horizontal)': 'X（水平）',
  'Reverse Top / Bottom': '反轉上／下方向',
  'Add to Comparison': '加入比較',
  Comparison: '樣品比較',
  Results: '分析結果',
  'Uniformity CV': '分布均勻性 CV',
  'Interparticle Occupancy': '顆粒間佔據率',
  'Targeting Efficiency': '目標區域命中率',
  'Median Distance': '距離中位數',
  Mean: '平均',
  'Binder Coverage': '黏結劑鄰近覆蓋率',
  'Distance distribution': '距離分布',
  'Local area fraction': '局部面積比例',
  'F colocalization': 'F 共定位',
  'Pearson r': 'Pearson 相關係數',
  'F with Secondary': 'F 位於次要相的比例',
  'Secondary with F': '次要相與 F 重疊比例',
  'Depth CV': '厚度分布 CV',
  Zone: '分區',
  Overlap: '重疊比例',
  'F Depth CV': 'F 厚度分布 CV',
  Top: '上層',
  Middle: '中層',
  Bottom: '下層',
  Sample: '樣品',
  CV: 'CV',
  Occupancy: '佔據率',
  Targeting: '命中率',
  Median: '距離中位數',
  Binder: '覆蓋率',
  Cohesive: '內聚強度',
  Peel: '剝離強度',
  'Recipe note': '配方備註',
  'Export comparison CSV': '匯出比較 CSV',
  'Analysis CSV': '分析 CSV',
  'Analysis JSON': '分析 JSON',
  'Overlay PNG': '疊圖 PNG',
  'Session JSON': '專案 JSON',
  'Comparison CSV': '比較 CSV',
  'Reset workspace': '重設工作區',
  Help: '說明',
  Language: '介面語言',
  Imported: '已匯入',
  'Analyzing…': '分析中…',
  'Segmenting…': '分割中…',
  'Mask updated': '遮罩已更新',
  'Calibration updated': '尺度校正已更新',
  'Added to Comparison': '已加入比較',
  'Session loaded · results recomputed': '專案已載入，結果已重新計算',
  'Workspace reset': '工作區已重設',
  'Calibration cleared': '尺度校正已清除',
  'ROI and calibration cleared.': '原分析區域與校正已清除。',
  'Analysis complete': '分析完成',
  'Session could not be loaded': '無法載入專案',
  'Background calculation failed': '背景計算失敗',
  'Mn tracer requires main-phase separation': 'Mn 訊號需區分主相',
  'Exclude Al current collector': '排除 Al 集流體',
  '2D image quantification': '二維影像量化',
  calibrated: '已校正',
  'uncalibrated (px)': '未校正（像素）',
  'About intensity':
    '強度：CSV 保留原始數值；PNG／JPG 採 max(R,G,B)。連通性使用四鄰域；距離由像素中心量至邊界像素中心。分析區域裁切處視為邊界，比較時請採一致裁切規則。',
  'About offline':
    '無外部 API、CDN、上傳或 AI 執行環境。專案 JSON 保存完整強度資料，可離線重新載入。',
};
UI_ZH['μm / pixel'] = 'μm／像素';
const UI_EN = {
  'About intensity':
    'Intensity: CSV retains raw values; PNG/JPG uses max(R,G,B). Connectivity uses four neighbours. Distances run from pixel centre to boundary pixel centre. ROI cuts form boundaries; compare consistent crop rules.',
  'About offline':
    'No external API, CDN, upload or AI runtime. Session JSON includes complete intensity data and can be reloaded offline.',
};
// Help texts in plain Chinese; symbols, units and instrument names stay as written on the reports.
const HELP_ZH = {
  secondary:
    '相對主相額外加入的材料，例如 TiO₂、ZrO₂、MnO₂、Al₂O₃ 或 LFP。這是配方上的角色，不代表一定是獨立的晶相。',
  area: '遮罩的像素數除以分析範圍的像素數，也就是這個元素在影像上所佔的面積比例。',
  cv: '把分析範圍切成網格，算出每一格的面積比例，再以標準差除以平均。數值越小，各處越接近，分布越均勻；空格不計入。',
  profileCV:
    '把同一欄（或同一列）的格子合併算出面積比例，再比較各欄（或各列）之間的差異。欄間差異大代表左右不均，列間差異大代表上下不均；截面影像的列間差異就是厚度方向的變化。',
  between: '這個元素的像素中，位於主相顆粒之外、也就是顆粒之間的比例。',
  occupancy: '主相顆粒之間的空隙中，被次要相佔據的比例。這是平面上的佔據率，不是立體孔隙的填充率。',
  targeting: '次要相的像素中，位於主相顆粒之外的比例。',
  distance: '每個次要相像素到最近主相顆粒邊界的直線距離；疊在顆粒上的像素也量到邊界。',
  binder:
    '次要相的邊緣像素中，在設定距離內有黏結劑（F）的比例。F 只是黏結劑的指標元素，不代表有化學鍵結。',
  pearson: '次要相與 F 兩張元素圖原始強度的相關係數，介於 −1 到 1。相關高不能單獨證明黏結劑包覆。',
  overlap: '兩個遮罩重疊的像素數，分別除以 F 或次要相的像素數；只看有無，不看強度。',
  depth:
    '把截面的分析範圍沿厚度方向等分為上、中、下三層，比較各層的面積比例。請設定哪一側是上方，並先排除集流體。',
  threshold: '自動模式依強度分布找出分界（大津法）；手動模式把強度高於閾值的像素算作有該元素。',
  csv: '沒有標題列、以逗號分隔的數值矩陣。CSV 保留原始強度，比圖片準確；圖片取紅、綠、藍三色中的最大值，彩色色階不一定保留原始強度。',
  cal: '每個像素代表的實際長度（μm）。裁切時會由原圖上的比例尺換算，也可以在這裡直接輸入；空白時距離以像素顯示。',
  roi: '矩形用拖曳；多邊形逐點點選後按「完成多邊形」。多個範圍取聯集，可整體反轉，最後扣除標為排除的部分。',
  mn: '主相本身就含錳，直接以錳圖取閾值會高估 MnO₂。錳除以鎳的比例圖只是輔助判斷，需確認背景與低鎳區的訊號。',
  al: '鋁圖可能包含鋁集流體。截面影像必須先限定電極層，並排除集流體。',
  unit: 'CSV 保留原始強度，圖片為 0 到 255。各張圖須相同尺寸、相同視野與方向，並已對齊。',
  smooth: '以 3×3 鄰域多數決修整遮罩邊緣。處理順序：取閾值、修整、填補孔洞、移除小物件。',
  radius:
    '判定「附近有黏結劑」的距離。有比例尺時預設 0.5 μm，否則 3 像素；只影響黏結劑鄰近覆蓋率。',
  scope:
    '所有結果都是平面影像的量化，不能據此推論體積分率、立體孔隙、化學鍵結、顆粒內部滲入或內聚力的因果關係。',
  scaleBar:
    '比例尺在原圖上，裁切後就看不到了。橘線是找到的比例尺，請輸入旁邊標示的長度；位置不對時按「點選比例尺兩端」自行指定。誤差約 ±1 像素。',
  denoise:
    '取閾值前先對元素圖做局部平均。元素圖是稀疏的計數點，不平均時只會挑出零星亮點。半徑越大區域越完整、細節越少；0 為關閉，舊版專案維持關閉。',
  pasteCrop:
    '在 VDI 複製影像或截圖，按該通道的「貼上」，再按 Ctrl+V。框選範圍只保留元素圖本身，排除標題與比例尺。尺寸相同不代表已對齊，請用右側的混合預覽確認。更換分析用影像或改變尺寸時，會清除分析範圍與尺度。',
  nudge:
    '以整數像素移動裁切框，大小不變、不重新取樣。點左側影像後也可以用方向鍵；按住 Shift 一次移動 10 像素。',
  semFit:
    'SEM 只當底圖，不參與任何計算，所以可以縮放。請框出元素圖實際掃描的範圍（例如標示 Map Data 的白框），工具會把它縮放成與元素圖相同的尺寸。分析用影像永遠不縮放。',
  lockSize:
    '所有通道必須是相同的像素尺寸才能計算。勾選時裁切框固定為已載入影像的尺寸，拖曳只移動位置。只有要重新決定整組尺寸時才取消勾選。',
  comparison:
    '把目前的結果加入比較表，換下一個樣品分析後再加入。比較表可以填入剝離強度等實驗值，並匯出 CSV。',
};
const HELP_EN = {
  secondary:
    'An additive relative to the NMC main phase, such as TiO₂, ZrO₂, MnO₂, Al₂O₃ or LFP; this recipe role does not imply a separate crystalline phase.',
  cv: 'Population standard deviation divided by mean Secondary area fraction across ROI tiles; lower values indicate less local variation. Empty tiles are excluded.',
  occupancy:
    'Secondary pixels in the NMC interparticle region divided by interparticle pixels; this is 2D occupancy, not 3D pore filling.',
  targeting:
    'Secondary pixels in ROI minus the NMC mask divided by all Secondary pixels in the effective ROI.',
  distance:
    '2D Euclidean distance from each Secondary pixel centre to the nearest NMC boundary pixel centre; pixels inside NMC are also measured to its boundary.',
  binder:
    'Fraction of Secondary boundary pixels with F mask within the selected radius. F is a PVDF tracer, not evidence of chemical bonding.',
  pearson:
    'Pearson r between raw Secondary and F intensities in the effective ROI; constant signals are undefined. Correlation alone does not prove PVDF coverage.',
  overlap:
    'Directional overlap of thresholded binary masks, not an intensity-weighted Manders coefficient.',
  depth:
    'Split the effective ROI thickness into three equal zones and compute area fractions and population CV; set the Top direction and exclude the collector.',
  threshold:
    'Auto uses an Otsu histogram in the ROI; Manual selects intensity > threshold, and Invert reverses that predicate.',
  csv: 'A rectangular numeric CSV matrix without headers. Prefer raw CSV; image intensity is max(R,G,B), and colour LUTs may not preserve raw intensity.',
  cal: 'μm/pixel; blank or zero means uncalibrated pixel distances. For a scale bar, select both endpoints and enter its physical length.',
  roi: 'Drag a Rectangle, or click Polygon vertices and finish. Include ROIs are united, optionally inverted, then exclusions are subtracted.',
  mn: 'NMC contains Mn. Mn thresholding can overestimate MnO₂; Mn/(Ni+ε) is an exploratory proxy requiring background and low-Ni validation.',
  al: 'Al maps may include the current collector. Restrict the electrode ROI and exclude the collector in cross sections.',
  unit: 'CSV retains raw numeric intensity; images use 0–255. Maps must share dimensions, field of view and orientation and be registered before import.',
  smooth:
    '3×3 binary majority smoothing. Processing order: threshold → smooth → fill holes → remove small objects. Boundaries and connectivity use four neighbours.',
  radius:
    'Default: 0.5 μm when calibrated, otherwise 3 px. This radius affects Binder Coverage only.',
  scope:
    'All results are 2D spatial image quantification; they cannot establish volume fraction, 3D pores, chemical bonding, internal penetration or cohesive causation.',
};
const MESSAGES = {
  'NMC mask 為空，請調整 threshold。': [
    'NMC 遮罩為空，請調整閾值。',
    'NMC mask is empty. Adjust threshold.',
  ],
  'Secondary mask 為空，請調整 threshold。': [
    '次要相遮罩為空，請調整閾值。',
    'Secondary mask is empty. Adjust threshold.',
  ],
  'ROI 為空。': ['分析區域為空。', 'ROI is empty.'],
  'CSV 含空值或非數值。': ['CSV 含空值或非數值。', 'CSV contains empty or nonnumeric values.'],
  'CSV 各列欄數不一致。': ['CSV 各列欄數不一致。', 'CSV rows have different column counts.'],
  'Map 含非有限數值。': ['影像矩陣含非有限數值。', 'Map contains nonfinite values.'],
  'Channel 尺寸不一致，請重新匯入相同尺寸 map。': [
    '通道尺寸不一致，請匯入相同尺寸的影像。',
    'Channel dimensions differ. Import maps of equal size.',
  ],
  'Channel 尺寸不一致，無法分析。': [
    '通道尺寸不一致，無法分析。',
    'Channel dimensions differ. Analysis is blocked.',
  ],
  '請載入 NMC 與 Secondary map。': ['請載入 NMC 與次要相影像。', 'Import NMC and Secondary maps.'],
  'Ratio 需要 Ni 與 Mn map。': ['比例圖需要 Ni 與 Mn 影像。', 'Ratio requires Ni and Mn maps.'],
  'Al₂O₃ 截面請先設定極層 ROI／排除集流體。': [
    'Al₂O₃ 截面請先設定極層分析區域／排除集流體。',
    'Define the electrode ROI or exclude the collector for an Al₂O₃ cross section.',
  ],
  '設定已改變，請重新分析。': ['設定已改變，請重新分析。', 'Settings changed. Run analysis again.'],
  '僅支援 PNG / JPG / CSV。': ['僅支援 PNG / JPG / CSV。', 'Only PNG, JPG and CSV are supported.'],
  'Map 超過 1600 萬像素，請先縮小。': [
    '影像超過 1600 萬像素，請先縮小。',
    'Map exceeds 16 million pixels. Resize it first.',
  ],
  'Threshold 必須為有限數值。': ['閾值必須為有限數值。', 'Threshold must be finite.'],
  '距離必須 ≥ 0。': ['距離必須 ≥ 0。', 'Distance must be nonnegative.'],
  'ε 必須 > 0。': ['ε 必須 > 0。', 'ε must be positive.'],
  'Scale bar length 必須 > 0。': ['比例尺長度必須 > 0。', 'Scale bar length must be positive.'],
  '拖曳 Rectangle。': ['拖曳以繪製矩形。', 'Drag to draw a rectangle.'],
  '點選 Polygon 頂點，完成後按完成。': [
    '逐點選取多邊形頂點，再按完成。',
    'Click polygon vertices, then finish.',
  ],
  '點選 Scale bar 兩端。': ['點選比例尺兩端。', 'Select both scale bar endpoints.'],
  '兩端不能相同。': ['兩端不能相同。', 'Endpoints must be different.'],
  'Polygon 至少需要 3 個頂點。': [
    '多邊形至少需要 3 個頂點。',
    'A polygon needs at least three vertices.',
  ],
  '尚無分析結果。': ['尚無分析結果。', 'No analysis results yet.'],
  '請先完成分析。': ['請先完成分析。', 'Run analysis first.'],
  '不支援的 Session 格式。': ['不支援的專案格式。', 'Unsupported session format.'],
  '欄位缺漏。': ['欄位缺漏。', 'Required fields are missing.'],
  '圖片須為內嵌 PNG。': ['圖片須為內嵌 PNG。', 'Images must be embedded PNG data.'],
  'Channel 資料不合法。': ['通道資料不合法。', 'Invalid channel data.'],
  '參數不合法。': ['參數不合法。', 'Invalid parameters.'],
  'Segmentation 不合法。': ['影像分割設定不合法。', 'Invalid segmentation settings.'],
  'ROI 不合法。': ['分析區域不合法。', 'Invalid ROI.'],
  'Polygon 不合法。': ['多邊形不合法。', 'Invalid polygon.'],
  'ROI 格式不合法。': ['分析區域格式不合法。', 'Invalid ROI format.'],
  'NMC mask 超過 ROI 95%。': ['NMC 遮罩超過分析區域 95%。', 'NMC mask exceeds 95% of the ROI.'],
  'Secondary mask 超過 ROI 95%。': [
    '次要相遮罩超過分析區域 95%。',
    'Secondary mask exceeds 95% of the ROI.',
  ],
  'F mask 超過 ROI 95%。': ['F 遮罩超過分析區域 95%。', 'F mask exceeds 95% of the ROI.'],
  'C mask 超過 ROI 95%。': ['C 遮罩超過分析區域 95%。', 'C mask exceeds 95% of the ROI.'],
  '請至少載入次要相、F 或 C 其中一張。': [
    '請至少載入次要相、F 或 C 其中一張。',
    'Load at least one of the secondary phase, F or C.',
  ],
  '無 NMC 顆粒間區域，Occupancy 無法計算。': [
    '無 NMC 顆粒間區域，無法計算佔據率。',
    'No interparticle region. Occupancy is undefined.',
  ],
};
Object.assign(UI_ZH, {
  'Channel dimensions differ': '通道尺寸不一致',
  'Crop labels and scale bars; use aligned map regions of equal size.':
    '請裁除標題與比例尺，使用相同尺寸、已對位的影像區域。',
  'Import failed': '匯入失敗',
  'Image could not be decoded': '無法解碼圖片，請以影像軟體重新另存 PNG／JPEG 後再匯入。',
  'File could not be read': '無法讀取檔案，請複製到電腦本機後重試。',
});
Object.assign(UI_ZH, {
  'Paste / Ctrl+V': '貼上 / Ctrl+V',
  'Crop / review': '裁切／確認',
  'Paste image': '貼上影像',
  'Waiting for image': '等待貼上影像',
  'Clipboard image': '剪貼簿影像',
  'Copy an image or screenshot in VDI, then press Ctrl+V here.':
    '在 VDI 複製影像或截圖，再於此處按 Ctrl+V。',
  'Paste image pixels, not a file shortcut.': '請複製顯示出的影像，不是檔案捷徑。',
  'Crop and review': '裁切與對位確認',
  'Drag to select image region': '拖曳框選有效影像區域',
  'Left (px)': '左側 X (px)',
  'Top (px)': '上側 Y (px)',
  'Width (px)': '寬度 (px)',
  'Height (px)': '高度 (px)',
  'Use full image': '使用整張圖',
  'Use reference dimensions': '套用參考圖尺寸',
  'Crop preview': '裁切預覽',
  'Reference channel': '對位參考通道',
  'Image / reference blend': '影像／參考圖混合比例',
  'I checked the image region, orientation and alignment.':
    '我已確認有效影像區域、方向與位置對齊。',
  'Apply to channel': '確認並匯入通道',
  'Crop must be an integer rectangle inside the image.':
    '裁切範圍須為圖內的整數座標，寬高至少 1 px。',
  'Invalid crop rectangle': '裁切範圍不合法。',
  'First channel: select only the map region.': '第一個通道：請只保留有效影像區域。',
  'Equal dimensions; check alignment using the blend slider.': '尺寸一致；請拖曳混合比例檢查對位。',
  'Dimensions differ. Adjust the crop or crop the other channels before analysis.':
    '尺寸仍不一致；請調整裁切或裁切其他通道後再分析。',
  'Image applied': '影像已匯入',
  'ROI and calibration cleared; recalibrate cropped screenshots.':
    '原分析區域與校正已清除；請重新校正裁切影像。',
  'Calibrate screenshots before using micrometres.': '截圖須校正比例尺後才能使用 μm。',
  'No image in clipboard. Copy the displayed image or a screenshot.':
    '剪貼簿內沒有影像。請複製顯示出的影像或截圖。',
});
Object.assign(UI_ZH, {
  'Check masks': '確認遮罩',
  'The coloured areas are where each element is counted as present. If they look like the element maps, go on; adjust only when one is clearly too large or too small.':
    '彩色區域是工具判定「有這個元素」的位置，所有數值都從這裡算出。和元素圖看起來相符就按下一步；明顯太多或太少時才調整。',
  'Each cell shows the local share of the secondary phase. Click a cell to see its values on the right; click it again for the whole region.':
    '每一格標示次要相的局部面積比例。點一格，右側顯示該格的數值；再點一次回到全區。',
  'Limit the analysed area (optional)': '限定分析範圍（選用）',
  'Only needed when the image holds something that must not be counted, such as a current collector or an empty margin.':
    '只有影像中包含不該計入的部分（例如集流體或空白邊緣）時才需要。',
  'Adjust a mask': '遮罩不對時再調整',
  'Averaging radius (px)': '平滑半徑 (px)',
  Off: '關閉',
  'Al₂O₃ cross sections need the current collector excluded; draw the area below.':
    'Al₂O₃ 截面須先排除集流體；請在下方繪製範圍。',
  'set from the scale bar when cropping': '裁切時由比例尺換算',
  'Scale bar': '比例尺',
  'Length printed on the image (μm)': '圖上標示的長度 (μm)',
  'Click the two ends': '點選比例尺兩端',
  'Click one end of the scale bar on the image.': '請在影像上點比例尺的一端。',
  'Now click the other end of the scale bar.': '再點比例尺的另一端。',
  'No scale bar found. Click its two ends, or enter μm / pixel on the Data step.':
    '找不到比例尺。請點選它的兩端，或在「資料」頁輸入 μm／像素。',
  pixel: '像素',
  'differs from the scale already set': '與目前的尺度不同',
  'at the scale already set': '依目前的尺度',
  'enter the length printed next to it.': '請輸入旁邊標示的長度。',
  'Secondary area fraction': '次要相面積比例',
  'Share of this area covered by the secondary phase.': '次要相佔這個範圍的面積比例。',
  'How much that share differs from cell to cell. Lower is more even.':
    '各格面積比例的差異程度；越小代表分布越均勻。',
  'Share of the space between main-phase particles filled by the secondary phase.':
    '主相顆粒之間的空隙，有多少被次要相佔據。',
  'Share of the secondary phase that lies between particles rather than on them.':
    '次要相有多少落在顆粒之間，而不是疊在主相上。',
  'Typical distance from the secondary phase to the nearest main-phase surface.':
    '次要相到最近主相顆粒表面的典型距離。',
  'Share of the secondary-phase outline with binder within the set distance.':
    '次要相邊緣在設定距離內有黏結劑的比例。',
  'How much that share differs between the top, middle and bottom thirds. Lower is more even.':
    '上、中、下三層面積比例的差異程度；越小代表越均勻。',
  'Row {r} · column {c}': '第 {r} 列 · 第 {c} 欄',
  'Whole region': '全區',
  'Values of this cell only. The smaller the cell, the less steady the numbers.':
    '以下只是這一格的數值；格子越小，數值越不穩定。',
  'Click a cell on the image to see its values.': '點影像上的格子，可看該格的數值。',
  'whole region only': '只有全區才有',
  'already set': '已設定，可不填',
  'Analysed-area limits cleared; the scale is unchanged.': '分析範圍已清除；尺度不變。',
  'Replacing this image clears the scale; type the length to keep it.':
    '換成另一張影像會清除尺度；請填入長度以保留。',
});
HELP_EN.scaleBar =
  'The scale bar is still on this source image; after cropping it is gone. The bar that was found is drawn in orange: type the length printed next to it to get μm per pixel. If it is in the wrong place, click its two ends yourself. Length runs between the centres of the end ticks, give or take one pixel.';
HELP_EN.denoise =
  'Local averaging of the map before its threshold. EDS maps are sparse counts; without averaging a threshold picks out lit pixels rather than regions. A larger radius gives fuller regions and less detail; 0 turns it off. Sessions from older versions stay off.';
HELP_EN.cal =
  'μm per pixel; blank or zero means distances stay in pixels. The crop dialog works it out from the scale bar on the source image, or type it here.';
HELP_EN.pasteCrop =
  'Copy an image or screenshot in VDI, select a channel, then press Ctrl+V. Crop only the map region. Reference dimensions change the crop rectangle without resizing pixels. Capture each map at the same display scale and retain the same field of view. Equal dimensions do not prove registration: inspect the blend preview. Replacing or recropping an analysis channel (Ni, secondary phase or F), or changing the image size, clears ROI and calibration; recalibrate screenshot distances. SEM and other-element maps are display-only and keep them when the size is unchanged.';
Object.assign(UI_ZH, {
  'Nudge (px)': '微調（像素）',
  'Move left': '左移',
  'Move right': '右移',
  'Move up': '上移',
  'Move down': '下移',
  'Shift = 10 px': 'Shift＝10 px',
  'Scale selection to reference size (SEM only)': '將框選區縮放為參考圖尺寸（僅限 SEM）',
  'Lock reference aspect ratio': '鎖定參考圖長寬比',
  'Preview mode': '預覽模式',
  Blend: '混合',
  Difference: '差異',
  'Hold to show reference': '按住顯示參考圖',
  Scale: '縮放',
  'Horizontal and vertical scale differ by more than 2%; check the selected region.':
    '水平與垂直縮放比例相差超過 2%；請檢查框選範圍。',
  'SEM is display-only; resampled pixels never enter the metrics.':
    'SEM 僅供顯示；重採樣後的像素不參與任何指標。',
  'Display only, resampled': '僅供顯示，已重採樣',
  'Only the SEM display channel can be resampled': '只有 SEM 顯示通道可以重採樣。',
  'Invalid target size': '目標尺寸不合法。',
  'Detect map region': '自動偵測有效區域',
  'Keep the analysis grid size': '鎖定為分析格點尺寸',
  'Region suggested automatically; please check it.': '已自動框選有效區域，請確認。',
  'Review the crop': '請確認裁切範圍',
  'Calculation is paused: channel sizes differ.': '計算已暫停：通道尺寸不一致。',
  'Analysis grid': '分析格點',
  Fix: '修正',
  'Re-import this channel at the grid size, or remove it.':
    '請以格點尺寸重新匯入此通道，或將其移除。',
  Next: '下一步',
  Advanced: '進階',
  'in use': '已啟用',
  'Show elements': '顯示元素',
  'Paste or choose an image for each channel. The map area is found for you and every channel is kept the same size.':
    '為每個通道貼上或選擇影像。工具會自動框出有效區域，並讓各通道保持相同尺寸。',
  'The region is optional: leave it empty to analyse the whole image. Enter μm / pixel here if distances should be in micrometres.':
    '分析區域可不設定（分析整張影像）。若距離要以 μm 顯示，請在此填入 μm／像素。',
  'Check that the mask of each channel covers the right areas; adjust the threshold if not.':
    '逐一檢查各通道的遮罩是否蓋住正確區域；不對時調整閾值。',
  'Run the analysis. Change a setting and run it again to compare.':
    '按「分析」取得結果；更動設定後需重新分析。',
  'Channel sizes differ; fix them with the notice above the image.':
    '通道尺寸不一致；請用影像上方的提示修正。',
  'Load the main-phase and secondary-phase maps first.': '請先載入主相與次要相影像。',
});
HELP_EN.nudge =
  'Moves the crop by whole pixels; size is unchanged and nothing is resampled. Arrow keys work after clicking the source image; hold Shift for 10 px. Check alignment with the blend, difference or hold-to-show-reference views.';
HELP_EN.semFit =
  'SEM is a display backdrop and never enters the metrics, so it may be scaled. Select the area the element maps actually scanned (for example the white Map Data box); it is resampled to the reference channel size using area averaging when shrinking and bilinear interpolation when enlarging. Scale and method are recorded in the trace. Analysis channels (Ni, secondary phase, F) are never resampled.';
HELP_EN.lockSize =
  'Every channel must have the same pixel size before anything can be computed. While ticked, the crop box is fixed at the size of the analysis channels already loaded and dragging only moves it, so channels cannot end up a pixel or two apart. Untick only to redefine the size for the whole set.';
Object.assign(HELP_EN, {
  area: 'Mask pixels divided by the pixels of the analysed area: the share of the image the element covers.',
  profileCV:
    'Cells in the same column (or row) are pooled into one share, and the columns (or rows) are compared. A large column spread means left and right differ; a large row spread means top and bottom differ, which on a cross section is the change through the thickness.',
  between: 'Share of the element lying outside the main-phase particles, in the gaps between them.',
  comparison:
    'Adds the current results to the comparison table; analyse the next sample and add it too. The table takes measured values such as peel strength and exports to CSV.',
});
// Interface text introduced with the redesigned layout.
Object.assign(UI_ZH, {
  Steps: '步驟',
  'Open project': '開啟專案',
  More: '更多',
  'Load the synthetic example': '載入合成範例',
  'Start with the first element map': '從第一張元素圖開始',
  'Paste or choose it on the left. The map area and the scale bar are found for you.':
    '在左側貼上或選擇影像，工具會自動找出有效區域與比例尺。',
  'Open a saved project': '開啟已存的專案',
  'Try the synthetic example': '用合成範例試用',
  'The example is generated data for trying the steps; it is not a measurement.':
    '範例是程式產生的影像，用來熟悉操作，不是量測資料。',
  'Replace the loaded images with the synthetic example?': '要以合成範例取代目前載入的影像嗎？',
  Elements: '元素疊圖',
  Overlay: '遮罩疊圖',
  Original: '原圖',
  'Single mask': '單一遮罩',
  'Carbon / C': '導電碳 / C',
  Required: '必填',
  Optional: '選填',
  'Display only': '僅顯示',
  Paste: '貼上',
  'Choose file': '選擇檔案',
  'Crop / review': '裁切',
  'Maps to analyse': '分析用影像',
  'Shown only, never measured': '底圖與參考（不參與計算）',
  'Load the main-phase map and at least one of the secondary phase, F or C.':
    '請載入主相影像，以及次要相、F、C 至少一張。',
  'Paste or choose an image for each element. The map area and the scale bar are found when you crop.':
    '為每個元素貼上或選擇影像；裁切時會自動找出有效區域與比例尺。',
  'Colour marks where each element is counted. Go on if it matches the element maps.':
    '顏色是判定為有該元素的位置。和元素圖相符就繼續。',
  'Click a cell to see its values; click it again for the whole region.':
    '點格子看該格數值，再點一次回到全區。',
  Analysis: '分析設定',
  'Add to Comparison': '加入目前結果',
  'Open table': '開啟比較表',
  Recalculate: '重新計算',
  Results: '分析結果',
  'Figures appear here once the analysis has run.':
    '完成前兩個步驟後，這裡會顯示各元素的分布數值。',
  'Secondary phase': '次要相',
  'Binder F': '黏結劑 F',
  'Carbon C': '導電碳 C',
  'Area fraction': '面積比例',
  'Share of the analysed area.': '佔分析範圍的比例',
  'Uniformity CV': '分布均勻性 CV',
  'Cell-to-cell spread; lower is more even.': '各格之間的差異，越小越均勻',
  'Column CV': '欄間差異 CV',
  'Row CV': '列間差異 CV',
  'Left to right': '左右方向',
  'Top to bottom': '上下方向',
  'Around the main-phase particles': '與主相顆粒的關係',
  'Interparticle Occupancy': '顆粒間佔據率',
  'Share of the gaps between particles it fills.': '顆粒之間的空隙被它佔據的比例',
  'Between particles': '落在顆粒之間',
  'Share of it lying between particles, not on them.': '落在顆粒之間、而非疊在顆粒上的比例',
  'Median Distance': '到顆粒距離中位數',
  'With the binder': '與黏結劑的關係',
  'Binder Coverage': '鄰近有黏結劑的比例',
  'Share of its outline with binder within the set distance.': '邊緣在設定距離內有黏結劑的比例',
  'With the secondary phase': '與次要相的關係',
  'Share of the secondary-phase outline with binder nearby.': '次要相邊緣附近有黏結劑的比例',
  'F with Secondary': 'F 與次要相重疊',
  'Secondary with F': '次要相與 F 重疊',
  'Pearson r': '強度相關係數',
  'Through the thickness': '厚度方向',
  'Depth CV': '上中下差異 CV',
  'Spread between the top, middle and bottom thirds.': '上、中、下三層之間的差異',
  'Share of this cell.': '佔這一格的比例',
  'Spread figures exist for the whole region only. The smaller the cell, the less steady the numbers.':
    '差異類指標只有全區才有。格子越小，數值越不穩定。',
  'Columns, left to right': '各欄 · 左 → 右',
  'Rows, top to bottom': '各列 · 上 → 下',
  'Row {n}': '第 {n} 列',
  'Column {n}': '第 {n} 欄',
  'Whole columns': '整欄',
  'Whole rows': '整列',
  '{element}: share in each column and row': '{element} · 各欄與各列的面積比例',
  'Whole column / row': '整欄／整列',
  'Grid labels': '格內數字',
  'Each row / column of cells': '單一列／欄',
  'already set': '已設定',
  'First channel: select only the map region.': '第一個通道：只框選元素圖本身',
  'Equal dimensions; check alignment using the blend slider.': '尺寸一致；拖曳混合比例檢查對位',
  'Dimensions differ. Adjust the crop or crop the other channels before analysis.':
    '尺寸仍不一致；請調整裁切',
  'Region suggested automatically; please check it.': '已自動框選，請確認',
});
function t(key) {
  return language === 'zh-Hant' ? (UI_ZH[key] ?? key) : (UI_EN[key] ?? key);
}
function messageText(raw) {
  return MESSAGES[raw]?.[language === 'zh-Hant' ? 0 : 1] ?? t(raw);
}
function setUILanguage(value) {
  if (!['zh-Hant', 'en'].includes(value)) return false;
  language = value;
  return true;
}
const help = new Proxy(HELP_ZH, {
  get: (_, key) => (language === 'en' ? (HELP_EN[key] ?? HELP_ZH[key]) : HELP_ZH[key]),
});
if (typeof module !== 'undefined')
  module.exports = {
    t,
    messageText,
    help,
    setUILanguage,
    getLanguage: () => language,
    UI_ZH,
    UI_EN,
    HELP_ZH,
    HELP_EN,
    MESSAGES,
  };
