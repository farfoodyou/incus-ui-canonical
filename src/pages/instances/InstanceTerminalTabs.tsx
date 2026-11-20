import type { FC } from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { LxdInstance } from "types/instance";
import { ROOT_PATH } from "util/rootPath";
import { useTranslation } from "react-i18next";
import InstanceTerminal from "./InstanceTerminal";

interface Props {
  instance: LxdInstance;
  refreshInstance: () => Promise<unknown>;
}

interface TerminalTab {
  id: string;
  session: string;
  label?: string;
  /** "install" tabs run a fixed command (e.g. installing tmux) instead of tmux */
  kind?: "term" | "install";
  /** attach to the existing tmux session so several clients can share it */
  shared?: boolean;
}

const TMUX_PATHS = ["/usr/local/bin/tmux", "/usr/bin/tmux", "/bin/tmux"];

const INSTALL_TMUX_CMD = [
  "/bin/sh",
  "-lc",
  "set -x; " +
    "if command -v apk >/dev/null 2>&1; then apk add --no-cache tmux; " +
    "elif command -v pkg >/dev/null 2>&1; then env ASSUME_ALWAYS_YES=yes pkg install -y tmux; " +
    "elif command -v apt-get >/dev/null 2>&1; then apt-get update && apt-get install -y tmux; " +
    "elif command -v dnf >/dev/null 2>&1; then dnf install -y tmux; " +
    "elif command -v yum >/dev/null 2>&1; then yum install -y tmux; " +
    "else echo 'No supported package manager found, please install tmux manually'; fi; " +
    "command -v tmux && echo TMUX_INSTALLED_OK; " +
    "echo; echo 'Done. Close this tab and open a new terminal tab.'; exec sh -l",
];

const probeTmux = async (name: string, project: string): Promise<boolean> => {
  for (const p of TMUX_PATHS) {
    try {
      const r = await fetch(
        `${ROOT_PATH}/1.0/instances/${encodeURIComponent(name)}/files?project=${encodeURIComponent(project)}&path=${encodeURIComponent(p)}`,
        { method: "HEAD" },
      );
      if (r.ok) {
        return true;
      }
    } catch {
      /* keep probing */
    }
  }
  return false;
};

const MAX_TABS = 8;

const randomId = () => Math.random().toString(36).slice(2, 8);

const newTab = (): TerminalTab => {
  const id = randomId();
  return { id, session: `incus-${id}` };
};

const storageKey = (project: string, name: string) =>
  `ui-terminal-tabs:${project}/${name}`;

const loadTabs = (project: string, name: string): TerminalTab[] | null => {
  try {
    const raw = localStorage.getItem(storageKey(project, name));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { tabs?: TerminalTab[]; active?: string };
    if (!parsed.tabs || !parsed.tabs.length) {
      return null;
    }
    return parsed.tabs.filter((t) => t && t.id && t.session);
  } catch {
    return null;
  }
};

