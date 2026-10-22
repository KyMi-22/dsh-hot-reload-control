<p align="center">
  <img src="./icon.svg" width="96" height="96" alt="DSH 热重载 / 重启">
</p>

<h1 align="center">热重载 / 重启</h1>

<p align="center"><code>dsh-hot-reload-control</code> · 用于 DeepSeek Harness 桌面版</p>

在设置页「打开配置文件」旁边加一个下拉按钮。默认是 **热重载**，点右侧箭头可以 **重启应用**。

```
设置                                        打开配置文件  [⟳ 热重载 | ⌄]
```

## 功能

- **热重载**：重新加载当前 profile 的插件树，然后刷新页面。新装的插件、改过的配置、更新过的客户端代码都会生效，不用退出 DSH。不会写配置。
- **重启应用**：完整重启桌面端。适合热重载覆盖不到的情况。会中断正在运行的任务，有任务时会先确认。
- 重启日志：`%USERPROFILE%\.dsh\dsh-hot-reload-control\restart.log`

要求 DSH 0.2.x。热重载需要 Host 启用 HMR，桌面版默认开启。

## 安装

### 从 GitHub 安装（推荐）

1. 打开 DSH 侧边栏的 **插件**。
2. 点右上角 **添加插件**。
3. 填入仓库地址：

   ```
   https://github.com/KyMi-22/dsh-hot-reload-control
   ```

4. 点 **安装**，等待完成。
5. 在「已安装插件」里找到 **热重载 / 重启 (dsh-hot-reload-control)**，把右侧开关打开。卡片上如果显示「立即启用」，直接点它。
6. 打开设置，按钮应该在「打开配置文件」右边。没出现就刷新一次页面。

> 只在本机使用、不想走网络的话，用下面的本地目录方式更省事。

### 从本地目录安装

适合开发，或者不想处理仓库权限：

1. 插件页 → **添加插件**。
2. 填入本地目录：

   ```
   C:\path\to\dsh-hot-reload-control
   ```

3. 安装后回到「已安装插件」，打开右侧开关。

如果本机有 `dsh` CLI，也可以：

```powershell
dsh plugin --profile desktop add link:C:\path\to\dsh-hot-reload-control
```

然后在插件页把它的开关打开。

> 插件页只列出 profile 里登记的 bundle。只把文件夹放进 `node_modules` 不会出现在这里。

### 命令行安装 GitHub 版本

```powershell
dsh plugin --profile desktop add https://github.com/KyMi-22/dsh-hot-reload-control
```

装完后到插件页把它的开关打开。

## 使用

**热重载**

1. 装好或改好插件。
2. 打开设置，点「热重载」。
3. 页面会自动刷新，设置面板会关闭，这是正常的。

**重启应用**

1. 点右侧箭头，选「重启应用」。
2. 有正在运行的 Agent 或后台任务时，会先弹确认框。
3. DSH 关闭后会自动重新打开。

## 常见问题

**安装一直超时，换安装源也没用**

需要代理才能访问 GitHub 的网络环境里，这是最常见的原因：**`git` 和 `pnpm` 默认都不读系统代理**（系统代理只对浏览器生效）。

安装界面里的「安装源」只改 npm registry；而 GitHub 仓库形式最后要连 github.com，那一步走的是 `git`——所以换源不会好。

先确认代理端口（Windows：设置 → 网络和 Internet → 代理），然后：

```powershell
# git 走代理——GitHub 仓库安装要用它
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# npm/pnpm 走代理——拉 npm 包要用它
npm config set proxy http://127.0.0.1:7890
npm config set https-proxy http://127.0.0.1:7890
```

把 `7890` 换成你自己的端口。配完回 DSH 界面重试，不用重启。

不用代理时还原：

```powershell
git config --global --unset http.proxy
git config --global --unset https.proxy
npm config delete proxy
npm config delete https-proxy
```

**设置里没有按钮**

先到插件页确认「热重载 / 重启」右侧的开关是打开的，然后刷新页面。

**插件页看不到这个插件**

用插件页安装，不要只把文件夹放进 `node_modules`。已经装过但列表是旧的，点插件页右上角刷新。

**「重启应用」提示不可用**

只有打包的桌面版支持完整重启。`dsh web` 或开发检出只能用热重载。

**热重载后没变化**

用「重启应用」完整重启一次，或者确认插件确实已启用。

## 卸载

插件页 →「已安装插件」→ 卸载。

如果之前用 CLI 安装：

```powershell
dsh plugin --profile desktop remove dsh-hot-reload-control
```

## 开发

```powershell
npm run check
npm test
```

`lib/client.js` 是可直接加载的客户端 bundle，不需要构建。测试说明见 [test/README.md](test/README.md)，浏览器端到端脚本见 [test/e2e](test/e2e/README.md)。

## 许可

MIT
