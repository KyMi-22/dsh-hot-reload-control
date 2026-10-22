# 测试

这些测试不依赖正在运行的 DSH，也不需要网络；在插件根目录执行：

```powershell
npm test
```

| 文件 | 覆盖内容 |
|---|---|
| `test-host.mjs` | 用假 `ctx` 挂载宿主路由，验证 `status` / `reload` / 未知方法 / 非桌面重启拒绝 |
| `test-client.mjs` | 在 `vm` 中执行客户端 bundle，验证 `settings.action` 注册、order、locale 与中英文字典键一致 |
| `test-render.mjs` | 用最小 React 桩渲染默认态、下拉菜单态和重启确认态 |
| `test-helper.mjs` | 起一个模拟 shell/host 进程树，验证分离助手终止目标、等待端口、重新拉起并写日志 |
| `test-desktop-detect.mjs` | 验证打包桌面环境的识别（需要环境变量与一个 `app.asar` 路径参数） |

真实浏览器脚本在 [`e2e/`](e2e/README.md)，需要另起一个隔离的 `dsh web` 实例，不包含在 `npm test` 中。

`test-desktop-detect.mjs` 的示例：

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
$env:DSH_CLIENT_VERSION = "0.2.1-rc.2"
node test/test-desktop-detect.mjs "D:\DeepSeek Harness\resources\app.asar\dsh"
```

UI 端到端验证（需要另起一个隔离的 `dsh web` 实例）不包含在 `npm test` 中；测试原则见插件根目录的 README。
