import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function replaceOnce(path, before, after) {
  const content = read(path);
  if (content.includes(after)) return false;
  if (!content.includes(before)) {
    throw new Error(`Patch anchor not found in ${path}: ${before.slice(0, 120)}`);
  }
  write(path, content.replace(before, after));
  return true;
}

let changed = false;

{
  const path = "package.json";
  const json = JSON.parse(read(path));
  json.dependencies ??= {};
  if (!json.dependencies["@tauri-apps/plugin-clipboard-manager"]) {
    json.dependencies["@tauri-apps/plugin-clipboard-manager"] = "^2";
    write(path, `${JSON.stringify(json, null, 2)}\n`);
    changed = true;
  }
}

changed = replaceOnce(
  "src-tauri/Cargo.toml",
  'tauri-plugin-http = "2"\n',
  'tauri-plugin-http = "2"\ntauri-plugin-clipboard-manager = "2"\n',
) || changed;

{
  const path = "src-tauri/capabilities/default.json";
  const json = JSON.parse(read(path));
  if (!json.permissions.includes("clipboard-manager:allow-read-text")) {
    json.permissions.push("clipboard-manager:allow-read-text");
    write(path, `${JSON.stringify(json, null, 2)}\n`);
    changed = true;
  }
}

changed = replaceOnce(
  "src-tauri/src/lib.rs",
  '        .plugin(tauri_plugin_http::init())\n',
  '        .plugin(tauri_plugin_http::init())\n        .plugin(tauri_plugin_clipboard_manager::init())\n',
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  'import { useEffect, useMemo, useRef, useState } from "react";\n',
  'import { useEffect, useMemo, useRef, useState } from "react";\nimport { readText } from "@tauri-apps/plugin-clipboard-manager";\n',
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  `  async function importProfile(file: File) {\n    try {\n      const parsed = JSON.parse(await file.text());\n      const imported = importProfileFile(parsed);\n      setProfile(imported);\n      setCardPreferences(readCardPreferences(profilePreferenceKey(imported)));\n      setProfileError("");\n      setSearchResponse(null);\n      setLastSkillTriggerTimes(null);\n      setMedleyInput(null);\n      setMedleyResponse(null);\n    } catch (cause) {\n      setProfile(null);\n      setCardPreferences(createDefaultCardPreferences());\n      setProfileError(cause instanceof Error ? cause.message : "无法读取档案");\n    }\n  }\n`,
  `  function applyImportedProfile(parsed: unknown) {\n    const imported = importProfileFile(parsed);\n    setProfile(imported);\n    setCardPreferences(readCardPreferences(profilePreferenceKey(imported)));\n    setProfileError("");\n    setSearchResponse(null);\n    setLastSkillTriggerTimes(null);\n    setMedleyInput(null);\n    setMedleyResponse(null);\n  }\n\n  async function importProfile(file: File) {\n    try {\n      applyImportedProfile(JSON.parse(await file.text()));\n    } catch (cause) {\n      setProfile(null);\n      setCardPreferences(createDefaultCardPreferences());\n      setProfileError(cause instanceof Error ? cause.message : "无法读取档案");\n    }\n  }\n\n  async function importProfileFromClipboard() {\n    try {\n      const text = await readText();\n      if (!text.trim()) {\n        throw new Error("剪贴板中没有可读取的 JSON 文本");\n      }\n      applyImportedProfile(JSON.parse(text));\n    } catch (cause) {\n      setProfileError(cause instanceof Error ? cause.message : "无法从剪贴板读取档案");\n    }\n  }\n`,
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  `              <label className="primary-button file-button">\n                导入 JSON\n                <input\n                  type="file"\n                  accept="application/json,.json"\n                  onChange={(event) => {\n                    const file = event.currentTarget.files?.[0];\n                    if (file) void importProfile(file);\n                  }}\n                />\n              </label>\n`,
  `              <div className="profile-import-actions">\n                <button type="button" className="ghost-button" onClick={() => void importProfileFromClipboard()}>\n                  从剪贴板读取\n                </button>\n                <label className="primary-button file-button">\n                  导入 JSON\n                  <input\n                    type="file"\n                    accept="application/json,.json"\n                    onChange={(event) => {\n                      const file = event.currentTarget.files?.[0];\n                      if (file) void importProfile(file);\n                    }}\n                  />\n                </label>\n              </div>\n`,
) || changed;

{
  const path = "src/styles.css";
  const content = read(path);
  if (!content.includes(".profile-import-actions")) {
    write(path, `${content.trimEnd()}\n\n.profile-import-actions {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 8px;\n}\n`);
    changed = true;
  }
}

console.log(changed ? "Clipboard import patch applied." : "Clipboard import patch already applied.");
