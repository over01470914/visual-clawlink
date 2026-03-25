# ClawLink 視覺化介面

ClawLink 代理管理系統的商業級網頁介面。採用現代深色主題設計，靈感來自 Linear、Cursor AI 和 TRAE 編輯器。

## 功能特色

- **獨立模式**：與個別代理進行一對一對話
- **群組模式**：多代理主題式討論，支援 @提及功能
- **教學控制**：設定教學模式、嚴格度，以及匯出記憶
- **評分追蹤**：即時 SVG 儀表板、評分細項、迭代計數器
- **檔案鎖定**：檢視與管理跨代理的檔案鎖定
- **記憶瀏覽器**：搜尋與瀏覽代理記憶
- **配對系統**：透過配對碼（XXXX-XXXX 格式）連接代理
- **佇列指示器**：訊息排隊時的視覺回饋
- **WebSocket**：即時訊息傳遞，支援自動重新連線

## 快速開始

### 前置需求

- Python 3.10+
- 運行中的 ClawLink Router（預設：`http://localhost:8420`）

### 安裝

```bash
pip install aiohttp
```

或使用專案檔案：

```bash
pip install .
```

### 啟動

```bash
python server.py
```

介面將於 `http://localhost:8421` 提供服務。

### 環境設定

| 環境變數        | 預設值                    | 說明               |
|----------------|--------------------------|-------------------|
| `ROUTER_URL`   | `http://localhost:8420`  | ClawLink Router 位址 |
| `PORT`         | `8421`                   | GUI 伺服器埠號       |

## 架構

```
visual-clawlink/
  server.py              # aiohttp 伺服器（靜態檔案 + API/WS 代理）
  pyproject.toml         # Python 專案設定
  templates/
    index.html           # 主要 HTML 模板
  static/
    css/
      style.css          # 深色主題樣式表
    js/
      app.js             # 應用程式邏輯（物件導向、模組化類別）
```

### JavaScript 類別

| 類別                    | 職責                                              |
|------------------------|--------------------------------------------------|
| `RouterAPI`            | 透過 /api/ 代理的 REST 呼叫                         |
| `WSManager`            | WebSocket 自動重連與事件發射器                        |
| `ChatRenderer`         | 訊息渲染、對話氣泡、評分卡片、佇列                      |
| `ConversationManager`  | 多對話狀態管理、分頁重新排序                            |
| `AgentPanel`           | 左側欄對話分頁                                       |
| `GroupChatManager`     | 群組主題、@提及自動完成、篩選                           |
| `ScoringPanel`         | SVG 儀表板、評分細項、迭代顯示                          |
| `FileLockViewer`       | 鎖定列表與釋放控制                                    |
| `StrictnessControl`    | 滑桿控制與防抖儲存                                    |
| `PairingDialog`        | 配對碼輸入對話框（自動格式化）                           |
| `App`                  | 主控制器、事件連接、生命週期                             |

## 使用方式

1. 啟動 ClawLink Router
2. 啟動此 GUI 伺服器
3. 在瀏覽器開啟 `http://localhost:8421`
4. 點擊「New Conversation」並輸入代理配對碼
5. 開始對話、教學與評分

## 授權

ClawLink 專案的一部分。
