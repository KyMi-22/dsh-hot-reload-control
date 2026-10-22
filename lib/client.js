// dsh-hot-reload-control — browser half (client plugin bundle).
//
// Loaded by dsh-client-modules at /plugins/dsh-hot-reload-control/client.js and
// executed through the vendored cordis Loader's lazy-CJS module table
// (window.__ModuleLoader__.load). The factory body is plain CJS with require()
// resolved against the shell's platform module table. Only platform seed names
// and registered client bundles may be required.
//
// The bundle registers one split dropdown into Settings' `settings.action`
// list, ordered right after the shipped "Open configuration file" action. The
// visible half always reads 热重载; the caret opens the second action.
//
// This file is the shipped artifact: no build step, no JSX syntax. JSX is
// expressed through `react/jsx-runtime` calls, the same shape the shipped
// ui-* packages emit.
window.__ModuleLoader__.load({
  id: "dsh-hot-reload-control",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    /** Resolve a platform seed without ever throwing out of the factory. */
    const seedProbe = { lastError: null };
    const requireSeed = (name) => {
      try {
        return require(name);
      } catch (error) {
        seedProbe.lastError = error;
        return null;
      }
    };
    const jsxRuntime = requireSeed("react/jsx-runtime");
    const react = requireSeed("react");
    if (jsxRuntime === null || react === null) {
      try {
        console.warn(
          "[dsh-hot-reload-control] required platform modules unavailable — plugin disabled for this session:",
          seedProbe.lastError && seedProbe.lastError.message,
        );
      } catch {}
      exports.apply = () => {};
      exports.inject = [];
      return module.exports;
    }

    const jsx = jsxRuntime.jsx;
    const jsxs = jsxRuntime.jsxs;
    const { useEffect, useRef, useState } = react;

    /** Dictionary namespace owned by this plugin. */
    const NS = "hot-reload-control";

    /** Same-origin Host route, resolved against either the Web or Desktop origin. */
    const API_PATH = new URL("dsh-hot-reload-control/api", document.baseURI || "http://localhost/").pathname;

    /** Survives the post-reload page so a partial hot reload can still explain itself. */
    const NOTICE_KEY = "dsh-hot-reload-control:notice";

    // ── dictionaries ────────────────────────────────────────────────────────
    const zh = {
      "action.reload": "热重载",
      "action.reloading": "热重载中…",
      "action.restarting": "重启中…",
      "action.reloadHint": "重新组合插件树并刷新页面",
      "action.more": "更多操作",
      "menu.label": "热重载与重启",
      "menu.reload": "热重载",
      "menu.reload.desc": "重新组合插件树并刷新页面，不写入任何配置",
      "menu.restart": "重启应用",
      "menu.restart.desc": "关闭并重新启动 DSH，会中断运行中的任务",
      "menu.default": "默认",
      "confirm.title": "重启 DSH？",
      "confirm.body": "将关闭当前窗口并重新启动应用。",
      "confirm.active": "检测到正在运行的任务：{agents} 个 Agent，{jobs} 个后台作业。重启会中断它们。",
      "confirm.activeGeneric": "检测到正在运行的任务或后台作业。重启会中断它们。",
      "confirm.unknown": "无法确认当前任务状态；重启可能中断正在运行的任务。",
      "confirm.cancel": "取消",
      "confirm.confirm": "确认重启",
      "status.reloaded": "已热重载，正在刷新页面…",
      "status.reloadedRestart": "配置已应用，但部分模块需要重启才能生效。正在刷新页面…",
      "status.reloadedWarnings": "已热重载，有 {count} 条诊断；正在刷新页面…",
      "status.restarting": "正在重启应用…",
      "status.restartScheduled": "重启已安排，应用会自动重新打开。",
      "error.generic": "操作失败：{message}",
      "error.hmrUnavailable": "当前 Host 没有启用 HMR，无法热重载；请使用「重启应用」。",
      "error.restartUnavailable": "当前运行环境不支持一键重启（仅桌面安装版可用）。",
      "notice.close": "关闭提示",
      "aria.reload": "热重载插件树并刷新页面",
      "aria.more": "更多操作",
    };

    const en = {
      "action.reload": "Hot reload",
      "action.reloading": "Reloading…",
      "action.restarting": "Restarting…",
      "action.reloadHint": "Recompose the plugin tree and refresh the page",
      "action.more": "More actions",
      "menu.label": "Hot reload and restart",
      "menu.reload": "Hot reload",
      "menu.reload.desc": "Recompose the plugin tree and refresh the page without writing configuration",
      "menu.restart": "Restart app",
      "menu.restart.desc": "Close and relaunch DSH; running tasks are interrupted",
      "menu.default": "Default",
      "confirm.title": "Restart DSH?",
      "confirm.body": "The current window will close and the application will start again.",
      "confirm.active": "Running work detected: {agents} agent(s), {jobs} background job(s). Restarting interrupts them.",
      "confirm.activeGeneric": "Running work or background jobs were detected. Restarting interrupts them.",
      "confirm.unknown": "Current task state is unavailable; restarting may interrupt running work.",
      "confirm.cancel": "Cancel",
      "confirm.confirm": "Restart",
      "status.reloaded": "Hot reload complete. Refreshing the page…",
      "status.reloadedRestart": "Configuration applied, but some modules need a restart. Refreshing the page…",
      "status.reloadedWarnings": "Hot reload complete with {count} diagnostic(s). Refreshing the page…",
      "status.restarting": "Restarting the application…",
      "status.restartScheduled": "Restart scheduled; the application will reopen automatically.",
      "error.generic": "Action failed: {message}",
      "error.hmrUnavailable": "This Host has no HMR service, so it cannot hot reload; use Restart app.",
      "error.restartUnavailable": "One-click restart is unavailable in this runtime (desktop install only).",
      "notice.close": "Close message",
      "aria.reload": "Hot reload plugins and refresh the page",
      "aria.more": "More actions",
    };

    const fallbackDictionary = () => {
      try {
        return String(navigator.language).toLowerCase().startsWith("zh") ? zh : en;
      } catch {
        return zh;
      }
    };

    /** Translate through the slot's `t`, falling back to a bundled dictionary. */
    function translate(t, key, params) {
      if (typeof t === "function") {
        try {
          return t(key, params);
        } catch {}
      }
      const template = fallbackDictionary()[key] ?? zh[key] ?? key;
      if (params === undefined) return template;
      return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
    }

    // ── Host RPC ────────────────────────────────────────────────────────────
    async function rpc(method) {
      let response;
      try {
        response = await fetch(API_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method }),
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok || body === null || body.ok !== true) {
        const message = body?.error?.message ?? `HTTP ${response.status}`;
        const wrapped = new Error(message);
        if (typeof body?.error?.code === "string") wrapped.code = body.error.code;
        throw wrapped;
      }
      return body.value;
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error);
    }

    // ── styles ──────────────────────────────────────────────────────────────
    const CSS_ID = "dsh-hot-reload-control/action.css";
    const CSS = `
.dsh-hrc-root{position:relative;display:inline-flex;align-items:stretch;height:28px;flex:none;vertical-align:middle}
.dsh-hrc-split{display:inline-flex;align-items:stretch;height:28px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,color-mix(in srgb,currentColor 18%,transparent));border-radius:var(--dsw-radius-sm,6px);overflow:hidden;background:transparent;color:var(--dsw-alias-label-primary,currentColor);font-family:inherit;font-size:12px;line-height:18px}
.dsh-hrc-main,.dsh-hrc-caret{box-sizing:border-box;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0}
.dsh-hrc-main{padding:0 9px 0 8px;gap:6px;white-space:nowrap}
.dsh-hrc-main svg,.dsh-hrc-caret svg{flex:none;display:block}
.dsh-hrc-caret{width:24px;border-left:1px solid var(--dsw-alias-border-l2,color-mix(in srgb,currentColor 18%,transparent))}
.dsh-hrc-main:hover:not(:disabled),.dsh-hrc-caret:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent))}
.dsh-hrc-main:disabled,.dsh-hrc-caret:disabled{opacity:.55;cursor:default}
.dsh-hrc-main:focus-visible,.dsh-hrc-caret:focus-visible{outline:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color,#4d6bfe);outline-offset:-2px}
.dsh-hrc-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:90;width:264px;box-sizing:border-box;padding:4px;border:1px solid var(--dsw-alias-border-l2,color-mix(in srgb,currentColor 18%,transparent));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary,currentColor)}
.dsh-hrc-item{display:flex;flex-direction:column;gap:2px;width:100%;box-sizing:border-box;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:inherit;text-align:left;padding:7px 9px;cursor:pointer;font:inherit}
.dsh-hrc-item:hover,.dsh-hrc-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent));outline:none}
.dsh-hrc-item[data-danger="true"]:hover,.dsh-hrc-item[data-danger="true"]:focus-visible{background:color-mix(in srgb,#e5484d 12%,transparent)}
.dsh-hrc-item-title{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:500;line-height:18px}
.dsh-hrc-item-desc{font-size:11px;line-height:15px;opacity:.62;white-space:normal}
.dsh-hrc-badge{margin-left:auto;padding:0 5px;border-radius:999px;background:color-mix(in srgb,currentColor 10%,transparent);font-size:10px;font-weight:500;line-height:15px;opacity:.72}
.dsh-hrc-notice{position:absolute;top:calc(100% + 6px);right:0;z-index:85;width:292px;box-sizing:border-box;display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,color-mix(in srgb,currentColor 18%,transparent));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary,currentColor);font-size:12px;line-height:17px}
.dsh-hrc-notice[data-kind="error"]{border-color:color-mix(in srgb,#e5484d 45%,transparent);background:color-mix(in srgb,#e5484d 9%,var(--dsw-alias-bg-layer-2,#fff))}
.dsh-hrc-notice[data-kind="warn"]{border-color:color-mix(in srgb,#f5a524 45%,transparent);background:color-mix(in srgb,#f5a524 10%,var(--dsw-alias-bg-layer-2,#fff))}
.dsh-hrc-notice-text{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word}
.dsh-hrc-notice-close{flex:none;border:0;background:transparent;color:inherit;cursor:pointer;opacity:.55;font:inherit;line-height:17px;padding:0 2px}
.dsh-hrc-notice-close:hover{opacity:.9}
.dsh-hrc-modal{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.dsh-hrc-mask{position:absolute;inset:0;background:rgba(0,0,0,.38)}
.dsh-hrc-dialog{position:relative;z-index:1;width:min(390px,calc(100vw - 48px));box-sizing:border-box;padding:18px;border-radius:12px;background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:var(--dsw-elevation-prominent,0 12px 40px rgba(0,0,0,.24));color:var(--dsw-alias-label-primary,currentColor);font-family:inherit}
.dsh-hrc-dialog-title{margin:0 0 8px;font-size:15px;font-weight:600;line-height:22px}
.dsh-hrc-dialog-body{margin:0 0 8px;font-size:13px;line-height:20px;opacity:.78}
.dsh-hrc-dialog-warn{margin:0 0 16px;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,#f5a524 14%,transparent);font-size:12px;line-height:18px}
.dsh-hrc-dialog-actions{display:flex;justify-content:flex-end;gap:8px}
.dsh-hrc-btn{box-sizing:border-box;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,color-mix(in srgb,currentColor 18%,transparent));border-radius:var(--dsw-radius-sm,6px);background:transparent;color:inherit;font:inherit;font-size:12.5px;cursor:pointer}
.dsh-hrc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent))}
.dsh-hrc-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color,#4d6bfe);outline-offset:1px}
.dsh-hrc-btn-danger{border-color:color-mix(in srgb,#e5484d 55%,transparent);background:color-mix(in srgb,#e5484d 13%,transparent)}
.dsh-hrc-btn-danger:hover{background:color-mix(in srgb,#e5484d 20%,transparent)}
`;

    function ensureStyle() {
      if (typeof document === "undefined") return;
      const existing = document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_ID)}]`);
      if (existing !== null) {
        if (existing.textContent !== CSS) existing.textContent = CSS;
        return;
      }
      const style = document.createElement("style");
      style.dataset.plugin = "dsh-hot-reload-control";
      style.dataset.pluginCss = CSS_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // ── icons ───────────────────────────────────────────────────────────────
    function reloadIcon() {
      return jsxs("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 16 16",
        fill: "none",
        "aria-hidden": "true",
        children: [
          jsx("path", {
            d: "M13.2 6.6A5.4 5.4 0 1 0 13.4 9.4",
            stroke: "currentColor",
            strokeWidth: 1.4,
            strokeLinecap: "round",
          }),
          jsx("path", {
            d: "M13.4 2.9v3.8H9.6",
            stroke: "currentColor",
            strokeWidth: 1.4,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }),
        ],
      });
    }

    function restartIcon() {
      return jsxs("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 16 16",
        fill: "none",
        "aria-hidden": "true",
        children: [
          jsx("path", {
            d: "M12.6 5.2A5.4 5.4 0 1 0 13.4 9",
            stroke: "currentColor",
            strokeWidth: 1.4,
            strokeLinecap: "round",
          }),
          jsx("path", {
            d: "M13.4 2.4v3.9H9.5",
            stroke: "currentColor",
            strokeWidth: 1.4,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }),
        ],
      });
    }

    function chevronIcon() {
      return jsx("svg", {
        width: 12,
        height: 12,
        viewBox: "0 0 16 16",
        fill: "none",
        "aria-hidden": "true",
        children: jsx("path", {
          d: "M4.2 6.2 8 10l3.8-3.8",
          stroke: "currentColor",
          strokeWidth: 1.4,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      });
    }

    // ── confirmation dialog ─────────────────────────────────────────────────
    function ConfirmDialog(props) {
      const { activity, unknown, onCancel, onConfirm, text } = props;
      const agents = activity?.activeAgents ?? 0;
      const jobs = activity?.activeJobs ?? 0;
      let detail = text("confirm.unknown");
      if (!unknown) {
        if (agents > 0 || jobs > 0) detail = text("confirm.active", { agents, jobs });
        else if (activity?.active === true) detail = text("confirm.activeGeneric");
        else detail = text("confirm.body");
      }
      return jsxs("div", {
        className: "dsh-hrc-modal",
        role: "presentation",
        children: [
          jsx("div", {
            className: "dsh-hrc-mask",
            "aria-hidden": "true",
            onClick: onCancel,
          }),
          jsxs("div", {
            className: "dsh-hrc-dialog",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": "dsh-hrc-confirm-title",
            children: [
              jsx("h2", {
                id: "dsh-hrc-confirm-title",
                className: "dsh-hrc-dialog-title",
                children: text("confirm.title"),
              }),
              jsx("p", {
                className: "dsh-hrc-dialog-body",
                children: text("confirm.body"),
              }),
              jsx("p", {
                className: "dsh-hrc-dialog-warn",
                children: detail,
              }),
              jsxs("div", {
                className: "dsh-hrc-dialog-actions",
                children: [
                  jsx("button", {
                    key: "cancel",
                    type: "button",
                    className: "dsh-hrc-btn",
                    autoFocus: true,
                    onClick: onCancel,
                    children: text("confirm.cancel"),
                  }),
                  jsx("button", {
                    key: "confirm",
                    type: "button",
                    className: "dsh-hrc-btn dsh-hrc-btn-danger",
                    onClick: onConfirm,
                    children: text("confirm.confirm"),
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    }

    // ── settings action ─────────────────────────────────────────────────────
    function Action({ t }) {
      const text = (key, params) => translate(t, key, params);
      const [menuOpen, setMenuOpen] = useState(false);
      const [phase, setPhase] = useState("idle");
      const [notice, setNotice] = useState(null);
      const [confirm, setConfirm] = useState(null);
      const rootRef = useRef(null);
      const menuRef = useRef(null);

      useEffect(() => {
        try {
          const raw = window.sessionStorage.getItem(NOTICE_KEY);
          if (raw === null) return;
          window.sessionStorage.removeItem(NOTICE_KEY);
          const stored = JSON.parse(raw);
          if (stored !== null && typeof stored.message === "string") {
            setNotice({ kind: stored.kind === "warn" ? "warn" : "info", message: stored.message });
          }
        } catch {}
      }, []);

      useEffect(() => {
        if (notice === null) return;
        const timer = window.setTimeout(() => setNotice(null), 12000);
        return () => window.clearTimeout(timer);
      }, [notice]);

      useEffect(() => {
        if (!menuOpen) return;
        const onPointerDown = (event) => {
          if (rootRef.current !== null && !rootRef.current.contains(event.target)) setMenuOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
      }, [menuOpen]);

      useEffect(() => {
        if (!menuOpen && confirm === null) return;
        const onKeyDown = (event) => {
          if (event.key !== "Escape") return;
          if (confirm !== null) setConfirm(null);
          else setMenuOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, [menuOpen, confirm]);

      useEffect(() => {
        if (!menuOpen || menuRef.current === null) return;
        const first = menuRef.current.querySelector('[role="menuitem"]');
        if (first instanceof HTMLElement) first.focus();
      }, [menuOpen]);

      async function runReload() {
        if (phase !== "idle") return;
        setMenuOpen(false);
        setNotice(null);
        setPhase("reloading");
        try {
          const value = await rpc("reload");
          const pending = Array.isArray(value?.pending) ? value.pending.length : 0;
          const warnings = Array.isArray(value?.warnings) ? value.warnings.length : 0;
          let message = text("status.reloaded");
          let kind = "info";
          if (typeof value?.restartReason === "string" && value.restartReason !== "") {
            message = text("status.reloadedRestart");
            kind = "warn";
          } else if (pending + warnings > 0) {
            message = text("status.reloadedWarnings", { count: pending + warnings });
            kind = "warn";
          }
          setNotice({ kind, message });
          if (kind === "warn") {
            try {
              window.sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ kind, message }));
            } catch {}
          }
          window.setTimeout(() => {
            try {
              window.location.reload();
            } catch {}
          }, 450);
          window.setTimeout(() => setPhase("idle"), 6000);
        } catch (error) {
          setPhase("idle");
          const message = error?.code === "hmr-unavailable"
            ? text("error.hmrUnavailable")
            : text("error.generic", { message: messageOf(error) });
          setNotice({ kind: "error", message });
        }
      }

      async function runRestart() {
        setConfirm(null);
        setPhase("restarting");
        setNotice({ kind: "info", message: text("status.restarting") });
        try {
          await rpc("restart");
          setNotice({ kind: "info", message: text("status.restartScheduled") });
        } catch (error) {
          setPhase("idle");
          const message = error?.code === "restart-unavailable"
            ? text("error.restartUnavailable")
            : text("error.generic", { message: messageOf(error) });
          setNotice({ kind: "error", message });
        }
      }

      async function requestRestart() {
        if (phase !== "idle") return;
        setMenuOpen(false);
        setNotice(null);
        let status = null;
        try {
          status = await rpc("status");
        } catch {
          setConfirm({ activity: null, unknown: true });
          return;
        }
        if (status?.restart?.available === false) {
          setNotice({ kind: "error", message: text("error.restartUnavailable") });
          return;
        }
        if (status?.activity?.active === true) {
          setConfirm({ activity: status.activity, unknown: false });
          return;
        }
        await runRestart();
      }

      function openMenu() {
        if (phase !== "idle") return;
        setNotice(null);
        setMenuOpen((open) => !open);
      }

      function onMenuKeyDown(event) {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        if (menuRef.current === null) return;
        const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'));
        if (items.length === 0) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement);
        let next = 0;
        if (event.key === "End") next = items.length - 1;
        else if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
        else if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
        items[next].focus();
      }

      const busy = phase !== "idle";
      const label = phase === "reloading"
        ? text("action.reloading")
        : phase === "restarting"
          ? text("action.restarting")
          : text("action.reload");

      const items = [
        jsxs("button", {
          key: "reload",
          type: "button",
          role: "menuitem",
          tabIndex: -1,
          className: "dsh-hrc-item",
          onClick: () => { void runReload(); },
          children: [
            jsxs("span", {
              className: "dsh-hrc-item-title",
              children: [
                reloadIcon(),
                jsx("span", { children: text("menu.reload") }),
                jsx("span", { className: "dsh-hrc-badge", children: text("menu.default") }),
              ],
            }),
            jsx("span", { className: "dsh-hrc-item-desc", children: text("menu.reload.desc") }),
          ],
        }),
        jsxs("button", {
          key: "restart",
          type: "button",
          role: "menuitem",
          tabIndex: -1,
          className: "dsh-hrc-item",
          "data-danger": "true",
          onClick: () => { void requestRestart(); },
          children: [
            jsxs("span", {
              className: "dsh-hrc-item-title",
              children: [restartIcon(), jsx("span", { children: text("menu.restart") })],
            }),
            jsx("span", { className: "dsh-hrc-item-desc", children: text("menu.restart.desc") }),
          ],
        }),
      ];

      return jsxs("div", {
        className: "dsh-hrc-root",
        ref: rootRef,
        children: [
          jsxs("div", {
            className: "dsh-hrc-split",
            children: [
              jsxs("button", {
                type: "button",
                className: "dsh-hrc-main",
                disabled: busy,
                title: text("action.reloadHint"),
                "aria-label": text("aria.reload"),
                onClick: () => { void runReload(); },
                children: [reloadIcon(), jsx("span", { children: label })],
              }),
              jsx("button", {
                type: "button",
                className: "dsh-hrc-caret",
                disabled: busy,
                "aria-haspopup": "menu",
                "aria-expanded": menuOpen,
                "aria-controls": "dsh-hrc-menu",
                "aria-label": text("aria.more"),
                title: text("action.more"),
                onClick: openMenu,
                children: chevronIcon(),
              }),
            ],
          }),
          menuOpen
            ? jsx("div", {
              className: "dsh-hrc-menu",
              id: "dsh-hrc-menu",
              role: "menu",
              "aria-label": text("menu.label"),
              ref: menuRef,
              onKeyDown: onMenuKeyDown,
              children: items,
            })
            : null,
          notice !== null
            ? jsxs("div", {
              className: "dsh-hrc-notice",
              "data-kind": notice.kind,
              role: notice.kind === "error" ? "alert" : "status",
              children: [
                jsx("span", { className: "dsh-hrc-notice-text", children: notice.message }),
                jsx("button", {
                  type: "button",
                  className: "dsh-hrc-notice-close",
                  "aria-label": text("notice.close"),
                  onClick: () => setNotice(null),
                  children: "×",
                }),
              ],
            })
            : null,
          confirm !== null
            ? jsx(ConfirmDialog, {
              activity: confirm.activity,
              unknown: confirm.unknown,
              onCancel: () => setConfirm(null),
              onConfirm: () => { void runRestart(); },
              text,
            })
            : null,
        ],
      });
    }

    // ── plugin face ─────────────────────────────────────────────────────────
    const inject = ["slots", "locale"];

    function apply(ctx) {
      ensureStyle();
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-hot-reload-control: dictionaries");
      ctx.slots.inject("settings.action", () => ctx.slots.register({
        name: "settings.action",
        id: "hot-reload-control",
        order: 10,
        locale: NS,
      }, Action));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
