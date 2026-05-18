import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  Disc3,
  FileAudio,
  Gauge,
  Home,
  Image,
  ListMusic,
  Medal,
  Music2,
  Play,
  Settings,
  Sparkles,
  Trophy,
  Upload
} from "lucide-react";

type Screen = "home" | "live" | "upload" | "chart" | "game" | "records" | "missions" | "settings" | "effectSettings" | "story" | "memorial";
type CharacterId = string;
type SpeechPosition = "center" | "left" | "right" | "top" | "bottom";
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
  hitAnimationUrl?: string;
  hitAnimationPosterUrl?: string;
  hitAnimationName?: string;
  hitAnimationType?: string;
  hitAnimationLayer?: HitAnimationLayer;
  hitAnimationPosition?: HitAnimationPosition;
  hitAnimationX?: number;
  hitAnimationY?: number;
  hitAnimationSize?: number;
  charts: Partial<Record<DifficultyKey, Chart>>;
};

type PlayRecord = {
  title: string;
  difficulty: DifficultyKey;
  score: number;
  perfect: number;
  good: number;
  ok: number;
  miss: number;
  maxCombo: number;
  totalNotes: number;
  theoreticalScore: number;
  scorePercentile: number;
  expGained: number;
  playedAt: number;
};

type Mission = {
  id: string;
  title: string;
  detail: string;
  target: number;
  current: number;
  unit: string;
};

type PerformanceTrigger = "progress" | "combo" | "score";

type PerformanceRule = {
  id: string;
  label: string;
  trigger: PerformanceTrigger;
  threshold: number;
  imageUrl: string;
  animationUrl: string;
  backgroundUrl: string;
};

type PerformanceSettings = Record<string, PerformanceRule[]>;

type HitAnimationLayer = "front" | "back";
type HitAnimationPosition = "center" | "left" | "right" | "upper" | "lower";

type HitAnimationDisplaySettings = {
  animationUrl?: string;
  idleImageUrl?: string;
  layer: HitAnimationLayer;
  position: HitAnimationPosition;
  x?: number;
  y?: number;
  size: number;
  idleLayer?: HitAnimationLayer;
  idlePosition?: HitAnimationPosition;
  idleX?: number;
  idleY?: number;
  idleSize?: number;
};

type CharacterHitSettings = Record<CharacterId, HitAnimationDisplaySettings>;
type EffectSettingsMode = "song" | "character";
type CharacterEffectPart = "hit" | "idle";

type StoryScene = {
  speaker: string;
  text: string;
  background: string;
  illustration: string;
  characterState?: string;
  characterPosition: "left" | "center" | "right" | "hidden";
};

type StoryShort = {
  id: string;
  title: string;
  summary: string;
  scenes: StoryScene[];
};

type StoryChapter = {
  id: string;
  title: string;
  shorts: StoryShort[];
};

type Character = {
  id: CharacterId;
  name: string;
  role: string;
  theme: string;
  illustrations: {
    lobby: string;
    play: string;
    result: string;
    memorial: string;
    story: string;
  };
  marker: {
    label: string;
    primary: string;
    secondary: string;
    image: string;
  };
  quote: string;
  lobbyQuotes: string[];
  story: StoryScene[];
};

type PlayerProgress = {
  level: number;
  exp: number;
  totalExp: number;
  playCount: number;
  storyExp: number;
};

type MemorialAssetSlot = {
  key: "lobby" | "play" | "result" | "marker";
  label: string;
  imageUrl: string;
};

type HitAnimation = {
  id: number;
  noteType: NoteType | "miss";
  judgment: string;
  animationUrl: string;
  mediaKind: "image" | "video";
  layer: HitAnimationLayer;
  position: HitAnimationPosition;
  size: number;
};

type SongHitEffect = {
  id: number;
  judgment: string;
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

const hitAnimationLayerLabels: Record<HitAnimationLayer, string> = {
  front: "音符の前",
  back: "音符の奥"
};

const hitAnimationPositionLabels: Record<HitAnimationPosition, string> = {
  center: "中央",
  left: "左",
  right: "右",
  upper: "上",
  lower: "下"
};

const hitAnimationPositions: Record<HitAnimationPosition, { left: string; bottom: string }> = {
  center: { left: "52%", bottom: "22%" },
  left: { left: "30%", bottom: "22%" },
  right: { left: "74%", bottom: "22%" },
  upper: { left: "52%", bottom: "44%" },
  lower: { left: "52%", bottom: "8%" }
};

const sectionLabels: Record<SectionName, string> = {
  intro: "前奏",
  verse_a: "Aメロ",
  verse_b: "Bメロ",
  chorus: "サビ",
  bridge: "ブリッジ",
  outro: "アウトロ"
};

const hitWindows = {
  perfect: 0.055,
  good: 0.105,
  ok: 0.15,
  miss: 0.15
};

const scoreModel = {
  perfect: 1200,
  good: 850,
  ok: 500
};

const judgeVisibleMs = 300;

const resultPercentileTargets = [100, 98, 95, 90, 80, 70];

const progressionPolicy = {
  basePlayExp: 60,
  scoreExpRate: 0.018,
  comboExpRate: 0.45,
  perfectExp: 2,
  okExp: 0.8,
  storyExpRate: 1,
  nextLevelExp: (level: number) => Math.round(520 + level * 190 + level * level * 35)
};

const characters: Character[] = [
  {
    id: "akari",
    name: "Akari",
    role: "Drummer",
    theme: "cyan",
    illustrations: {
      lobby: "/assets/characters/akari/akari_lobby.png",
      play: "/assets/characters/akari/akari_play.png",
      result: "/assets/characters/akari/akari_result.png",
      memorial: "/assets/characters/akari/akari_story.png",
      story: "/assets/characters/akari/akari_story.png"
    },
    marker: { label: "DRUM", primary: "#ff5f54", secondary: "#ffd25f", image: "/assets/characters/akari/akari_note.png" },
    quote: "テンポが走っても、気持ちは前に出していこ！",
    lobbyQuotes: [
      "テンポが走っても、気持ちは前に出していこ！",
      "先生、今日はどの曲から叩く？ ウォームアップなら任せて！",
      "ミスしても次の一打で取り返せるよ。リズムは止まらないから！",
      "ライブ前のこの感じ、ちょっと緊張して、すごく楽しい！"
    ],
    story: [
      { speaker: "地の文", text: "放課後の音楽室で、アカリは壊れかけのメトロノームを叩き直していた。", background: "/assets/story-classroom.png", illustration: "/assets/characters/akari/akari_story.png", characterPosition: "center" },
      { speaker: "Akari", text: "私のリズムは荒いけど、ステージは誰より明るくするよ！", background: "/assets/story-classroom.png", illustration: "/assets/characters/akari/akari_story.png", characterPosition: "center" }
    ]
  },
  {
    id: "shion",
    name: "Shion",
    role: "Vocal",
    theme: "violet",
    illustrations: {
      lobby: "/assets/characters/shion/shion_lobby.png",
      play: "/assets/characters/shion/shion_play.png",
      result: "/assets/characters/shion/shion_result.png",
      memorial: "/assets/characters/shion/shion_story.png",
      story: "/assets/characters/shion/shion_story.png"
    },
    marker: { label: "VOICE", primary: "#8b6cff", secondary: "#e7b4ff", image: "/assets/characters/shion/shion_note.png" },
    quote: "旋律の入りを聞いて。そこが譜面の呼吸になるから。",
    lobbyQuotes: [
      "旋律の入りを聞いて。そこが譜面の呼吸になるから。",
      "静かなところにも、次の音へ向かう合図が隠れています。",
      "先生、焦らずいきましょう。綺麗なタイミングは必ず見つかります。",
      "サビ前の一瞬、息を合わせられたら素敵ですね。"
    ],
    story: [
      { speaker: "地の文", text: "シオンは講堂の端で、誰にも聞こえない小さな旋律をなぞっていた。", background: "/assets/story-classroom.png", illustration: "/assets/characters/shion/shion_story.png", characterPosition: "center" },
      { speaker: "Shion", text: "旋律の入りを聞いて。そこが譜面の呼吸になるから。", background: "/assets/story-classroom.png", illustration: "/assets/characters/shion/shion_story.png", characterPosition: "center" }
    ]
  },
  {
    id: "mika",
    name: "Mika",
    role: "DJ / Producer",
    theme: "amber",
    illustrations: {
      lobby: "/assets/characters/mika/mika_lobby.png",
      play: "/assets/characters/mika/mika_play.png",
      result: "/assets/characters/mika/mika_result.png",
      memorial: "/assets/characters/mika/mika_story.png",
      story: "/assets/characters/mika/mika_story.png"
    },
    marker: { label: "DJ", primary: "#ffb347", secondary: "#5ce0b8", image: "/assets/characters/mika/mika_note.png" },
    quote: "裏で鳴ってる音、ちゃんと拾えたら気持ちいいよ。",
    lobbyQuotes: [
      "裏で鳴ってる音、ちゃんと拾えたら気持ちいいよ。",
      "この曲、ハイハットの裏においしいリズムがあるね。",
      "先生、波形だけじゃなくてノリも見ていこ。そこが大事！",
      "譜面を少し攻める？ それとも今日は気持ちよく刻む感じ？"
    ],
    story: [
      { speaker: "地の文", text: "ミカのノートPCには、誰も気づかなかった裏拍の波形が光っていた。", background: "/assets/story-classroom.png", illustration: "/assets/characters/mika/mika_story.png", characterPosition: "center" },
      { speaker: "Mika", text: "裏で鳴ってる音、ちゃんと拾えたら気持ちいいよ。", background: "/assets/story-classroom.png", illustration: "/assets/characters/mika/mika_story.png", characterPosition: "center" }
    ]
  },
  {
    id: "reina",
    name: "Reina",
    role: "Keyboard / Lead",
    theme: "rose",
    illustrations: {
      lobby: "/assets/characters/reina/reina_lobby.png",
      play: "/assets/characters/reina/reina_play.png",
      result: "/assets/characters/reina/reina_result.png",
      memorial: "/assets/characters/reina/reina_story_joy.png",
      story: "/assets/characters/reina/reina_story.png"
    },
    marker: { label: "KEYS", primary: "#ff6f91", secondary: "#70e1ff", image: "/assets/characters/reina/reina_note.png" },
    quote: "次の一音、綺麗に重ねましょう。",
    lobbyQuotes: [
      "次の一音、綺麗に重ねましょう。",
      "先生、今日は指先までリズムを通していきます。",
      "譜面の流れが見えたら、音は自然に前へ進みます。",
      "大丈夫。少しずつ、ステージに馴染ませていきましょう。"
    ],
    story: [
      { speaker: "地の文", text: "レイナは鍵盤に指を置き、まだ名前のないイントロを静かに鳴らした。", background: "/assets/story-classroom.png", illustration: "/assets/characters/reina/reina_story.png", characterPosition: "center" },
      { speaker: "Reina", text: "次の一音、綺麗に重ねましょう。", background: "/assets/story-classroom.png", illustration: "/assets/characters/reina/reina_story.png", characterPosition: "center" }
    ]
  },
  {
    id: "ren",
    name: "Ren",
    role: "Guitar",
    theme: "lime",
    illustrations: {
      lobby: "/assets/characters/ren/ren_lobby.png",
      play: "/assets/characters/ren/ren_play.png",
      result: "/assets/characters/ren/ren_result.png",
      memorial: "/assets/characters/ren/ren_story_joy.png",
      story: "/assets/characters/ren/ren_story.png"
    },
    marker: { label: "GTR", primary: "#5ce0b8", secondary: "#ffd35f", image: "/assets/characters/ren/ren_note.png" },
    quote: "勢いは任せて。入りだけ合わせよう。",
    lobbyQuotes: [
      "勢いは任せて。入りだけ合わせよう。",
      "先生、この曲は少し前のめりくらいが気持ちいい。",
      "ミスった場所も覚えた。次はそこを越える。",
      "音が走る瞬間、ちゃんと掴みにいこう。"
    ],
    story: [
      { speaker: "地の文", text: "レンはアンプのつまみを少しだけ上げ、教室の空気を震わせた。", background: "/assets/story-classroom.png", illustration: "/assets/characters/ren/ren_story.png", characterPosition: "center" },
      { speaker: "Ren", text: "勢いは任せて。入りだけ合わせよう。", background: "/assets/story-classroom.png", illustration: "/assets/characters/ren/ren_story.png", characterPosition: "center" }
    ]
  },
  {
    id: "yui",
    name: "Yui",
    role: "Bass",
    theme: "sky",
    illustrations: {
      lobby: "/assets/characters/yui/yui_lobby.png",
      play: "/assets/characters/yui/yui_play.png",
      result: "/assets/characters/yui/yui_result.png",
      memorial: "/assets/characters/yui/yui_story_joy.png",
      story: "/assets/characters/yui/yui_story.png"
    },
    marker: { label: "BASS", primary: "#20c2ea", secondary: "#5ce0b8", image: "/assets/characters/yui/yui_note.png" },
    quote: "土台はこっちで支えるね。",
    lobbyQuotes: [
      "土台はこっちで支えるね。",
      "先生、低い音を聞くとリズムが安定するよ。",
      "焦らなくていいよ。拍の真ん中で待ってるから。",
      "今日は少しだけ、グルーヴを深くしてみよっか。"
    ],
    story: [
      { speaker: "地の文", text: "ユイはベースの弦を弾き、床に小さな鼓動を落とした。", background: "/assets/story-classroom.png", illustration: "/assets/characters/yui/yui_story.png", characterPosition: "center" },
      { speaker: "Yui", text: "土台はこっちで支えるね。", background: "/assets/story-classroom.png", illustration: "/assets/characters/yui/yui_story.png", characterPosition: "center" }
    ]
  }
];

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

function characterImageBackground(imageUrl: string) {
  return `url(${imageUrl})`;
}

function characterPreviewBackground(imageUrl: string) {
  return `url(${imageUrl})`;
}

function inferHitAnimationMediaKind(url: string, mimeType = ""): "image" | "video" {
  const normalizedMime = mimeType.toLowerCase();
  if (normalizedMime.startsWith("video/")) return "video";
  if (normalizedMime.startsWith("image/")) return "image";
  const normalizedUrl = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogg|ogv)$/.test(normalizedUrl)) return "video";
  return "image";
}

