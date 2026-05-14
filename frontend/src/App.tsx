import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  Disc3,
  FileAudio,
  Gauge,
  Home,
  ListMusic,
  Medal,
  Music2,
  Play,
  Settings,
  Sparkles,
  Trophy,
  Upload
} from "lucide-react";

type Screen = "home" | "live" | "upload" | "chart" | "game" | "records" | "settings";
type DifficultyKey = "easy" | "normal" | "hard" | "oni";
type NoteType = "don" | "ka" | "big_don" | "big_ka";
type SectionName = "intro" | "verse_a" | "verse_b" | "chorus" | "bridge" | "outro";

type Note = {
  time: number;
  type: NoteType;
  strength: number;
  source: "onbeat" | "offbeat" | "melody" | "accent";
  section: SectionName;
};

type Chart = {
  difficulty: DifficultyKey;
  bpm: number;
  duration: number;
  notes: Note[];
  method: string;
};

type Song = {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  duration: number;
  audioUrl: string;
  charts: Partial<Record<DifficultyKey, Chart>>;
};

type PlayRecord = {
  title: string;
  difficulty: DifficultyKey;
  score: number;
  good: number;
  miss: number;
  maxCombo: number;
  playedAt: number;
};

const difficulties: Record<DifficultyKey, { label: string; level: number; minGap: number; percentile: number }> = {
  easy: { label: "EASY", level: 2, minGap: 0.46, percentile: 68 },
  normal: { label: "NORMAL", level: 4, minGap: 0.32, percentile: 46 },
  hard: { label: "HARD", level: 6, minGap: 0.22, percentile: 30 },
  oni: { label: "ONI", level: 8, minGap: 0.15, percentile: 18 }
};

const noteLabels: Record<NoteType, string> = {
  don: "面",
  ka: "縁",
  big_don: "大面",
  big_ka: "大縁"
};

