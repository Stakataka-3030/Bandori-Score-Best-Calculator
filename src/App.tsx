import { useState } from "react";
import { importProfileFile, type ImportedProfile } from "@/lib/profile-import";

export default function App() {
  const [profile, setProfile] = useState<ImportedProfile | null>(null);
  const [error, setError] = useState("");

  async function importProfile(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      setProfile(importProfileFile(parsed));
      setError("");
    } catch (cause) {
      setProfile(null);
      setError(cause instanceof Error ? cause.message : "无法读取档案");
    }
  }

  return (
    <main className="shell">
      <header>
        <p className="eyebrow">Portable baseline</p>
        <h1>Bandori Score Best Calculator</h1>
        <p>纯本地读取 Bestdori / HHWX 导出档案。不会按 UID 查询游戏账号，也不会连接 HHWX user-fetcher。</p>
      </header>

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
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
