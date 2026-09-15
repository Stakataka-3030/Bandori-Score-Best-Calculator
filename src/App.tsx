import { useState } from "react";
import { decodeBestdoriProfile, type NormalizedBestdoriProfile } from "@/lib/bestdori-profile-codec";

export default function App() {
  const [profile, setProfile] = useState<NormalizedBestdoriProfile | null>(null);
  const [error, setError] = useState("");

  async function importProfile(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      setProfile(decodeBestdoriProfile(parsed));
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
        <p>纯本地读取 Bestdori / HHWX 导出档案。当前阶段只建立可移植基线，尚未修改 HHWX 计分规则。</p>
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
            <strong>{profile.name}</strong>
            <span>服务器索引：{profile.server}</span>
            <span>卡牌数量：{profile.cards.length}</span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
