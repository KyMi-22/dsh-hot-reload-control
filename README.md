# dsh-hot-reload-control

DSH 设置页右上角的「热重载 / 重启」下拉按钮。默认显示 **热重载**，点右侧箭头展开第二个动作 **重启应用**。

## 界面

```
设置                                        打开配置文件  [⟳ 热重载 | ⌄]
                                                         ┌─────────────────────────────┐
                                                         │ ⟳ 热重载            默认    │
                                                         │   重新组合插件树并刷新页面    │
                                                         │ ↻ 重启应用                  │
                                                         │   关闭并重新启动 DSH…       │
                                                         └─────────────────────────────┘
```

- **热重载**：调用 DSH 自带的 HMR 服务重新组合当前 profile 的插件树，然后刷新页面。新装的 Host 插件、改过的 `cordis.patch.yml`、重新构建过的客户端 bundle 都会在这一步生效。**不会写入任何配置文件**（因此没有采用“往 patch 里写标记注释”的做法）。
- **重启应用**：桌面安装版专用。由一个分离助手结束 Electron 外壳、等待 Host 与旧端口退出，再用干净的环境重新拉起同一个可执行文件。用于 HMR 覆盖不到的情况（例如换包、原生模块、Host 启动期模块）。会中断正在运行的 Agent 与后台作业；检测到活动任务时会先弹出确认框。

## 目录结构

```
dsh-hot-reload-control/
├─ package.json          # 插件清单：dsh.bundle + dsh.client
├─ cordis.patch.yml      # profile 注册层
├─ lib/
│  ├─ index.js           # Host 半区：HMR 重载与重启 RPC
│  ├─ client.js          # 浏览器半区：设置下拉按钮（源码即产物）
│  └─ restart-helper.js  # detached 重启助手源码
├─ locale/               # 插件市场元数据（中/英）
├─ test/                 # 不依赖 DSH 的单元/集成测试
└─ README.md
```

源码即产物：`lib/client.js` 不需要构建步骤，修改后由 DSH 的客户端 bundle 监听器直接加载。

## 开发与测试

```powershell
npm run check   # 三个 JS 文件的语法检查
npm test        # Host / 客户端注册 / 渲染 / 重启助手测试
```

`test/test-desktop-detect.mjs` 需要模拟打包桌面环境，单独运行方式见 [test/README.md](test/README.md)。真实浏览器端到端脚本在 [test/e2e](test/e2e/README.md)，需要一个隔离的 DSH Web 实例。

## 安装

> DSH 的「插件」页只列出 profile 里正式选择的 **bundle**。只把包挂到 `node_modules`，或只在 `cordis.patch.yml` 里手写一条 insert，插件可以运行，但插件页不会显示它。原因是插件管理器的 `listBundles` 只枚举 `dsh.profile.bundles` 中的选中项，未选中的普通依赖会被忽略。

### 方式一：作为 profile bundle 登记（推荐，插件页可见）

以桌面 profile 的 `~/.dsh/profiles/desktop/package.json` 为例：

```json
{
  "dependencies": {
    "dsh-hot-reload-control": "link:C:/path/to/dsh-hot-reload-control"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "...",
        "dsh-hot-reload-control"
      ]
    }
  }
}
```

然后在 profile 目录执行：

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm install
```

包内的 `cordis.patch.yml` 会由 bundle 机制自动应用，**不需要**再往 profile 的 `cordis.patch.yml` 手写 insert。登记后点插件页右上角的「刷新」或重开页面——外部配置变更不会主动通知插件页。

### 方式二：仅挂载运行（插件页不显示）

适合临时调试。把包挂到 `node_modules`，再在 profile 的 `cordis.patch.yml` 末尾追加一条 insert：

```powershell
$profileDir = "$env:USERPROFILE\.dsh\profiles\desktop"
$pluginDir  = "C:\path\to\dsh-hot-reload-control"

New-Item -ItemType Directory -Force "$profileDir\node_modules" | Out-Null
New-Item -ItemType Junction -Path "$profileDir\node_modules\dsh-hot-reload-control" -Target $pluginDir
```

```yaml
- insert:
    - id: hot-reload-control
      name: 'dsh-hot-reload-control'
```

这种方式绕过了 profile 的 bundle 选择，所以插件页不会列出它。要让它出现在插件页，改用方式一。

## 卸载

- 方式一：从 `dsh.profile.bundles` 与 `dependencies` 中移除 `dsh-hot-reload-control`，在 profile 目录执行 `pnpm install`。
- 方式二：删除 `node_modules\dsh-hot-reload-control` 链接，并移除 `cordis.patch.yml` 中对应的 insert。

## 实现要点

- 宿主半区只注册一个小型同源 JSON 路由 `/dsh-hot-reload-control/api`，访问前经过官方 `ctx.connection.requestRejection(req)` 信任栅栏。
- `reload` 使用公开的 HMR 服务：`ctx.get('hmr').runExclusive(() => hmr.reconcileProfile())`，不走文件监听、不写配置。
- `restart` 通过 `electron -e <helper>` 启动一个 detached 助手；助手先让 HTTP 响应送达页面，再结束外壳、等待 Host 与端口退出，最后用移除 `ELECTRON_RUN_AS_NODE` 的环境重新启动应用。日志写在 `$DSH_HOME/dsh-hot-reload-control/restart.log`。
- 非桌面环境（例如 `dsh web`）会把「重启应用」标为不可用，避免误杀启动它的终端进程。
- 客户端半区是可直接分发的 CJS bundle：通过 `window.__ModuleLoader__.load` 注册，向 `settings.action` 列表注册 `id: hot-reload-control, order: 10`，因此排在 `open-document`（order 0）右侧。

## 已知限制

- 「重启应用」只支持打包后的桌面安装版；开发检出或 CLI Web 版只能使用「热重载」。
- 重启是进程级重启，会中断进行中的 Agent 回合与后台作业；设置页会在有活动任务时要求确认。
- 热重载依赖 Host 已启用 HMR。DSH 桌面 profile 默认启用；如果 profile 禁用了 HMR，按钮会提示改用「重启应用」。
- 热重载会刷新页面，设置面板会关闭；这是为了让新的客户端 bundle 与模块图一起重新加载。