const killSession = (name: string, project: string, session: string) => {
  void fetch(
    `${ROOT_PATH}/1.0/instances/${encodeURIComponent(name)}/exec?project=${encodeURIComponent(project)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: ["/bin/sh", "-lc", `tmux kill-session -t ${session}`],
        "wait-for-websocket": false,
        interactive: false,
      }),
    },
  );
};

const InstanceTerminalTabs: FC<Props> = ({ instance, refreshInstance }) => {
  const { t: tr } = useTranslation();
  const { name = "", project = "" } = useParams<{
    name: string;
    project: string;
  }>();

  const [tabs, setTabs] = useState<TerminalTab[]>(
    () => loadTabs(project, name) ?? [newTab()],
  );
  const [hasTmux, setHasTmux] = useState<boolean | null>(null);
  const [active, setActive] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(storageKey(project, name));
      const saved = raw ? (JSON.parse(raw) as { active?: string }) : null;
      if (saved?.active && tabs.some((t) => t.id === saved.active)) {
        return saved.active;
      }
    } catch {
      /* ignore */
    }
    return tabs[0]?.id ?? "";
  });

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(project, name),
        JSON.stringify({ tabs, active }),
      );
    } catch {
      /* ignore */
    }
  }, [tabs, active, project, name]);

  useEffect(() => {
    if (!tabs.some((t) => t.id === active)) {
      setActive(tabs[0]?.id ?? "");
    }
  }, [tabs, active]);

  const refreshTmuxProbe = () => {
    probeTmux(name, project).then(setHasTmux).catch(() => setHasTmux(null));
  };

  // re-probe when the tab set changes: after an "install tmux" tab the badge must disappear
  useEffect(() => {
    refreshTmuxProbe();
  }, [name, project, tabs.length]);

  const addTab = () => {
    if (tabs.length >= MAX_TABS) {
      return;
    }
    const t = newTab();
    setTabs([...tabs, t]);
    setActive(t.id);
  };

  const closeTab = (tab: TerminalTab, kill: boolean) => {
    const wasInstall = tab.kind === "install";
    if (kill) {
      killSession(name, project, tab.session);
    }
    if (wasInstall) {
      refreshTmuxProbe();
    }
    const remaining = tabs.filter((t) => t.id !== tab.id);
    if (!remaining.length) {
      const t = newTab();
      setTabs([t]);
      setActive(t.id);
      return;
    }
    setTabs(remaining);
    if (active === tab.id) {
      setActive(remaining[remaining.length - 1].id);
    }
  };

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  const toggleShared = (tab: TerminalTab) => {
    setTabs(tabs.map((t) => (t.id === tab.id ? { ...t, shared: !t.shared } : t)));
  };

  // keyboard shortcuts: alt+t new tab, alt+w detach the active one, alt+1..9 switch.
  // e.code is used instead of e.key so it works with any keyboard layout.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }

      // ignore real form fields, but not xterm's hidden textarea (that is where the
      // keystrokes land while the terminal has focus)
      const target = e.target as HTMLElement | null;
      if (
        target &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) &&
        !target.classList.contains("xterm-helper-textarea")
      ) {
        return;
      }

      if (e.code === "KeyT") {
        e.preventDefault();
        addTab();
      } else if (e.code === "KeyW") {
        e.preventDefault();
        if (activeTab) {
          closeTab(activeTab, false);
        }
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const wanted = tabs[Number(e.code.replace("Digit", "")) - 1];
        if (wanted) {
          e.preventDefault();
          setActive(wanted.id);
        }
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [tabs, activeTab]);

  return (
    <div className="instance-terminal-tabs">
      <div
        className="terminal-tabs-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          marginBottom: "8px",
          flexWrap: "wrap",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActive(t.id);
            }}
            title={tr("terminal.detachHint", { session: t.session })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "4px",
              border: "1px solid " + (t.id === activeTab?.id ? "#06c" : "#ccc"),
              background: t.id === activeTab?.id ? "#06c" : "transparent",
              color: t.id === activeTab?.id ? "#fff" : "inherit",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            <span>
              {t.kind === "install"
                ? tr("terminal.installTab")
                : "#" + (tabs.filter((x) => x.kind !== "install").indexOf(t) + 1)}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t, e.shiftKey);
              }}
              onKeyDown={() => {
                /* keyboard close not bound */
              }}
              style={{
                opacity: 0.75,
                padding: "0 2px",
                cursor: "pointer",
              }}
            >
              ×
            </span>
          </button>
        ))}
        {hasTmux === false && (
          <>
            <span
              style={{
                marginLeft: "8px",
                fontSize: "12px",
                color: "#c96",
              }}
              title={tr("terminal.noTmuxHint")}
            >
              {tr("terminal.noTmuxBadge")}
            </span>
            <button
              type="button"
              onClick={() => {
                const t: TerminalTab = { ...newTab(), kind: "install" };
                setTabs([...tabs, t]);
                setActive(t.id);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: "4px",
                border: "1px solid #06c",
                background: "#06c",
                color: "#fff",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {tr("terminal.installTmux")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={addTab}
          disabled={tabs.length >= MAX_TABS}
          title={tr("terminal.newTab")}
          style={{
            padding: "4px 10px",
            borderRadius: "4px",
            border: "1px dashed #ccc",
            background: "transparent",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          +
        </button>
        {activeTab && activeTab.kind !== "install" && (
          <button
            type="button"
            onClick={() => {
              toggleShared(activeTab);
            }}
            title={tr("terminal.shareHint")}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              border: "1px solid " + (activeTab.shared ? "#06c" : "#ccc"),
              background: activeTab.shared ? "#06c" : "transparent",
              color: activeTab.shared ? "#fff" : "inherit",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {tr("terminal.share")} {activeTab.shared ? "on" : "off"}
          </button>
        )}
        <span
          style={{ marginLeft: "auto", opacity: 0.6, fontSize: "12px" }}
          title={tr("terminal.sessionsHint")}
        >
          {tr("terminal.sessionsBadge")}
        </span>
      </div>

      {activeTab && (
        <InstanceTerminal
          key={activeTab.id + (activeTab.shared ? ":shared" : "")}
          instance={instance}
          refreshInstance={refreshInstance}
          session={activeTab.kind === "install" ? undefined : activeTab.session}
          shared={activeTab.shared}
          command={activeTab.kind === "install" ? INSTALL_TMUX_CMD : undefined}
        />
      )}
    </div>
  );
};

export default InstanceTerminalTabs;