const sectionLabels: Record<SectionName, string> = {
  intro: "前奏",
  verse_a: "Aメロ",
  verse_b: "Bメロ",
  chorus: "サビ",
  bridge: "ブリッジ",
  outro: "アウトロ"
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sectionFor(progress: number): SectionName {
  if (progress < 0.12) return "intro";
  if (progress < 0.34) return "verse_a";
  if (progress < 0.52) return "verse_b";
  if (progress < 0.78) return "chorus";
  if (progress < 0.9) return "bridge";
  return "outro";
}

function sectionWeight(section: SectionName) {
  return {
    intro: 0.78,
    verse_a: 0.94,
    verse_b: 1.04,
    chorus: 1.26,
    bridge: 1.1,
    outro: 0.86
  }[section];
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((p / 100) * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[index];
}

function nearestDistance(value: number, targets: number[]) {
  if (!targets.length) return 999;
  let best = 999;
  for (const target of targets) best = Math.min(best, Math.abs(value - target));
  return best;
}

function dedupeNotes(notes: Note[], minGap: number) {
  const chosen: Note[] = [];
  for (const note of [...notes].sort((a, b) => b.strength - a.strength || a.time - b.time)) {
    if (chosen.every((item) => Math.abs(item.time - note.time) >= minGap)) chosen.push(note);
  }
  return chosen.sort((a, b) => a.time - b.time);
}

async function analyzeAudio(file: File, difficulty: DifficultyKey): Promise<{ chart: Chart; audioUrl: string; duration: number; bpm: number }> {
  const audioUrl = URL.createObjectURL(file);
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;
  const channel = buffer.getChannelData(0);
  const frameSize = 2048;
  const hop = 512;
  const frames: { time: number; energy: number; flux: number; zcr: number }[] = [];
  let previousEnergy = 0;

  for (let start = 0; start + frameSize < channel.length; start += hop) {
    let energy = 0;
    let zeroCrossings = 0;
    let last = channel[start];
    for (let index = 0; index < frameSize; index += 1) {
      const value = channel[start + index];
      energy += value * value;
      if ((last <= 0 && value > 0) || (last >= 0 && value < 0)) zeroCrossings += 1;
      last = value;
    }
    energy = Math.sqrt(energy / frameSize);
    frames.push({
      time: start / sampleRate,
      energy,
      flux: Math.max(energy - previousEnergy, 0),
      zcr: zeroCrossings / frameSize
    });
    previousEnergy = energy;
  }

  await context.close();

  const maxEnergy = Math.max(...frames.map((frame) => frame.energy), 0.00001);
  const maxFlux = Math.max(...frames.map((frame) => frame.flux), 0.00001);
  const maxZcr = Math.max(...frames.map((frame) => frame.zcr), 0.00001);
  const candidates: Note[] = [];

  for (let index = 2; index < frames.length - 2; index += 1) {
    const frame = frames[index];
    const local = frames.slice(Math.max(0, index - 10), Math.min(frames.length, index + 11));
    const localFlux = local.reduce((sum, item) => sum + item.flux, 0) / local.length;
    const localEnergy = local.reduce((sum, item) => sum + item.energy, 0) / local.length;
    const isPeak = frame.flux > frames[index - 1].flux && frame.flux >= frames[index + 1].flux;
    if (!isPeak || frame.flux < localFlux * 1.35 || frame.energy < localEnergy * 0.84) continue;
    const section = sectionFor(frame.time / Math.max(duration, 1));
    const brightness = frame.zcr / maxZcr;
    const strength = clamp(
      ((frame.flux / maxFlux) * 0.54 + (frame.energy / maxEnergy) * 0.31 + brightness * 0.15) * sectionWeight(section),
      0,
      1
    );
    candidates.push({
      time: frame.time,
      type: brightness > 0.6 ? "ka" : "don",
      strength,
      source: brightness > 0.6 ? "melody" : "accent",
      section
    });
  }

  const intervals = candidates
    .slice(1)
    .map((note, index) => note.time - candidates[index].time)
    .filter((gap) => gap > 0.22 && gap < 1.4);
  const medianInterval = percentile(intervals, 50) || 0.5;
  const bpm = clamp(Math.round(60 / medianInterval), 60, 220);
  const beat = 60 / bpm;
  const beatTimes = Array.from({ length: Math.ceil(duration / beat) }, (_, index) => index * beat);
  const offbeatTimes = beatTimes.slice(0, -1).map((time) => time + beat / 2);

  const enriched = candidates.map((note, index) => {
    const onDist = nearestDistance(note.time, beatTimes);
    const offDist = nearestDistance(note.time, offbeatTimes);
    const source = offDist < onDist && offDist < 0.11 ? "offbeat" : onDist < 0.1 ? "onbeat" : note.source;
    const big = note.strength > 0.84 && index % 5 === 0;
    const type: NoteType = source === "offbeat" || note.source === "melody" ? (big ? "big_ka" : "ka") : big ? "big_don" : "don";
    return { ...note, source, type, strength: source === "offbeat" ? clamp(note.strength + 0.06, 0, 1) : note.strength };
  });

  const threshold = percentile(
    enriched.map((note) => note.strength),
    difficulties[difficulty].percentile
  );
  const filtered = dedupeNotes(
    enriched.filter((note) => note.strength >= threshold),
    difficulties[difficulty].minGap
  ).slice(0, 1200);

  return {
    audioUrl,
    duration,
    bpm,
    chart: {
      difficulty,
      bpm,
      duration,
      notes: filtered,
      method: "web-audio-energy-flux-sections"
    }
  };
}

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string>("");
  const [difficulty, setDifficulty] = useState<DifficultyKey>("normal");
  const [records, setRecords] = useState<PlayRecord[]>([]);
  const [offsetMs, setOffsetMs] = useState(0);
  const selectedSong = songs.find((song) => song.id === selectedSongId) ?? songs[0];

  const navigate = (next: Screen) => setScreen(next);
  const activeChart = selectedSong?.charts[difficulty];

  return (
    <div className="app">
      <main className="shell">
        {screen === "home" && <Lobby songs={songs} records={records} navigate={navigate} />}
        {screen === "upload" && (
          <UploadScreen
            navigate={navigate}
            onSong={(song) => {
              setSongs((current) => [song, ...current]);
              setSelectedSongId(song.id);
              setScreen("live");
            }}
          />
        )}
        {screen === "live" && (
          <LiveSelect
            songs={songs}
            selectedSongId={selectedSongId}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            selectSong={setSelectedSongId}
            navigate={navigate}
          />
        )}
        {screen === "chart" && (
          <ChartScreen
            songs={songs}
            selectedSong={selectedSong}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            updateSong={(song) => setSongs((current) => current.map((item) => (item.id === song.id ? song : item)))}
            navigate={navigate}
          />
        )}
        {screen === "game" && selectedSong && activeChart && (
          <GameScreen
            song={selectedSong}
            chart={activeChart}
            offsetMs={offsetMs}
            navigate={navigate}
            onFinish={(record) => setRecords((current) => [record, ...current].slice(0, 50))}
          />
        )}
        {screen === "game" && (!selectedSong || !activeChart) && <EmptyGame navigate={navigate} />}
        {screen === "records" && <Records records={records} navigate={navigate} />}
        {screen === "settings" && <SettingsScreen offsetMs={offsetMs} setOffsetMs={setOffsetMs} navigate={navigate} />}
      </main>
    </div>
  );
}

function Lobby({ songs, records, navigate }: { songs: Song[]; records: PlayRecord[]; navigate: (screen: Screen) => void }) {
  return (
    <section className="lobby">
      <div className="topHud">
        <button className="profilePlate" onClick={() => navigate("records")}>
          <span className="profileAvatar">Lv</span>
          <span>
            <strong>Sensei Lv {Math.floor(records.length / 3) + 1}</strong>
            <small>EXP {records.length * 120}/1000</small>
          </span>
        </button>
        <div className="resourceBar">
          <span>AP {90 + records.length}</span>
          <span>石 {340 + records.length * 20}</span>
          <span>曲 {songs.length}</span>
          <span>PLAY {records.length}</span>
        </div>
        <div className="toolRow">
          <button onClick={() => navigate("settings")} aria-label="設定">
            <Settings size={20} />
          </button>
          <button onClick={() => navigate("live")} aria-label="メニュー">
            <ListMusic size={20} />
          </button>
        </div>
      </div>

      <div className="leftStack">
        <button onClick={() => navigate("records")}><small>MISSION</small><strong>今日のライブを1回プレイ</strong></button>
        <button onClick={() => navigate("chart")}><small>LESSON</small><strong>譜面解析を更新</strong></button>
        <button onClick={() => navigate("live")}><small>SHOP</small><strong>楽曲ライブラリ</strong></button>
      </div>

      <div className="characterAura" />
      <div className="nameTag">Festival Beat Live</div>
      <div className="speech">ロビー上のボタンはすべて実際に動きます。アップロード曲から譜面を作ってライブへ進めます。</div>

      <div className="rightStack">
        <button className="noticePanel" onClick={() => navigate("chart")}>
          <span>NOTICE</span>
          <strong>Web Audio解析を使用中</strong>
          <small>BPM固定ではなく発音ピークと曲展開から譜面化</small>
        </button>
        <button className="eventPanel" onClick={() => navigate("chart")}>
          <Sparkles size={22} />
          <strong>RHYTHM ANALYSIS</strong>
          <small>Aメロ / Bメロ / サビで密度変化</small>
        </button>
      </div>

      <nav className="lobbyNav">
        <button className="liveStart" onClick={() => navigate("live")}><Play size={24} />LIVE START</button>
        <button onClick={() => navigate("upload")}><Upload size={20} />UPLOAD</button>
        <button onClick={() => navigate("chart")}><BarChart3 size={20} />CHART</button>
        <button onClick={() => navigate("records")}><Trophy size={20} />RECORD</button>
        <button onClick={() => navigate("settings")}><Gauge size={20} />CONFIG</button>
      </nav>
    </section>
  );
}

function UploadScreen({ navigate, onSong }: { navigate: (screen: Screen) => void; onSong: (song: Song) => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("Unknown");
  const [file, setFile] = useState<File | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyKey>("normal");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file || !title.trim()) return;
    setBusy(true);
    const analysis = await analyzeAudio(file, difficulty);
    onSong({
      id: `${Date.now()}`,
      title: title.trim(),
      artist: artist.trim() || "Unknown",
      bpm: analysis.bpm,
      duration: analysis.duration,
      audioUrl: analysis.audioUrl,
      charts: { [difficulty]: analysis.chart }
    });
    setBusy(false);
  }

  return (
    <Panel title="楽曲アップロード" icon={<FileAudio />}>
      <label className="field">曲名<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Song title" /></label>
      <label className="field">アーティスト<input value={artist} onChange={(event) => setArtist(event.target.value)} /></label>
      <label className="field">音源<input type="file" accept="audio/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <DifficultyTabs value={difficulty} onChange={setDifficulty} />
      <div className="actions">
        <button className="primary" disabled={!file || !title.trim() || busy} onClick={submit}>{busy ? "解析中..." : "解析して保存"}</button>
        <button onClick={() => navigate("home")}><ChevronLeft size={18} />ホーム</button>
      </div>
    </Panel>
  );
}