function isGifHitAnimation(url = "", mimeType = "") {
  return mimeType.toLowerCase() === "image/gif" || url.split("?")[0].toLowerCase().endsWith(".gif");
}

function withReplayToken(url: string, id: number, mediaKind: "image" | "video") {
  if (mediaKind === "video" || url.startsWith("blob:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}hit=${id}`;
}

async function createStillPosterUrl(file: File) {
  if (!isGifHitAnimation(file.name, file.type)) return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

function songHitEffectStyle(song: Song) {
  const position = song.hitAnimationPosition ?? "center";
  const left = song.hitAnimationX ?? Number.parseFloat(hitAnimationPositions[position].left);
  const bottom = song.hitAnimationY ?? Number.parseFloat(hitAnimationPositions[position].bottom);
  return {
    "--song-hit-left": `${left}%`,
    "--song-hit-bottom": `${bottom}%`,
    "--song-hit-scale": `${(song.hitAnimationSize ?? 100) / 100}`
  } as React.CSSProperties;
}

function defaultHitDisplaySettings(): HitAnimationDisplaySettings {
  return { layer: "front", position: "center", size: 100 };
}

function hitDisplayStyle(prefix: string, setting: HitAnimationDisplaySettings) {
  const left = setting.x ?? Number.parseFloat(hitAnimationPositions[setting.position].left);
  const bottom = setting.y ?? Number.parseFloat(hitAnimationPositions[setting.position].bottom);
  return {
    [`--${prefix}-left`]: `${left}%`,
    [`--${prefix}-bottom`]: `${bottom}%`,
    [`--${prefix}-scale`]: `${setting.size / 100}`
  } as React.CSSProperties;
}

function characterIdleDisplaySetting(setting: HitAnimationDisplaySettings): HitAnimationDisplaySettings {
  return {
    layer: setting.idleLayer ?? setting.layer,
    position: setting.idlePosition ?? setting.position,
    x: setting.idleX ?? setting.x,
    y: setting.idleY ?? setting.y,
    size: setting.idleSize ?? setting.size,
    animationUrl: setting.idleImageUrl
  };
}

function getMemorialAssetSlots(character: Character): MemorialAssetSlot[] {
  return [
    { key: "lobby", label: "ロビー", imageUrl: character.illustrations.lobby },
    { key: "play", label: "プレイ", imageUrl: character.illustrations.play },
    { key: "result", label: "リザルト", imageUrl: character.illustrations.result },
    { key: "marker", label: "叩くマーカー", imageUrl: character.marker.image }
  ];
}

function performanceSettingKey(songId: string, difficulty: DifficultyKey) {
  return `${songId || "all"}:${difficulty}`;
}

function createDefaultPerformanceRules(character: Character): PerformanceRule[] {
  return [
    {
      id: "phase-opening",
      label: "序盤",
      trigger: "progress",
      threshold: 0,
      imageUrl: character.illustrations.play,
      animationUrl: character.illustrations.play,
      backgroundUrl: ""
    },
    {
      id: "phase-combo",
      label: "コンボ演出",
      trigger: "combo",
      threshold: 30,
      imageUrl: character.illustrations.story,
      animationUrl: character.illustrations.play,
      backgroundUrl: ""
    },
    {
      id: "phase-climax",
      label: "終盤",
      trigger: "progress",
      threshold: 70,
      imageUrl: character.illustrations.result,
      animationUrl: character.illustrations.play,
      backgroundUrl: ""
    }
  ];
}

function resolvePerformanceRules(settings: PerformanceSettings, songId: string, difficulty: DifficultyKey, character: Character) {
  return settings[performanceSettingKey(songId, difficulty)] ?? settings[performanceSettingKey("all", difficulty)] ?? createDefaultPerformanceRules(character);
}

function resolveActivePerformanceRule(rules: PerformanceRule[], progressPercent: number, combo: number, score: number) {
  const valueFor = (rule: PerformanceRule) => {
    if (rule.trigger === "combo") return combo;
    if (rule.trigger === "score") return score;
    return progressPercent;
  };
  return rules.filter((rule) => valueFor(rule) >= rule.threshold).at(-1);
}

function createInitialProgress(): PlayerProgress {
  return { level: 1, exp: 0, totalExp: 0, playCount: 0, storyExp: 0 };
}

function theoreticalScoreFor(totalNotes: number) {
  return totalNotes * scoreModel.perfect;
}

function scorePercentile(score: number, theoreticalScore: number) {
  if (!theoreticalScore) return 0;
  return clamp((score / theoreticalScore) * 100, 0, 100);
}

function resultGrade(percentileValue: number) {
  if (percentileValue >= 98) return "SS";
  if (percentileValue >= 95) return "S";
  if (percentileValue >= 90) return "A";
  if (percentileValue >= 80) return "B";
  if (percentileValue >= 70) return "C";
  return "D";
}

function resultPercentileRows(score: number, theoreticalScore: number) {
  return resultPercentileTargets.map((target) => ({
    target,
    score: Math.round(theoreticalScore * (target / 100)),
    reached: score >= theoreticalScore * (target / 100)
  }));
}

function expForRecord(record: Omit<PlayRecord, "expGained" | "playedAt">, storyBonusExp = 0) {
  const accuracyBonus = Math.round(record.scorePercentile * 2.4);
  return Math.max(
    0,
    Math.round(
      progressionPolicy.basePlayExp +
      record.score * progressionPolicy.scoreExpRate +
        record.maxCombo * progressionPolicy.comboExpRate +
        record.perfect * progressionPolicy.perfectExp +
        record.ok * progressionPolicy.okExp +
        accuracyBonus +
        storyBonusExp * progressionPolicy.storyExpRate
    )
  );
}

function applyRecordProgress(progress: PlayerProgress, record: PlayRecord): PlayerProgress {
  let level = progress.level;
  let exp = progress.exp + record.expGained;
  let totalExp = progress.totalExp + record.expGained;
  while (exp >= progressionPolicy.nextLevelExp(level)) {
    exp -= progressionPolicy.nextLevelExp(level);
    level += 1;
  }
  return { ...progress, level, exp, totalExp, playCount: progress.playCount + 1 };
}

function progressToNextLevel(progress: PlayerProgress) {
  const next = progressionPolicy.nextLevelExp(progress.level);
  return { current: progress.exp, next, percent: next ? clamp((progress.exp / next) * 100, 0, 100) : 0 };
}

function todayRecords(records: PlayRecord[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return records.filter((record) => record.playedAt >= start.getTime());
}

function createDailyMissions(records: PlayRecord[]): Mission[] {
  const today = todayRecords(records);
  const bestScore = today.reduce((best, record) => Math.max(best, record.score), 0);
  const bestCombo = today.reduce((best, record) => Math.max(best, record.maxCombo), 0);
  const oniPlays = today.filter((record) => record.difficulty === "oni").length;
  const totalHit = today.reduce((sum, record) => sum + record.perfect + record.good + record.ok, 0);

  return [
    { id: "play-1", title: "今日のライブ", detail: "ライブを1回プレイ", target: 1, current: today.length, unit: "回" },
    { id: "score-50000", title: "スコアチャレンジ", detail: "1曲でスコア50,000以上", target: 50000, current: bestScore, unit: "pts" },
    { id: "combo-50", title: "コンボチャレンジ", detail: "1曲で最大コンボ50以上", target: 50, current: bestCombo, unit: "combo" },
    { id: "oni-1", title: "鬼の腕試し", detail: "ONI譜面を1回プレイ", target: 1, current: oniPlays, unit: "回" },
    { id: "good-100", title: "リズム練習", detail: "今日の合計ヒット数100以上", target: 100, current: totalHit, unit: "hit" }
  ];
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
    if (frame.time < 1) continue;
    const local = frames.slice(Math.max(0, index - 10), Math.min(frames.length, index + 11));
    const localFlux = local.reduce((sum, item) => sum + item.flux, 0) / local.length;
    const localEnergy = local.reduce((sum, item) => sum + item.energy, 0) / local.length;
    const isPeak = frame.flux > frames[index - 1].flux && frame.flux >= frames[index + 1].flux;
    if (!isPeak || frame.flux < localFlux * 1.35 || frame.energy < localEnergy * 0.84) continue;
    const section = sectionFor(frame.time / Math.max(duration, 1));
    const brightness = frame.zcr / maxZcr;
    const strength = clamp(
      ((frame.flux / maxFlux) * 0.42 + (frame.energy / maxEnergy) * 0.3 + brightness * 0.28) * sectionWeight(section),
      0,
      1
    );
    candidates.push({
      time: frame.time,
      type: brightness > 0.46 ? "ka" : "don",
      strength,
      source: brightness > 0.46 ? "melody" : "accent",
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
    const source: Note["source"] = note.source === "melody" ? "melody" : offDist < onDist && offDist < 0.11 ? "offbeat" : onDist < 0.1 ? "onbeat" : note.source;
    const big = note.strength > 0.84 && index % 5 === 0;
    const type: NoteType = source === "offbeat" || note.source === "melody" ? (big ? "big_ka" : "ka") : big ? "big_don" : "don";
    return { ...note, source, type, strength: source === "melody" ? clamp(note.strength + 0.08, 0, 1) : source === "offbeat" ? clamp(note.strength + 0.06, 0, 1) : note.strength };
  });

  const threshold = percentile(
    enriched.map((note) => note.strength),
    difficulties[difficulty].percentile
  );
  const filtered = dedupeNotes(
    enriched.filter((note) => note.time >= 1 && note.strength >= threshold),
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
  const [playerProgress, setPlayerProgress] = useState<PlayerProgress>(createInitialProgress);
  const [offsetMs, setOffsetMs] = useState(0);
  const [speechPosition, setSpeechPosition] = useState<SpeechPosition>("bottom");
  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>({});
  const [characterHitSettings, setCharacterHitSettings] = useState<CharacterHitSettings>({});
  const [effectSettingsMode, setEffectSettingsMode] = useState<EffectSettingsMode>("song");
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId>("akari");
  const [illustrationSlots, setIllustrationSlots] = useState<Record<"lobby" | "play" | "result" | "marker", CharacterId>>({
    lobby: "akari",
    play: "akari",
    result: "akari",
    marker: "akari"
  });
  const selectedSong = songs.find((song) => song.id === selectedSongId) ?? songs[0];
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) ?? characters[0];
  const lobbyCharacter = characters.find((character) => character.id === illustrationSlots.lobby) ?? selectedCharacter;
  const playCharacter = characters.find((character) => character.id === illustrationSlots.play) ?? selectedCharacter;
  const resultCharacter = characters.find((character) => character.id === illustrationSlots.result) ?? selectedCharacter;
  const markerCharacter = characters.find((character) => character.id === illustrationSlots.marker) ?? selectedCharacter;

  const navigate = (next: Screen) => setScreen(next);
  const updateSong = (nextSong: Song) => {
    setSongs((current) =>
      current.map((item) =>
        item.id === nextSong.id
          ? { ...item, ...nextSong, charts: { ...item.charts, ...nextSong.charts } }
          : item
      )
    );
  };
  const startSongHitEdit = (song: Song) => {
    setSelectedSongId(song.id);
    const availableDifficulty = song.charts[difficulty] ? difficulty : (Object.keys(song.charts)[0] as DifficultyKey | undefined);
    if (availableDifficulty) setDifficulty(availableDifficulty);
    setEffectSettingsMode("song");
    setScreen("effectSettings");
  };
  const activeChart = selectedSong?.charts[difficulty];

  return (
    <div className="app">
      <main className="shell">
        {screen === "home" && (
          <Lobby
            songs={songs}
            records={records}
            playerProgress={playerProgress}
            navigate={navigate}
            lobbyCharacter={lobbyCharacter}
            speechPosition={speechPosition}
            setSelectedCharacterId={setSelectedCharacterId}
          />
        )}
        {screen === "upload" && (
          <UploadScreen
            navigate={navigate}
            canEditSongEffect={Boolean(selectedSong && activeChart)}
            startSongHitEdit={() => {
              if (selectedSong) startSongHitEdit(selectedSong);
            }}
            onSongs={(uploadedSongs) => {
              setSongs((current) => [...uploadedSongs, ...current]);
              setSelectedSongId(uploadedSongs[0]?.id ?? "");
              const uploadedDifficulty = Object.keys(uploadedSongs[0]?.charts ?? {})[0] as DifficultyKey | undefined;
              if (uploadedDifficulty) setDifficulty(uploadedDifficulty);
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
            startSongHitEdit={startSongHitEdit}
            navigate={navigate}
          />
        )}
        {screen === "chart" && (
          <ChartScreen
            songs={songs}
            selectedSong={selectedSong}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            updateSong={updateSong}
            navigate={navigate}
          />
        )}
        {screen === "game" && selectedSong && activeChart && (
          <GameScreen
            song={selectedSong}
            chart={activeChart}
            offsetMs={offsetMs}
            playCharacter={playCharacter}
            resultCharacter={resultCharacter}
            markerCharacter={markerCharacter}
            performanceRules={resolvePerformanceRules(performanceSettings, selectedSong.id, difficulty, playCharacter)}
            characterHitSetting={characterHitSettings[playCharacter.id] ?? defaultHitDisplaySettings()}
            navigate={navigate}
            updateSong={updateSong}
            updateCharacterHitSetting={(patch) => {
              setCharacterHitSettings((current) => ({
                ...current,
                [playCharacter.id]: { ...(current[playCharacter.id] ?? defaultHitDisplaySettings()), ...patch }
              }));
            }}
            onFinish={(record) => {
              setRecords((current) => [record, ...current].slice(0, 50));
              setPlayerProgress((current) => applyRecordProgress(current, record));
            }}
          />
        )}
        {screen === "game" && (!selectedSong || !activeChart) && <EmptyGame navigate={navigate} />}
        {screen === "effectSettings" && selectedSong && activeChart && (
          <EffectSettingsScreen
            song={selectedSong}
            chart={activeChart}
            playCharacter={playCharacter}
            markerCharacter={markerCharacter}
            characterHitSetting={characterHitSettings[playCharacter.id] ?? defaultHitDisplaySettings()}
            mode={effectSettingsMode}
            updateSong={updateSong}
            updateCharacterHitSetting={(patch) => {
              setCharacterHitSettings((current) => ({
                ...current,
                [playCharacter.id]: { ...(current[playCharacter.id] ?? defaultHitDisplaySettings()), ...patch }
              }));
            }}
            navigate={navigate}
          />
        )}
        {screen === "effectSettings" && (!selectedSong || !activeChart) && <EmptyGame navigate={navigate} />}
        {screen === "records" && <Records records={records} navigate={navigate} />}
        {screen === "missions" && <Missions records={records} navigate={navigate} />}
        {screen === "story" && <StoryMode character={selectedCharacter} navigate={navigate} />}
        {screen === "memorial" && (
          <Memorial
            characters={characters}
            selectedCharacterId={selectedCharacterId}
            navigate={navigate}
            setSelectedCharacterId={setSelectedCharacterId}
            illustrationSlots={illustrationSlots}
            setIllustrationSlots={setIllustrationSlots}
          />
        )}
        {screen === "settings" && (
          <SettingsScreen
            songs={songs}
            selectedSongId={selectedSongId}
            difficulty={difficulty}
            playCharacter={playCharacter}
            startCharacterHitEdit={() => {
              setEffectSettingsMode("character");
              setScreen("effectSettings");
            }}
            performanceSettings={performanceSettings}
            setPerformanceSettings={setPerformanceSettings}
            offsetMs={offsetMs}
            setOffsetMs={setOffsetMs}
            speechPosition={speechPosition}
            setSpeechPosition={setSpeechPosition}
            navigate={navigate}
          />
        )}
      </main>
    </div>
  );
}

function Lobby({
  songs,
  records,
  playerProgress,
  navigate,
  lobbyCharacter,
  speechPosition,
  setSelectedCharacterId
}: {
  songs: Song[];
  records: PlayRecord[];
  playerProgress: PlayerProgress;
  navigate: (screen: Screen) => void;
  lobbyCharacter: Character;
  speechPosition: SpeechPosition;
  setSelectedCharacterId: (id: CharacterId) => void;
}) {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const lobbyQuotes = lobbyCharacter.lobbyQuotes.length ? lobbyCharacter.lobbyQuotes : [lobbyCharacter.quote];
  const currentQuote = lobbyQuotes[quoteIndex % lobbyQuotes.length];
  const missions = createDailyMissions(records);
  const clearedMissions = missions.filter((mission) => mission.current >= mission.target).length;
  const levelProgress = progressToNextLevel(playerProgress);

  useEffect(() => {
    setQuoteIndex(0);
  }, [lobbyCharacter.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setQuoteIndex((value) => (value + 1) % lobbyQuotes.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [lobbyCharacter.id, lobbyQuotes.length]);

  function nextQuote() {
    setQuoteIndex((value) => (value + 1) % lobbyQuotes.length);
  }

  function openLobbyCharacterStory() {
    setSelectedCharacterId(lobbyCharacter.id);
    navigate("story");
  }

  return (
    <section className={`lobby theme-${lobbyCharacter.theme}`} style={{ "--lobby-image": characterImageBackground(lobbyCharacter.illustrations.lobby) } as React.CSSProperties}>
      <div className="topHud">
        <button className="profilePlate" onClick={() => navigate("records")}>
          <span className="profileAvatar">Lv</span>
          <span>
            <strong>Sensei Lv {playerProgress.level}</strong>
            <small>EXP {levelProgress.current}/{levelProgress.next} ({Math.round(levelProgress.percent)}%)</small>
          </span>
        </button>
        <div className="resourceBar">
          <span>AP {90 + records.length}</span>
          <span>石 {340 + records.length * 20}</span>
          <span>曲 {songs.length}</span>
          <span>PLAY {playerProgress.playCount}</span>
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
        <button onClick={() => navigate("missions")}><small>MISSION {clearedMissions}/{missions.length}</small><strong>{clearedMissions === missions.length ? "本日のミッション完了" : "今日のミッションを確認"}</strong></button>
        <button onClick={() => navigate("chart")}><small>LESSON</small><strong>譜面解析を更新</strong></button>
        <button onClick={openLobbyCharacterStory}><small>STORY</small><strong>{lobbyCharacter.name} のストーリー</strong></button>
        <button onClick={() => navigate("memorial")}><small>MEMORIAL</small><strong>記録と画像アルバム</strong></button>
      </div>

      <button className="characterAura" aria-label="セリフを切り替え" onClick={nextQuote} />
      <button className={`speech speech-${speechPosition}`} onClick={nextQuote}>{currentQuote}</button>

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
        <button onClick={openLobbyCharacterStory}><BookOpen size={20} />STORY</button>
        <button onClick={() => navigate("memorial")}><Image size={20} />MEMORIAL</button>
        <button onClick={() => navigate("settings")}><Gauge size={20} />CONFIG</button>
      </nav>
    </section>
  );
}

function UploadScreen({
  navigate,
  onSongs,
  canEditSongEffect,
  startSongHitEdit
}: {
  navigate: (screen: Screen) => void;
  onSongs: (songs: Song[]) => void;
  canEditSongEffect: boolean;
  startSongHitEdit: () => void;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("Unknown");
  const [files, setFiles] = useState<File[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyKey>("normal");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!files.length || (files.length === 1 && !title.trim())) return;
    setBusy(true);
    const uploadedSongs: Song[] = [];
    for (const [index, audioFile] of files.entries()) {
      const analysis = await analyzeAudio(audioFile, difficulty);
      const fallbackTitle = audioFile.name.replace(/\.[^.]+$/, "") || `Song ${index + 1}`;
      uploadedSongs.push({
        id: `${Date.now()}-${index}`,
        title: files.length === 1 ? title.trim() : fallbackTitle,
        artist: artist.trim() || "Unknown",
        bpm: analysis.bpm,
        duration: analysis.duration,
        audioUrl: analysis.audioUrl,
        charts: { [difficulty]: analysis.chart }
      });
    }
    onSongs(uploadedSongs);
    setBusy(false);
  }

  return (
    <Panel title="楽曲アップロード" icon={<FileAudio />}>
      <label className="field">曲名<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Song title" /><small>複数選択時はファイル名を曲名にします</small></label>
      <label className="field">アーティスト<input value={artist} onChange={(event) => setArtist(event.target.value)} /></label>
      <label className="field">
        音源
        <input type="file" accept="audio/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
        <small>{files.length ? `${files.length}曲を選択中` : "複数の音源をまとめて選択できます"}</small>
      </label>
      <DifficultyTabs value={difficulty} onChange={setDifficulty} />
      <div className="actions">
        <button className="primary" disabled={!files.length || (files.length === 1 && !title.trim()) || busy} onClick={submit}>{busy ? "解析中..." : "解析してライブへ"}</button>
        <button disabled={!canEditSongEffect} onClick={startSongHitEdit}><Sparkles size={18} />叩く演出設定</button>
        <button onClick={() => navigate("live")}><Play size={18} />ライブ</button>
        <button onClick={() => navigate("home")}><ChevronLeft size={18} />ロビー</button>
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
  startSongHitEdit: (song: Song) => void;
  navigate: (screen: Screen) => void;
}) {
  if (!props.songs.length) return <EmptyLibrary navigate={props.navigate} />;
  const selectedSong = props.songs.find((song) => song.id === props.selectedSongId) ?? props.songs[0];
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
        <button onClick={() => props.startSongHitEdit(selectedSong)}><Sparkles size={18} />叩く演出設定</button>
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
  playCharacter,
  resultCharacter,
  markerCharacter,
  performanceRules,
  characterHitSetting,
  navigate,
  updateSong,
  updateCharacterHitSetting,
  onFinish
}: {
  song: Song;
  chart: Chart;
  offsetMs: number;
  playCharacter: Character;
  resultCharacter: Character;
  markerCharacter: Character;
  performanceRules: PerformanceRule[];
  characterHitSetting: HitAnimationDisplaySettings;
  navigate: (screen: Screen) => void;
  updateSong: (song: Song) => void;
  updateCharacterHitSetting: (patch: Partial<HitAnimationDisplaySettings>) => void;
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
  const [perfect, setPerfect] = useState(0);
  const [good, setGood] = useState(0);
  const [ok, setOk] = useState(0);
  const [judge, setJudge] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [hitFlash, setHitFlash] = useState<number | null>(null);
  const [hitAnimation, setHitAnimation] = useState<HitAnimation | null>(null);
  const [songHitEffect, setSongHitEffect] = useState<SongHitEffect | null>(null);
  const songHitVideoRef = useRef<HTMLVideoElement | null>(null);
  const hitNotesRef = useRef<Set<number>>(new Set());
  const missNotesRef = useRef<Set<number>>(new Set());
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const perfectRef = useRef(0);
  const goodRef = useRef(0);
  const okRef = useRef(0);
  const judgeTimerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const hitAnimationIdRef = useRef(0);
  const songHitEffectIdRef = useRef(0);

  useEffect(() => {
    if (!songHitEffect || !song.hitAnimationUrl || inferHitAnimationMediaKind(song.hitAnimationUrl, song.hitAnimationType) !== "video") return;
    const video = songHitVideoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play();
  }, [songHitEffect, song.hitAnimationType, song.hitAnimationUrl]);

  useEffect(() => {
    if (!songHitEffect) return;
    const timer = window.setTimeout(() => setSongHitEffect(null), 620);
    return () => window.clearTimeout(timer);
  }, [songHitEffect]);

  useEffect(() => {
    return () => {
      if (judgeTimerRef.current !== null) window.clearTimeout(judgeTimerRef.current);
    };
  }, []);

  function showJudgeFeedback(value: string) {
    if (judgeTimerRef.current !== null) window.clearTimeout(judgeTimerRef.current);
    setJudge(value);
    judgeTimerRef.current = window.setTimeout(() => {
      setJudge(null);
      judgeTimerRef.current = null;
    }, judgeVisibleMs);
  }

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = () => {
      const now = audioRef.current?.currentTime ?? 0;
      setTime(now);
      let addedMiss = false;
      chart.notes.forEach((note, index) => {
        if (note.time < now - hitWindows.miss && !hitNotesRef.current.has(index) && !missNotesRef.current.has(index)) {
          missNotesRef.current.add(index);
          comboRef.current = 0;
          addedMiss = true;
        }
      });
      if (addedMiss) {
        setMissNotes(new Set(missNotesRef.current));
        setCombo(0);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chart.notes, running]);

  function start() {
    hitNotesRef.current = new Set();
    missNotesRef.current = new Set();
    scoreRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    perfectRef.current = 0;
    goodRef.current = 0;
    okRef.current = 0;
    finishedRef.current = false;
    setHitNotes(new Set(hitNotesRef.current));
    setMissNotes(new Set(missNotesRef.current));
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setPerfect(0);
    setGood(0);
    setOk(0);
    setFinished(false);
    setJudge(null);
    setHitAnimation(null);
    setSongHitEffect(null);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
    }
    setRunning(true);
  }

  function playHitAnimation(noteType: NoteType | "miss", judgment: string) {
    const id = hitAnimationIdRef.current + 1;
    hitAnimationIdRef.current = id;
    const baseAnimationUrl = activePerformanceRule?.animationUrl || playCharacter.illustrations.play;
    const mediaKind = inferHitAnimationMediaKind(baseAnimationUrl);
    setHitAnimation({
      id,
      noteType,
      judgment,
      animationUrl: withReplayToken(baseAnimationUrl, id, mediaKind),
      mediaKind,
      layer: characterHitSetting.layer,
      position: characterHitSetting.position,
      size: characterHitSetting.size
    });
  }

  function playSongHitEffect(judgment: string) {
    if (!song.hitAnimationUrl) return;
    const id = songHitEffectIdRef.current + 1;
    songHitEffectIdRef.current = id;
    setSongHitEffect({ id, judgment });
  }

  function updateSongHitSettings(
    patch: Partial<
      Pick<
        Song,
        | "hitAnimationUrl"
        | "hitAnimationPosterUrl"
        | "hitAnimationName"
        | "hitAnimationType"
        | "hitAnimationLayer"
        | "hitAnimationPosition"
        | "hitAnimationX"
        | "hitAnimationY"
        | "hitAnimationSize"
      >
    >
  ) {
    updateSong({ ...song, ...patch });
  }

  function dragSongHitEffect(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (!song.hitAnimationUrl) return;
    const stage = event.currentTarget.closest(".gameStage") as HTMLElement | null;
    if (!stage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const updatePosition = (clientX: number, clientY: number) => {
      const rect = stage.getBoundingClientRect();
      const x = clamp(((clientX - rect.left) / rect.width) * 100, 4, 96);
      const y = clamp(((rect.bottom - clientY) / rect.height) * 100, 4, 92);
      updateSongHitSettings({ hitAnimationX: Math.round(x * 10) / 10, hitAnimationY: Math.round(y * 10) / 10 });
    };
    updatePosition(event.clientX, event.clientY);
    const move = (moveEvent: PointerEvent) => updatePosition(moveEvent.clientX, moveEvent.clientY);
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }

  function resizeSongHitEffect(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nextSize = clamp((song.hitAnimationSize ?? 100) + (event.deltaY < 0 ? 5 : -5), 30, 180);
    updateSongHitSettings({ hitAnimationSize: nextSize });
  }

  function dragCharacterHitEffect(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    const stage = event.currentTarget.closest(".gameStage") as HTMLElement | null;
    if (!stage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const updatePosition = (clientX: number, clientY: number) => {
      const rect = stage.getBoundingClientRect();
      const x = clamp(((clientX - rect.left) / rect.width) * 100, 4, 96);
      const y = clamp(((rect.bottom - clientY) / rect.height) * 100, 4, 92);
      updateCharacterHitSetting({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    };
    updatePosition(event.clientX, event.clientY);
    const move = (moveEvent: PointerEvent) => updatePosition(moveEvent.clientX, moveEvent.clientY);
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }

  function resizeCharacterHitEffect(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    updateCharacterHitSetting({ size: clamp(characterHitSetting.size + (event.deltaY < 0 ? 5 : -5), 30, 180) });
  }

  function markNoteHit(index: number) {
    hitNotesRef.current.add(index);
    missNotesRef.current.delete(index);
    setHitNotes(new Set(hitNotesRef.current));
    setMissNotes(new Set(missNotesRef.current));
  }

  function markNoteMiss(index: number) {
    missNotesRef.current.add(index);
    setMissNotes(new Set(missNotesRef.current));
  }

  function tap() {
    if (!running || finishedRef.current) return;
    const now = (audioRef.current?.currentTime ?? 0) + offsetMs / 1000;
    const pendingNotes = chart.notes
      .map((note, index) => ({ note, index, delta: Math.abs(note.time - now) }))
      .filter(({ index, delta }) => !hitNotesRef.current.has(index) && !missNotesRef.current.has(index) && delta <= hitWindows.ok)
      .sort((a, b) => a.delta - b.delta);
    const target = pendingNotes[0];

    if (!target) {
      comboRef.current = 0;
      setCombo(0);
      showJudgeFeedback("MISS");
      playHitAnimation("miss", "MISS");
      playSongHitEffect("MISS");
      return;
    }

    if (target.delta <= hitWindows.ok) {
      markNoteHit(target.index);
      setHitFlash(target.index);
      window.setTimeout(() => setHitFlash(null), 120);
      comboRef.current += 1;
      maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
      const isPerfect = target.delta <= hitWindows.perfect;
      const isGood = target.delta <= hitWindows.good;
      const judgment = isPerfect ? "PERFECT" : isGood ? "GOOD" : "OK";
      scoreRef.current += isPerfect ? scoreModel.perfect : isGood ? scoreModel.good : scoreModel.ok;
      if (isPerfect) {
        perfectRef.current += 1;
        setPerfect(perfectRef.current);
      } else if (isGood) {
        goodRef.current += 1;
        setGood(goodRef.current);
      } else {
        okRef.current += 1;
        setOk(okRef.current);
      }
      setCombo(comboRef.current);
      setMaxCombo(maxComboRef.current);
      setScore(scoreRef.current);
      showJudgeFeedback(judgment);
      playHitAnimation(target.note.type, judgment);
      playSongHitEffect(judgment);
    } else {
      markNoteMiss(target.index);
      comboRef.current = 0;
      setCombo(0);
      showJudgeFeedback("MISS");
      playHitAnimation("miss", "MISS");
      playSongHitEffect("MISS");
    }
  }

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setRunning(false);
    setFinished(true);
    const finalMiss = Math.max(chart.notes.length - hitNotesRef.current.size, missNotesRef.current.size);
    const theoreticalScore = theoreticalScoreFor(chart.notes.length);
    const percentileValue = scorePercentile(scoreRef.current, theoreticalScore);
    const recordWithoutExp = {
      title: song.title,
      difficulty: chart.difficulty,
      score: scoreRef.current,
      perfect: perfectRef.current,
      good: goodRef.current,
      ok: okRef.current,
      miss: finalMiss,
      maxCombo: maxComboRef.current,
      totalNotes: chart.notes.length,
      theoreticalScore,
      scorePercentile: percentileValue
    };
    onFinish({
      ...recordWithoutExp,
      expGained: expForRecord(recordWithoutExp),
      playedAt: Date.now()
    });
  }

  const visibleNotes = chart.notes
    .map((note, index) => ({ note, index, dt: note.time - time }))
    .filter(({ dt, index }) => dt < 2.1 && dt > -hitWindows.miss && !hitNotes.has(index) && !missNotes.has(index));
  const canShowFinish = running && time >= Math.max(chart.duration - 10, 0);
  const progressPercent = chart.duration ? clamp((time / chart.duration) * 100, 0, 100) : 0;
  const activePerformanceRule = resolveActivePerformanceRule(performanceRules, progressPercent, combo, score);
  const stageBackground = activePerformanceRule?.backgroundUrl || playCharacter.illustrations.play;
  const standingImage = activePerformanceRule?.imageUrl || playCharacter.illustrations.play;
  const songHitMediaKind = song.hitAnimationUrl ? inferHitAnimationMediaKind(song.hitAnimationUrl, song.hitAnimationType) : "image";
  const songHitIsGif = Boolean(song.hitAnimationUrl && isGifHitAnimation(song.hitAnimationUrl, song.hitAnimationType));
  const songHitImageUrl =
    songHitIsGif && !songHitEffect && song.hitAnimationPosterUrl
      ? song.hitAnimationPosterUrl
      : song.hitAnimationUrl
        ? withReplayToken(song.hitAnimationUrl, songHitEffect?.id ?? songHitEffectIdRef.current, "image")
        : "";
  const resultTheoreticalScore = theoreticalScoreFor(chart.notes.length);
  const resultScorePercentile = scorePercentile(score, resultTheoreticalScore);
  const resultMiss = finished ? Math.max(chart.notes.length - hitNotes.size, missNotes.size) : missNotes.size;
  const resultExpPreview = expForRecord({
    title: song.title,
    difficulty: chart.difficulty,
    score,
    perfect,
    good,
    ok,
    miss: resultMiss,
    maxCombo,
    totalNotes: chart.notes.length,
    theoreticalScore: resultTheoreticalScore,
    scorePercentile: resultScorePercentile
  });
  const percentileRows = resultPercentileRows(score, resultTheoreticalScore);

  return (
    <section
      className={`gameStage theme-${playCharacter.theme}`}
      style={
        {
          "--game-image": `url(${stageBackground})`,
          "--standing-image": `url(${standingImage})`,
          "--marker-primary": markerCharacter.marker.primary,
          "--marker-secondary": markerCharacter.marker.secondary,
          "--note-image": `url(${markerCharacter.marker.image})`
        } as React.CSSProperties
      }
      onPointerDown={tap}
    >
      <audio ref={audioRef} src={song.audioUrl} preload="auto" onEnded={finish} />
      <div className="gameTop"><button onClick={(event) => { event.stopPropagation(); navigate("live"); }}><ChevronLeft />戻る</button><strong>{song.title}</strong><span>{difficulties[chart.difficulty].label}</span></div>
      <div className="scoreHud"><small>SCORE</small><strong>{score.toLocaleString()}</strong><small>COMBO {combo}</small></div>
      <div className="gameCharacter"><strong>{playCharacter.name}</strong><span>{playCharacter.role}</span></div>
      <div className="stageStanding" />
      <div className="performanceBadge">
        <small>{activePerformanceRule?.label ?? "通常"}</small>
        <span>{Math.round(progressPercent)}%</span>
      </div>
      {characterHitSetting.idleImageUrl && !hitAnimation && (
        <div
          className={`characterIdleEffect characterIdleEffect-${characterIdleDisplaySetting(characterHitSetting).layer}`}
          style={
            {
              ...hitDisplayStyle("character-idle", characterIdleDisplaySetting(characterHitSetting)),
              "--character-idle-image": `url(${characterHitSetting.idleImageUrl})`
            } as React.CSSProperties
          }
        />
      )}
      {song.hitAnimationUrl && (
        <div
          className={`songHitEffect songHitEffect-${song.hitAnimationLayer ?? "front"} ${songHitEffect ? "playing" : ""}`}
          style={songHitEffectStyle(song)}
          onPointerDown={dragSongHitEffect}
          onWheel={resizeSongHitEffect}
          aria-label={song.hitAnimationName ?? "楽曲判定演出"}
        >
          {songHitMediaKind === "video" ? (
            <video ref={songHitVideoRef} className="songHitEffectMedia" src={song.hitAnimationUrl} muted playsInline preload="auto" />
          ) : (
            <img
              key={songHitEffect?.id ?? songHitEffectIdRef.current}
              className="songHitEffectMedia"
              src={songHitImageUrl}
              alt=""
            />
          )}
          {songHitEffect && <span>{songHitEffect.judgment}</span>}
        </div>
      )}
      {hitAnimation && (
        <div
          key={hitAnimation.id}
          className={`hitAnimation hitAnimation-${hitAnimation.noteType} hitAnimation-${hitAnimation.layer}`}
          style={
            {
              "--hit-character": `url(${standingImage})`,
              ...hitDisplayStyle("hit-animation", {
                layer: hitAnimation.layer,
                position: hitAnimation.position,
                size: hitAnimation.size,
                x: characterHitSetting.x,
                y: characterHitSetting.y
              })
            } as React.CSSProperties
          }
        >
          {hitAnimation.mediaKind === "video" ? (
            <video className="hitAnimationMedia" src={hitAnimation.animationUrl} autoPlay muted playsInline />
          ) : (
            <img className="hitAnimationMedia" src={hitAnimation.animationUrl} alt="" />
          )}
          <span>{hitAnimation.judgment}</span>
        </div>
      )}
      <div className="lane">
        <div className="hitCircle" />
        <div className="hitCore" />
        {judge && <div className="judgeText">{judge}</div>}
        {hitFlash !== null && <div className="hitBurst">HIT</div>}
        {visibleNotes.map(({ note, index, dt }) => (
          <div
            key={index}
            className={`note ${note.type} marker-${markerCharacter.theme}`}
            style={{ left: `${96 + (92 - 96) * (1 - dt / 2.1)}%`, transform: `translateX(-${(1 - dt / 2.1) * 82}vw)` }}
          >
            <span>{markerCharacter.marker.label}</span>
          </div>
        ))}
      </div>
      <button className="tapPad">TAP / CLICK</button>
      <div className="gameControls">
        <button onPointerDown={(event) => event.stopPropagation()} onClick={start}><Play />START</button>
        {canShowFinish && <button onPointerDown={(event) => event.stopPropagation()} onClick={finish}><Medal />FINISH</button>}
      </div>
      {finished && (
        <div className="resultOverlay" style={{ "--result-image": `url(${resultCharacter.illustrations.result})` } as React.CSSProperties}>
          <div className="resultPanel">
            <strong className="resultGrade">{resultGrade(resultScorePercentile)}</strong>
            <span>{resultCharacter.name} Result / Score {score.toLocaleString()} / Max Combo {maxCombo}</span>
            <div className="resultStats">
              <div><small>PERFECT</small><b>{perfect}</b></div>
              <div><small>GOOD</small><b>{good}</b></div>
              <div><small>OK</small><b>{ok}</b></div>
              <div><small>MISS</small><b>{resultMiss}</b></div>
              <div><small>NOTES</small><b>{chart.notes.length}</b></div>
              <div><small>理論値</small><b>{resultTheoreticalScore.toLocaleString()}</b></div>
              <div><small>到達率</small><b>{resultScorePercentile.toFixed(1)}%</b></div>
              <div><small>EXP</small><b>+{resultExpPreview}</b></div>
              <div><small>精度</small><b>{chart.notes.length ? Math.round(((perfect + good + ok) / chart.notes.length) * 100) : 0}%</b></div>
            </div>
            <div className="percentileCompare">
              {percentileRows.map((row) => (
                <div key={row.target} className={row.reached ? "reached" : ""}>
                  <small>{row.target}%</small>
                  <span>{row.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="resultActions">
            <button onPointerDown={(event) => event.stopPropagation()} onClick={() => navigate("home")}><Home size={18} />ロビーへ戻る</button>
            <button onPointerDown={(event) => event.stopPropagation()} onClick={() => navigate("live")}><Play size={18} />もう一度選ぶ</button>
          </div>
        </div>
      )}
    </section>
  );
}

function EffectSettingsScreen({
  song,
  chart,
  playCharacter,
  markerCharacter,
  characterHitSetting,
  mode,
  updateSong,
  updateCharacterHitSetting,
  navigate
}: {
  song: Song;
  chart: Chart;
  playCharacter: Character;
  markerCharacter: Character;
  characterHitSetting: HitAnimationDisplaySettings;
  mode: EffectSettingsMode;
  updateSong: (song: Song) => void;
  updateCharacterHitSetting: (patch: Partial<HitAnimationDisplaySettings>) => void;
  navigate: (screen: Screen) => void;
}) {
  const [previewTarget, setPreviewTarget] = useState<"song" | "character">(mode === "song" ? "song" : "character");
  const [characterPart, setCharacterPart] = useState<CharacterEffectPart>("hit");
  const [testMode, setTestMode] = useState(false);
  const songHitIsGif = Boolean(song.hitAnimationUrl && isGifHitAnimation(song.hitAnimationUrl, song.hitAnimationType));
  const songPreviewImageUrl = songHitIsGif && song.hitAnimationPosterUrl && !testMode ? song.hitAnimationPosterUrl : song.hitAnimationUrl;

  function updateSongHitSettings(
    patch: Partial<
      Pick<
        Song,
        | "hitAnimationUrl"
        | "hitAnimationPosterUrl"
        | "hitAnimationName"
        | "hitAnimationType"
        | "hitAnimationLayer"
        | "hitAnimationPosition"
        | "hitAnimationX"
        | "hitAnimationY"
        | "hitAnimationSize"
      >
    >
  ) {
    updateSong({ ...song, ...patch });
  }

  async function updateSongHitFile(file?: File) {
    if (!file) return;
    updateSongHitSettings({
      hitAnimationUrl: URL.createObjectURL(file),
      hitAnimationPosterUrl: await createStillPosterUrl(file),
      hitAnimationName: file.name,
      hitAnimationType: file.type,
      hitAnimationLayer: song.hitAnimationLayer ?? "front",
      hitAnimationPosition: song.hitAnimationPosition ?? "center",
      hitAnimationSize: song.hitAnimationSize ?? 100
    });
    setPreviewTarget("song");
  }

  function currentPreviewPoint() {
    if (previewTarget === "song") {
      const position = song.hitAnimationPosition ?? "center";
      return {
        x: song.hitAnimationX ?? Number.parseFloat(hitAnimationPositions[position].left),
        y: song.hitAnimationY ?? Number.parseFloat(hitAnimationPositions[position].bottom)
      };
    }
    const setting = characterPart === "idle" ? characterIdleDisplaySetting(characterHitSetting) : characterHitSetting;
    return {
      x: setting.x ?? Number.parseFloat(hitAnimationPositions[setting.position].left),
      y: setting.y ?? Number.parseFloat(hitAnimationPositions[setting.position].bottom)
    };
  }

  function updatePreviewPosition(stage: HTMLElement, clientX: number, clientY: number, offset: { x: number; y: number }) {
    const rect = stage.getBoundingClientRect();
    const pointerX = ((clientX - rect.left) / rect.width) * 100;
    const pointerY = ((rect.bottom - clientY) / rect.height) * 100;
    const x = Math.round(clamp(pointerX + offset.x, -80, 180) * 10) / 10;
    const y = Math.round(clamp(pointerY + offset.y, -80, 180) * 10) / 10;
    if (previewTarget === "song") updateSongHitSettings({ hitAnimationX: x, hitAnimationY: y });
    else if (characterPart === "idle") updateCharacterHitSetting({ idleX: x, idleY: y });
    else updateCharacterHitSetting({ x, y });
  }

  function dragPreview(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    const stage = document.querySelector(".effectPreviewStage") as HTMLElement | null;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const current = currentPreviewPoint();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((rect.bottom - event.clientY) / rect.height) * 100;
    const offset = { x: current.x - pointerX, y: current.y - pointerY };
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => updatePreviewPosition(stage, moveEvent.clientX, moveEvent.clientY, offset);
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }

  function resizePreview(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (previewTarget === "song") {
      updateSongHitSettings({ hitAnimationSize: clamp((song.hitAnimationSize ?? 100) + (event.deltaY < 0 ? 5 : -5), 30, 220) });
    } else if (characterPart === "idle") {
      updateCharacterHitSetting({ idleSize: clamp((characterHitSetting.idleSize ?? characterHitSetting.size) + (event.deltaY < 0 ? 5 : -5), 30, 220) });
    } else {
      updateCharacterHitSetting({ size: clamp(characterHitSetting.size + (event.deltaY < 0 ? 5 : -5), 30, 220) });
    }
  }

  function runTestMode() {
    setTestMode(true);
    window.setTimeout(() => setTestMode(false), 900);
  }

  return (
    <Panel title="演出設定" icon={<Sparkles />}>
      <div className="effectSettingsLayout">
        <aside className="effectSettingsPanel">
          <strong>調整対象</strong>
          <div className="segmented">
            {mode === "song" && <button className="active" onClick={() => setPreviewTarget("song")}>楽曲</button>}
            {mode === "character" && <button className="active" onClick={() => setPreviewTarget("character")}>キャラ</button>}
          </div>
          {mode === "song" ? (
            <>
              <label>叩く演出ファイル<input type="file" accept="image/gif,image/png,image/webp,image/jpeg,video/mp4,video/webm,video/ogg,.gif,.mp4,.webm,.ogg,.ogv,.mov,.m4v" onChange={(event) => void updateSongHitFile(event.target.files?.[0])} /></label>
              <small>{song.hitAnimationName ? `選択中: ${song.hitAnimationName}` : "楽曲に紐づく叩く演出をここで選択します。"}</small>
              <label>前後<select value={song.hitAnimationLayer ?? "front"} onChange={(event) => updateSongHitSettings({ hitAnimationLayer: event.target.value as HitAnimationLayer })}>{(Object.keys(hitAnimationLayerLabels) as HitAnimationLayer[]).map((layer) => <option key={layer} value={layer}>{hitAnimationLayerLabels[layer]}</option>)}</select></label>
              <label>位置<select value={song.hitAnimationPosition ?? "center"} onChange={(event) => updateSongHitSettings({ hitAnimationPosition: event.target.value as HitAnimationPosition, hitAnimationX: undefined, hitAnimationY: undefined })}>{(Object.keys(hitAnimationPositionLabels) as HitAnimationPosition[]).map((position) => <option key={position} value={position}>{hitAnimationPositionLabels[position]}</option>)}</select></label>
              <label>サイズ {song.hitAnimationSize ?? 100}%<input type="range" min="30" max="220" step="5" value={song.hitAnimationSize ?? 100} onChange={(event) => updateSongHitSettings({ hitAnimationSize: Number(event.target.value) })} /></label>
            </>
          ) : (
            <>
              <div className="segmented">
                <button className={characterPart === "hit" ? "active" : ""} onClick={() => setCharacterPart("hit")}>叩く演出</button>
                <button className={characterPart === "idle" ? "active" : ""} onClick={() => setCharacterPart("idle")}>待機画像</button>
              </div>
              {characterPart === "hit" ? (
                <>
                  <small>叩く演出画像はメモリアルの「演奏」キャラクター画像を使用します。</small>
                  <label>前後<select value={characterHitSetting.layer} onChange={(event) => updateCharacterHitSetting({ layer: event.target.value as HitAnimationLayer })}>{(Object.keys(hitAnimationLayerLabels) as HitAnimationLayer[]).map((layer) => <option key={layer} value={layer}>{hitAnimationLayerLabels[layer]}</option>)}</select></label>
                  <label>位置<select value={characterHitSetting.position} onChange={(event) => updateCharacterHitSetting({ position: event.target.value as HitAnimationPosition, x: undefined, y: undefined })}>{(Object.keys(hitAnimationPositionLabels) as HitAnimationPosition[]).map((position) => <option key={position} value={position}>{hitAnimationPositionLabels[position]}</option>)}</select></label>
                  <label>サイズ {characterHitSetting.size}%<input type="range" min="30" max="220" step="5" value={characterHitSetting.size} onChange={(event) => updateCharacterHitSetting({ size: Number(event.target.value) })} /></label>
                </>
              ) : (
                <>
                  <label>待機画像URL<input value={characterHitSetting.idleImageUrl ?? ""} onChange={(event) => updateCharacterHitSetting({ idleImageUrl: event.target.value || undefined })} placeholder={playCharacter.illustrations.play} /></label>
                  <label>前後<select value={characterHitSetting.idleLayer ?? characterHitSetting.layer} onChange={(event) => updateCharacterHitSetting({ idleLayer: event.target.value as HitAnimationLayer })}>{(Object.keys(hitAnimationLayerLabels) as HitAnimationLayer[]).map((layer) => <option key={layer} value={layer}>{hitAnimationLayerLabels[layer]}</option>)}</select></label>
                  <label>位置<select value={characterHitSetting.idlePosition ?? characterHitSetting.position} onChange={(event) => updateCharacterHitSetting({ idlePosition: event.target.value as HitAnimationPosition, idleX: undefined, idleY: undefined })}>{(Object.keys(hitAnimationPositionLabels) as HitAnimationPosition[]).map((position) => <option key={position} value={position}>{hitAnimationPositionLabels[position]}</option>)}</select></label>
                  <label>サイズ {characterHitSetting.idleSize ?? characterHitSetting.size}%<input type="range" min="30" max="220" step="5" value={characterHitSetting.idleSize ?? characterHitSetting.size} onChange={(event) => updateCharacterHitSetting({ idleSize: Number(event.target.value) })} /></label>
                </>
              )}
            </>
          )}
          <button onClick={runTestMode}>テスト再生</button>
          <small>{mode === "song" ? "楽曲演出は背景と同じ画面全体基準で表示されます。演奏画面を掴んで位置、ホイールでサイズを調整できます。" : "演出は常時表示されます。中央の演奏画面内外で掴んで移動、ホイールでサイズ調整できます。"}</small>
        </aside>
        <div className="effectPreviewShell">
          <section
            className={`gameStage effectPreviewStage theme-${playCharacter.theme}`}
            style={
              {
                "--game-image": `url(${playCharacter.illustrations.play})`,
                "--standing-image": `url(${playCharacter.illustrations.play})`,
                "--marker-primary": markerCharacter.marker.primary,
                "--marker-secondary": markerCharacter.marker.secondary,
                "--note-image": `url(${markerCharacter.marker.image})`
              } as React.CSSProperties
            }
          >
            <div className="gameTop"><button onClick={() => navigate("settings")}><ChevronLeft />戻る</button><strong>{song.title}</strong><span>{difficulties[chart.difficulty].label}</span></div>
            <div className="scoreHud"><small>PREVIEW</small><strong>000000</strong><small>COMBO 0</small></div>
            <div className="stageStanding" />
            <div className="lane"><div className="hitCircle" /><div className="hitCore" /><div className="note marker-cyan" style={{ left: "68%", transform: "translateX(-42vw)" }}><span>{markerCharacter.marker.label}</span></div></div>
            {song.hitAnimationUrl && (
              <div className={`songHitEffect songHitEffect-${song.hitAnimationLayer ?? "front"} ${previewTarget === "song" ? "editing" : ""} ${testMode && previewTarget === "song" ? "playing" : ""}`} style={songHitEffectStyle(song)} onPointerDown={previewTarget === "song" ? dragPreview : undefined} onWheel={previewTarget === "song" ? resizePreview : undefined}>
                {inferHitAnimationMediaKind(song.hitAnimationUrl, song.hitAnimationType) === "video" ? <video key={testMode ? "song-test" : "song-still"} className="songHitEffectMedia" src={song.hitAnimationUrl} autoPlay={testMode && previewTarget === "song"} muted playsInline preload="auto" /> : <img key={testMode ? "song-test" : "song-still"} className="songHitEffectMedia" src={songPreviewImageUrl} alt="" />}
                {previewTarget === "song" && <span>DRAG</span>}
              </div>
            )}
            {characterHitSetting.idleImageUrl && (
              <div
                className={`characterHitPreview characterHitPreview-${characterIdleDisplaySetting(characterHitSetting).layer} ${previewTarget === "character" && characterPart === "idle" ? "editing" : ""}`}
                style={{ ...hitDisplayStyle("character-hit-preview", characterIdleDisplaySetting(characterHitSetting)), "--character-hit-preview-image": `url(${characterHitSetting.idleImageUrl})` } as React.CSSProperties}
                onPointerDown={previewTarget === "character" && characterPart === "idle" ? dragPreview : undefined}
                onWheel={previewTarget === "character" && characterPart === "idle" ? resizePreview : undefined}
              >
                {previewTarget === "character" && characterPart === "idle" && <span>DRAG</span>}
              </div>
            )}
            <div
              className={`characterHitPreview characterHitPreview-${characterHitSetting.layer} ${previewTarget === "character" && characterPart === "hit" ? "editing" : ""} ${testMode && previewTarget === "character" && characterPart === "hit" ? "playing" : ""}`}
              style={{ ...hitDisplayStyle("character-hit-preview", characterHitSetting), "--character-hit-preview-image": `url(${playCharacter.illustrations.play})` } as React.CSSProperties}
              onPointerDown={previewTarget === "character" && characterPart === "hit" ? dragPreview : undefined}
              onWheel={previewTarget === "character" && characterPart === "hit" ? resizePreview : undefined}
            >
              {previewTarget === "character" && characterPart === "hit" && <span>DRAG</span>}
            </div>
          </section>
        </div>
      </div>
      <div className="actions"><button className="primary" onClick={() => navigate("settings")}>設定へ戻る</button><button onClick={() => navigate("game")}>演奏画面へ</button></div>
    </Panel>
  );
}

function Records({ records, navigate }: { records: PlayRecord[]; navigate: (screen: Screen) => void }) {
  return (
    <Panel title="記録" icon={<Trophy />}>
      <div className="recordList">
        {records.length ? records.map((record) => (
          <div key={`${record.playedAt}-${record.title}`} className="recordItem">
            <strong>{record.title}</strong>
            <span>
              {difficulties[record.difficulty].label} / {record.score.toLocaleString()} pts / Combo {record.maxCombo} / {record.scorePercentile.toFixed(1)}%
            </span>
            <small>PERFECT {record.perfect} / GOOD {record.good} / OK {record.ok} / MISS {record.miss} / EXP +{record.expGained}</small>
          </div>
        )) : <p>まだ記録がありません。</p>}
      </div>
      <button onClick={() => navigate("home")}>ホーム</button>
    </Panel>
  );
}

function Missions({ records, navigate }: { records: PlayRecord[]; navigate: (screen: Screen) => void }) {
  const missions = createDailyMissions(records);
  const cleared = missions.filter((mission) => mission.current >= mission.target).length;

  return (
    <Panel title="今日のミッション" icon={<Medal />}>
      <div className="missionSummary">
        <div>
          <small>本日の達成</small>
          <strong>{cleared}/{missions.length}</strong>
        </div>
        <span>{cleared === missions.length ? "ミッションコンプリート" : "ライブで条件を達成しよう"}</span>
      </div>
      <div className="missionList">
        {missions.map((mission) => {
          const progress = clamp(mission.current / mission.target, 0, 1);
          const clearedMission = progress >= 1;
          return (
            <article key={mission.id} className={`missionCard ${clearedMission ? "cleared" : ""}`}>
              <div className="missionState">{clearedMission ? "CLEAR" : "挑戦中"}</div>
              <div>
                <strong>{mission.title}</strong>
                <span>{mission.detail}</span>
              </div>
              <small>
                {Math.min(mission.current, mission.target).toLocaleString()} / {mission.target.toLocaleString()} {mission.unit}
              </small>
              <div className="missionProgress" aria-label={`${mission.title} progress`}>
                <span style={{ width: `${progress * 100}%` }} />
              </div>
              {clearedMission && <b>ミッションクリア</b>}
            </article>
          );
        })}
      </div>
      <div className="actions">
        <button className="primary" onClick={() => navigate("live")}><Play size={18} />ライブへ</button>
        <button onClick={() => navigate("records")}><Trophy size={18} />記録を見る</button>
        <button onClick={() => navigate("home")}>ホーム</button>
      </div>
    </Panel>
  );
}

function isNarrationSpeaker(speaker: string) {
  return ["地の文", "ナレーション", "narration", "Narration"].includes(speaker);
}

function resolveStoryCharacter(name: string, fallback: Character) {
  const normalized = name.trim().toLowerCase();
  return characters.find((item) => {
    const candidates = [item.id, item.name, item.role].map((value) => value.toLowerCase());
    return candidates.includes(normalized) || normalized.includes(item.id) || normalized.includes(item.name.toLowerCase());
  }) ?? fallback;
}

function resolveStoryBackground(value: string, fallback: string) {
  const token = value.trim();
  if (!token) return fallback;
  if (token.startsWith("/") || token.startsWith("http")) return token;
  if (token.includes("教室") || token.toLowerCase().includes("classroom")) return "/assets/story-classroom.png";
  if (/\.(png|jpg|jpeg|webp)$/i.test(token)) return token.startsWith("assets/") ? `/${token}` : `/assets/${token}`;
  return fallback;
}

function resolveStoryPosition(value: string): StoryScene["characterPosition"] {
  const token = value.trim().toLowerCase();
  if (["左", "left", "l"].includes(token)) return "left";
  if (["右", "right", "r"].includes(token)) return "right";
  if (["非表示", "none", "hidden", "hide", "off"].includes(token)) return "hidden";
  return "center";
}

function resolveStoryIllustration(actor: Character, state: string) {
  const normalizedState = state.trim().toLowerCase();
  if (normalizedState === "lobby") return actor.illustrations.lobby;
  if (normalizedState === "play") return actor.illustrations.play;
  if (normalizedState === "result") return actor.illustrations.result;
  if (normalizedState === "memorial") return actor.illustrations.memorial;
  const expressionMap: Record<string, string> = {
    "喜": "joy",
    joy: "joy",
    happy: "joy",
    smile: "joy",
    "怒": "anger",
    anger: "anger",
    angry: "anger",
    mad: "anger",
    "哀": "sadness",
    sadness: "sadness",
    sad: "sadness",
    sorrow: "sadness",
    "楽": "fun",
    fun: "fun",
    excited: "fun",
    delight: "fun"
  };
  const expression = expressionMap[normalizedState];
  if (expression) return `/assets/characters/${actor.id}/${actor.id}_story_${expression}.png`;
  return actor.illustrations.story;
}

function parseStoryCue(line: string, current: StoryScene, fallbackCharacter: Character): StoryScene {
  const cue = line.replace(/^\/+/, "").trim();
  const [background = "", actorName = "", state = "", position = ""] = cue.split(/[,、\t]/).map((part) => part.trim());
  const hiddenActor = ["非表示", "none", "hidden", "hide", "off"].includes(actorName.trim().toLowerCase());
  const actor = actorName && !hiddenActor && !isNarrationSpeaker(actorName) ? resolveStoryCharacter(actorName, fallbackCharacter) : fallbackCharacter;
  return {
    ...current,
    background: resolveStoryBackground(background, current.background),
    illustration: hiddenActor ? "" : resolveStoryIllustration(actor, state),
    characterState: state,
    characterPosition: hiddenActor ? "hidden" : resolveStoryPosition(position || (actorName ? "center" : current.characterPosition))
  };
}

function parseStoryScript(text: string, character: Character): StoryScene[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const scenes: StoryScene[] = [];
  let currentVisual: StoryScene = {
    speaker: "地の文",
    text: "",
    background: character.story[0]?.background ?? "/assets/story-classroom.png",
    illustration: character.illustrations.story,
    characterPosition: "center"
  };

  lines.forEach((line) => {
    if (line.startsWith("/")) {
      currentVisual = parseStoryCue(line, currentVisual, character);
      return;
    }

    const match = line.match(/^([^:：;\t]+)[:：;\t](.*)$/);
    const speaker = match ? match[1].trim() : "地の文";
    const body = (match ? match[2] : line).trim();
    if (!body) return;

    const displaySpeaker = isNarrationSpeaker(speaker) ? "地の文" : speaker;
    scenes.push({
      ...currentVisual,
      speaker: displaySpeaker,
      text: body
    });
  });

  return scenes;
}

function createStoryChapters(character: Character): StoryChapter[] {
  return Array.from({ length: 3 }, (_, chapterIndex) => ({
    id: `${character.id}-chapter-${chapterIndex + 1}`,
    title: `第${chapterIndex + 1}章 ${chapterIndex === 0 ? "放課後の音楽室" : chapterIndex === 1 ? "小さなライブ準備" : "本番前夜"}`,
    shorts: Array.from({ length: 12 }, (_, shortIndex) => {
      const number = chapterIndex * 12 + shortIndex + 1;
      return {
        id: `${character.id}-${number}`,
        title: `${String(number).padStart(2, "0")} ${character.name} 短編`,
        summary: `1つの .txt で差し替えられる ${character.role} の短編`,
        scenes: character.story.map((scene, sceneIndex) => ({
          ...scene,
          text: sceneIndex === 0 ? `${currentChapterLead(chapterIndex, shortIndex)} ${scene.text}` : scene.text
        }))
      };
    })
  }));
}

function currentChapterLead(chapterIndex: number, shortIndex: number) {
  const beats = ["最初のチャイムが鳴るころ、", "譜面ノートを開くと、", "窓の外が夕色に変わり、", "本番の予定表を見ながら、"];
  return beats[(chapterIndex + shortIndex) % beats.length];
}

function StoryMode({ character, navigate }: { character: Character; navigate: (screen: Screen) => void }) {
  const chapters = useMemo(() => createStoryChapters(character), [character]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [activeShortId, setActiveShortId] = useState<string | null>(null);
  const [chapter, setChapter] = useState(0);
  const [shortScripts, setShortScripts] = useState<Record<string, StoryScene[]>>({});
  const [autoPlay, setAutoPlay] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const currentChapter = chapters[chapterIndex] ?? chapters[0];
  const activeShort = currentChapter.shorts.find((item) => item.id === activeShortId) ?? currentChapter.shorts[0];
  const scenes = activeShortId && shortScripts[activeShortId]?.length ? shortScripts[activeShortId] : activeShort.scenes;
  const scene = scenes[chapter] ?? scenes[0];

  useEffect(() => {
    setChapterIndex(0);
    setActiveShortId(null);
    setChapter(0);
    setShortScripts({});
    setAutoPlay(false);
    setShowLog(false);
  }, [character.id]);

  useEffect(() => {
    if (!autoPlay || chapter >= scenes.length - 1) return;
    const timer = window.setTimeout(() => setChapter((value) => Math.min(value + 1, scenes.length - 1)), 2600);
    return () => window.clearTimeout(timer);
  }, [autoPlay, chapter, scenes.length]);

  async function loadStoryFile(shortId: string, file?: File) {
    if (!file) return;
    const text = await file.text();
    const parsed = parseStoryScript(text, character);
    setShortScripts((current) => ({ ...current, [shortId]: parsed.length ? parsed : [] }));
    setChapter(0);
  }

  function startShort(shortId: string) {
    setActiveShortId(shortId);
    setChapter(0);
    setShowLog(false);
    setAutoPlay(false);
  }

  if (!activeShortId) {
    return (
      <section
        className={`storySelectScreen theme-${character.theme}`}
        style={{ "--selected-character": `url(${character.illustrations.story})` } as React.CSSProperties}
      >
        <div className="storySelectHeader">
          <button onClick={() => navigate("home")}><Home size={18} />ホーム</button>
          <div>
            <h1>{character.name} Story</h1>
            <p>章を選び、各短編ボタンから再生します。短編ごとの .txt 読み込みにも対応しています。</p>
          </div>
          <div className="chapterPager">
            <button onClick={() => setChapterIndex((value) => Math.max(value - 1, 0))}>前の章</button>
            <strong>{currentChapter.title}</strong>
            <button onClick={() => setChapterIndex((value) => Math.min(value + 1, chapters.length - 1))}>次の章</button>
          </div>
        </div>
        <div className="storyChapterStrip">
          {chapters.map((item, index) => (
            <button key={item.id} className={index === chapterIndex ? "active" : ""} onClick={() => setChapterIndex(index)}>
              {item.title}
            </button>
          ))}
        </div>
        <div className="shortGrid">
          {currentChapter.shorts.map((short, index) => (
            <article key={short.id} className={shortScripts[short.id]?.length ? "shortCard loaded" : "shortCard"}>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <strong>{short.title}</strong>
              <p>{short.summary}</p>
              <div className="shortActions">
                <button className="primary" onClick={() => startShort(short.id)}>再生</button>
                <label>
                  TXT
                  <input type="file" accept=".txt,text/plain" onChange={(event) => void loadStoryFile(short.id, event.target.files?.[0])} />
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`storyScreen theme-${character.theme}`}
      style={
        {
          "--story-image": scene.illustration ? `url(${scene.illustration})` : "none",
          "--story-bg": `url(${scene.background})`
        } as React.CSSProperties
      }
    >
      <div className={`storyCharacterLayer storyCharacter-${scene.characterPosition}`} />
      <div className="storyTopBar">
        <button onClick={() => setActiveShortId(null)}><ChevronLeft size={18} />短編選択</button>
        <label className="storyLoader">
          <BookOpen size={16} />
          この短編のTXTを読み込む
          <input type="file" accept=".txt,text/plain" onChange={(event) => void loadStoryFile(activeShortId, event.target.files?.[0])} />
        </label>
      </div>
      <div className="storyTextBox">
        <div className="storyName">{scene.speaker === "地の文" ? "" : scene.speaker}</div>
        <div className="storyTools">
          <button onClick={() => setShowLog((value) => !value)}>LOG</button>
          <button className={autoPlay ? "active" : ""} onClick={() => setAutoPlay((value) => !value)}>AUTO</button>
          <button onClick={() => setChapter((value) => Math.min(value + 1, scenes.length - 1))}>SKIP</button>
        </div>
        <p className={scene.speaker === "地の文" ? "narrationText" : "dialogueText"}>{scene.text}</p>
        <button className="storyPrev" onClick={() => setChapter((value) => Math.max(value - 1, 0))}>前へ</button>
        <button className="storyNext" onClick={() => setChapter((value) => Math.min(value + 1, scenes.length - 1))}>次へ</button>
      </div>
      {showLog && (
        <div className="storyLog">
          <strong>TEXT LOG</strong>
          {scenes.slice(0, chapter + 1).map((item, index) => (
            <button key={`${item.text}-${index}`} onClick={() => setChapter(index)}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item.speaker !== "地の文" && <b>{item.speaker}</b>}
              <em>{item.text}</em>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Memorial({
  characters,
  selectedCharacterId,
  navigate,
  setSelectedCharacterId,
  illustrationSlots,
  setIllustrationSlots
}: {
  characters: Character[];
  selectedCharacterId: CharacterId;
  navigate: (screen: Screen) => void;
  setSelectedCharacterId: (id: CharacterId) => void;
  illustrationSlots: Record<"lobby" | "play" | "result" | "marker", CharacterId>;
  setIllustrationSlots: React.Dispatch<React.SetStateAction<Record<"lobby" | "play" | "result" | "marker", CharacterId>>>;
}) {
  const slotLabels: Record<"lobby" | "play" | "result" | "marker", string> = {
    lobby: "ロビー",
    play: "プレイ",
    result: "リザルト",
    marker: "叩くマーカー"
  };
  return (
    <Panel title="メモリアル" icon={<Image />}>
      <div className="memorialGrid">
        {characters.map((character) => {
          const unlocked = true;
          const memorialAssets = getMemorialAssetSlots(character);
          return (
            <article
              key={character.id}
              className={`memorialCard ${selectedCharacterId === character.id ? "selected" : ""} ${unlocked ? "" : "locked"}`}
              onClick={() => {
                if (unlocked) setSelectedCharacterId(character.id);
              }}
              aria-label={`${character.name} を選択`}
            >
              <span className="memorialImage" style={{ backgroundImage: characterPreviewBackground(character.illustrations.memorial) }} />
              <strong>{unlocked ? character.name : "LOCKED"}</strong>
              <small>{unlocked ? character.role : "未解放"}</small>
              {unlocked && (
                <div className="memorialAssetGrid" aria-label={`${character.name} のメモリアル画像`}>
                  {memorialAssets.map((asset) => (
                    <button
                      key={asset.key}
                      className={`memorialAsset ${illustrationSlots[asset.key] === character.id ? "active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setIllustrationSlots((current) => ({ ...current, [asset.key]: character.id }));
                      }}
                    >
                      <span className="memorialAssetImage">
                        <img src={asset.imageUrl} alt={`${character.name} ${asset.label}`} />
                      </span>
                      <span>{asset.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {unlocked && (
                <span className="slotButtons">
                  {(Object.keys(slotLabels) as Array<"lobby" | "play" | "result" | "marker">).map((slot) => (
                    <button
                      key={slot}
                      className={illustrationSlots[slot] === character.id ? "active" : ""}
                      onClick={(event) => {
                        event.stopPropagation();
                        setIllustrationSlots((current) => ({ ...current, [slot]: character.id }));
                      }}
                    >
                      {slotLabels[slot]}
                    </button>
                  ))}
                </span>
              )}
            </article>
          );
        })}
      </div>
      <div className="actions"><button className="primary" onClick={() => navigate("home")}>ロビーへ反映</button></div>
    </Panel>
  );
}

function SettingsScreen({
  songs,
  selectedSongId,
  difficulty,
  playCharacter,
  startCharacterHitEdit,
  performanceSettings,
  setPerformanceSettings,
  offsetMs,
  setOffsetMs,
  speechPosition,
  setSpeechPosition,
  navigate
}: {
  songs: Song[];
  selectedSongId: string;
  difficulty: DifficultyKey;
  playCharacter: Character;
  startCharacterHitEdit: () => void;
  performanceSettings: PerformanceSettings;
  setPerformanceSettings: React.Dispatch<React.SetStateAction<PerformanceSettings>>;
  offsetMs: number;
  setOffsetMs: (value: number) => void;
  speechPosition: SpeechPosition;
  setSpeechPosition: (value: SpeechPosition) => void;
  navigate: (screen: Screen) => void;
}) {
  const speechOptions: Array<{ value: SpeechPosition; label: string }> = [
    { value: "center", label: "中央" },
    { value: "left", label: "左" },
    { value: "right", label: "右" },
    { value: "top", label: "上" },
    { value: "bottom", label: "下" }
  ];
  const [targetSongId, setTargetSongId] = useState(selectedSongId || "all");
  const [targetDifficulty, setTargetDifficulty] = useState<DifficultyKey>(difficulty);
  const settingsKey = performanceSettingKey(targetSongId, targetDifficulty);
  const performanceRules = performanceSettings[settingsKey] ?? createDefaultPerformanceRules(playCharacter);
  const selectedTargetSong = songs.find((song) => song.id === targetSongId);
  const triggerLabels: Record<PerformanceTrigger, string> = {
    progress: "進捗%",
    combo: "コンボ数",
    score: "スコア"
  };

  function updatePerformanceRule(ruleId: string, patch: Partial<PerformanceRule>) {
    setPerformanceSettings((current) => ({
      ...current,
      [settingsKey]: performanceRules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule))
    }));
  }

  function resetPerformanceRules() {
    setPerformanceSettings((current) => ({
      ...current,
      [settingsKey]: createDefaultPerformanceRules(playCharacter)
    }));
  }

  return (
    <Panel title="設定" icon={<Settings />}>
      <label className="field">判定オフセット {offsetMs}ms<input type="range" min="-150" max="150" step="5" value={offsetMs} onChange={(event) => setOffsetMs(Number(event.target.value))} /></label>
      <div className="field">
        ロビーセリフ位置
        <div className="segmented">
          {speechOptions.map((option) => (
            <button
              key={option.value}
              className={speechPosition === option.value ? "active" : ""}
              onClick={() => setSpeechPosition(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <section className="performanceSettings">
        <div className="settingsSectionHeader">
          <div>
            <strong>キャラクター演出</strong>
            <span>{playCharacter.name} のメモリアル「演奏」画像を基準に補正</span>
          </div>
          <button onClick={startCharacterHitEdit}>演奏画面で調整</button>
        </div>
        <div className="performanceTarget">
          <small>キャラクターの叩く演出アップロードは使わず、メモリアルで選んだ演奏キャラの画像を表示します。</small>
        </div>
      </section>
      <section className="performanceSettings">
        <div className="settingsSectionHeader">
          <div>
            <strong>演奏設定</strong>
            <span>進捗・コンボ・スコアで立ち絵、ヒットGIF、背景を切り替え</span>
          </div>
          <button onClick={resetPerformanceRules}>初期化</button>
        </div>
        <div className="performanceTarget">
          <label>
            曲
            <select value={targetSongId} onChange={(event) => setTargetSongId(event.target.value)}>
              <option value="all">全曲共通</option>
              {songs.map((song) => (
                <option key={song.id} value={song.id}>{song.title}</option>
              ))}
            </select>
          </label>
          <label>
            難易度
            <select value={targetDifficulty} onChange={(event) => setTargetDifficulty(event.target.value as DifficultyKey)}>
              {(Object.keys(difficulties) as DifficultyKey[]).map((key) => (
                <option key={key} value={key}>{difficulties[key].label}</option>
              ))}
            </select>
          </label>
          <small>{selectedTargetSong ? `${selectedTargetSong.title} / ${difficulties[targetDifficulty].label}` : `全曲共通 / ${difficulties[targetDifficulty].label}`}</small>
        </div>
        <div className="performanceRuleList">
          {performanceRules.map((rule) => (
            <article key={rule.id} className="performanceRuleCard">
              <label>
                表示名
                <input value={rule.label} onChange={(event) => updatePerformanceRule(rule.id, { label: event.target.value })} />
              </label>
              <label>
                条件
                <select value={rule.trigger} onChange={(event) => updatePerformanceRule(rule.id, { trigger: event.target.value as PerformanceTrigger })}>
                  {(Object.keys(triggerLabels) as PerformanceTrigger[]).map((trigger) => (
                    <option key={trigger} value={trigger}>{triggerLabels[trigger]}</option>
                  ))}
                </select>
              </label>
              <label>
                基準値
                <input type="number" min="0" value={rule.threshold} onChange={(event) => updatePerformanceRule(rule.id, { threshold: Number(event.target.value) })} />
              </label>
              <label>
                立ち絵URL
                <input value={rule.imageUrl} onChange={(event) => updatePerformanceRule(rule.id, { imageUrl: event.target.value })} placeholder="/assets/characters/akari/akari_play.png" />
              </label>
              <label>
                ヒットGIF URL
                <input value={rule.animationUrl} onChange={(event) => updatePerformanceRule(rule.id, { animationUrl: event.target.value })} placeholder="/assets/characters/akari/akari_hit.gif" />
              </label>
              <label>
                背景URL
                <input value={rule.backgroundUrl} onChange={(event) => updatePerformanceRule(rule.id, { backgroundUrl: event.target.value })} placeholder="/assets/game_stage.png" />
              </label>
            </article>
          ))}
        </div>
      </section>
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
