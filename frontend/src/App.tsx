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
  Medal,
  Music2,
  Package,
  Play,
  Settings,
  Sparkles,
  Trophy,
  Upload
} from "lucide-react";

type Screen = "home" | "live" | "upload" | "chart" | "game" | "records" | "missions" | "settings" | "effectSettings" | "story" | "memorial" | "items" | "help" | "adminHelp";
type CharacterId = string;
type SpeechPosition = "center" | "left" | "right" | "top" | "bottom";
type DifficultyKey = "easy" | "normal" | "hard" | "oni";
type NoteType = "don" | "ka" | "big_don" | "big_ka";
type NoteInputKind = "tap" | "key" | "rapid" | "hold";
type SectionName = "intro" | "verse_a" | "verse_b" | "chorus" | "bridge" | "outro";
type SongHitPlaybackMode = "delayed" | "instant";
type UiTheme = "festival" | "scarlet" | "nocturne" | "aurora";
type ItemEffectType = "combo_guard" | "miss_guard" | "score_boost";
type HitJudgment = "PERFECT" | "GOOD" | "OK";
type KeyNoteVisualMode = "button" | "character";

type Note = {
  time: number;
  type: NoteType;
  strength: number;
  source: "onbeat" | "offbeat" | "melody" | "accent";
  section: SectionName;
  inputKind?: NoteInputKind;
  inputKey?: string;
  requiredHits?: number;
  holdMs?: number;
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
  hitAnimationPlaybackMode?: SongHitPlaybackMode;
  hitAnimationEnabled?: boolean;
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
  rewardItemId: string;
  rewardAmount: number;
};

type GameItem = {
  id: string;
  name: string;
  description: string;
  effect: ItemEffectType;
  value: number;
  maxUses: number;
  owned: number;
  iconUrl: string;
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
  enabled?: boolean;
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

type StoryCharacterPose = {
  id: CharacterId;
  name: string;
  illustration: string;
  characterState?: string;
  characterPosition: "left" | "center" | "right" | "hidden" | "custom";
  characterX?: number;
  characterY?: number;
  characterScale?: number;
  characterFlipX?: boolean;
};

type StoryLiveSettings = {
  song?: string;
  difficulty?: DifficultyKey;
  stageBackground?: string;
  characterHitAnimation?: string;
  songHitAnimation?: string;
  songHitLayer?: HitAnimationLayer;
  songHitSize?: number;
  songHitEnabled?: boolean;
};

type StoryScene = {
  speaker: string;
  text: string;
  background: string;
  illustration: string;
  characterState?: string;
  characterPosition: "left" | "center" | "right" | "hidden" | "custom";
  characterX?: number;
  characterY?: number;
  characterScale?: number;
  characterFlipX?: boolean;
  characters?: StoryCharacterPose[];
};

type StoryShort = {
  id: string;
  title: string;
  summary: string;
  storyFileBase: string;
  storyFileVersion: number;
  storyFileName?: string;
  importedScript?: StoryScriptData;
  scenes: StoryScene[];
};

type StoryScriptData = {
  scenes: StoryScene[];
  goLiveAfterEnd: boolean;
  title?: string;
  subtitle?: string;
  liveSettings?: StoryLiveSettings;
  editedText?: string;
  sourceFileBase?: string;
  sourceVersion?: number;
  sourceFileName?: string;
};

type StoryChapter = {
  id: string;
  title: string;
  shorts: StoryShort[];
};

const storyDefaultCharacterScale = 1.75;
const storyDefaultCharacterY = -44.75;
const storyDefaultPositionCenters: Record<StoryCharacterPose["characterPosition"], number> = {
  left: 24,
  center: 50,
  right: 76,
  hidden: 50,
  custom: 50
};
type StoryPositionCenters = typeof storyDefaultPositionCenters;
const storyReadMarksStorageKey = "festival-beat-story-read-marks";

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
  animationUrl: string;
  mediaKind: "image" | "video";
  startAt: number;
};

type HitInput = {
  source: "pointer" | "keyboard";
  key?: string;
  phase: "down" | "up";
};

type HitNoteVanish = {
  id: number;
  index: number;
  note: Note;
  hitTime: number;
};

type HitNoteVanishMode = "on" | "off";
const HIT_NOTE_VANISH_SECONDS = 0.52;

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

const noteInputLabels: Record<NoteInputKind, string> = {
  tap: "通常",
  key: "キー指定",
  rapid: "連打",
  hold: "長押し"
};

const defaultSpecialNoteConfig = {
  kind: "tap" as NoteInputKind,
  every: 8,
  start: 1,
  key: "f",
  requiredHits: 3,
  holdMs: 600
};

function normalizeInputKey(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === " ") return "space";
  return normalized.replace(/^key/, "");
}

function formatInputKey(value?: string) {
  const key = normalizeInputKey(value ?? "");
  return key ? key.toUpperCase() : "-";
}

function noteInputKind(note: Note): NoteInputKind {
  return note.inputKind ?? "tap";
}

function noteInputDetail(note: Note) {
  const kind = noteInputKind(note);
  if (kind === "key") return `${noteInputLabels[kind]} ${formatInputKey(note.inputKey)}`;
  if (kind === "rapid") return `${noteInputLabels[kind]} ${Math.max(2, note.requiredHits ?? 3)}回`;
  if (kind === "hold") return `${noteInputLabels[kind]} ${formatInputKey(note.inputKey)} ${Math.max(500, note.holdMs ?? 600)}ms`;
  return noteInputLabels.tap;
}

function noteHoldVisualWidth(note: Note) {
  if (noteInputKind(note) !== "hold") return undefined;
  const holdMs = Math.max(500, note.holdMs ?? defaultSpecialNoteConfig.holdMs);
  return Math.round(clamp(92 + holdMs * 0.16, 128, 280));
}

const generatedSpecialNotePolicy: Record<DifficultyKey, { keyEvery: number; rapidEvery: number; holdEvery: number; rapidHits: number; holdMs: number }> = {
  easy: { keyEvery: 14, rapidEvery: 0, holdEvery: 0, rapidHits: 2, holdMs: 500 },
  normal: { keyEvery: 10, rapidEvery: 18, holdEvery: 26, rapidHits: 3, holdMs: 600 },
  hard: { keyEvery: 8, rapidEvery: 14, holdEvery: 20, rapidHits: 4, holdMs: 700 },
  oni: { keyEvery: 6, rapidEvery: 10, holdEvery: 16, rapidHits: 5, holdMs: 800 }
};

function generateSpecialNotes(notes: Note[], difficulty: DifficultyKey): Note[] {
  const policy = generatedSpecialNotePolicy[difficulty];
  const keys = ["f", "j", "d", "k"];
  return notes.map((note, index) => {
    const noteNumber = index + 1;
    if (noteNumber < 5) return note;
    const nextGap = notes[index + 1] ? notes[index + 1].time - note.time : 999;
    const specialWindowSec = 0.5;
    const canRapid = policy.rapidEvery > 0 && nextGap >= specialWindowSec;
    const canHold = policy.holdEvery > 0 && nextGap >= Math.max(specialWindowSec, policy.holdMs / 1000) + 0.12;
    const isPhrasePeak = note.section === "chorus" || note.section === "bridge" || note.strength > 0.82;

    if (canHold && isPhrasePeak && noteNumber % policy.holdEvery === 0) {
      return {
        ...note,
        inputKind: "hold",
        inputKey: keys[index % keys.length],
        holdMs: policy.holdMs
      };
    }

    if (canRapid && note.strength > 0.68 && noteNumber % policy.rapidEvery === 0) {
      return {
        ...note,
        inputKind: "rapid",
        requiredHits: policy.rapidHits
      };
    }

    if (policy.keyEvery > 0 && (note.source === "melody" || note.source === "offbeat" || noteNumber % policy.keyEvery === 0) && noteNumber % policy.keyEvery === 0) {
      return {
        ...note,
        inputKind: "key",
        inputKey: keys[index % keys.length]
      };
    }

    return note;
  });
}

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
const songHitStartDelayMs = 100;
const songHitImagePlaybackMs = 900;
const songHitVideoFallbackMs = 5000;

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

