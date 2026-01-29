# 資產配置模擬器 (Asset Allocation Simulator)

這是一個基於 **Cloudflare Workers** 與 **LINE LIFF** 構建的高度互動式財務規劃工具。旨在幫助用戶透過直覺的滑桿界面，模擬不同資產配置比例（如現金、指數 ETF、房地產、主動交易）在長期複利下的財富變化，並透過社群大數據提供同儕配置參考。

## 🌟 核心功能亮點

### 1. 雙模式獨立模擬 (Dual-Plan Simulation)
- 提供 **方案 A (現況)** 與 **方案 B (策略)** 雙滑桿組。
- 用戶可即時對比兩種不同配置在 20 年後的「財富差距」。
- **自動歸一化邏輯**：滑桿具備智慧餘額分配功能，確保資產比例加總恆定為 100%。

### 2. 專業財務概念引導
- **淨資產 (Net Worth) 導向**：強調「淨資產 = 全部資產市值 − 全部負債餘額」，引導用戶排除房貸等負債干擾。
- **動態複利計算**：採用月複利計算模型，精準呈現長時間維度下的財富滾存效果。
- **通膨及格線**：內建通膨試算器，將真實通膨（CAGR）映射至財富趨勢圖，幫助用戶識別配置是否跑贏通膨。

### 3. 社群大數據統計 (Community Insights)
- **資產階層分選**：根據淨資產將數據分為「小資族 (< 300萬)」、「中產階級 (300-3000萬)」及「富裕層 (> 3000萬)」。
- **數據純化過濾**：自動排除維持「100% 現金」預設值的無效紀錄，確保統計結果具備真實參考價值。
- **動態通膨牆**：即時展示社群用戶回報的各類物價漲幅紀錄。

### 4. 極致的跨平台體驗 (UX/Compatibility)
- **LINE LIFF 深度整合**：自動識別好友狀態，提供平滑的登入與授權流程。
- **Android 指標優化**：針對 Android WebView 實作了非同步事件解耦與 `idToken` 重試機制，解決初始化卡頓與狀態遺失問題。
- **登入續接功能**：支持登入後自動回復之前的操作狀態並回開統計視窗。

## 🛠️ 技術棧 (Tech Stack)

- **前端 (Frontend)**: 原生 HTML5 / ES6 JavaScript / Vanilla CSS
- **後端 (Backend)**: [Hono Framework](https://hono.dev/) (Runtime: Cloudflare Workers)
- **資料庫 (Database)**: Cloudflare D1 (SQLite)
- **驗證 (Auth)**: LINE Front-end Framework (LIFF v2)
- **圖表 (Charts)**: Chart.js

## 📂 專案結構

```bash
├── public/
│   ├── index.html      # 主頁面結構
│   ├── script.js       # 核心邏輯 (計算引擎、LIFF 整合、UI 交互)
│   ├── config.js       # 全域配置 (報酬率參數、時間尺度)
│   └── auth.css        # 精緻毛玻璃感視覺樣式
├── src/
│   └── index.js        # Hono 後端 API (數據聚合、身份驗證、D1 交互)
├── schema.sql          # 資料庫表格定義 (users, simulations)
└── wrangler.toml       # Cloudflare Workers 部署設定
```

## 🚀 部署指南

1. **安裝依賴**
   ```bash
   npm install
   ```

2. **建立 D1 資料庫**
   ```bash
   npx wrangler d1 create asset-db
   ```

3. **初始化資料表**
   ```bash
   npx wrangler d1 execute asset-db --file=./schema.sql
   ```

4. **部署至 Cloudflare**
   ```bash
   npx wrangler deploy
   ```

## 📝 開發備註
- **報酬率設定**：所有資產的預期報酬率與風險參數皆定義於 `public/config.js`。
- **數據解耦**：前端數據採集已從 DOM ID 解耦，直接與 `CONFIG.USER_INPUTS` 狀態同步，確保 UI 變動不影響統計功能。

---
*Developed with ❤️ for financial freedom.*