function LiveSelect(props: {
  songs: Song[];
  selectedSongId: string;
  difficulty: DifficultyKey;
  setDifficulty: (value: DifficultyKey) => void;
  selectSong: (id: string) => void;
  navigate: (screen: Screen) => void;
}) {
  if (!props.songs.length) return <EmptyLibrary navigate={props.navigate} />;
  return (
    <Panel title="ライブ選択" icon={<Music2 />}>
      <DifficultyTabs value={props.difficulty} onChange={props.setDifficulty} />
      <div className="songGrid">
        {props.songs.map((song) => (
          <button
            key={song.id}
            className={`songCard ${props.selectedSongId === song.id ? "selected" : ""}`}
            onClick={() => props.selectSong(song.id)}
          >
            <Disc3 />
            <strong>{song.title}</strong>
            <small>{song.artist} / BPM {song.bpm} / {Math.round(song.duration)}秒</small>
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="primary" onClick={() => props.navigate("game")}><Play size={18} />ライブ開始</button>
        <button onClick={() => props.navigate("chart")}><BarChart3 size={18} />譜面</button>
        <button onClick={() => props.navigate("home")}><Home size={18} />ホーム</button>
      </div>
    </Panel>
  );
}

function ChartScreen(props: {
  songs: Song[];
  selectedSong?: Song;
  difficulty: DifficultyKey;
  setDifficulty: (value: DifficultyKey) => void;
  updateSong: (song: Song) => void;
  navigate: (screen: Screen) => void;
}) {
  const [busy, setBusy] = useState(false);
  const chart = props.selectedSong?.charts[props.difficulty];

  async function regenerate() {
    if (!props.selectedSong) return;
    setBusy(true);
    const audio = await fetch(props.selectedSong.audioUrl).then((response) => response.blob());
    const file = new File([audio], `${props.selectedSong.title}.audio`);
    const analysis = await analyzeAudio(file, props.difficulty);
    URL.revokeObjectURL(analysis.audioUrl);
    props.updateSong({
      ...props.selectedSong,
      bpm: analysis.bpm,
      duration: analysis.duration,
      charts: { ...props.selectedSong.charts, [props.difficulty]: analysis.chart }
    });
    setBusy(false);
  }

  if (!props.songs.length) return <EmptyLibrary navigate={props.navigate} />;
  return (
    <Panel title="譜面解析" icon={<BarChart3 />}>
      <DifficultyTabs value={props.difficulty} onChange={props.setDifficulty} />
      <div className="chartSummary">
        <div><small>BPM</small><strong>{chart?.bpm ?? props.selectedSong?.bpm ?? "-"}</strong></div>
        <div><small>NOTES</small><strong>{chart?.notes.length ?? 0}</strong></div>
        <div><small>METHOD</small><strong>{chart?.method ?? "未生成"}</strong></div>
      </div>
      <button className="primary" onClick={regenerate} disabled={busy}>{busy ? "解析中..." : "選択難易度の譜面を再生成"}</button>
      <div className="noteTable">
        {(chart?.notes ?? []).slice(0, 64).map((note, index) => (
          <span key={`${note.time}-${index}`}>{note.time.toFixed(2)}s / {noteLabels[note.type]} / {sectionLabels[note.section]}</span>
        ))}
      </div>
      <div className="actions"><button onClick={() => props.navigate("live")}>ライブへ</button><button onClick={() => props.navigate("home")}>ホーム</button></div>
    </Panel>
  );
}

function GameScreen({
  song,
  chart,
  offsetMs,
  navigate,
  onFinish
}: {
  song: Song;
  chart: Chart;
  offsetMs: number;
  navigate: (screen: Screen) => void;
  onFinish: (record: PlayRecord) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [hitNotes, setHitNotes] = useState<Set<number>>(new Set());
  const [missNotes, setMissNotes] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [judge, setJudge] = useState("READY");
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = () => {
      const now = audioRef.current?.currentTime ?? 0;
      setTime(now);
      setMissNotes((current) => {
        const next = new Set(current);
        chart.notes.forEach((note, index) => {
          if (note.time < now - 0.22 && !hitNotes.has(index) && !next.has(index)) {
            next.add(index);
            setCombo(0);
            setJudge("MISS");
          }
        });
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chart.notes, hitNotes, running]);

  function start() {
    setHitNotes(new Set());
    setMissNotes(new Set());
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setFinished(false);
    setJudge("GO");
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
    }
    setRunning(true);
  }

  function tap() {
    if (!running || finished) return;
    const now = (audioRef.current?.currentTime ?? 0) + offsetMs / 1000;
    let bestIndex = -1;
    let bestDelta = 999;
    chart.notes.forEach((note, index) => {
      if (hitNotes.has(index) || missNotes.has(index)) return;
      const delta = Math.abs(note.time - now);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestDelta <= 0.18) {
      setHitNotes((current) => new Set(current).add(bestIndex));
      setCombo((value) => {
        const next = value + 1;
        setMaxCombo((max) => Math.max(max, next));
        return next;
      });
      setScore((value) => value + (bestDelta <= 0.075 ? 1200 : 850));
      setJudge(bestDelta <= 0.075 ? "PERFECT" : "GOOD");
    } else {
      setCombo(0);
      setJudge("MISS");
    }
  }

  function finish() {
    if (finished) return;
    setRunning(false);
    setFinished(true);
    onFinish({
      title: song.title,
      difficulty: chart.difficulty,
      score,
      good: hitNotes.size,
      miss: Math.max(chart.notes.length - hitNotes.size, missNotes.size),
      maxCombo,
      playedAt: Date.now()
    });
  }

  const visibleNotes = chart.notes
    .map((note, index) => ({ note, index, dt: note.time - time }))
    .filter(({ dt, index }) => dt < 2.1 && dt > -0.4 && !hitNotes.has(index));

  return (
    <section className="gameStage" onPointerDown={tap}>
      <audio ref={audioRef} src={song.audioUrl} preload="auto" onEnded={finish} />
      <div className="gameTop"><button onClick={(event) => { event.stopPropagation(); navigate("live"); }}><ChevronLeft />戻る</button><strong>{song.title}</strong><span>{difficulties[chart.difficulty].label}</span></div>
      <div className="scoreHud"><small>SCORE</small><strong>{score.toLocaleString()}</strong><small>COMBO {combo}</small></div>
      <div className="lane">
        <div className="hitCircle" />
        <div className="judgeText">{judge}</div>
        {visibleNotes.map(({ note, index, dt }) => (
          <div
            key={index}
            className={`note ${note.type}`}
            style={{ left: `${96 + (92 - 96) * (1 - dt / 2.1)}%`, transform: `translateX(-${(1 - dt / 2.1) * 82}vw)` }}
          >
            {noteLabels[note.type]}
          </div>
        ))}
      </div>
      <button className="tapPad">TAP / CLICK</button>
      <div className="gameControls">
        <button onPointerDown={(event) => event.stopPropagation()} onClick={start}><Play />START</button>
        <button onPointerDown={(event) => event.stopPropagation()} onClick={finish}><Medal />FINISH</button>
      </div>
      {finished && <div className="resultOverlay"><strong>{score > chart.notes.length * 900 ? "S" : "A"}</strong><span>Score {score.toLocaleString()} / Max Combo {maxCombo}</span></div>}
    </section>
  );
}

function Records({ records, navigate }: { records: PlayRecord[]; navigate: (screen: Screen) => void }) {
  return (
    <Panel title="記録" icon={<Trophy />}>
      <div className="recordList">
        {records.length ? records.map((record) => (
          <div key={`${record.playedAt}-${record.title}`} className="recordItem">
            <strong>{record.title}</strong>
            <span>{difficulties[record.difficulty].label} / {record.score.toLocaleString()} pts / Combo {record.maxCombo}</span>
          </div>
        )) : <p>まだ記録がありません。</p>}
      </div>
      <button onClick={() => navigate("home")}>ホーム</button>
    </Panel>
  );
}

function SettingsScreen({ offsetMs, setOffsetMs, navigate }: { offsetMs: number; setOffsetMs: (value: number) => void; navigate: (screen: Screen) => void }) {
  return (
    <Panel title="設定" icon={<Settings />}>
      <label className="field">判定オフセット {offsetMs}ms<input type="range" min="-150" max="150" step="5" value={offsetMs} onChange={(event) => setOffsetMs(Number(event.target.value))} /></label>
      <div className="actions"><button onClick={() => navigate("home")}>ホーム</button><button onClick={() => navigate("live")}>ライブ</button></div>
    </Panel>
  );
}

function DifficultyTabs({ value, onChange }: { value: DifficultyKey; onChange: (value: DifficultyKey) => void }) {
  return (
    <div className="difficultyTabs">
      {(Object.keys(difficulties) as DifficultyKey[]).map((key) => (
        <button key={key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>
          {difficulties[key].label}<small>★{difficulties[key].level}</small>
        </button>
      ))}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panelScreen">
      <header><span>{icon}</span><h1>{title}</h1></header>
      {children}
    </section>
  );
}

function EmptyLibrary({ navigate }: { navigate: (screen: Screen) => void }) {
  return (
    <Panel title="楽曲がありません" icon={<FileAudio />}>
      <p>まず音源をアップロードしてください。</p>
      <button className="primary" onClick={() => navigate("upload")}>アップロードへ</button>
    </Panel>
  );
}

function EmptyGame({ navigate }: { navigate: (screen: Screen) => void }) {
  return (
    <Panel title="ライブ準備が必要です" icon={<Play />}>
      <p>楽曲と譜面を選択してください。</p>
      <button className="primary" onClick={() => navigate("live")}>ライブ選択へ</button>
    </Panel>
  );
}
