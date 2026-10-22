# 端到端（浏览器）测试

这两个脚本用 Puppeteer 驱动真实浏览器，验证设置面板里的按钮、下拉菜单、错误提示和热重载后的页面状态。它们**不在** `npm test` 中运行，因为需要一个正在运行的 DSH Web 实例。

## 前置条件

- 一个隔离的 DSH Web 实例（不要用你的主 profile）：
  ```powershell
  $env:DSH_HOME = "$env:TEMP\dsh-hrc-e2e"
  dsh --profile web --host 127.0.0.1 --port 0 --no-open
  ```
  记录它打印的带 token 的 URL。
- 把本插件挂到该临时 profile 的 `node_modules`，并在 `cordis.patch.yml` 中加入注册条目（见根目录 README）。
- 安装 Puppeteer，或使用全局安装：
  ```powershell
  npm install --no-save puppeteer
  # 或
  $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
  ```
- 默认使用 Edge；也可以用 `DSH_EDGE_PATH` 指定 Chromium 可执行文件。

## 运行

```powershell
node test/e2e/test-hot-reload.cjs "http://127.0.0.1:<port>/?token=<token>" "$env:TEMP\hr.png"
node test/e2e/test-ui-actions.cjs "http://127.0.0.1:<port>/?token=<token>" "$env:TEMP\ui.png"
```

- `test-hot-reload.cjs`：打开设置 → 点「热重载」→ 等待页面重载 → 重新打开设置，确认按钮仍在。
- `test-ui-actions.cjs`：打开下拉菜单 → 点「重启应用」（CLI Host 下应显示不可用提示）→ 点「热重载」并等待刷新。

输出里的 `api response: 200` 与 `has hot reload: true` 是主要断言。脚本会把不同阶段的截图写到输出路径旁。
