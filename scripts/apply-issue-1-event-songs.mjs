import { readFile, writeFile } from "node:fs/promises";

const providerPath = "src/data/bestdori-provider.ts";
const appPath = "src/App.tsx";

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  return source.replace(needle, replacement);
}

async function patchProvider() {
  let source = await readFile(providerPath, "utf8");
  if (source.includes("export async function fetchBestdoriEventMusicIds")) {
    return false;
  }

  const marker = "export async function fetchBestdoriChart(\n";
  const helper = `export async function fetchBestdoriEventMusicIds(\n  eventId: number,\n  server: number,\n): Promise<number[]> {\n  if (!Number.isSafeInteger(eventId) || eventId <= 0) {\n    throw new Error(\`Invalid eventId: \${eventId}\`);\n  }\n  if (!Number.isSafeInteger(server) || server < 0) {\n    throw new Error(\`Invalid server: \${server}\`);\n  }\n\n  const url = \`\${BESTDORI_BASE_URL}/api/events/\${eventId}.json\`;\n  const rawText = await fetchText(url);\n  let parsed: unknown;\n  try {\n    parsed = JSON.parse(rawText);\n  } catch {\n    throw new Error(\`Bestdori event \${eventId} returned invalid JSON\`);\n  }\n  if (!isRecord(parsed)) {\n    throw new Error(\`Bestdori event \${eventId} payload is not an object\`);\n  }\n\n  // Event details store challenge/event songs by server. Do not fall back to JP here:\n  // a missing regional list should not silently offer songs from a different server.\n  const regionalMusics = Array.isArray(parsed.musics) ? parsed.musics[server] : null;\n  if (!Array.isArray(regionalMusics)) {\n    return [];\n  }\n\n  const musicIds = regionalMusics.flatMap((entry) => {\n    if (!isRecord(entry)) return [];\n    const musicId = typeof entry.musicId === \"number\" ? entry.musicId : Number(entry.musicId);\n    return Number.isSafeInteger(musicId) && musicId > 0 ? [musicId] : [];\n  });\n  return [...new Set(musicIds)];\n}\n\n`;

  source = replaceRequired(source, marker, helper + marker, "Bestdori chart function");
  await writeFile(providerPath, source);
  return true;
}

async function patchApp() {
  let source = await readFile(appPath, "utf8");
  if (source.includes("活动课题曲") && source.includes("fetchBestdoriEventMusicIds")) {
    return false;
  }

  source = replaceRequired(
    source,
    `  eventTypeFromBestdori,\n  loadCurrentGameData,`,
    `  eventTypeFromBestdori,\n  fetchBestdoriEventMusicIds,\n  loadCurrentGameData,`,
    "data import",
  );

  source = replaceRequired(
    source,
    `  const [eventId, setEventId] = useState<number | null>(null);\n  const [liveType, setLiveType] = useState<BandoriTeamSearchLiveType>(\"free\");`,
    `  const [eventId, setEventId] = useState<number | null>(null);\n  const [eventMusicIds, setEventMusicIds] = useState<number[]>([]);\n  const [liveType, setLiveType] = useState<BandoriTeamSearchLiveType>(\"free\");`,
    "event state",
  );

  source = replaceRequired(
    source,
    `  const songs = useMemo(() => buildSongOptions(gameData, server), [gameData, server]);\n  const events = useMemo(() => buildEventOptions(gameData, server), [gameData, server]);`,
    `  const songs = useMemo(() => buildSongOptions(gameData, server), [gameData, server]);\n  const events = useMemo(() => buildEventOptions(gameData, server), [gameData, server]);\n  const songLabelsById = useMemo(() => new Map(songs.map((song) => [song.id, song.label])), [songs]);`,
    "song/event memo",
  );

  source = replaceRequired(
    source,
    `  const allowedLiveTypes = useMemo(() => allowedLiveTypesForEvent(selectedEventType), [selectedEventType]);\n\n  useEffect(() => {\n    let cancelled = false;\n    async function bootstrapGameData() {`,
    `  const allowedLiveTypes = useMemo(() => allowedLiveTypesForEvent(selectedEventType), [selectedEventType]);\n\n  useEffect(() => {\n    let cancelled = false;\n    if (eventId === null) {\n      setEventMusicIds([]);\n      return () => {\n        cancelled = true;\n      };\n    }\n\n    setEventMusicIds([]);\n    void fetchBestdoriEventMusicIds(eventId, server)\n      .then((musicIds) => {\n        if (!cancelled) setEventMusicIds(musicIds);\n      })\n      .catch((cause) => {\n        console.warn(\`Failed to load Bestdori event songs for event \${eventId}\`, cause);\n        if (!cancelled) setEventMusicIds([]);\n      });\n\n    return () => {\n      cancelled = true;\n    };\n  }, [eventId, server]);\n\n  useEffect(() => {\n    let cancelled = false;\n    async function bootstrapGameData() {`,
    "event-song effect",
  );

  source = replaceRequired(
    source,
    `              </label>\n\n              <label className=\"field\">\n                <span>活动类型</span>`,
    `              </label>\n\n              {eventMusicIds.length > 0 && (\n                <div className=\"field field-wide\">\n                  <span>活动课题曲</span>\n                  <div className=\"summary-row\" aria-label=\"当前活动课题曲\">\n                    {eventMusicIds.map((musicId) => (\n                      <button\n                        key={musicId}\n                        type=\"button\"\n                        className={songId === musicId ? \"primary-button\" : \"ghost-button\"}\n                        onClick={() => setSongId(musicId)}\n                      >\n                        {songLabelsById.get(musicId) ?? \`Song #\${musicId}\`}\n                      </button>\n                    ))}\n                  </div>\n                </div>\n              )}\n\n              <label className=\"field\">\n                <span>活动类型</span>`,
    "event-song UI",
  );

  if (!source.includes("fetchBestdoriEventMusicIds") || !source.includes("活动课题曲")) {
    throw new Error("Issue #1 App patch did not produce expected markers");
  }
  await writeFile(appPath, source);
  return true;
}

const changed = [await patchProvider(), await patchApp()].some(Boolean);
console.log(changed ? "Applied issue #1 event-song patch." : "Issue #1 event-song patch already applied.");