const characterAssetModules = import.meta.glob("../public/assets/characters/*/*.{png,jpg,jpeg,webp,gif}", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

const characterTextModules = import.meta.glob("../public/assets/characters/*/*.txt", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

const storyScriptModules = import.meta.glob("../public/assets/story/**/*.txt", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

const storyBackgroundModules = import.meta.glob("../public/assets/backgrounds/story/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

const rootStoryExpressionModules = import.meta.glob("../public/assets/*_story_*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

const itemCsvModules = import.meta.glob("../public/assets/items/*.csv", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

const itemIconModules = import.meta.glob("../public/assets/items/icons/*.{svg,png,jpg,jpeg,webp,gif}", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

const characterAssetFolders = buildCharacterAssetFolders(characterAssetModules);
const storyBackgrounds = buildStoryBackgroundIndex(storyBackgroundModules);
const storyExpressionImages = buildStoryExpressionIndex({ ...characterAssetModules, ...rootStoryExpressionModules });

const baseCharacters: Character[] = [
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

const characterHomeTexts = buildCharacterHomeTexts(characterTextModules);

const characters: Character[] = applyCharacterHomeTexts(mergeAssetCharacters(baseCharacters, characterAssetFolders), characterHomeTexts);
const gameItems: GameItem[] = loadGameItems(itemCsvModules, itemIconModules);

type CharacterAssetFolder = {
  id: CharacterId;
  files: Record<string, string>;
};

function buildCharacterAssetFolders(modules: Record<string, string>): CharacterAssetFolder[] {
  const folders = new Map<CharacterId, Record<string, string>>();
  Object.entries(modules).forEach(([path, url]) => {
    const normalizedPath = path.replace(/\\/g, "/");
    const match = normalizedPath.match(/\/characters\/([^/]+)\/([^/]+)$/);
    if (!match) return;
    const [, id, fileName] = match;
    const current = folders.get(id) ?? {};
    current[fileName.toLowerCase()] = url;
    folders.set(id, current);
  });
  return [...folders.entries()]
    .map(([id, files]) => ({ id, files }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildCharacterHomeTexts(modules: Record<string, string>) {
  const texts = new Map<CharacterId, string[]>();
  Object.entries(modules).forEach(([path, content]) => {
    const normalizedPath = path.replace(/\\/g, "/");
    const match = normalizedPath.match(/\/characters\/([^/]+)\/([^/]+)$/);
    if (!match) return;
    const [, id, fileName] = match;
    if (!["home.txt", "lobby.txt", `${id}_home.txt`, `${id}_lobby.txt`].includes(fileName.toLowerCase())) return;
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    if (lines.length) texts.set(id, lines);
  });
  return texts;
}

function buildStoryBackgroundIndex(modules: Record<string, string>) {
  const backgrounds = new Map<string, string>();
  Object.entries(modules).forEach(([path, url]) => {
    const normalizedPath = path.replace(/\\/g, "/");
    const filename = normalizedPath.split("/").pop();
    if (!filename) return;
    const basename = filename.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    [
      filename,
      basename,
      `/assets/backgrounds/story/${filename}`,
      `assets/backgrounds/story/${filename}`,
      `/backgrounds/story/${filename}`,
      `backgrounds/story/${filename}`,
      `/${filename}`,
      filename.replace(/_/g, "-"),
      basename.replace(/_/g, "-")
    ].forEach((key) => backgrounds.set(key.toLowerCase(), url));
  });
  return backgrounds;
}

function buildStoryExpressionIndex(modules: Record<string, string>) {
  const expressions = new Map<string, string>();
  Object.entries(modules).forEach(([path, url]) => {
    const normalizedPath = path.replace(/\\/g, "/");
    const filename = normalizedPath.split("/").pop();
    if (!filename) return;
    const match = filename.match(/^(?:\d+)?([^_]+)_story_([^./]+)\.(png|jpg|jpeg|webp)$/i);
    if (!match) return;
    const [, characterId, expression] = match;
    expressions.set(`${characterId.toLowerCase()}:${expression.toLowerCase()}`, url);
    const folderCharacterId = normalizedPath.match(/\/characters\/([^/]+)\//i)?.[1];
    if (folderCharacterId) expressions.set(`${folderCharacterId.toLowerCase()}:${expression.toLowerCase()}`, url);
  });
  return expressions;
}

function applyCharacterHomeTexts(characterList: Character[], texts: Map<CharacterId, string[]>) {
  return characterList.map((character) => {
    const homeTexts = texts.get(character.id);
    if (!homeTexts?.length) return character;
    return {
      ...character,
      quote: homeTexts[0],
      lobbyQuotes: homeTexts
    };
  });
}

function characterAssetUrl(folder: CharacterAssetFolder, names: string[]) {
  const extensions = ["png", "webp", "jpg", "jpeg", "gif"];
  for (const name of names) {
    for (const extension of extensions) {
      const fileName = `${folder.id}_${name}.${extension}`.toLowerCase();
      if (folder.files[fileName]) return folder.files[fileName];
    }
  }
  return "";
}

function displayNameFromId(id: string) {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || id;
}

function generatedThemeFor(id: string) {
  const themes = ["cyan", "violet", "amber", "rose", "lime", "sky"];
  const index = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % themes.length;
  return themes[index];
}

function generatedMarkerColors(id: string) {
  const palettes = [
    ["#20c2ea", "#ffd35f"],
    ["#8b6cff", "#e7b4ff"],
    ["#ffb347", "#5ce0b8"],
    ["#ff6f91", "#70e1ff"],
    ["#5ce0b8", "#ffd35f"],
    ["#20c2ea", "#5ce0b8"]
  ];
  const index = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length;
  return palettes[index];
}

function createCharacterFromAssets(folder: CharacterAssetFolder): Character | null {
  const lobby = characterAssetUrl(folder, ["lobby", "loby"]);
  const play = characterAssetUrl(folder, ["play", "paly"]);
  const result = characterAssetUrl(folder, ["result", "resalt"]);
  const story = characterAssetUrl(folder, ["story", "story_joy"]) || play || lobby || result;
  const memorial = characterAssetUrl(folder, ["story_joy", "story"]) || story;
  const note = characterAssetUrl(folder, ["note", "marker"]) || play || lobby;
  const primaryImage = lobby || play || result || story;
  if (!primaryImage) return null;
  const [primary, secondary] = generatedMarkerColors(folder.id);
  const name = displayNameFromId(folder.id);
  return {
    id: folder.id,
    name,
    role: "Auto Character",
    theme: generatedThemeFor(folder.id),
    illustrations: {
      lobby: lobby || primaryImage,
      play: play || primaryImage,
      result: result || primaryImage,
      memorial: memorial || primaryImage,
      story: story || primaryImage
    },
    marker: {
      label: folder.id.slice(0, 4).toUpperCase(),
      primary,
      secondary,
      image: note || primaryImage
    },
    quote: `${name} の画像フォルダを検出しました。`,
    lobbyQuotes: [
      `${name} の画像フォルダを検出しました。`,
      "メモリアルからロビー・演奏・リザルト・マーカーへ割り当てられます。"
    ],
    story: [
      {
        speaker: "地の文",
        text: `${name} のアセットフォルダから自動生成されたストーリーです。`,
        background: "/assets/story-classroom.png",
        illustration: story || primaryImage,
        characterPosition: "center"
      },
      {
        speaker: name,
        text: "必要な画像を追加すると、メモリアルや演奏画面でも使えます。",
        background: "/assets/story-classroom.png",
        illustration: story || primaryImage,
        characterPosition: "center"
      }
    ]
  };
}

function mergeAssetCharacters(base: Character[], folders: CharacterAssetFolder[]) {
  const baseIds = new Set(base.map((character) => character.id));
  const generated = folders
    .filter((folder) => !baseIds.has(folder.id))
    .map(createCharacterFromAssets)
    .filter((character): character is Character => Boolean(character));
  return [...base, ...generated];
}

function parseCsvRows(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  const [headerLine, ...bodyLines] = lines;
  if (!headerLine) return [];
  const headers = headerLine.split(",").map((value) => value.trim());
  return bodyLines.map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function itemIconUrl(iconFile: string, iconModules: Record<string, string>) {
  const normalizedIcon = iconFile.trim().toLowerCase();
  const found = Object.entries(iconModules).find(([path]) => path.replace(/\\/g, "/").toLowerCase().endsWith(`/items/icons/${normalizedIcon}`));
  return found?.[1] ?? `/assets/items/icons/${iconFile}`;
}

function loadGameItems(csvModules: Record<string, string>, iconModules: Record<string, string>): GameItem[] {
  return Object.values(csvModules)
    .flatMap(parseCsvRows)
    .map((row) => ({
      id: row.id,
      name: row.name || row.id,
      description: row.description || "",
      effect: (row.effect || "combo_guard") as ItemEffectType,
      value: Number(row.value) || 0,
      maxUses: Math.max(1, Number(row.maxUses) || 1),
      owned: Math.max(0, Number(row.owned) || 0),
      iconUrl: itemIconUrl(row.icon || `${row.id}.svg`, iconModules)
    }))
    .filter((item) => item.id);
}

function itemEffectLabel(effect: ItemEffectType) {
  if (effect === "combo_guard") return "コンボ保護";
  if (effect === "miss_guard") return "MISS救済";
  return "スコア補正";
}

function findItem(items: GameItem[], itemId: string) {
  return items.find((item) => item.id === itemId);
}

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
  return { enabled: false, layer: "front", position: "center", size: 100 };
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

function noteTypeScoreMultiplier(note: Note) {
  return note.type === "big_don" || note.type === "big_ka" ? 1.08 : 1;
}

function noteInputScoreMultiplier(note: Note) {
  const kind = noteInputKind(note);
  if (kind === "key") return 1.08;
  if (kind === "rapid") return 1 + Math.min(0.28, Math.max(2, note.requiredHits ?? 3) * 0.045);
  if (kind === "hold") return 1 + Math.min(0.26, Math.max(100, note.holdMs ?? 600) / 3600);
  return 1;
}

function comboScoreMultiplier(comboBeforeHit: number) {
  return 1 + Math.min(0.32, comboBeforeHit * 0.0016);
}

function timingScoreMultiplier(delta: number) {
  const precision = clamp(1 - delta / hitWindows.ok, 0, 1);
  return 0.92 + precision * 0.2;
}

function judgmentScoreMultiplier(judgment: HitJudgment) {
  if (judgment === "PERFECT") return 1;
  if (judgment === "GOOD") return scoreModel.good / scoreModel.perfect;
  return scoreModel.ok / scoreModel.perfect;
}

function scoreBoostRate(items: GameItem[]) {
  const boost = items.find((item) => item.effect === "score_boost");
  return boost ? 1 + boost.value / 100 : 1;
}

function scoreForNote(note: Note, delta: number, comboBeforeHit: number, judgment: HitJudgment, boostRate = 1) {
  return Math.round(
    scoreModel.perfect *
      noteTypeScoreMultiplier(note) *
      noteInputScoreMultiplier(note) *
      judgmentScoreMultiplier(judgment) *
      timingScoreMultiplier(delta) *
      comboScoreMultiplier(comboBeforeHit) *
      boostRate
  );
}

function theoreticalScoreFor(notes: Note[], boostRate = 1) {
  return notes.reduce((sum, note, index) => sum + scoreForNote(note, 0, index, "PERFECT", boostRate), 0);
}

function averageNoteScoreMultiplier(notes: Note[]) {
  if (!notes.length) return 1;
  const total = notes.reduce((sum, note) => sum + noteTypeScoreMultiplier(note) * noteInputScoreMultiplier(note), 0);
  return total / notes.length;
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
    { id: "play-1", title: "今日のライブ", detail: "ライブを1回プレイ", target: 1, current: today.length, unit: "回", rewardItemId: "combo_charm", rewardAmount: 1 },
    { id: "score-50000", title: "スコアチャレンジ", detail: "1曲でスコア50,000以上", target: 50000, current: bestScore, unit: "pts", rewardItemId: "score_amp", rewardAmount: 1 },
    { id: "combo-50", title: "コンボチャレンジ", detail: "1曲で最大コンボ50以上", target: 50, current: bestCombo, unit: "combo", rewardItemId: "combo_charm", rewardAmount: 1 },
    { id: "oni-1", title: "鬼の腕試し", detail: "ONI譜面を1回プレイ", target: 1, current: oniPlays, unit: "回", rewardItemId: "miss_badge", rewardAmount: 1 },
    { id: "good-100", title: "リズム練習", detail: "今日の合計ヒット数100以上", target: 100, current: totalHit, unit: "hit", rewardItemId: "miss_badge", rewardAmount: 1 }
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
  const generatedNotes = generateSpecialNotes(filtered, difficulty);

  return {
    audioUrl,
    duration,
    bpm,
    chart: {
      difficulty,
      bpm,
      duration,
      notes: generatedNotes,
      method: "web-audio-energy-flux-sections-special-notes"
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
  const [uiTheme, setUiTheme] = useState<UiTheme>("festival");
  const [keyNoteVisualMode, setKeyNoteVisualMode] = useState<KeyNoteVisualMode>("button");
  const [hitNoteVanishMode, setHitNoteVanishMode] = useState<HitNoteVanishMode>("on");
  const [storyAutoDelayMs, setStoryAutoDelayMs] = useState(1000);
  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>({});
  const [characterHitSettings, setCharacterHitSettings] = useState<CharacterHitSettings>({});
  const [effectSettingsMode, setEffectSettingsMode] = useState<EffectSettingsMode>("song");
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId>("akari");
  const [itemInventory, setItemInventory] = useState<Record<string, number>>(() =>
    Object.fromEntries(gameItems.map((item) => [item.id, 0]))
  );
  const [claimedMissionIds, setClaimedMissionIds] = useState<string[]>([]);
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

  useEffect(() => {
    const newlyCleared = createDailyMissions(records).filter(
      (mission) => mission.current >= mission.target && !claimedMissionIds.includes(mission.id)
    );
    if (!newlyCleared.length) return;
    setItemInventory((current) => {
      const next = { ...current };
      newlyCleared.forEach((mission) => {
        next[mission.rewardItemId] = (next[mission.rewardItemId] ?? 0) + mission.rewardAmount;
      });
      return next;
    });
    setClaimedMissionIds((current) => [...current, ...newlyCleared.map((mission) => mission.id)]);
  }, [records, claimedMissionIds]);

  return (
    <div className={`app ui-${uiTheme}`}>
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
            items={gameItems}
            itemInventory={itemInventory}
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
            keyNoteVisualMode={keyNoteVisualMode}
            hitNoteVanishMode={hitNoteVanishMode}
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
            items={gameItems}
            itemInventory={itemInventory}
            onFinish={(record, consumedItems) => {
              setRecords((current) => [record, ...current].slice(0, 50));
              setPlayerProgress((current) => applyRecordProgress(current, record));
              if (consumedItems.length) {
                setItemInventory((current) => {
                  const next = { ...current };
                  consumedItems.forEach((itemId) => {
                    next[itemId] = Math.max(0, (next[itemId] ?? 0) - 1);
                  });
                  return next;
                });
              }
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
        {screen === "missions" && <Missions records={records} items={gameItems} claimedMissionIds={claimedMissionIds} navigate={navigate} />}
        {screen === "story" && (
          <StoryMode
            character={selectedCharacter}
            navigate={navigate}
            autoDelayMs={storyAutoDelayMs}
            applyLiveSettings={(settings) => {
              const targetSong = settings.song
                ? songs.find((song) => song.id === settings.song || song.title === settings.song)
                : selectedSong;
              const targetDifficulty = settings.difficulty ?? difficulty;
              if (targetSong) {
                setSelectedSongId(targetSong.id);
                setDifficulty(targetSong.charts[targetDifficulty] ? targetDifficulty : (Object.keys(targetSong.charts)[0] as DifficultyKey | undefined) ?? targetDifficulty);
                if (settings.songHitAnimation) {
                  updateSong({
                    ...targetSong,
                    hitAnimationUrl: settings.songHitAnimation,
                    hitAnimationName: "story live hit",
                    hitAnimationType: inferHitAnimationMediaKind(settings.songHitAnimation),
                    hitAnimationLayer: settings.songHitLayer ?? targetSong.hitAnimationLayer ?? "front",
                    hitAnimationSize: settings.songHitSize ?? targetSong.hitAnimationSize ?? 100,
                    hitAnimationEnabled: settings.songHitEnabled ?? true
                  });
                }
                if (settings.stageBackground || settings.characterHitAnimation) {
                  const liveDifficulty = targetSong.charts[targetDifficulty] ? targetDifficulty : (Object.keys(targetSong.charts)[0] as DifficultyKey | undefined) ?? targetDifficulty;
                  const key = performanceSettingKey(targetSong.id, liveDifficulty);
                  setPerformanceSettings((current) => ({
                    ...current,
                    [key]: [{
                      id: "story-live",
                      label: "Story Live",
                      trigger: "progress",
                      threshold: 0,
                      imageUrl: playCharacter.illustrations.play,
                      animationUrl: settings.characterHitAnimation || playCharacter.illustrations.play,
                      backgroundUrl: settings.stageBackground || playCharacter.illustrations.play
                    }]
                  }));
                }
              }
            }}
          />
        )}
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
        {screen === "items" && <ItemInventory items={gameItems} itemInventory={itemInventory} navigate={navigate} />}
        {screen === "help" && <AssetHelp navigate={navigate} />}
        {screen === "adminHelp" && <AdminHelp navigate={navigate} />}
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
            uiTheme={uiTheme}
            setUiTheme={setUiTheme}
            keyNoteVisualMode={keyNoteVisualMode}
            setKeyNoteVisualMode={setKeyNoteVisualMode}
            hitNoteVanishMode={hitNoteVanishMode}
            setHitNoteVanishMode={setHitNoteVanishMode}
            storyAutoDelayMs={storyAutoDelayMs}
            setStoryAutoDelayMs={setStoryAutoDelayMs}
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
  setSelectedCharacterId,
  items,
  itemInventory
}: {
  songs: Song[];
  records: PlayRecord[];
  playerProgress: PlayerProgress;
  navigate: (screen: Screen) => void;
  lobbyCharacter: Character;
  speechPosition: SpeechPosition;
  setSelectedCharacterId: (id: CharacterId) => void;
  items: GameItem[];
  itemInventory: Record<string, number>;
}) {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const lobbyQuotes = lobbyCharacter.lobbyQuotes.length ? lobbyCharacter.lobbyQuotes : [lobbyCharacter.quote];
  const currentQuote = lobbyQuotes[quoteIndex % lobbyQuotes.length];
  const missions = createDailyMissions(records);
  const clearedMissions = missions.filter((mission) => mission.current >= mission.target).length;
  const levelProgress = progressToNextLevel(playerProgress);
  const ownedItemTotal = items.reduce((sum, item) => sum + (itemInventory[item.id] ?? 0), 0);

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
          <button onClick={() => navigate("items")} aria-label="アイテム">
            <Package size={20} />
            {ownedItemTotal > 0 && <span className="toolBadge">{ownedItemTotal}</span>}
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
        <button onClick={() => navigate("help")}><BookOpen size={20} />HELP</button>
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

  function updateNote(index: number, patch: Partial<Note>) {
    if (!props.selectedSong || !chart) return;
    const nextNotes = chart.notes.map((note, noteIndex) => {
      if (noteIndex !== index) return note;
      const nextNote = { ...note, ...patch };
      if (patch.inputKind === "tap") {
        delete nextNote.inputKind;
        delete nextNote.inputKey;
        delete nextNote.requiredHits;
        delete nextNote.holdMs;
      }
      if (patch.inputKind === "key") {
        nextNote.inputKey = normalizeInputKey(nextNote.inputKey ?? defaultSpecialNoteConfig.key);
        delete nextNote.requiredHits;
        delete nextNote.holdMs;
      }
      if (patch.inputKind === "rapid") {
        nextNote.requiredHits = Math.max(2, nextNote.requiredHits ?? defaultSpecialNoteConfig.requiredHits);
        delete nextNote.inputKey;
        delete nextNote.holdMs;
      }
      if (patch.inputKind === "hold") {
        nextNote.inputKey = normalizeInputKey(nextNote.inputKey ?? defaultSpecialNoteConfig.key);
        nextNote.holdMs = Math.max(100, nextNote.holdMs ?? defaultSpecialNoteConfig.holdMs);
        delete nextNote.requiredHits;
      }
      return nextNote;
    });
    props.updateSong({
      ...props.selectedSong,
      charts: {
        ...props.selectedSong.charts,
        [props.difficulty]: { ...chart, notes: nextNotes }
      }
    });
  }

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
      <div className="chartEditor">
        {(chart?.notes ?? []).map((note, index) => {
          const kind = noteInputKind(note);
          return (
            <div className={`chartNoteRow chartNoteRow-${kind}`} key={`${note.time}-${index}`}>
              <div className="chartNoteMeta">
                <strong>#{index + 1}</strong>
                <span>{note.time.toFixed(2)}s</span>
                <small>{sectionLabels[note.section]}</small>
              </div>
              <label>
                音符
                <select value={note.type} onChange={(event) => updateNote(index, { type: event.target.value as NoteType })}>
                  {(Object.keys(noteLabels) as NoteType[]).map((type) => <option key={type} value={type}>{noteLabels[type]}</option>)}
                </select>
              </label>
              <label>
                入力
                <select value={kind} onChange={(event) => updateNote(index, { inputKind: event.target.value as NoteInputKind })}>
                  {(Object.keys(noteInputLabels) as NoteInputKind[]).map((inputKind) => <option key={inputKind} value={inputKind}>{noteInputLabels[inputKind]}</option>)}
                </select>
              </label>
              {(kind === "key" || kind === "hold") && (
                <label>
                  キー
                  <input value={note.inputKey ?? defaultSpecialNoteConfig.key} maxLength={12} onChange={(event) => updateNote(index, { inputKey: event.target.value })} />
                </label>
              )}
              {kind === "rapid" && (
                <label>
                  連打
                  <input type="number" min={2} max={12} value={note.requiredHits ?? defaultSpecialNoteConfig.requiredHits} onChange={(event) => updateNote(index, { requiredHits: Number(event.target.value) || 2 })} />
                </label>
              )}
              {kind === "hold" && (
                <label>
                  長押しms
                  <input type="number" min={100} step={50} value={note.holdMs ?? defaultSpecialNoteConfig.holdMs} onChange={(event) => updateNote(index, { holdMs: Number(event.target.value) || 100 })} />
                </label>
              )}
              <small className="chartNoteDetail">{noteInputDetail(note)}</small>
            </div>
          );
        })}
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
  keyNoteVisualMode,
  hitNoteVanishMode,
  performanceRules,
  characterHitSetting,
  navigate,
  updateSong,
  updateCharacterHitSetting,
  items,
  itemInventory,
  onFinish
}: {
  song: Song;
  chart: Chart;
  offsetMs: number;
  playCharacter: Character;
  resultCharacter: Character;
  markerCharacter: Character;
  keyNoteVisualMode: KeyNoteVisualMode;
  hitNoteVanishMode: HitNoteVanishMode;
  performanceRules: PerformanceRule[];
  characterHitSetting: HitAnimationDisplaySettings;
  navigate: (screen: Screen) => void;
  updateSong: (song: Song) => void;
  updateCharacterHitSetting: (patch: Partial<HitAnimationDisplaySettings>) => void;
  items: GameItem[];
  itemInventory: Record<string, number>;
  onFinish: (record: PlayRecord, consumedItems: string[]) => void;
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
  const [hitNoteVanishes, setHitNoteVanishes] = useState<HitNoteVanish[]>([]);
  const [vanishingNoteIndexes, setVanishingNoteIndexes] = useState<Set<number>>(new Set());
  const [hitAnimation, setHitAnimation] = useState<HitAnimation | null>(null);
  const [songHitEffect, setSongHitEffect] = useState<SongHitEffect | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const songHitVideoRef = useRef<HTMLVideoElement | null>(null);
  const hitNotesRef = useRef<Set<number>>(new Set());
  const missNotesRef = useRef<Set<number>>(new Set());
  const vanishingNoteIndexesRef = useRef<Set<number>>(new Set());
  const rapidProgressRef = useRef<Record<number, number>>({});
  const activeHoldRef = useRef<{ index: number; timer: number; key?: string } | null>(null);
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
  const hitNoteVanishIdRef = useRef(0);
  const songHitQueueRef = useRef<SongHitEffect[]>([]);
  const songHitActiveRef = useRef(false);
  const songHitStartTimerRef = useRef<number | null>(null);
  const songHitFinishTimerRef = useRef<number | null>(null);
  const songHitFallbackTimerRef = useRef<number | null>(null);
  const usedItemCountsRef = useRef<Record<string, number>>({});
  const consumedItemIdsRef = useRef<string[]>([]);
  const playableItems = items.filter((item) => (itemInventory[item.id] ?? 0) > 0);
  const selectedItems = playableItems.filter((item) => selectedItemIds.has(item.id));

  function toggleSelectedItem(itemId: string) {
    if (running) return;
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function consumeItemEffect(effect: ItemEffectType) {
    const item = selectedItems.find((candidate) => {
      const used = usedItemCountsRef.current[candidate.id] ?? 0;
      const owned = itemInventory[candidate.id] ?? 0;
      return candidate.effect === effect && used < candidate.maxUses && used < owned;
    });
    if (!item) return undefined;
    usedItemCountsRef.current[item.id] = (usedItemCountsRef.current[item.id] ?? 0) + 1;
    consumedItemIdsRef.current.push(item.id);
    showJudgeFeedback(itemEffectLabel(item.effect));
    return item;
  }

  useEffect(() => {
    if (!songHitEffect || songHitEffect.mediaKind !== "video") return;
    const video = songHitVideoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.playbackRate = 1;
    void video.play();
    if (songHitFallbackTimerRef.current !== null) window.clearTimeout(songHitFallbackTimerRef.current);
    songHitFallbackTimerRef.current = window.setTimeout(() => finishSongHitEffect(), songHitVideoFallbackMs);
  }, [songHitEffect, song.hitAnimationType, song.hitAnimationUrl]);

  useEffect(() => {
    if (!songHitEffect || songHitEffect.mediaKind !== "image") return;
    if (songHitFinishTimerRef.current !== null) window.clearTimeout(songHitFinishTimerRef.current);
    songHitFinishTimerRef.current = window.setTimeout(() => finishSongHitEffect(), songHitImagePlaybackMs);
  }, [songHitEffect]);

  useEffect(() => {
    return () => {
      if (judgeTimerRef.current !== null) window.clearTimeout(judgeTimerRef.current);
      clearActiveHold(false);
      clearSongHitTimers();
    };
  }, []);

  useEffect(() => {
    clearSongHitTimers();
    songHitQueueRef.current = [];
    songHitActiveRef.current = false;
    setSongHitEffect(null);
  }, [song.id]);

  function showJudgeFeedback(value: string) {
    if (judgeTimerRef.current !== null) window.clearTimeout(judgeTimerRef.current);
    setJudge(value);
    judgeTimerRef.current = window.setTimeout(() => {
      setJudge(null);
      judgeTimerRef.current = null;
    }, judgeVisibleMs);
  }

  function playHitNoteVanish(note: Note, index: number) {
    if (hitNoteVanishMode === "off") return;
    const id = hitNoteVanishIdRef.current + 1;
    hitNoteVanishIdRef.current = id;
    const hitTime = (audioRef.current?.currentTime ?? time) + offsetMs / 1000;
    vanishingNoteIndexesRef.current.add(index);
    setVanishingNoteIndexes(new Set(vanishingNoteIndexesRef.current));
    setHitNoteVanishes((current) => [...current, { id, index, note, hitTime }].slice(-6));
    window.setTimeout(() => {
      setHitNoteVanishes((current) => current.filter((item) => item.id !== id));
      vanishingNoteIndexesRef.current.delete(index);
      setVanishingNoteIndexes(new Set(vanishingNoteIndexesRef.current));
    }, HIT_NOTE_VANISH_SECONDS * 1000);
  }

  function clearActiveHold(markMiss = false, key?: string) {
    const active = activeHoldRef.current;
    if (!active) return;
    if (key && active.key && active.key !== key) return;
    window.clearTimeout(active.timer);
    activeHoldRef.current = null;
    if (markMiss && !hitNotesRef.current.has(active.index) && !missNotesRef.current.has(active.index)) {
      const note = chart.notes[active.index];
      if (note && rescueMissWithItem(note, active.index)) return;
      markNoteMiss(active.index);
      const protectedCombo = protectComboWithItem();
      if (!protectedCombo) comboRef.current = 0;
      setCombo(comboRef.current);
      if (!protectedCombo) {
        showJudgeFeedback("MISS");
        playHitAnimation("miss", "MISS");
        playSongHitEffect("MISS");
      }
    }
  }

  function clearSongHitTimers() {
    if (songHitStartTimerRef.current !== null) window.clearTimeout(songHitStartTimerRef.current);
    if (songHitFinishTimerRef.current !== null) window.clearTimeout(songHitFinishTimerRef.current);
    if (songHitFallbackTimerRef.current !== null) window.clearTimeout(songHitFallbackTimerRef.current);
    songHitStartTimerRef.current = null;
    songHitFinishTimerRef.current = null;
    songHitFallbackTimerRef.current = null;
  }

  function scheduleNextSongHitEffect() {
    if (songHitActiveRef.current || songHitStartTimerRef.current !== null || !songHitQueueRef.current.length) return;
    const nextStartAt = songHitQueueRef.current[0]?.startAt ?? Date.now();
    const delayMs = Math.max(0, nextStartAt - Date.now());
    songHitStartTimerRef.current = window.setTimeout(() => {
      songHitStartTimerRef.current = null;
      if (songHitActiveRef.current) return;
      const next = songHitQueueRef.current.shift();
      if (!next) return;
      songHitActiveRef.current = true;
      setSongHitEffect(next);
    }, delayMs);
  }

  function accelerateCurrentSongHitEffect(deadlineAt: number) {
    if (!songHitActiveRef.current || !songHitEffect) return;
    const remainingMs = Math.max(0, deadlineAt - Date.now());
    if (songHitFinishTimerRef.current !== null) window.clearTimeout(songHitFinishTimerRef.current);
    songHitFinishTimerRef.current = window.setTimeout(() => finishSongHitEffect(), remainingMs);

    if (songHitEffect.mediaKind !== "video") return;
    const video = songHitVideoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const remainingSeconds = Math.max(video.duration - video.currentTime, 0.01);
    const targetSeconds = Math.max(remainingMs / 1000, 0.01);
    try {
      video.playbackRate = Math.max(1, remainingSeconds / targetSeconds);
      void video.play();
    } catch {
      video.playbackRate = 16;
    }
  }

  function finishSongHitEffect() {
    if (songHitFinishTimerRef.current !== null) window.clearTimeout(songHitFinishTimerRef.current);
    if (songHitFallbackTimerRef.current !== null) window.clearTimeout(songHitFallbackTimerRef.current);
    songHitFinishTimerRef.current = null;
    songHitFallbackTimerRef.current = null;
    if (songHitVideoRef.current) songHitVideoRef.current.playbackRate = 1;
    songHitActiveRef.current = false;
    setSongHitEffect(null);
    scheduleNextSongHitEffect();
  }

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = () => {
      const now = audioRef.current?.currentTime ?? 0;
      setTime(now);
      let addedMiss = false;
      chart.notes.forEach((note, index) => {
        if (
          note.time < now - hitWindows.miss &&
          activeHoldRef.current?.index !== index &&
          !hitNotesRef.current.has(index) &&
          !missNotesRef.current.has(index)
        ) {
          if (rescueMissWithItem(note, index)) {
            addedMiss = true;
            return;
          }
          missNotesRef.current.add(index);
          if (!protectComboWithItem()) comboRef.current = 0;
          addedMiss = true;
        }
      });
      if (addedMiss) {
        setHitNotes(new Set(hitNotesRef.current));
        setMissNotes(new Set(missNotesRef.current));
        setCombo(comboRef.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chart.notes, running]);

  useEffect(() => {
    if (!running) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      handleHitInput({ source: "keyboard", key: event.key, phase: "down" });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      handleHitInput({ source: "keyboard", key: event.key, phase: "up" });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [chart.notes, hitNoteVanishMode, offsetMs, running]);

  function start() {
    clearActiveHold(false);
    hitNotesRef.current = new Set();
    missNotesRef.current = new Set();
    vanishingNoteIndexesRef.current = new Set();
    rapidProgressRef.current = {};
    usedItemCountsRef.current = {};
    consumedItemIdsRef.current = [];
    selectedItems
      .filter((item) => item.effect === "score_boost" && (itemInventory[item.id] ?? 0) > 0)
      .forEach((item) => {
        usedItemCountsRef.current[item.id] = 1;
        consumedItemIdsRef.current.push(item.id);
      });
    scoreRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    perfectRef.current = 0;
    goodRef.current = 0;
    okRef.current = 0;
    finishedRef.current = false;
    setHitNotes(new Set(hitNotesRef.current));
    setMissNotes(new Set(missNotesRef.current));
    setVanishingNoteIndexes(new Set(vanishingNoteIndexesRef.current));
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setPerfect(0);
    setGood(0);
    setOk(0);
    setFinished(false);
    setJudge(null);
    setHitNoteVanishes([]);
    setHitAnimation(null);
    clearSongHitTimers();
    songHitQueueRef.current = [];
    songHitActiveRef.current = false;
    setSongHitEffect(null);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
    }
    setRunning(true);
  }

  function playHitAnimation(noteType: NoteType | "miss", judgment: string) {
    if (!characterHitSetting.enabled) return;
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
    if (!song.hitAnimationEnabled || !song.hitAnimationUrl) return;
    const id = songHitEffectIdRef.current + 1;
    songHitEffectIdRef.current = id;
    const mediaKind = inferHitAnimationMediaKind(song.hitAnimationUrl, song.hitAnimationType);
    const nextEffect: SongHitEffect = {
      id,
      judgment,
      mediaKind,
      animationUrl: withReplayToken(song.hitAnimationUrl, id, mediaKind),
      startAt: song.hitAnimationPlaybackMode === "instant" ? Date.now() : Date.now() + songHitStartDelayMs
    };

    if (song.hitAnimationPlaybackMode === "instant") {
      clearSongHitTimers();
      songHitQueueRef.current = [];
      songHitActiveRef.current = true;
      setSongHitEffect(nextEffect);
      return;
    }

    songHitQueueRef.current.push(nextEffect);
    const startAt = nextEffect.startAt;
    accelerateCurrentSongHitEffect(startAt);
    scheduleNextSongHitEffect();
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
        | "hitAnimationPlaybackMode"
        | "hitAnimationEnabled"
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

  function rescueMissWithItem(note: Note, index: number) {
    const item = consumeItemEffect("miss_guard");
    if (!item) return false;
    markNoteHit(index);
    scoreRef.current += scoreForNote(note, hitWindows.good, comboRef.current, "OK", scoreBoostRate(selectedItems));
    okRef.current += 1;
    comboRef.current += 1;
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
    setScore(scoreRef.current);
    setOk(okRef.current);
    setCombo(comboRef.current);
    setMaxCombo(maxComboRef.current);
    playHitNoteVanish(note, index);
    playHitAnimation(note.type, item.name);
    playSongHitEffect("OK");
    return true;
  }

  function protectComboWithItem() {
    const item = consumeItemEffect("combo_guard");
    if (!item) return false;
    playHitAnimation("miss", item.name);
    playSongHitEffect(item.name);
    return true;
  }

  function inputMatchesNote(note: Note, input: HitInput) {
    const kind = noteInputKind(note);
    if (kind === "tap" || kind === "rapid") return input.phase === "down";
    if (input.source !== "keyboard") return false;
    return normalizeInputKey(input.key ?? "") === normalizeInputKey(note.inputKey ?? "");
  }

  function completeNoteHit(target: { note: Note; index: number; delta: number }) {
    markNoteHit(target.index);
    playHitNoteVanish(target.note, target.index);
    setHitFlash(target.index);
    window.setTimeout(() => setHitFlash(null), 120);
    const comboBeforeHit = comboRef.current;
    const isPerfect = target.delta <= hitWindows.perfect;
    const isGood = target.delta <= hitWindows.good;
    const judgment: HitJudgment = isPerfect ? "PERFECT" : isGood ? "GOOD" : "OK";
    scoreRef.current += scoreForNote(target.note, target.delta, comboBeforeHit, judgment, scoreBoostRate(selectedItems));
    comboRef.current += 1;
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
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
  }

  function handleHitInput(input: HitInput) {
    if (!running || finishedRef.current) return;
    if (input.phase === "up") {
      clearActiveHold(true, normalizeInputKey(input.key ?? ""));
      return;
    }
    const now = (audioRef.current?.currentTime ?? 0) + offsetMs / 1000;
    const pendingNotes = chart.notes
      .map((note, index) => ({ note, index, delta: Math.abs(note.time - now) }))
      .filter(
        ({ note, index, delta }) =>
          !hitNotesRef.current.has(index) &&
          !missNotesRef.current.has(index) &&
          delta <= hitWindows.ok &&
          inputMatchesNote(note, input)
      )
      .sort((a, b) => a.delta - b.delta);
    const target = pendingNotes[0];

    if (!target) {
      const protectedCombo = protectComboWithItem();
      if (!protectedCombo) comboRef.current = 0;
      setCombo(comboRef.current);
      if (!protectedCombo) showJudgeFeedback("MISS");
      if (!protectedCombo) {
        playHitAnimation("miss", "MISS");
        playSongHitEffect("MISS");
      }
      return;
    }

    const kind = noteInputKind(target.note);
    if (kind === "rapid") {
      const required = Math.max(2, target.note.requiredHits ?? 3);
      const next = Math.min(required, (rapidProgressRef.current[target.index] ?? 0) + 1);
      rapidProgressRef.current[target.index] = next;
      showJudgeFeedback(next >= required ? "RAPID OK" : `RAPID ${next}/${required}`);
      if (next < required) return;
      delete rapidProgressRef.current[target.index];
      completeNoteHit(target);
      return;
    }

    if (kind === "hold") {
      clearActiveHold(false);
      showJudgeFeedback("HOLD");
      const timer = window.setTimeout(() => {
        if (activeHoldRef.current?.index !== target.index) return;
        activeHoldRef.current = null;
        completeNoteHit(target);
      }, Math.max(100, target.note.holdMs ?? 600));
      activeHoldRef.current = { index: target.index, timer, key: normalizeInputKey(input.key ?? "") };
      return;
    }

    completeNoteHit(target);
  }

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearSongHitTimers();
    songHitQueueRef.current = [];
    songHitActiveRef.current = false;
    setSongHitEffect(null);
    setRunning(false);
    setFinished(true);
    const finalMiss = Math.max(chart.notes.length - hitNotesRef.current.size, missNotesRef.current.size);
    const theoreticalScore = theoreticalScoreFor(chart.notes, scoreBoostRate(selectedItems));
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
    }, consumedItemIdsRef.current);
  }

  const visibleNotes = chart.notes
    .map((note, index) => ({ note, index, dt: note.time - time }))
    .filter(
      ({ dt, index }) =>
        dt < 2.1 &&
        dt > -hitWindows.miss &&
        !vanishingNoteIndexesRef.current.has(index) &&
        !hitNotesRef.current.has(index) &&
        !missNotesRef.current.has(index) &&
        !vanishingNoteIndexes.has(index) &&
        !hitNotes.has(index) &&
        !missNotes.has(index)
    );
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
      : songHitEffect
        ? songHitEffect.animationUrl
        : song.hitAnimationUrl
          ? withReplayToken(song.hitAnimationUrl, songHitEffectIdRef.current, "image")
        : "";
  const resultTheoreticalScore = theoreticalScoreFor(chart.notes, scoreBoostRate(selectedItems));
  const resultScorePercentile = scorePercentile(score, resultTheoreticalScore);
  const resultAverageNoteMultiplier = averageNoteScoreMultiplier(chart.notes);
  const resultMaxComboRate = comboScoreMultiplier(Math.max(maxCombo - 1, 0));
  const resultBoostRate = scoreBoostRate(selectedItems);
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
  const noteTravel = (dt: number) => {
    const progress = 1 - dt / 2.1;
    return {
      left: `${96 + (92 - 96) * progress}%`,
      translateX: `-${progress * 82}vw`
    };
  };
  const noteStyle = (note: Note, dt: number): React.CSSProperties => {
    const travel = noteTravel(dt);
    return {
      left: travel.left,
      transform: `translateX(${travel.translateX})`,
      "--hold-note-width": noteHoldVisualWidth(note) ? `${noteHoldVisualWidth(note)}px` : undefined
    } as React.CSSProperties;
  };
  const noteVanishStyle = (vanish: HitNoteVanish): React.CSSProperties => {
    const travel = noteTravel(vanish.note.time - vanish.hitTime);
    const endTravel = noteTravel(vanish.note.time - (vanish.hitTime + HIT_NOTE_VANISH_SECONDS));
    return {
      "--note-vanish-left-start": travel.left,
      "--note-vanish-left-end": endTravel.left,
      "--note-vanish-x-start": travel.translateX,
      "--note-vanish-x-end": endTravel.translateX,
      "--hold-note-width": noteHoldVisualWidth(vanish.note) ? `${noteHoldVisualWidth(vanish.note)}px` : undefined
    } as React.CSSProperties;
  };

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
      onPointerDown={() => handleHitInput({ source: "pointer", phase: "down" })}
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
      {song.hitAnimationEnabled && song.hitAnimationUrl && (
        <div
          className={`songHitEffect songHitEffect-${song.hitAnimationLayer ?? "front"} ${songHitEffect ? "playing" : ""}`}
          style={songHitEffectStyle(song)}
          onPointerDown={dragSongHitEffect}
          onWheel={resizeSongHitEffect}
          aria-label={song.hitAnimationName ?? "楽曲判定演出"}
        >
          {songHitMediaKind === "video" ? (
            <video
              key={songHitEffect?.id ?? "song-hit-idle"}
              ref={songHitVideoRef}
              className="songHitEffectMedia"
              src={songHitEffect?.animationUrl ?? song.hitAnimationUrl}
              muted
              playsInline
              preload="auto"
              onEnded={finishSongHitEffect}
            />
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
        {hitNoteVanishes.map((vanish) => (
          <div key={vanish.id} className={`hitNoteVanish note ${vanish.note.type} note-${noteInputKind(vanish.note)} keyNote-${keyNoteVisualMode} marker-${markerCharacter.theme}`} style={noteVanishStyle(vanish)}>
            {noteInputKind(vanish.note) === "key" && <b className="noteKeyGlyph">{formatInputKey(vanish.note.inputKey)}</b>}
            {noteInputKind(vanish.note) !== "key" && <span>{noteInputKind(vanish.note) === "tap" ? markerCharacter.marker.label : noteInputDetail(vanish.note)}</span>}
          </div>
        ))}
        {visibleNotes.map(({ note, index, dt }) => (
          <div
            key={index}
            className={`note ${note.type} note-${noteInputKind(note)} keyNote-${keyNoteVisualMode} marker-${markerCharacter.theme}`}
            style={noteStyle(note, dt)}
          >
            {noteInputKind(note) === "key" && <b className="noteKeyGlyph">{formatInputKey(note.inputKey)}</b>}
            {noteInputKind(note) !== "key" && <span>{noteInputKind(note) === "tap" ? markerCharacter.marker.label : noteInputDetail(note)}</span>}
          </div>
        ))}
      </div>
      <button className="tapPad">TAP / CLICK</button>
      {!running && !finished && playableItems.length > 0 && (
        <div className="preLiveItems" onPointerDown={(event) => event.stopPropagation()}>
          <strong>使用アイテム</strong>
          <div className="preLiveItemList">
            {playableItems.map((item) => {
              const selected = selectedItemIds.has(item.id);
              return (
                <button key={item.id} className={selected ? "selected" : ""} onClick={() => toggleSelectedItem(item.id)}>
                  <img src={item.iconUrl} alt="" />
                  <span>{item.name}</span>
                  <small>{itemEffectLabel(item.effect)} / 所持 {itemInventory[item.id] ?? 0}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}
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
              <div><small>特殊補正</small><b>x{resultAverageNoteMultiplier.toFixed(2)}</b></div>
              <div><small>コンボ倍率</small><b>x{resultMaxComboRate.toFixed(2)}</b></div>
              <div><small>アイテム倍率</small><b>x{resultBoostRate.toFixed(2)}</b></div>
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
        | "hitAnimationPlaybackMode"
        | "hitAnimationEnabled"
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
              <label>
                楽曲叩く演出
                <select value={song.hitAnimationEnabled ? "on" : "off"} onChange={(event) => updateSongHitSettings({ hitAnimationEnabled: event.target.value === "on" })}>
                  <option value="off">OFF</option>
                  <option value="on">ON</option>
                </select>
              </label>
              <label>叩く演出ファイル<input type="file" accept="image/gif,image/png,image/webp,image/jpeg,video/mp4,video/webm,video/ogg,.gif,.mp4,.webm,.ogg,.ogv,.mov,.m4v" onChange={(event) => void updateSongHitFile(event.target.files?.[0])} /></label>
              <small>{song.hitAnimationName ? `選択中: ${song.hitAnimationName}` : "楽曲に紐づく叩く演出をここで選択します。"}</small>
              <label>
                再生方式
                <select value={song.hitAnimationPlaybackMode ?? "delayed"} onChange={(event) => updateSongHitSettings({ hitAnimationPlaybackMode: event.target.value as SongHitPlaybackMode })}>
                  <option value="delayed">100ms調整再生</option>
                  <option value="instant">叩いた瞬間に再生</option>
                </select>
              </label>
              <label>前後<select value={song.hitAnimationLayer ?? "front"} onChange={(event) => updateSongHitSettings({ hitAnimationLayer: event.target.value as HitAnimationLayer })}>{(Object.keys(hitAnimationLayerLabels) as HitAnimationLayer[]).map((layer) => <option key={layer} value={layer}>{hitAnimationLayerLabels[layer]}</option>)}</select></label>
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
                  <label>
                    キャラ叩く演出
                    <select value={characterHitSetting.enabled ? "on" : "off"} onChange={(event) => updateCharacterHitSetting({ enabled: event.target.value === "on" })}>
                      <option value="off">OFF</option>
                      <option value="on">ON</option>
                    </select>
                  </label>
                  <small>叩く演出画像はメモリアルの「演奏」キャラクター画像を使用します。</small>
                  <label>前後<select value={characterHitSetting.layer} onChange={(event) => updateCharacterHitSetting({ layer: event.target.value as HitAnimationLayer })}>{(Object.keys(hitAnimationLayerLabels) as HitAnimationLayer[]).map((layer) => <option key={layer} value={layer}>{hitAnimationLayerLabels[layer]}</option>)}</select></label>
                  <label>サイズ {characterHitSetting.size}%<input type="range" min="30" max="220" step="5" value={characterHitSetting.size} onChange={(event) => updateCharacterHitSetting({ size: Number(event.target.value) })} /></label>
                </>
              ) : (
                <>
                  <label>待機画像URL<input value={characterHitSetting.idleImageUrl ?? ""} onChange={(event) => updateCharacterHitSetting({ idleImageUrl: event.target.value || undefined })} placeholder={playCharacter.illustrations.play} /></label>
                  <label>前後<select value={characterHitSetting.idleLayer ?? characterHitSetting.layer} onChange={(event) => updateCharacterHitSetting({ idleLayer: event.target.value as HitAnimationLayer })}>{(Object.keys(hitAnimationLayerLabels) as HitAnimationLayer[]).map((layer) => <option key={layer} value={layer}>{hitAnimationLayerLabels[layer]}</option>)}</select></label>
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

function Missions({
  records,
  items,
  claimedMissionIds,
  navigate
}: {
  records: PlayRecord[];
  items: GameItem[];
  claimedMissionIds: string[];
  navigate: (screen: Screen) => void;
}) {
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
          const rewardItem = findItem(items, mission.rewardItemId);
          const rewardClaimed = claimedMissionIds.includes(mission.id);
          return (
            <article key={mission.id} className={`missionCard ${clearedMission ? "cleared" : ""}`}>
              <div className="missionState">{clearedMission ? rewardClaimed ? "GET" : "CLEAR" : "挑戦中"}</div>
              <div>
                <strong>{mission.title}</strong>
                <span>{mission.detail}</span>
                {rewardItem && <em>報酬: {rewardItem.name} x{mission.rewardAmount}</em>}
              </div>
              <small>
                {Math.min(mission.current, mission.target).toLocaleString()} / {mission.target.toLocaleString()} {mission.unit}
              </small>
              <div className="missionProgress" aria-label={`${mission.title} progress`}>
                <span style={{ width: `${progress * 100}%` }} />
              </div>
              {clearedMission && <b>{rewardClaimed ? "報酬受取済み" : "報酬付与中"}</b>}
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
  const normalizedToken = token.replace(/\\/g, "/").toLowerCase();
  const bareToken = normalizedToken.replace(/^\/+/, "");
  const directBackground =
    storyBackgrounds.get(normalizedToken) ??
    storyBackgrounds.get(bareToken) ??
    storyBackgrounds.get(`/${bareToken}`) ??
    storyBackgrounds.get(bareToken.split("/").pop() ?? "");
  if (directBackground) return directBackground;
  if (token.startsWith("/") || token.startsWith("http")) return token;
  if (token.includes("教室") || token.toLowerCase().includes("classroom")) return "/assets/story-classroom.png";
  if (/\.(png|jpg|jpeg|webp)$/i.test(token)) return token.startsWith("assets/") ? `/${token}` : `/assets/${token}`;
  return fallback;
}

function resolveStoryPosition(value: string): StoryScene["characterPosition"] {
  const token = value.trim().toLowerCase().split(",")[0]?.trim() ?? "";
  if (["左", "left", "l"].includes(token)) return "left";
  if (["右", "right", "r"].includes(token)) return "right";
  if (["非表示", "none", "hidden", "hide", "off"].includes(token)) return "hidden";
  if (token.startsWith("x=") || token.includes("x:")) return "custom";
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
  if (expression) return storyExpressionImages.get(`${actor.id}:${expression}`) ?? `/assets/characters/${actor.id}/${actor.id}_story_${expression}.png`;
  const customExpression = storyExpressionImages.get(`${actor.id}:${normalizedState}`);
  if (customExpression) return customExpression;
  return actor.illustrations.story;
}

function normalizeStoryScale(value?: number) {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.round(clamp(value, 0.4, 2.2) * 100) / 100;
}

function parseStoryScale(text: string) {
  const scaleMatch = text.match(/(?:scale|size|拡大率|サイズ)\s*[:=]\s*(\d+(?:\.\d+)?)/i);
  return normalizeStoryScale(scaleMatch ? Number(scaleMatch[1]) : undefined);
}

function parseStoryFlipX(text: string) {
  const normalized = text.toLowerCase();
  if (/(?:flip|flipx|mirror|反転|左右反転)\s*[:=]\s*(?:off|false|no|0|なし)/i.test(normalized)) return false;
  if (/(?:flip|flipx|mirror|反転|左右反転)(?:\s*[:=]\s*(?:on|true|yes|1|あり))?/i.test(normalized)) return true;
  return undefined;
}

function createStoryPose(actor: Character, state: string, position: string, x?: number, y?: number, scale?: number, flipX?: boolean): StoryCharacterPose {
  return {
    id: actor.id,
    name: actor.name,
    illustration: resolveStoryIllustration(actor, state),
    characterState: state,
    characterPosition: x !== undefined || y !== undefined ? "custom" : resolveStoryPosition(position),
    characterX: x,
    characterY: y,
    characterScale: normalizeStoryScale(scale) ?? storyDefaultCharacterScale,
    characterFlipX: flipX
  };
}

function parseStoryCharacterPoses(actorText: string, state: string, position: string, fallbackCharacter: Character): StoryCharacterPose[] {
  const token = actorText.trim();
  if (!token || isNarrationSpeaker(token)) return [];
  if (["非表示", "none", "hidden", "hide", "off"].includes(token.toLowerCase())) return [];
  return token
    .split(/[|＋+]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [name = "", partState = "", partPosition = "", ...extras] = part.split(/[:：]/).map((value) => value.trim());
      const coordinateText = [partPosition, ...extras].join(",");
      const xMatch = coordinateText.match(/x\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
      const yMatch = coordinateText.match(/y\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
      const scale = parseStoryScale(coordinateText);
      const flipX = parseStoryFlipX(coordinateText);
      const actor = resolveStoryCharacter(name, fallbackCharacter);
      const fallbackPosition = index === 0 ? position : index === 1 ? "right" : "center";
      return createStoryPose(
        actor,
        partState || state,
        partPosition || fallbackPosition || "center",
        xMatch ? Number(xMatch[1]) : undefined,
        yMatch ? Number(yMatch[1]) : undefined,
        scale,
        flipX
      );
    });
}

function parseStoryCue(line: string, current: StoryScene, fallbackCharacter: Character): StoryScene {
  const cue = line.replace(/^\/+/, "").trim();
  const rawParts = cue.split(/[,、\t]/).map((part) => part.trim());
  const [background = ""] = rawParts;
  const actorSpecHasInlineDetail = rawParts[1]?.includes(":") || rawParts[1]?.includes("|");
  const [actorName = "", state = "", position = "", ...extras] = actorSpecHasInlineDetail ? [rawParts.slice(1).join(",")] : rawParts.slice(1);
  const hiddenActor = ["非表示", "none", "hidden", "hide", "off"].includes(actorName.trim().toLowerCase());
  const coordinateParts = [position, ...extras];
  const coordinateText = coordinateParts.join(",");
  const xMatch = coordinateText.match(/x\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  const yMatch = coordinateText.match(/y\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  const customX = xMatch ? Number(xMatch[1]) : undefined;
  const customY = yMatch ? Number(yMatch[1]) : undefined;
  const customScale = parseStoryScale(coordinateText);
  const customFlipX = parseStoryFlipX(coordinateText);
  const actor = actorName && !hiddenActor && !isNarrationSpeaker(actorName) ? resolveStoryCharacter(actorName, fallbackCharacter) : fallbackCharacter;
  const storyCharacters = hiddenActor ? [] : parseStoryCharacterPoses(actorName, state, position, fallbackCharacter);
  const firstCharacterPatch = {
    ...(customX !== undefined || customY !== undefined ? { characterPosition: "custom" as const, characterX: customX, characterY: customY } : {}),
    ...(customScale !== undefined ? { characterScale: customScale } : {}),
    ...(customFlipX !== undefined ? { characterFlipX: customFlipX } : {})
  };
  return {
    ...current,
    background: resolveStoryBackground(background, current.background),
    illustration: hiddenActor ? "" : resolveStoryIllustration(actor, state),
    characterState: state,
    characterPosition: hiddenActor ? "hidden" : customX !== undefined || customY !== undefined ? "custom" : resolveStoryPosition(position || (actorName ? "center" : current.characterPosition)),
    characterX: customX ?? current.characterX,
    characterY: customY ?? current.characterY,
    characterScale: customScale ?? current.characterScale,
    characterFlipX: customFlipX ?? current.characterFlipX,
    characters: storyCharacters.length
      ? storyCharacters.map((item, index) => index === 0 ? { ...item, ...firstCharacterPatch } : item)
      : hiddenActor
        ? []
        : current.characters
  };
}

function parseStoryDifficulty(value: string): DifficultyKey | undefined {
  const normalized = value.trim().toLowerCase();
  if ((Object.keys(difficulties) as DifficultyKey[]).includes(normalized as DifficultyKey)) return normalized as DifficultyKey;
  return (Object.keys(difficulties) as DifficultyKey[]).find((key) => difficulties[key].label.toLowerCase() === normalized);
}

function parseStoryLiveSettingKey(rawKey: string) {
  return rawKey.trim().toLowerCase().replace(/\s+/g, "");
}

function parseStoryDirective(line: string) {
  const content = line.replace(/^[#@]+/, "").replace(/[：=]/g, ":").trim();
  const keyValue = content.match(/^([^:]+):\s*(.*)$/);
  if (keyValue) {
    const key = parseStoryLiveSettingKey(keyValue[1]);
    const value = keyValue[2].trim();
    if (["title", "タイトル", "storytitle"].includes(key)) return { handled: true, title: value };
    if (["subtitle", "サブタイトル", "storysubtitle"].includes(key)) return { handled: true, subtitle: value };
    if (["livesong", "song", "楽曲", "演奏楽曲"].includes(key)) return { handled: true, liveSettings: { song: value } as StoryLiveSettings };
    if (["livedifficulty", "difficulty", "難易度", "演奏難易度"].includes(key)) return { handled: true, liveSettings: { difficulty: parseStoryDifficulty(value) } as StoryLiveSettings };
    if (["livestage", "stagebackground", "livebackground", "ステージ背景", "演奏背景"].includes(key)) return { handled: true, liveSettings: { stageBackground: resolveStoryBackground(value, value) } as StoryLiveSettings };
    if (["characterhit", "characterhitanimation", "キャラ叩く演出", "キャラ演出"].includes(key)) return { handled: true, liveSettings: { characterHitAnimation: value } as StoryLiveSettings };
    if (["songhit", "songhitanimation", "楽曲叩く演出", "楽曲演出"].includes(key)) return { handled: true, liveSettings: { songHitAnimation: value, songHitEnabled: Boolean(value) } as StoryLiveSettings };
    if (["songhitlayer", "楽曲演出前後"].includes(key)) return { handled: true, liveSettings: { songHitLayer: value === "back" || value === "奥" ? "back" : "front" } as StoryLiveSettings };
    if (["songhitsize", "楽曲演出サイズ"].includes(key)) return { handled: true, liveSettings: { songHitSize: Number(value) || undefined } as StoryLiveSettings };
  }
  const normalized = line
    .replace(/^[#@]+/, "")
    .replace(/[：=]/g, ":")
    .trim()
    .toLowerCase();
  const compact = normalized.replace(/\s+/g, "");
  if (!compact) return { handled: false, goLiveAfterEnd: false };
  const liveKeywords = ["after:live", "afterlive", "live:on", "live:true", "live:yes", "live", "ライブへ:on", "ライブへ:true", "ライブへ", "ライブ接続:on", "ライブ接続"];
  const stayKeywords = ["after:home", "after:none", "live:off", "live:false", "live:no", "ライブへ:off", "ライブへ:false", "ライブ接続:off"];
  if (liveKeywords.some((keyword) => compact.includes(keyword))) return { handled: true, goLiveAfterEnd: true };
  if (stayKeywords.some((keyword) => compact.includes(keyword))) return { handled: true, goLiveAfterEnd: false };
  return { handled: line.startsWith("@"), goLiveAfterEnd: false };
}

function parseStoryScript(text: string, character: Character): StoryScriptData {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const scenes: StoryScene[] = [];
  let goLiveAfterEnd = false;
  let title = "";
  let subtitle = "";
  let liveSettings: StoryLiveSettings = {};
  let currentVisual: StoryScene = {
    speaker: "地の文",
    text: "",
    background: character.story[0]?.background ?? "/assets/story-classroom.png",
    illustration: character.illustrations.story,
    characterPosition: "center",
    characterScale: storyDefaultCharacterScale,
    characters: [createStoryPose(character, "", "center")]
  };

  rawLines.forEach((line) => {
    if (line.startsWith("@") || line.startsWith("#")) {
      const directive = parseStoryDirective(line);
      if (directive.handled) {
        if (typeof directive.goLiveAfterEnd === "boolean") goLiveAfterEnd = directive.goLiveAfterEnd;
        if (directive.title !== undefined) title = directive.title;
        if (directive.subtitle !== undefined) subtitle = directive.subtitle;
        if (directive.liveSettings) liveSettings = { ...liveSettings, ...directive.liveSettings };
      }
      return;
    }

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

  return { scenes, goLiveAfterEnd, title, subtitle, liveSettings, editedText: serializeStoryScript(scenes, goLiveAfterEnd, title, subtitle, liveSettings) };
}

function storyPositionToken(scene: StoryScene) {
  const base =
    scene.characterPosition === "custom"
      ? `x=${Math.round((scene.characterX ?? 50) * 10) / 10},y=${Math.round((scene.characterY ?? storyDefaultCharacterY) * 10) / 10}`
      : scene.characterPosition === "left"
        ? "left"
        : scene.characterPosition === "right"
          ? "right"
          : scene.characterPosition === "hidden"
            ? "hidden"
            : "center";
  const extras = [
    scene.characterScale !== undefined && scene.characterScale !== storyDefaultCharacterScale ? `scale=${Math.round(scene.characterScale * 100) / 100}` : "",
    scene.characterFlipX ? "flip" : ""
  ].filter(Boolean);
  return [base, ...extras].join(",");
}

function serializeStoryScript(scenes: StoryScene[], goLiveAfterEnd: boolean, title = "", subtitle = "", liveSettings: StoryLiveSettings = {}) {
  const lines = [
    "# edited story script",
    title ? `# title: ${title}` : "",
    subtitle ? `# subtitle: ${subtitle}` : "",
    goLiveAfterEnd ? "@after live" : "@live off",
    liveSettings.song ? `# live song: ${liveSettings.song}` : "",
    liveSettings.difficulty ? `# live difficulty: ${liveSettings.difficulty}` : "",
    liveSettings.stageBackground ? `# live stage: ${liveSettings.stageBackground}` : "",
    liveSettings.characterHitAnimation ? `# character hit: ${liveSettings.characterHitAnimation}` : "",
    liveSettings.songHitAnimation ? `# song hit: ${liveSettings.songHitAnimation}` : "",
    liveSettings.songHitLayer ? `# song hit layer: ${liveSettings.songHitLayer}` : "",
    liveSettings.songHitSize ? `# song hit size: ${liveSettings.songHitSize}` : "",
    ""
  ].filter((line) => line !== "");
  scenes.forEach((scene) => {
    const actor = scene.characters?.length
      ? scene.characters.map((item) => `${item.id}:${item.characterState ?? ""}:${storyPositionToken({
        ...scene,
        characterPosition: item.characterPosition,
        characterX: item.characterX,
        characterY: item.characterY,
        characterScale: item.characterScale,
        characterFlipX: item.characterFlipX
      })}`).join("|")
      : scene.speaker === "地の文" ? "" : scene.speaker;
    lines.push(`/${scene.background}, ${actor}, ${scene.characterState ?? ""}, ${storyPositionToken(scene)}`);
    lines.push(`${scene.speaker}: ${scene.text}`);
    lines.push("");
  });
  return lines.join("\n").trimEnd() + "\n";
}

type StoryScriptModuleEntry = {
  scope: string;
  base: string;
  version: number;
  fileName: string;
  text: string;
};

function isStoryShortBase(value: string) {
  return /^\d+-\d+$/.test(value);
}

function parseStoryScriptFileName(fileName: string, folderBase = "") {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const numbered = stem.match(/^(.+?)_(\d+)$/);
  if (numbered?.[1] && numbered[2]) {
    return { base: numbered[1], version: Number(numbered[2]) };
  }
  if (isStoryShortBase(stem)) return { base: stem, version: 0 };
  if (folderBase && isStoryShortBase(folderBase)) {
    const folderNumbered = stem.match(/(?:^|_)(\d+)$/);
    return { base: folderBase, version: folderNumbered?.[1] ? Number(folderNumbered[1]) : 0 };
  }
  return null;
}

function buildStoryScriptIndex() {
  const index = new Map<string, StoryScriptModuleEntry[]>();
  Object.entries(storyScriptModules).forEach(([path, text]) => {
    const relativePath = path.replace(/\\/g, "/").split("/assets/story/")[1];
    if (!relativePath) return;
    const parts = relativePath.split("/");
    const fileName = parts[parts.length - 1] ?? "";
    const folderBase = parts.slice(0, -1).find(isStoryShortBase) ?? "";
    const parsed = parseStoryScriptFileName(fileName, folderBase);
    if (!parsed) return;
    const firstFolder = parts.length > 1 ? parts[0] : "";
    const scope = firstFolder && !isStoryShortBase(firstFolder) ? firstFolder : "*";
    const key = `${scope}:${parsed.base}`;
    const entries = index.get(key) ?? [];
    entries.push({ scope, base: parsed.base, version: parsed.version, fileName, text });
    index.set(key, entries);
  });
  return index;
}

const storyScriptIndex = buildStoryScriptIndex();

function latestStoryScriptModule(characterId: string, base: string) {
  const scopedEntries = storyScriptIndex.get(`${characterId}:${base}`);
  const sharedEntries = storyScriptIndex.get(`*:${base}`);
  const entries = scopedEntries?.length ? scopedEntries : sharedEntries;
  if (!entries?.length) return undefined;
  return entries.reduce((latest, entry) => (entry.version > latest.version ? entry : latest), entries[0]);
}

function parseStoryScriptModule(entry: StoryScriptModuleEntry | undefined, character: Character): StoryScriptData | undefined {
  if (!entry) return undefined;
  const parsed = parseStoryScript(entry.text, character);
  return {
    ...parsed,
    sourceFileBase: entry.base,
    sourceVersion: entry.version,
    sourceFileName: entry.fileName
  };
}

function createStoryChapters(character: Character): StoryChapter[] {
  return Array.from({ length: 3 }, (_, chapterIndex) => ({
    id: `${character.id}-chapter-${chapterIndex + 1}`,
    title: `第${chapterIndex + 1}章 ${chapterIndex === 0 ? "放課後の音楽室" : chapterIndex === 1 ? "小さなライブ準備" : "本番前夜"}`,
    shorts: Array.from({ length: 12 }, (_, shortIndex) => {
      const number = chapterIndex * 12 + shortIndex + 1;
      const storyFileBase = `${chapterIndex + 1}-${shortIndex + 1}`;
      const importedScript = parseStoryScriptModule(latestStoryScriptModule(character.id, storyFileBase), character);
      return {
        id: `${character.id}-${number}`,
        title: `${String(number).padStart(2, "0")} ${character.name} 短編`,
        summary: importedScript?.sourceFileName
          ? `assets/story/${importedScript.sourceFileName} を読み込み済み`
          : `1つの .txt で差し替えられる ${character.role} の短編`,
        storyFileBase,
        storyFileVersion: importedScript?.sourceVersion ?? 0,
        storyFileName: importedScript?.sourceFileName,
        importedScript,
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

const storyImageChromaCache = new Map<string, Promise<string> | string>();

function hasGreenBackPixel(data: Uint8ClampedArray, index: number) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const greenLead = green - Math.max(red, blue);
  return green > 85 && greenLead > 34 && green > red * 1.22 && green > blue * 1.22;
}

function cropVisibleImageData(sourceCanvas: HTMLCanvasElement, sourceContext: CanvasRenderingContext2D) {
  const source = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const { data } = source;
  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const alpha = data[(y * sourceCanvas.width + x) * 4 + 3];
      if (alpha <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return sourceCanvas;
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropsMeaningfully = cropWidth < sourceCanvas.width * 0.96 || cropHeight < sourceCanvas.height * 0.96;
  if (!cropsMeaningfully) return sourceCanvas;
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  const croppedContext = croppedCanvas.getContext("2d");
  if (!croppedContext) return sourceCanvas;
  croppedContext.drawImage(sourceCanvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return croppedCanvas;
}

async function chromaKeyStoryImage(src: string) {
  if (!src) return "";
  const cached = storyImageChromaCache.get(src);
  if (cached) return cached;

  const task = new Promise<string>((resolve) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve(src);
          return;
        }
        context.drawImage(image, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;
        let greenPixels = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (hasGreenBackPixel(data, index)) greenPixels += 1;
        }
        const hasGreenBack = greenPixels / (canvas.width * canvas.height) >= 0.015;
        if (hasGreenBack) {
          for (let index = 0; index < data.length; index += 4) {
            if (!hasGreenBackPixel(data, index)) continue;
            const greenLead = data[index + 1] - Math.max(data[index], data[index + 2]);
            const alphaMultiplier = clamp((72 - greenLead) / 38, 0, 1);
            data[index + 3] = Math.round(data[index + 3] * alphaMultiplier);
            data[index] = Math.min(255, data[index] + 10);
            data[index + 1] = Math.min(data[index + 1], Math.max(data[index], data[index + 2]));
          }
          context.putImageData(imageData, 0, 0);
        }
        const croppedCanvas = cropVisibleImageData(canvas, context);
        resolve(croppedCanvas === canvas && !hasGreenBack ? src : croppedCanvas.toDataURL("image/png"));
      } catch {
        resolve(src);
      }
    };
    image.onerror = () => resolve(src);
    image.src = src;
  });

  storyImageChromaCache.set(src, task);
  const result = await task;
  storyImageChromaCache.set(src, result);
  return result;
}

function useChromaKeyedStoryImage(src: string) {
  const [processedSrc, setProcessedSrc] = useState(src);
  useEffect(() => {
    let cancelled = false;
    setProcessedSrc(src);
    if (!src) return;
    void chromaKeyStoryImage(src).then((nextSrc) => {
      if (!cancelled) setProcessedSrc(nextSrc);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);
  return processedSrc;
}

function StoryCharacterSprite({
  pose,
  index,
  positionCenters,
  onPointerDown
}: {
  pose: StoryCharacterPose;
  index: number;
  positionCenters: StoryPositionCenters;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}) {
  const image = useChromaKeyedStoryImage(pose.illustration);
  const characterX = pose.characterPosition === "custom" ? pose.characterX ?? 50 : positionCenters[pose.characterPosition];
  return (
    <div
      className={`storyCharacterLayer storyCharacter-${pose.characterPosition} storyCharacterSlot-${index}`}
      style={
        {
          "--story-image": image ? `url(${image})` : "none",
          "--story-character-x": `${characterX}%`,
          "--story-character-y": `${pose.characterY ?? storyDefaultCharacterY}%`,
          "--story-character-scale": pose.characterScale ?? storyDefaultCharacterScale,
          "--story-character-flip": pose.characterFlipX ? -1 : 1
        } as React.CSSProperties
      }
      onPointerDown={onPointerDown}
    />
  );
}

function ChromaKeyedMemorialImage({ src, alt }: { src: string; alt: string }) {
  const image = useChromaKeyedStoryImage(src);
  return <img src={image || src} alt={alt} />;
}

function ChromaKeyedMemorialPreview({ src }: { src: string }) {
  const image = useChromaKeyedStoryImage(src);
  return <span className="memorialImage" style={{ backgroundImage: characterPreviewBackground(image || src) }} />;
}

function readStoredStoryMarks() {
  try {
    const raw = window.localStorage.getItem(storyReadMarksStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

function StoryMode({
  character,
  navigate,
  autoDelayMs,
  applyLiveSettings
}: {
  character: Character;
  navigate: (screen: Screen) => void;
  autoDelayMs: number;
  applyLiveSettings: (settings: StoryLiveSettings) => void;
}) {
  const chapters = useMemo(() => createStoryChapters(character), [character]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [activeShortId, setActiveShortId] = useState<string | null>(null);
  const [chapter, setChapter] = useState(0);
  const [shortScripts, setShortScripts] = useState<Record<string, StoryScriptData>>({});
  const [autoPlay, setAutoPlay] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [editStoryLayout, setEditStoryLayout] = useState(false);
  const [storyPositionCenters, setStoryPositionCenters] = useState<StoryPositionCenters>(storyDefaultPositionCenters);
  const [draftStoryPositionCenters, setDraftStoryPositionCenters] = useState<StoryPositionCenters>(storyDefaultPositionCenters);
  const [storySaveVersions, setStorySaveVersions] = useState<Record<string, number>>({});
  const [readStoryMarks, setReadStoryMarks] = useState<Record<string, boolean>>(() => readStoredStoryMarks());
  const currentChapter = chapters[chapterIndex] ?? chapters[0];
  const activeShort = currentChapter.shorts.find((item) => item.id === activeShortId) ?? currentChapter.shorts[0];
  const loadedScript = activeShortId ? shortScripts[activeShortId] : undefined;
  const activeScript = loadedScript?.scenes.length ? loadedScript : activeShort.importedScript;
  const scenes = activeScript?.scenes.length ? activeScript.scenes : activeShort.scenes;
  const goLiveAfterEnd = Boolean(activeScript?.goLiveAfterEnd);
  const storyTitle = activeScript?.title || activeShort.title;
  const storySubtitle = activeScript?.subtitle || activeShort.summary;
  const storyLiveSettings = activeScript?.liveSettings ?? {};
  const scene = scenes[chapter] ?? scenes[0];
  const sceneCharacters = scene.characters?.length
    ? scene.characters
    : scene.illustration
      ? [{
        id: character.id,
        name: character.name,
        illustration: scene.illustration,
        characterState: scene.characterState,
        characterPosition: scene.characterPosition,
        characterX: scene.characterPosition === "custom" ? scene.characterX ?? 50 : undefined,
        characterY: scene.characterY ?? storyDefaultCharacterY,
        characterScale: scene.characterScale ?? storyDefaultCharacterScale,
        characterFlipX: scene.characterFlipX
      }]
      : [];

  function goStoryLive() {
    applyLiveSettings(storyLiveSettings);
    navigate("live");
  }

  function markStoryRead(shortId: string) {
    setReadStoryMarks((current) => {
      if (current[shortId]) return current;
      const next = { ...current, [shortId]: true };
      try {
        window.localStorage.setItem(storyReadMarksStorageKey, JSON.stringify(next));
      } catch {
        // localStorage may be blocked; the in-memory mark is still useful for this session.
      }
      return next;
    });
  }

  function completeActiveStory() {
    if (!activeShortId) return;
    markStoryRead(activeShortId);
    setAutoPlay(false);
    if (goLiveAfterEnd) {
      goStoryLive();
      return;
    }
    setActiveShortId(null);
    setChapter(0);
    setShowLog(false);
    setEditStoryLayout(false);
  }

  useEffect(() => {
    setChapterIndex(0);
    setActiveShortId(null);
    setChapter(0);
    setShortScripts({});
    setAutoPlay(false);
    setShowLog(false);
    setEditStoryLayout(false);
    setStoryPositionCenters(storyDefaultPositionCenters);
    setDraftStoryPositionCenters(storyDefaultPositionCenters);
    setStorySaveVersions({});
  }, [character.id]);

  useEffect(() => {
    if (!autoPlay) return;
    if (chapter >= scenes.length - 1) {
      const timer = window.setTimeout(completeActiveStory, autoDelayMs);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setChapter((value) => Math.min(value + 1, scenes.length - 1)), autoDelayMs);
    return () => window.clearTimeout(timer);
  }, [autoPlay, chapter, activeShortId, autoDelayMs, goLiveAfterEnd, scenes.length, storyLiveSettings]);

  async function loadStoryFile(shortId: string, file?: File) {
    if (!file) return;
    const text = await file.text();
    const fallbackShort = chapters.flatMap((item) => item.shorts).find((item) => item.id === shortId);
    const parsedFileName = parseStoryScriptFileName(file.name);
    const parsed = {
      ...parseStoryScript(text, character),
      sourceFileBase: parsedFileName?.base ?? fallbackShort?.storyFileBase,
      sourceVersion: parsedFileName?.version ?? fallbackShort?.storyFileVersion ?? 0,
      sourceFileName: file.name
    };
    setShortScripts((current) => ({ ...current, [shortId]: parsed }));
    setChapter(0);
  }

  function goNextScene() {
    if (chapter >= scenes.length - 1) {
      completeActiveStory();
      return;
    }
    setChapter((value) => Math.min(value + 1, scenes.length - 1));
  }

  function skipStory() {
    completeActiveStory();
  }

  function updateCurrentStoryScene(patch: Partial<StoryScene>) {
    if (!activeShortId) return;
    const nextScenes = scenes.map((item, index) => (index === chapter ? { ...item, ...patch } : item));
    setShortScripts((current) => ({
      ...current,
      [activeShortId]: {
        scenes: nextScenes,
        goLiveAfterEnd,
        title: activeScript?.title,
        subtitle: activeScript?.subtitle,
        liveSettings: storyLiveSettings,
        editedText: serializeStoryScript(nextScenes, goLiveAfterEnd, activeScript?.title, activeScript?.subtitle, storyLiveSettings),
        sourceFileBase: activeScript?.sourceFileBase ?? activeShort.storyFileBase,
        sourceVersion: activeScript?.sourceVersion ?? activeShort.storyFileVersion,
        sourceFileName: activeScript?.sourceFileName ?? activeShort.storyFileName
      }
    }));
  }

  function storyPoseHandleStyle(pose: StoryCharacterPose): React.CSSProperties {
    const left = pose.characterPosition === "custom" ? pose.characterX ?? 50 : storyPositionCenters[pose.characterPosition];
    const bottom = pose.characterPosition === "custom" ? pose.characterY ?? storyDefaultCharacterY : storyDefaultCharacterY;
    return {
      "--story-drag-left": `${left}%`,
      "--story-drag-bottom": `${bottom + 44}%`
    } as React.CSSProperties;
  }

  function applyStoryPositionDefaults() {
    setStoryPositionCenters(draftStoryPositionCenters);
    const nextCharacters = sceneCharacters.map((item) => {
      if (item.characterPosition === "left") {
        return { ...item, characterPosition: "custom" as const, characterX: draftStoryPositionCenters.left, characterY: item.characterY ?? storyDefaultCharacterY };
      }
      if (item.characterPosition === "right") {
        return { ...item, characterPosition: "custom" as const, characterX: draftStoryPositionCenters.right, characterY: item.characterY ?? storyDefaultCharacterY };
      }
      if (item.characterPosition !== "custom") return item;
      if ((item.characterX ?? 50) < 50) return { ...item, characterX: draftStoryPositionCenters.left };
      if ((item.characterX ?? 50) > 50) return { ...item, characterX: draftStoryPositionCenters.right };
      return item;
    });
    updateCurrentStoryScene({
      characters: nextCharacters,
      ...(nextCharacters[0]
        ? {
          characterPosition: nextCharacters[0].characterPosition,
          characterX: nextCharacters[0].characterX,
          characterY: nextCharacters[0].characterY,
          illustration: nextCharacters[0].illustration
        }
        : {})
    });
  }

  function dragStoryCharacter(event: React.PointerEvent<HTMLElement>, characterIndex: number) {
    if (!editStoryLayout || sceneCharacters[characterIndex]?.characterPosition === "hidden") return;
    event.stopPropagation();
    event.preventDefault();
    const stage = event.currentTarget.closest(".storyScreen") as HTMLElement | null;
    if (!stage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startRect = stage.getBoundingClientRect();
    const startPose = sceneCharacters[characterIndex];
    const startX = startPose.characterPosition === "custom" ? startPose.characterX ?? 50 : storyPositionCenters[startPose.characterPosition];
    const startY = startPose.characterPosition === "custom" ? startPose.characterY ?? storyDefaultCharacterY : storyDefaultCharacterY;
    const grabOffsetX = startX - ((event.clientX - startRect.left) / startRect.width) * 100;
    const grabOffsetY = startY - ((startRect.bottom - event.clientY) / startRect.height) * 100;
    const updatePosition = (clientX: number, clientY: number) => {
      const rect = stage.getBoundingClientRect();
      const x = Math.round(clamp(((clientX - rect.left) / rect.width) * 100 + grabOffsetX, -20, 120) * 10) / 10;
      const y = Math.round(clamp(((rect.bottom - clientY) / rect.height) * 100 + grabOffsetY, -80, 110) * 10) / 10;
      const nextCharacters = sceneCharacters.map((item, index) => index === characterIndex ? { ...item, characterPosition: "custom" as const, characterX: x, characterY: y } : item);
      updateCurrentStoryScene({
        characters: nextCharacters,
        ...(characterIndex === 0 ? { characterPosition: "custom" as const, characterX: x, characterY: y, illustration: nextCharacters[0]?.illustration ?? scene.illustration } : {})
      });
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

  function updateStoryCharacterTransform(characterIndex: number, patch: Pick<Partial<StoryCharacterPose>, "characterScale" | "characterFlipX">) {
    const nextCharacters = sceneCharacters.map((item, index) => index === characterIndex ? { ...item, ...patch } : item);
    updateCurrentStoryScene({
      characters: nextCharacters,
      ...(characterIndex === 0
        ? {
          characterScale: nextCharacters[0]?.characterScale,
          characterFlipX: nextCharacters[0]?.characterFlipX,
          illustration: nextCharacters[0]?.illustration ?? scene.illustration
        }
        : {})
    });
  }

  function downloadEditedStoryText() {
    const script = activeShortId ? shortScripts[activeShortId] ?? activeShort.importedScript : undefined;
    const text = script?.editedText ?? serializeStoryScript(scenes, goLiveAfterEnd, storyTitle, storySubtitle, storyLiveSettings);
    const fileBase = script?.sourceFileBase ?? activeShort.storyFileBase;
    const saveKey = `${character.id}:${fileBase}`;
    const nextVersion = (storySaveVersions[saveKey] ?? script?.sourceVersion ?? activeShort.storyFileVersion ?? 0) + 1;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileBase}_${nextVersion}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStorySaveVersions((current) => ({ ...current, [saveKey]: nextVersion }));
  }

  function startShort(shortId: string) {
    setActiveShortId(shortId);
    setChapter(0);
    setShowLog(false);
    setAutoPlay(false);
    setEditStoryLayout(false);
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
          {currentChapter.shorts.map((short) => {
            const shortScript = shortScripts[short.id] ?? short.importedScript;
            return (
              <article key={short.id} className={shortScript?.scenes.length ? "shortCard loaded" : "shortCard"}>
                {readStoryMarks[short.id] && <b className="storyReadBadge">読了</b>}
                <div className="shortCardMeta">
                  <small>{short.storyFileBase}</small>
                  {shortScript?.goLiveAfterEnd && <b className="storyLiveFlag">読了後LIVE</b>}
                </div>
                <strong>{shortScript?.title || short.title}</strong>
                <p>{shortScript?.subtitle || short.summary}</p>
                <div className="shortActions">
                  <button className="primary" onClick={() => startShort(short.id)}>再生</button>
                  <label>
                    TXT
                    <input type="file" accept=".txt,text/plain" onChange={(event) => void loadStoryFile(short.id, event.target.files?.[0])} />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`storyScreen theme-${character.theme} ${editStoryLayout ? "storyEditMode" : ""}`}
      style={
        {
          "--story-image": scene.illustration ? `url(${scene.illustration})` : "none",
          "--story-bg": `url(${scene.background})`,
          "--story-character-x": `${scene.characterX ?? 50}%`,
          "--story-character-y": `${scene.characterY ?? storyDefaultCharacterY}%`,
          "--story-character-scale": scene.characterScale ?? storyDefaultCharacterScale,
          "--story-character-flip": scene.characterFlipX ? -1 : 1
        } as React.CSSProperties
      }
    >
      {sceneCharacters.map((pose, index) => (
        <div key={`${pose.id}-${index}`}>
          <StoryCharacterSprite pose={pose} index={index} positionCenters={storyPositionCenters} onPointerDown={(event) => dragStoryCharacter(event, index)} />
          {editStoryLayout && pose.characterPosition !== "hidden" && (
            <button
              className="storyDragHandle"
              style={storyPoseHandleStyle(pose)}
              onPointerDown={(event) => dragStoryCharacter(event, index)}
            >
              DRAG {pose.name}
            </button>
          )}
          {editStoryLayout && pose.characterPosition !== "hidden" && (
            <div className="storyTransformEditor" style={storyPoseHandleStyle(pose)}>
              <label>
                <span>SIZE</span>
                <input
                  type="range"
                  min="0.4"
                  max="2.2"
                  step="0.05"
                  value={pose.characterScale ?? storyDefaultCharacterScale}
                  onChange={(event) => updateStoryCharacterTransform(index, { characterScale: normalizeStoryScale(Number(event.target.value)) })}
                />
              </label>
              <button
                className={pose.characterFlipX ? "active" : ""}
                onClick={() => updateStoryCharacterTransform(index, { characterFlipX: !pose.characterFlipX })}
              >
                左右反転
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="storyTextBox">
        <div className="storyName">{scene.speaker === "地の文" ? "" : scene.speaker}</div>
        <div className="storyTools">
          <button onClick={() => setActiveShortId(null)}><ChevronLeft size={16} />短編</button>
          <label className="storyToolFile">
            <BookOpen size={16} />TXT
            <input type="file" accept=".txt,text/plain" onChange={(event) => void loadStoryFile(activeShortId, event.target.files?.[0])} />
          </label>
          <button onClick={() => setShowLog((value) => !value)}>LOG</button>
          <button className={autoPlay ? "active" : ""} onClick={() => setAutoPlay((value) => !value)}>AUTO {Math.round(autoDelayMs / 100) / 10}s</button>
          <button className={editStoryLayout ? "active" : ""} onClick={() => setEditStoryLayout((value) => !value)}>位置編集</button>
          <button onClick={downloadEditedStoryText}>TXT保存</button>
          <button onClick={skipStory}>SKIP</button>
        </div>
        {editStoryLayout && (
          <div className="storyPositionPresetEditor">
            <label>
              <span>LEFT {draftStoryPositionCenters.left}%</span>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={draftStoryPositionCenters.left}
                onChange={(event) => setDraftStoryPositionCenters((current) => ({ ...current, left: Number(event.target.value) }))}
              />
            </label>
            <label>
              <span>RIGHT {draftStoryPositionCenters.right}%</span>
              <input
                type="range"
                min="50"
                max="100"
                step="1"
                value={draftStoryPositionCenters.right}
                onChange={(event) => setDraftStoryPositionCenters((current) => ({ ...current, right: Number(event.target.value) }))}
              />
            </label>
            <button onClick={applyStoryPositionDefaults}>反映</button>
          </div>
        )}
        <p className={scene.speaker === "地の文" ? "narrationText" : "dialogueText"}>{scene.text}</p>
        <button className="storyPrev" onClick={() => setChapter((value) => Math.max(value - 1, 0))}>前へ</button>
        <button className="storyNext" onClick={goNextScene}>{chapter >= scenes.length - 1 ? goLiveAfterEnd ? "ライブへ" : "短編へ" : "次へ"}</button>
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
              <ChromaKeyedMemorialPreview src={character.illustrations.memorial} />
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
                        <ChromaKeyedMemorialImage src={asset.imageUrl} alt={`${character.name} ${asset.label}`} />
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

function ItemInventory({
  items,
  itemInventory,
  navigate
}: {
  items: GameItem[];
  itemInventory: Record<string, number>;
  navigate: (screen: Screen) => void;
}) {
  return (
    <Panel title="アイテム" icon={<Package />}>
      <div className="itemInventoryGrid">
        {items.map((item) => {
          const owned = itemInventory[item.id] ?? 0;
          return (
            <article className={`itemCard ${owned <= 0 ? "empty" : ""}`} key={item.id}>
              <img src={item.iconUrl} alt="" />
              <div>
                <strong>{item.name}</strong>
                <small>{itemEffectLabel(item.effect)} / 1ライブ {item.maxUses}回まで</small>
                <p>{item.description}</p>
              </div>
              <span>所持 {owned}</span>
            </article>
          );
        })}
      </div>
      <div className="actions">
        <button className="primary" onClick={() => navigate("game")}><Play size={18} />ライブで使う</button>
        <button onClick={() => navigate("home")}><Home size={18} />ロビーへ</button>
      </div>
    </Panel>
  );
}

function AssetHelp({ navigate }: { navigate: (screen: Screen) => void }) {
  const characterRules = [
    "{id}_lobby.png",
    "{id}_play.png",
    "{id}_result.png",
    "{id}_story.png",
    "{id}_note.png",
    "{id}_story_joy.png",
    "{id}_story_fun.png",
    "{id}_story_anger.png",
    "{id}_story_sadness.png"
  ];
  const backgroundRules = [
    "story_{theme}.png",
    "play_{theme}.png"
  ];

  return (
    <Panel title="画像ルールヘルプ" icon={<BookOpen />}>
      <div className="helpGrid">
        <section className="helpCard">
          <strong>基本フォルダ</strong>
          <code>frontend/public/assets/</code>
          <p>アプリ内では <code>/assets/...</code> で参照します。直接コードへ書く場合もこの形式にします。</p>
        </section>
        <section className="helpCard">
          <strong>キャラクター</strong>
          <code>frontend/public/assets/characters/{'{id}'}/</code>
          <div className="helpCodeList">
            {characterRules.map((rule) => <code key={rule}>{rule}</code>)}
            <code>{'{id}'}_home.txt</code>
          </div>
          <p><code>{'{id}'}</code> は <code>akari</code>, <code>shion</code>, <code>mika</code>, <code>reina</code>, <code>ren</code>, <code>yui</code> などのキャラIDです。</p>
          <p>このフォルダ直下に画像を置くと、ビルド時にメモリアルのキャラクタータイルが自動作成されます。</p>
          <p>ホーム画面のセリフは <code>{'{id}'}_home.txt</code> に1行ずつ書きます。<code>#</code> で始まる行はコメント扱いです。</p>
        </section>
        <section className="helpCard">
          <strong>背景</strong>
          <code>frontend/public/assets/backgrounds/story/</code>
          <code>frontend/public/assets/backgrounds/play/</code>
          <div className="helpCodeList">
            {backgroundRules.map((rule) => <code key={rule}>{rule}</code>)}
          </div>
          <p>story用とplay用はフォルダを分けます。play用フォルダがない場合は作成して使います。</p>
        </section>
        <section className="helpCard">
          <strong>アイテム</strong>
          <code>frontend/public/assets/items/items.csv</code>
          <code>frontend/public/assets/items/icons/</code>
          <p>CSVの列は <code>id,name,description,effect,value,maxUses,owned,icon</code> です。</p>
          <p><code>effect</code> は <code>combo_guard</code>, <code>miss_guard</code>, <code>score_boost</code> を使えます。</p>
        </section>
        <section className="helpCard">
          <strong>メモリアルの対応</strong>
          <div className="helpCodeList">
            <code>ロビー: {'{id}'}_lobby.png</code>
            <code>プレイ: {'{id}'}_play.png</code>
            <code>リザルト: {'{id}'}_result.png</code>
            <code>叩くマーカー: {'{id}'}_note.png</code>
          </div>
          <p>メモリアルで切り替えた「プレイ」は、キャラクター叩く演出の基準画像にも使われます。</p>
        </section>
        <section className="helpCard">
          <strong>story台本からの参照</strong>
          <p>表情指定がある場合、次のファイルを自動参照します。</p>
          <code>/assets/characters/{'{id}'}/{'{id}'}_story_{'{expression}'}.png</code>
          <p>使える表情名は <code>joy</code>, <code>fun</code>, <code>anger</code>, <code>sadness</code> です。</p>
        </section>
        <section className="helpCard">
          <strong>story読了後の遷移</strong>
          <p>.txt の先頭などに次の行を入れると、最後まで再生した後にライブ選択へ進めます。</p>
          <div className="helpCodeList">
            <code>@after live</code>
            <code>@live on</code>
            <code># ライブへ: on</code>
          </div>
          <p>無効化したい場合は <code>@live off</code> を使います。</p>
        </section>
        <section className="helpCard">
          <strong>退避画像ルール</strong>
          <p><code>_old</code> や <code>_old2</code> 付きの退避画像は削除済みです。今後も通常表示に使わないファイルは残さず、必要なら別のバックアップ場所に移します。</p>
        </section>
        <section className="helpCard">
          <strong>楽曲の叩く演出</strong>
          <p>楽曲ごとの叩く演出はアップロード/選択されたファイルをブラウザ内で保持します。固定アセットとして管理したい場合は、将来的に <code>/assets/effects/songs/</code> などへ保存するルールに寄せます。</p>
        </section>
      </div>
      <div className="actions">
        <button className="primary" onClick={() => navigate("adminHelp")}><Settings size={18} />管理者</button>
        <button className="primary" onClick={() => navigate("settings")}><Settings size={18} />設定へ</button>
        <button onClick={() => navigate("home")}><Home size={18} />ロビーへ</button>
      </div>
    </Panel>
  );
}

function AdminHelp({ navigate }: { navigate: (screen: Screen) => void }) {
  return (
    <Panel title="管理者ヘルプ" icon={<Settings />}>
      <div className="helpGrid">
        <section className="helpCard">
          <strong>機能まとめ</strong>
          <code>docs/current_features.md</code>
          <p>現在の画面、譜面、特殊音符、採点、アイテム、ミッション、経験値、アセット規則をまとめています。</p>
        </section>
        <section className="helpCard">
          <strong>基本構造</strong>
          <div className="helpCodeList">
            <code>frontend/src/App.tsx</code>
            <code>frontend/src/styles.css</code>
            <code>frontend/public/assets/</code>
            <code>docs/</code>
          </div>
          <p>ロジックは主に App.tsx、画面デザインは styles.css、画像やCSVは public/assets 配下で管理します。</p>
        </section>
        <section className="helpCard">
          <strong>キャラクター追加</strong>
          <code>frontend/public/assets/characters/{'{id}'}/</code>
          <div className="helpCodeList">
            <code>{'{id}'}_lobby.png</code>
            <code>{'{id}'}_play.png</code>
            <code>{'{id}'}_result.png</code>
            <code>{'{id}'}_story.png</code>
            <code>{'{id}'}_note.png</code>
            <code>{'{id}'}_home.txt</code>
          </div>
          <p>フォルダを追加すると、メモリアル用キャラクタータイルが自動作成されます。</p>
        </section>
        <section className="helpCard">
          <strong>表情差分</strong>
          <div className="helpCodeList">
            <code>{'{id}'}_story_joy.png</code>
            <code>{'{id}'}_story_fun.png</code>
            <code>{'{id}'}_story_anger.png</code>
            <code>{'{id}'}_story_sadness.png</code>
          </div>
          <p>story台本で表情指定がある場合、この命名規則の画像を参照します。</p>
        </section>
        <section className="helpCard">
          <strong>背景</strong>
          <div className="helpCodeList">
            <code>frontend/public/assets/backgrounds/story/story_{'{theme}'}.png</code>
            <code>frontend/public/assets/backgrounds/play/play_{'{theme}'}.png</code>
          </div>
          <p>story用とplay用はフォルダを分けます。演奏設定で背景やアニメーションを切り替える前提です。</p>
        </section>
        <section className="helpCard">
          <strong>アイテムCSV</strong>
          <code>frontend/public/assets/items/items.csv</code>
          <p>列は <code>id,name,description,effect,value,maxUses,owned,icon</code> です。アイコンは <code>frontend/public/assets/items/icons/</code> に置きます。</p>
          <p><code>effect</code> は <code>combo_guard</code>, <code>miss_guard</code>, <code>score_boost</code> に対応しています。</p>
        </section>
        <section className="helpCard">
          <strong>ストーリー台本</strong>
          <div className="helpCodeList">
            <code>@after live</code>
            <code>@live on</code>
            <code># ライブへ: on</code>
          </div>
          <p>読了後ライブ遷移、背景変更、立ち絵位置、表情差分に対応しています。設定モードでは立ち位置をドラッグで編集できます。</p>
        </section>
        <section className="helpCard">
          <strong>保存の注意</strong>
          <p>アップロード楽曲、譜面編集、アイテム所持数、プレイ履歴、レベル、ミッション受取状態は現在 state 管理です。リロード永続化は未実装です。</p>
        </section>
        <section className="helpCard">
          <strong>退避ファイル</strong>
          <p><code>_old</code> 付き画像は通常運用では残さない方針です。使わない画像はバックアップ場所へ移すか削除します。</p>
        </section>
      </div>
      <div className="actions">
        <button className="primary" onClick={() => navigate("help")}><BookOpen size={18} />通常ヘルプ</button>
        <button onClick={() => navigate("home")}><Home size={18} />ロビーへ</button>
      </div>
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
  uiTheme,
  setUiTheme,
  keyNoteVisualMode,
  setKeyNoteVisualMode,
  hitNoteVanishMode,
  setHitNoteVanishMode,
  storyAutoDelayMs,
  setStoryAutoDelayMs,
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
  uiTheme: UiTheme;
  setUiTheme: (value: UiTheme) => void;
  keyNoteVisualMode: KeyNoteVisualMode;
  setKeyNoteVisualMode: (value: KeyNoteVisualMode) => void;
  hitNoteVanishMode: HitNoteVanishMode;
  setHitNoteVanishMode: (value: HitNoteVanishMode) => void;
  storyAutoDelayMs: number;
  setStoryAutoDelayMs: (value: number) => void;
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
      <div className="field">
        UIテーマ
        <div className="segmented">
          <button className={uiTheme === "festival" ? "active" : ""} onClick={() => setUiTheme("festival")}>フェスティバル</button>
          <button className={uiTheme === "scarlet" ? "active" : ""} onClick={() => setUiTheme("scarlet")}>スカーレット</button>
          <button className={uiTheme === "nocturne" ? "active" : ""} onClick={() => setUiTheme("nocturne")}>ノクターン</button>
          <button className={uiTheme === "aurora" ? "active" : ""} onClick={() => setUiTheme("aurora")}>オーロラ</button>
        </div>
      </div>
      <label className="field">判定オフセット {offsetMs}ms<input type="range" min="-150" max="150" step="5" value={offsetMs} onChange={(event) => setOffsetMs(Number(event.target.value))} /></label>
      <label className="field">
        Story AUTO速度 {Math.round(storyAutoDelayMs / 100) / 10}秒
        <input
          type="range"
          min="500"
          max="5000"
          step="100"
          value={storyAutoDelayMs}
          onChange={(event) => setStoryAutoDelayMs(Number(event.target.value))}
        />
      </label>
      <div className="field">
        キー指定音符
        <div className="segmented">
          <button className={keyNoteVisualMode === "button" ? "active" : ""} onClick={() => setKeyNoteVisualMode("button")}>白地ボタン</button>
          <button className={keyNoteVisualMode === "character" ? "active" : ""} onClick={() => setKeyNoteVisualMode("character")}>キャラ依存音符</button>
        </div>
      </div>
      <div className="field">
        ヒット音符発光
        <div className="segmented">
          <button className={hitNoteVanishMode === "on" ? "active" : ""} onClick={() => setHitNoteVanishMode("on")}>ON</button>
          <button className={hitNoteVanishMode === "off" ? "active" : ""} onClick={() => setHitNoteVanishMode("off")}>OFF</button>
        </div>
      </div>
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
      <div className="actions">
        <button onClick={() => navigate("help")}><BookOpen size={18} />画像ルールヘルプ</button>
      </div>
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
