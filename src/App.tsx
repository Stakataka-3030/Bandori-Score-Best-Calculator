import { useEffect, useState } from "react";
import {
  loadCurrentGameData,
  syncBestdoriMasters,
  syncBestdoriMastersIfStale,
  type GameDataGeneration,
} from "@/data";
import { importProfileFile, type ImportedProfile } from "@/lib/profile-import";

type SyncState = "starting" | "ready" | "syncing" | "error";

export default function App() {
  const [profile, setProfile] = useState<ImportedProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [gameData, setGameData] = useState<GameDataGeneration | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("starting");
  const [syncMessage, setSyncMessage] = useState("正在读取本地游戏数据…");

  useEffect(() => {
    let cancelled = false;

    async function bootstrapGameData() {
      const cached = await loadCurrentGameData().catch(() => null);
      if (cancelled) return;

      if (cached) {
        setGameData(cached);
        setSyncState("ready");
        setSyncMessage(`本地数据 ${cached.manifest.generation.slice(0, 12)}，正在后台检查更新…`);
        const result = await syncBestdoriMastersIfStale();
        if (cancelled || result === null) return;
        if (result.ok) {
          const current = await loadCurrentGameData();
          if (cancelled) return;
          setGameData(current);
          setSyncState("ready");
          setSyncMessage(result.updated ? "Bestdori 游戏数据已自动更新" : "游戏数据已是最新");
        } else {
          setSyncState("ready");
          setSyncMessage(`更新检查失败，继续使用本地数据：${result.error ?? "未知错误"}`);
        }
        return;
      }

      setSyncState("syncing");
      setSyncMessage("首次启动：正在从 Bestdori 获取游戏数据…");
      const result = await syncBestdoriMasters();
      if (cancelled) return;
      const current = await loadCurrentGameData();
      if (cancelled) return;
      setGameData(current);
      if (result.ok && current) {
        setSyncState("ready");
        setSyncMessage("游戏数据初始化完成");
      } else {
        setSyncState("error");
        setSyncMessage(`暂无可用游戏数据：${result.error ?? "同步失败"}`);
      }
    }

    void bootstrapGameData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshGameData() {
    setSyncState("syncing");
    setSyncMessage("正在检查 Bestdori 更新…");
    const result = await syncBestdoriMasters();
    const current = await loadCurrentGameData();
    setGameData(current);
    if (result.ok) {
      setSyncState("ready");
      setSyncMessage(result.updated ? "Bestdori 游戏数据已更新" : "游戏数据已是最新");
    } else if (current) {
      setSyncState("ready");
      setSyncMessage(`更新失败，继续使用本地数据：${result.error ?? "未知错误"}`);
    } else {
      setSyncState("error");
      setSyncMessage(`暂无可用游戏数据：${result.error ?? "同步失败"}`);
    }
  }

  async function importProfile(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      setProfile(importProfileFile(parsed));
      setProfileError("");
    } catch (cause) {
      setProfile(null);
      setProfileError(cause instanceof Error ? cause.message : "无法读取档案");
    }
  }

  return (
    <main className="shell">
      <header>
        <p className="eyebrow">Tauri desktop baseline</p>
        <h1>Bandori Score Best Calculator</h1>
        <p>用户档案只从本地 Bestdori / HHWX 导出文件读取；游戏 Master 与谱面由客户端直接同步 Bestdori，不按 UID 查询账号，也不连接 HHWX user-fetcher。</p>
      </header>

      <section className="panel data-panel">
        <div>
          <strong>游戏数据</strong>
          <p className={`sync-status sync-status-${syncState}`}>{syncMessage}</p>
          {gameData && (
            <div className="data-summary">
              <span>Generation：{gameData.manifest.generation.slice(0, 16)}</span>
              <span>更新时间：{new Date(gameData.manifest.fetchedAt).toLocaleString()}</span>
              <span>卡牌 Master：{gameData.manifest.datasets.cards.recordCount}</span>
              <span>活动 Master：{gameData.manifest.datasets.events.recordCount}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={syncState === "syncing"}
          onClick={() => void refreshGameData()}
        >
          {syncState === "syncing" ? "同步中…" : "检查更新"}
        </button>
      </section>

      <section className="panel">
        <label className="file-button">
          导入档案 JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importProfile(file);
            }}
          />
        </label>

        {profile && (
          <div className="result">
            <strong>{profile.profile.name}</strong>
            <span>服务器索引：{profile.profile.server}</span>
            <span>卡牌数量：{profile.profile.cards.length}</span>
            <span>HHWX 精确扩展：{profile.hasHhwxExtension ? "已读取" : "无"}</span>
          </div>
        )}
        {profileError && <p className="error">{profileError}</p>}
      </section>
    </main>
  );
}
