import base64
import json
import mimetypes
import re
import time
from html import escape
from pathlib import Path
from typing import Any

import numpy as np
import streamlit as st
import streamlit.components.v1 as components


APP_TITLE = "和太鼓リズムゲーム"
LIBRARY_DIR = Path("rhythm_game_library")
SONGS_DIR = LIBRARY_DIR / "songs"
RECORDS_PATH = LIBRARY_DIR / "records.json"
ASSETS_DIR = Path("assets")
HOME_HERO_PATH = ASSETS_DIR / "home_hero.png"
GAME_STAGE_PATH = ASSETS_DIR / "game_stage.png"
SUPPORTED_AUDIO_TYPES = ("mp3", "wav", "ogg", "m4a")
ANALYSIS_VERSION = 3

DIFFICULTIES = {
    "easy": {"label": "かんたん", "level": 2, "density": 0.45, "min_gap": 0.46},
    "normal": {"label": "ふつう", "level": 4, "density": 0.62, "min_gap": 0.34},
    "hard": {"label": "むずかしい", "level": 6, "density": 0.78, "min_gap": 0.24},
    "oni": {"label": "おに", "level": 8, "density": 0.94, "min_gap": 0.16},
}

NOTE_LABELS = {
    "don": "面",
    "ka": "縁",
    "big_don": "大面",
    "big_ka": "大縁",
}


def ensure_library() -> None:
    SONGS_DIR.mkdir(parents=True, exist_ok=True)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip().lower()).strip("_")
    return slug or f"song_{int(time.time())}"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def default_records() -> dict[str, Any]:
    return {"plays": [], "best_scores": {}, "experience": 0}


def load_records() -> dict[str, Any]:
    records = load_json(RECORDS_PATH, default_records())
    merged = default_records()
    if isinstance(records, dict):
        merged.update({key: records.get(key, merged[key]) for key in merged})
    return merged


def save_records(records: dict[str, Any]) -> None:
    write_json(RECORDS_PATH, records)


def list_songs() -> list[dict[str, Any]]:
    ensure_library()
    songs: list[dict[str, Any]] = []
    for song_file in sorted(SONGS_DIR.glob("*/song.json")):
        song = load_json(song_file, {})
        if isinstance(song, dict):
            song["folder"] = str(song_file.parent)
            song["song_id"] = song_file.parent.name
            songs.append(song)
    return songs


def install_song(uploaded_file: Any, title: str, artist: str) -> dict[str, Any]:
    ensure_library()
    song_id = slugify(title)
    song_dir = SONGS_DIR / song_id
    suffix = Path(uploaded_file.name).suffix.lower() or ".mp3"
    index = 2
    while song_dir.exists():
        song_id = f"{slugify(title)}_{index}"
        song_dir = SONGS_DIR / song_id
        index += 1

    song_dir.mkdir(parents=True, exist_ok=False)
    audio_path = song_dir / f"audio{suffix}"
    audio_path.write_bytes(uploaded_file.getbuffer())
    metadata = analyze_audio_metadata(audio_path)
    song = {
        "id": song_id,
        "title": title.strip(),
        "artist": artist.strip() or "Unknown",
        "bpm": metadata["bpm"],
        "duration_seconds": metadata["duration_seconds"],
        "audio_file": audio_path.name,
        "created_at": int(time.time()),
        "analysis_version": ANALYSIS_VERSION,
    }
    write_json(song_dir / "song.json", song)
    song["folder"] = str(song_dir)
    song["song_id"] = song_id
    return song


def analyze_audio_metadata(audio_path: Path) -> dict[str, int]:
    try:
        import librosa

        y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
        duration = max(int(round(librosa.get_duration(y=y, sr=sr))), 5)
        y_percussive = librosa.effects.percussive(y)
        onset_env = librosa.onset.onset_strength(y=y_percussive, sr=sr)
        tempo = librosa.feature.rhythm.tempo(onset_envelope=onset_env, sr=sr)
        bpm = int(round(float(np.atleast_1d(tempo)[0])))
        return {"bpm": max(min(bpm, 260), 40), "duration_seconds": duration}
    except Exception:
        return {"bpm": 120, "duration_seconds": 90}


def chart_path(song: dict[str, Any], difficulty_key: str) -> Path:
    return Path(song["folder"]) / f"chart_{difficulty_key}.json"


def song_metadata_path(song: dict[str, Any]) -> Path:
    return Path(song["folder"]) / "song.json"


def load_chart(song: dict[str, Any], difficulty_key: str) -> dict[str, Any] | None:
    chart = load_json(chart_path(song, difficulty_key), None)
    return chart if isinstance(chart, dict) else None


def local_strength(values: np.ndarray, index: int) -> float:
    if len(values) == 0:
        return 0.0
    return float(values[int(np.clip(index, 0, len(values) - 1))])


def nearest_distance(value: float, targets: np.ndarray) -> float:
    if targets.size == 0:
        return 999.0
    return float(np.min(np.abs(targets - value)))


def note_type_for_event(event: dict[str, float | str], beat_times: np.ndarray, index: int) -> str:
    time_value = float(event["time"])
    strength = float(event["strength"])
    source = str(event["source"])
    brightness = float(event.get("brightness", 0.45))
    near_beat = nearest_distance(time_value, beat_times) < 0.07
    if source in {"offbeat", "melody"} or brightness > 0.63:
        return "ka" if strength < 0.82 else "big_ka"
    if source in {"onbeat", "section_accent"} or near_beat:
        return "big_don" if strength > 0.86 and index % 6 == 0 else "don"
    return "big_ka" if strength > 0.9 else "ka"


def dedupe_events(events: list[dict[str, float | str]], min_gap: float) -> list[dict[str, float | str]]:
    chosen: list[dict[str, float | str]] = []
    for event in sorted(events, key=lambda item: (-float(item["strength"]), float(item["time"]))):
        event_time = float(event["time"])
        if all(abs(event_time - float(previous["time"])) >= min_gap for previous in chosen):
            chosen.append(event)
    return sorted(chosen, key=lambda item: float(item["time"]))


def normalize_signal(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values
    values = values.astype(float)
    values = values - float(np.min(values))
    maximum = float(np.max(values))
    if maximum <= 1e-9:
        return np.zeros_like(values)
    return values / maximum


def section_name(progress: float) -> str:
    if progress < 0.12:
        return "intro"
    if progress < 0.34:
        return "verse_a"
    if progress < 0.52:
        return "verse_b"
    if progress < 0.78:
        return "chorus"
    if progress < 0.9:
        return "bridge"
    return "outro"


def section_density(section: str, difficulty_key: str) -> float:
    base = {
        "intro": 0.78,
        "verse_a": 0.9,
        "verse_b": 1.0,
        "chorus": 1.22,
        "bridge": 1.08,
        "outro": 0.86,
    }[section]
    if difficulty_key == "easy":
        return base * 0.78
    if difficulty_key == "hard":
        return base * 1.08
    if difficulty_key == "oni":
        return base * 1.18
    return base


def generate_chart(song: dict[str, Any], difficulty_key: str) -> dict[str, Any]:
    difficulty = DIFFICULTIES[difficulty_key]
    audio_path = Path(song["folder"]) / song["audio_file"]
    try:
        import librosa

        y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
        hop_length = 512
        duration = float(librosa.get_duration(y=y, sr=sr))
        y_harmonic, y_percussive = librosa.effects.hpss(y)
        full_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
        perc_env = librosa.onset.onset_strength(y=y_percussive, sr=sr, hop_length=hop_length)
        harmonic_env = librosa.onset.onset_strength(y=y_harmonic, sr=sr, hop_length=hop_length)
        rms = librosa.feature.rms(y=y_percussive, frame_length=2048, hop_length=hop_length)[0]
        centroid = librosa.feature.spectral_centroid(y=y_percussive, sr=sr, hop_length=hop_length)[0]
        full_norm = normalize_signal(full_env)
        perc_norm = normalize_signal(perc_env)
        harmonic_norm = normalize_signal(harmonic_env)
        rms_norm = normalize_signal(rms)
        centroid_norm = normalize_signal(centroid)

        tempo, beat_frames = librosa.beat.beat_track(onset_envelope=perc_env, sr=sr, hop_length=hop_length, trim=False)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
        offbeat_times = (beat_times[:-1] + beat_times[1:]) / 2 if beat_times.size >= 2 else np.array([])

        perc_frames = librosa.onset.onset_detect(
            onset_envelope=perc_env,
            sr=sr,
            hop_length=hop_length,
            units="frames",
            backtrack=True,
            pre_max=2,
            post_max=2,
            pre_avg=6,
            post_avg=8,
            delta=0.045,
            wait=1,
        )
        melody_frames = librosa.onset.onset_detect(
            onset_envelope=harmonic_env,
            sr=sr,
            hop_length=hop_length,
            units="frames",
            backtrack=True,
            pre_max=2,
            post_max=3,
            pre_avg=8,
            post_avg=10,
            delta=0.06,
            wait=2,
        )
        broad_frames = librosa.onset.onset_detect(
            onset_envelope=full_env,
            sr=sr,
            hop_length=hop_length,
            units="frames",
            backtrack=True,
            pre_max=2,
            post_max=3,
            pre_avg=8,
            post_avg=10,
            delta=0.055,
            wait=1,
        )

        events: list[dict[str, float | str]] = []
        frame_sources: dict[int, set[str]] = {}
        for source, frames in (("percussion", perc_frames), ("melody", melody_frames), ("accent", broad_frames)):
            for frame in frames:
                frame_sources.setdefault(int(frame), set()).add(source)

        for frame, sources in frame_sources.items():
            onset_time = float(librosa.frames_to_time(frame, sr=sr, hop_length=hop_length))
            if not 0.08 < onset_time < duration - 0.08:
                continue
            perc = local_strength(perc_norm, frame)
            broad = local_strength(full_norm, frame)
            melody = local_strength(harmonic_norm, frame)
            energy = local_strength(rms_norm, frame)
            brightness = local_strength(centroid_norm, frame)
            beat_distance = nearest_distance(onset_time, beat_times)
            offbeat_distance = nearest_distance(onset_time, offbeat_times)
            section = section_name(onset_time / max(duration, 1.0))
            source = "percussion"
            if "melody" in sources and melody > max(0.18, perc * 0.55):
                source = "melody"
            elif offbeat_distance < beat_distance and offbeat_distance < 0.11:
                source = "offbeat"
            elif beat_distance < 0.09:
                source = "onbeat"
            if section == "chorus" and broad > 0.5 and (beat_distance < 0.1 or offbeat_distance < 0.1):
                source = "section_accent"

            salience = (perc * 0.46) + (broad * 0.22) + (melody * 0.18) + (energy * 0.14)
            salience *= section_density(section, difficulty_key)
            if source == "offbeat":
                salience += 0.07
            if source == "melody":
                salience += 0.06 if difficulty_key in {"easy", "normal"} else 0.1
            if source == "section_accent":
                salience += 0.11
            if perc < 0.045 and broad < 0.09 and melody < 0.16:
                continue
            events.append(
                {
                    "time": onset_time,
                    "strength": min(float(salience), 1.0),
                    "brightness": brightness,
                    "source": source,
                    "section": section,
                }
            )

        if events:
            percentile_by_difficulty = {"easy": 64, "normal": 42, "hard": 28, "oni": 16}
            floor_by_difficulty = {"easy": 0.24, "normal": 0.16, "hard": 0.11, "oni": 0.08}
            strengths = np.array([float(event["strength"]) for event in events])
            threshold = max(float(np.percentile(strengths, percentile_by_difficulty[difficulty_key])), floor_by_difficulty[difficulty_key])
            events = [event for event in events if float(event["strength"]) >= threshold]

        if len(events) < 8 and full_norm.size:
            peak_frames = np.argsort(full_norm)[-min(96, full_norm.size) :]
            for frame in sorted(int(item) for item in peak_frames):
                onset_time = float(librosa.frames_to_time(frame, sr=sr, hop_length=hop_length))
                if 0.08 < onset_time < duration - 0.08:
                    events.append(
                        {
                            "time": onset_time,
                            "strength": local_strength(full_norm, frame),
                            "brightness": local_strength(centroid_norm, frame),
                            "source": "accent",
                            "section": section_name(onset_time / max(duration, 1.0)),
                        }
                    )

        strengths = np.array([float(event["strength"]) for event in events]) if events else np.array([0.0])
        events = dedupe_events(events, float(difficulty["min_gap"]))

        notes = [
            {
                "time": round(float(event["time"]), 3),
                "type": note_type_for_event(event, beat_times, index),
                "strength": round(float(event["strength"]), 3),
                "source": str(event["source"]),
                "section": str(event.get("section", "unknown")),
            }
            for index, event in enumerate(events)
        ]
        bpm = int(round(float(np.atleast_1d(tempo)[0]))) if np.size(tempo) else int(song.get("bpm", 120))
        duration_seconds = max(int(round(duration)), 5)
    except Exception as exc:
        bpm = int(song.get("bpm", 120))
        duration_seconds = int(song.get("duration_seconds", 90))
        beat_seconds = 60 / max(bpm, 1)
        step = {"easy": 2.0, "normal": 1.0, "hard": 0.5, "oni": 0.5}[difficulty_key]
        notes = []
        beat = 0.0
        while beat * beat_seconds < duration_seconds:
            note_index = len(notes)
            notes.append(
                {
                    "time": round(beat * beat_seconds, 3),
                    "type": "don" if note_index % 2 == 0 else "ka",
                    "strength": 0.5,
                    "source": "fallback",
                }
            )
            beat += step
        exc_text = str(exc)
    else:
        exc_text = ""

    song["bpm"] = max(min(bpm, 260), 40)
    song["duration_seconds"] = duration_seconds
    song["analysis_version"] = ANALYSIS_VERSION
    saved_song = {key: value for key, value in song.items() if key not in {"folder", "song_id"}}
    write_json(song_metadata_path(song), saved_song)

    return {
        "song_id": song["song_id"],
        "difficulty": difficulty_key,
        "difficulty_label": difficulty["label"],
        "level": difficulty["level"],
        "bpm": song["bpm"],
        "duration_seconds": duration_seconds,
        "notes": notes[:1200],
        "generated_at": int(time.time()),
        "analysis_version": ANALYSIS_VERSION,
        "analysis": {
            "method": "librosa_onset_melody_offbeat_sections",
            "note_count": len(notes[:1200]),
            "fallback_error": exc_text,
        },
    }


def get_or_create_chart(song: dict[str, Any], difficulty_key: str) -> dict[str, Any]:
    chart = load_chart(song, difficulty_key)
    if chart and int(chart.get("analysis_version", 0)) >= ANALYSIS_VERSION:
        return chart
    chart = generate_chart(song, difficulty_key)
    write_json(chart_path(song, difficulty_key), chart)
    return chart


def add_demo_play(song: dict[str, Any], difficulty_key: str, chart: dict[str, Any]) -> dict[str, Any]:
    records = load_records()
    notes_count = len(chart.get("notes", []))
    good = max(notes_count - max(notes_count // 7, 1), 0)
    ok = notes_count - good
    score = good * 1000 + ok * 450
    exp_gain = max(score // 120, 1)
    key = f"{song['song_id']}:{difficulty_key}"
    play = {
        "played_at": int(time.time()),
        "song_id": song["song_id"],
        "title": song.get("title", song["song_id"]),
        "difficulty": difficulty_key,
        "difficulty_label": DIFFICULTIES[difficulty_key]["label"],
        "score": score,
        "good": good,
        "ok": ok,
        "miss": 0,
        "max_combo": notes_count,
        "full_combo": ok == 0,
        "all_good": ok == 0,
        "exp_gain": exp_gain,
    }
    records["plays"].insert(0, play)
    records["plays"] = records["plays"][:100]
    if score > int(records["best_scores"].get(key, {}).get("score", 0)):
        records["best_scores"][key] = play
    records["experience"] = int(records.get("experience", 0)) + exp_gain
    save_records(records)
    return play


def level_status(exp: int) -> tuple[int, int, int]:
    return exp // 1000 + 1, exp % 1000, 1000


@st.cache_data(show_spinner=False)
def file_data_uri(path_text: str) -> str:
    path = Path(path_text)
    if not path.exists():
        return ""
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def go(screen: str) -> None:
    st.session_state["screen"] = screen
    st.query_params["screen"] = screen
    st.rerun()


def render_header() -> None:
    st.set_page_config(page_title=APP_TITLE, page_icon="🥁", layout="wide")
    st.markdown(
        """
        <style>
        :root {
            --sky: #8fd8ff;
            --cyan: #45d4ff;
            --navy: #18243d;
            --violet: #6b6ff2;
            --pink: #ff77a8;
            --gold: #ffd05f;
            --panel: rgba(248,252,255,.9);
            --ink: #1d2840;
            --line: rgba(74, 126, 190, .22);
        }
        .stApp {
            color: var(--ink);
            background:
                linear-gradient(120deg, rgba(219,244,255,.96), rgba(255,240,248,.94)),
                linear-gradient(90deg, rgba(69,212,255,.18), rgba(255,208,95,.14));
        }
        header, [data-testid="stToolbar"] { visibility: hidden; height: 0; }
        .block-container {
            max-width: 1240px;
            padding: min(2vh, 18px) min(2vw, 24px);
        }
        .landscape-shell {
            position: relative;
            width: min(100%, 1180px);
            min-height: min(92vh, 690px);
            margin: 0 auto;
            border-radius: 24px;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,.92);
            background:
                linear-gradient(180deg, rgba(255,255,255,.86), rgba(229,246,255,.9)),
                linear-gradient(135deg, rgba(69,212,255,.16), rgba(255,119,168,.12));
            box-shadow: 0 22px 70px rgba(34, 70, 126, .22);
        }
        .topbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 18px;
            padding: 12px 18px;
            color: #fff;
            background: linear-gradient(90deg, #263c75, #4a82e8 54%, #7f6df2);
        }
        .profile {
            display: flex;
            gap: 10px;
            align-items: center;
            font-weight: 900;
        }
        .avatar {
            width: 44px;
            height: 44px;
            display: grid;
            place-items: center;
            border-radius: 12px;
            background: rgba(255,255,255,.28);
            border: 1px solid rgba(255,255,255,.55);
        }
        .resources { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .res {
            padding: 7px 11px;
            border-radius: 10px;
            background: rgba(255,255,255,.26);
            font-size: .78rem;
            font-weight: 900;
        }
        .content { padding: 16px 18px 10px; }
        .home-content {
            padding: 12px 14px 0;
        }
        .home-lobby {
            position: relative;
            min-height: clamp(430px, 68vh, 575px);
            overflow: hidden;
            border-radius: 18px;
            background-size: cover;
            background-position: center;
            border: 1px solid rgba(255,255,255,.86);
            box-shadow: inset 0 0 0 1px rgba(46, 95, 160, .14), 0 18px 42px rgba(35, 75, 130, .18);
        }
        .home-lobby::before {
            content: "";
            position: absolute;
            inset: 0;
            background:
                linear-gradient(90deg, rgba(230,248,255,.82), rgba(255,255,255,.16) 34%, rgba(232,244,255,.18) 62%, rgba(226,241,255,.86)),
                linear-gradient(180deg, rgba(16,44,90,.1), rgba(18,38,76,.22));
        }
        .lobby-hud {
            position: absolute;
            inset: 10px 12px auto;
            display: grid;
            grid-template-columns: 260px 1fr auto;
            gap: 10px;
            align-items: start;
            z-index: 3;
        }
        .player-plate,
        .resource-pill,
        .mission-card,
        .notice-card,
        .event-card,
        .talk-box {
            background: rgba(255,255,255,.86);
            border: 1px solid rgba(79, 139, 205, .26);
            box-shadow: 0 8px 20px rgba(31, 75, 132, .14);
            backdrop-filter: blur(10px);
        }
        .player-plate {
            display: grid;
            grid-template-columns: 50px 1fr;
            gap: 10px;
            align-items: center;
            padding: 8px 10px;
            border-radius: 14px;
        }
        .player-icon {
            width: 50px;
            height: 50px;
            display: grid;
            place-items: center;
            border-radius: 13px;
            color: #fff;
            background: linear-gradient(135deg, #29c7f1, #7370f0);
            font-size: 1.45rem;
            font-weight: 950;
        }
        .player-name {
            font-size: .98rem;
            font-weight: 950;
            color: #203d73;
        }
        .player-sub {
            margin-top: 3px;
            font-size: .76rem;
            color: rgba(32,61,115,.68);
            font-weight: 850;
        }
        .resource-row {
            display: flex;
            justify-content: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .resource-pill {
            min-width: 84px;
            padding: 7px 10px;
            border-radius: 999px;
            text-align: center;
            color: #24426f;
            font-size: .76rem;
            font-weight: 950;
        }
        .top-actions {
            display: flex;
            gap: 8px;
        }
        .round-tool {
            width: 42px;
            height: 42px;
            display: grid;
            place-items: center;
            border-radius: 999px;
            background: rgba(255,255,255,.9);
            border: 1px solid rgba(79,139,205,.24);
            color: #24426f;
            font-weight: 950;
            box-shadow: 0 8px 18px rgba(31,75,132,.12);
        }
        .left-stack {
            position: absolute;
            left: 12px;
            top: 86px;
            width: 190px;
            display: grid;
            gap: 9px;
            z-index: 3;
        }
        .mission-card {
            min-height: 68px;
            padding: 10px 12px;
            border-radius: 14px;
        }
        .mission-label {
            color: #2b75b6;
            font-size: .72rem;
            font-weight: 950;
        }
        .mission-title {
            margin-top: 3px;
            color: #203d73;
            font-size: .92rem;
            line-height: 1.25;
            font-weight: 950;
        }
        .character-focus {
            position: absolute;
            left: 24%;
            right: 25%;
            top: 64px;
            bottom: 74px;
            z-index: 2;
            background:
                radial-gradient(circle at 50% 38%, rgba(255,255,255,.78), rgba(123,211,255,.32) 32%, transparent 58%);
            filter: drop-shadow(0 20px 26px rgba(31,75,132,.24));
        }
        .character-name {
            position: absolute;
            left: 47%;
            bottom: 105px;
            transform: translateX(-50%);
            z-index: 4;
            padding: 9px 16px;
            border-radius: 999px;
            color: #fff;
            background: linear-gradient(90deg, rgba(34,58,106,.86), rgba(51,150,215,.78));
            border: 1px solid rgba(255,255,255,.44);
            font-size: .9rem;
            font-weight: 950;
            box-shadow: 0 10px 24px rgba(31,75,132,.18);
        }
        .talk-box {
            position: absolute;
            left: 42%;
            right: 215px;
            top: 170px;
            z-index: 4;
            padding: 12px 14px;
            border-radius: 14px 14px 14px 4px;
            color: #203d73;
            font-size: .86rem;
            line-height: 1.45;
            font-weight: 850;
        }
        .right-stack {
            position: absolute;
            right: 12px;
            top: 86px;
            width: 210px;
            display: grid;
            gap: 10px;
            z-index: 3;
        }
        .notice-card {
            min-height: 92px;
            overflow: hidden;
            border-radius: 14px;
        }
        .notice-head {
            padding: 8px 10px;
            color: #fff;
            background: linear-gradient(90deg, #259ee4, #716ef0);
            font-size: .78rem;
            font-weight: 950;
        }
        .notice-body {
            padding: 10px;
            color: #203d73;
            font-size: .84rem;
            line-height: 1.35;
            font-weight: 850;
        }
        .event-card {
            min-height: 116px;
            padding: 12px;
            border-radius: 14px;
            color: #fff;
            background:
                linear-gradient(135deg, rgba(40,98,190,.82), rgba(255,119,168,.68)),
                linear-gradient(180deg, rgba(255,255,255,.2), transparent);
        }
        .event-title {
            font-size: 1.02rem;
            line-height: 1.15;
            font-weight: 950;
        }
        .event-sub {
            margin-top: 8px;
            font-size: .78rem;
            font-weight: 850;
            opacity: .9;
        }
        .home-stats {
            position: absolute;
            left: 222px;
            right: 236px;
            bottom: 14px;
            z-index: 3;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
        }
        .stat-tile {
            padding: 10px 12px;
            border-radius: 13px;
            background: rgba(255,255,255,.84);
            border: 1px solid rgba(79,139,205,.22);
            color: #203d73;
            box-shadow: 0 8px 18px rgba(31,75,132,.12);
        }
        .stat-tile small {
            display: block;
            font-size: .72rem;
            color: rgba(32,61,115,.64);
            font-weight: 950;
        }
        .stat-tile strong {
            display: block;
            font-size: 1.35rem;
            line-height: 1.1;
            font-weight: 950;
        }
        .hero-card {
            position: relative;
            min-height: clamp(280px, 48vh, 430px);
            padding: 22px;
            border-radius: 18px;
            overflow: hidden;
            background-size: cover;
            background-position: center;
            box-shadow: 0 16px 36px rgba(42,91,144,.18);
        }
        .hero-card::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, rgba(19,34,65,.76), rgba(19,34,65,.28) 54%, rgba(19,34,65,.08));
        }
        .hero-copy {
            position: absolute;
            left: 28px;
            top: 28px;
            width: min(48%, 460px);
            z-index: 2;
            color: #fff;
            text-shadow: 0 2px 14px rgba(0,0,0,.35);
        }
        .hero-copy h1 {
            margin: 0;
            font-size: clamp(2.2rem, 5vw, 4.6rem);
            line-height: 1;
            letter-spacing: 0;
        }
        .hero-copy p { margin: 12px 0 0; line-height: 1.45; font-weight: 800; max-width: 34rem; }
        .badge {
            display: inline-flex;
            padding: 6px 10px;
            border-radius: 9px;
            background: rgba(255,216,107,.92);
            color: #264066;
            font-weight: 950;
            margin-bottom: 10px;
        }
        .soft-card {
            border-radius: 14px;
            padding: 14px;
            background: rgba(255,255,255,.86);
            border: 1px solid var(--line);
            box-shadow: 0 8px 22px rgba(42,91,144,.1);
            margin-bottom: 12px;
        }
        .quick-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }
        .quick {
            min-height: 118px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 6px;
            border-radius: 14px;
            color: #fff;
            background: linear-gradient(145deg, #5fc4ff, #6886ee);
            font-weight: 950;
            text-align: center;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.35);
        }
        .quick:nth-child(2) { background: linear-gradient(145deg, #ff91bc, #aa82ff); }
        .quick:nth-child(3) { background: linear-gradient(145deg, #ffc75f, #ff8c6b); }
        .song-card {
            border-radius: 14px;
            padding: 14px;
            margin-bottom: 10px;
            background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(234,247,255,.92));
            border: 1px solid var(--line);
        }
        .song-title { font-size: 1.08rem; font-weight: 950; }
        .song-meta { color: rgba(32,48,77,.66); font-size: .84rem; margin: 4px 0 10px; }
        .chip {
            display: inline-flex;
            padding: 4px 8px;
            border-radius: 8px;
            background: rgba(110,200,255,.22);
            color: #1d5d93;
            font-size: .78rem;
            font-weight: 900;
            margin-right: 4px;
        }
        .bottom-nav {
            padding: 10px 14px 14px;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            background: linear-gradient(180deg, rgba(230,247,255,.86), rgba(255,255,255,.94));
            border-top: 1px solid rgba(79,139,205,.2);
        }
        .stButton > button {
            min-height: 56px;
            border-radius: 14px;
            border: 1px solid rgba(86,139,210,.18);
            background: #fff;
            color: #31547f;
            font-weight: 950;
            box-shadow: 0 4px 12px rgba(42,91,144,.08);
        }
        .stButton > button[kind="primary"] {
            color: #fff;
            border: 0;
            background: linear-gradient(135deg, #1fbce8, #6f70ed);
        }
        .stMetric {
            background: rgba(255,255,255,.72);
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 10px;
        }
        [data-testid="stMetricValue"] { font-size: 1.22rem; font-weight: 950; }
        div[data-testid="stHorizontalBlock"] { gap: .5rem; }
        iframe { border-radius: 18px; overflow: hidden; }
        @media (max-width: 820px) {
            .landscape-shell { min-height: auto; border-radius: 16px; }
            .topbar { align-items: flex-start; }
            .resources { max-width: 46%; }
            .content { padding: 12px; }
            .home-lobby { min-height: 560px; }
            .lobby-hud { grid-template-columns: 1fr; right: 12px; }
            .resource-row { justify-content: flex-start; }
            .top-actions { display: none; }
            .left-stack { top: 178px; width: 160px; }
            .right-stack { top: 178px; width: 168px; }
            .talk-box { left: 176px; right: 176px; top: 210px; }
            .character-focus { left: 16%; right: 16%; top: 135px; bottom: 95px; }
            .character-name { bottom: 88px; }
            .home-stats { left: 12px; right: 12px; grid-template-columns: repeat(3, 1fr); }
            .hero-card { min-height: 310px; }
            .hero-copy { width: 72%; left: 18px; top: 18px; }
            .quick-grid, .bottom-nav { grid-template-columns: repeat(2, 1fr); }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_frame(songs: list[dict[str, Any]]) -> None:
    records = load_records()
    level, _, _ = level_status(int(records.get("experience", 0)))
    gems = 340 + int(records.get("experience", 0)) // 10
    st.markdown(
        f"""
        <div class="landscape-shell">
          <div class="topbar">
            <div class="profile"><div class="avatar">🥁</div><div>{APP_TITLE}<br><span style="opacity:.78;font-size:.76rem;">Sensei Lv {level}</span></div></div>
            <div class="resources"><div class="res">AP {80 + level}</div><div class="res">石 {gems}</div><div class="res">曲 {len(songs)}</div></div>
          </div>
        """,
        unsafe_allow_html=True,
    )


def render_bottom_nav() -> None:
    nav_items = [("HOME", "home"), ("LIVE", "live"), ("UPLOAD", "install"), ("CHART", "chart"), ("RECORD", "records")]
    st.markdown('<div class="bottom-nav">', unsafe_allow_html=True)
    cols = st.columns(5)
    current = st.session_state.get("screen", "home")
    for col, (label, screen) in zip(cols, nav_items):
        with col:
            if st.button(label, type="primary" if current == screen else "secondary", width="stretch", key=f"nav_{screen}"):
                go(screen)
    st.markdown("</div>", unsafe_allow_html=True)


def render_home(songs: list[dict[str, Any]]) -> None:
    records = load_records()
    level, current, needed = level_status(int(records.get("experience", 0)))
    hero_uri = file_data_uri(str(HOME_HERO_PATH))
    plays = len(records.get("plays", []))
    progress_percent = int((current / needed) * 100)
    lobby_html = f"""
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        * {{ box-sizing: border-box; -webkit-tap-highlight-color: transparent; }}
        body {{ margin: 0; font-family: "Segoe UI", sans-serif; background: transparent; color: #213963; }}
        .lobby {{
          position: relative;
          height: 650px;
          overflow: hidden;
          border-radius: 18px;
          background-image:
            linear-gradient(90deg, rgba(232,248,255,.84), rgba(255,255,255,.18) 35%, rgba(235,247,255,.22) 62%, rgba(227,242,255,.88)),
            linear-gradient(180deg, rgba(18,44,90,.06), rgba(18,38,76,.2)),
            url('{hero_uri}');
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255,255,255,.88);
          box-shadow: inset 0 0 0 1px rgba(46,95,160,.16);
        }}
        button {{
          cursor: pointer;
          border: 0;
          font: inherit;
          color: inherit;
        }}
        .plate, .pill, .tile, .bubble, .panel, .icon-btn {{
          background: rgba(255,255,255,.88);
          border: 1px solid rgba(76,135,202,.26);
          box-shadow: 0 9px 20px rgba(31,75,132,.15);
          backdrop-filter: blur(10px);
        }}
        .top {{
          position: absolute;
          left: 12px;
          right: 12px;
          top: 10px;
          z-index: 5;
          display: grid;
          grid-template-columns: 260px 1fr 190px;
          gap: 10px;
          align-items: start;
        }}
        .plate {{
          height: 62px;
          display: grid;
          grid-template-columns: 48px 1fr;
          gap: 10px;
          align-items: center;
          padding: 7px 10px;
          border-radius: 14px;
        }}
        .avatar {{
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #fff;
          background: linear-gradient(135deg, #22bfe8, #6f70ed);
          font-weight: 950;
        }}
        .name {{ font-size: 15px; font-weight: 950; }}
        .sub {{ margin-top: 3px; font-size: 12px; opacity: .72; font-weight: 850; }}
        .resources {{ display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }}
        .pill {{
          min-width: 82px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 950;
        }}
        .tools {{ display: flex; justify-content: flex-end; gap: 8px; }}
        .icon-btn {{
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          color: #24426f;
          font-size: 18px;
          font-weight: 950;
          transition: transform .12s ease, filter .12s ease;
        }}
        .icon-btn:hover, .nav-btn:hover, .wide-btn:hover, .panel-btn:hover {{ transform: translateY(-2px); filter: brightness(1.04); }}
        .left {{
          position: absolute;
          left: 12px;
          top: 92px;
          z-index: 4;
          width: 190px;
          display: grid;
          gap: 9px;
        }}
        .panel-btn {{
          min-height: 70px;
          padding: 10px 12px;
          border-radius: 14px;
          text-align: left;
          color: #213963;
          transition: transform .12s ease, filter .12s ease;
        }}
        .panel-label {{ font-size: 11px; color: #277fbd; font-weight: 950; }}
        .panel-title {{ margin-top: 3px; font-size: 14px; line-height: 1.25; font-weight: 950; }}
        .center-glow {{
          position: absolute;
          left: 22%;
          right: 26%;
          top: 72px;
          bottom: 86px;
          background: radial-gradient(circle at 50% 38%, rgba(255,255,255,.76), rgba(112,208,255,.32) 34%, transparent 61%);
          filter: drop-shadow(0 22px 28px rgba(31,75,132,.23));
          z-index: 2;
          pointer-events: none;
        }}
        .name-tag {{
          position: absolute;
          left: 48%;
          bottom: 106px;
          transform: translateX(-50%);
          z-index: 5;
          padding: 9px 16px;
          border-radius: 999px;
          color: #fff;
          background: linear-gradient(90deg, rgba(34,58,106,.9), rgba(51,150,215,.82));
          border: 1px solid rgba(255,255,255,.44);
          font-size: 14px;
          font-weight: 950;
          box-shadow: 0 10px 24px rgba(31,75,132,.18);
        }}
        .bubble {{
          position: absolute;
          left: 42%;
          right: 222px;
          top: 176px;
          z-index: 5;
          padding: 12px 14px;
          border-radius: 14px 14px 14px 4px;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 850;
        }}
        .right {{
          position: absolute;
          right: 12px;
          top: 92px;
          width: 214px;
          z-index: 4;
          display: grid;
          gap: 10px;
        }}
        .notice {{
          overflow: hidden;
          border-radius: 14px;
        }}
        .notice-head {{
          padding: 8px 10px;
          color: #fff;
          background: linear-gradient(90deg, #239fe4, #716ef0);
          font-size: 12px;
          font-weight: 950;
        }}
        .notice-body {{
          padding: 10px;
          font-size: 13px;
          line-height: 1.35;
          font-weight: 850;
        }}
        .event {{
          min-height: 118px;
          padding: 12px;
          border-radius: 14px;
          color: #fff;
          background: linear-gradient(135deg, rgba(40,98,190,.84), rgba(255,119,168,.7));
          text-align: left;
        }}
        .event-title {{ font-size: 18px; line-height: 1.12; font-weight: 950; }}
        .event-sub {{ margin-top: 9px; font-size: 12px; font-weight: 850; opacity: .9; }}
        .bottom {{
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 12px;
          z-index: 6;
          display: grid;
          grid-template-columns: 1.35fr repeat(4, 1fr);
          gap: 10px;
          align-items: end;
        }}
        .wide-btn, .nav-btn {{
          height: 66px;
          border-radius: 15px;
          color: #fff;
          font-weight: 950;
          box-shadow: 0 11px 24px rgba(31,75,132,.2), inset 0 1px 0 rgba(255,255,255,.34);
          transition: transform .12s ease, filter .12s ease;
        }}
        .wide-btn {{
          height: 82px;
          background: linear-gradient(135deg, #ffcf5f, #ff7ea7);
          font-size: 20px;
          text-align: left;
          padding-left: 22px;
        }}
        .nav-btn {{ background: linear-gradient(135deg, #27c2eb, #6f70ed); font-size: 14px; }}
        .nav-btn:nth-child(3) {{ background: linear-gradient(135deg, #68d39d, #21a9da); }}
        .nav-btn:nth-child(4) {{ background: linear-gradient(135deg, #ff9b74, #ef6ba3); }}
        .nav-btn:nth-child(5) {{ background: linear-gradient(135deg, #6d85ff, #9a72f0); }}
        .stat-strip {{
          position: absolute;
          left: 218px;
          right: 238px;
          bottom: 108px;
          z-index: 5;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
        }}
        .tile {{
          height: 58px;
          padding: 8px 11px;
          border-radius: 13px;
        }}
        .tile small {{ display: block; font-size: 11px; opacity: .65; font-weight: 950; }}
        .tile strong {{ display: block; font-size: 21px; line-height: 1.1; font-weight: 950; }}
        @media (max-width: 820px) {{
          .lobby {{ height: 590px; }}
          .top {{ grid-template-columns: 1fr; right: 10px; }}
          .resources {{ justify-content: flex-start; }}
          .tools {{ position: absolute; right: 0; top: 0; }}
          .left {{ top: 178px; width: 162px; }}
          .right {{ top: 178px; width: 168px; }}
          .bubble {{ left: 180px; right: 180px; top: 208px; }}
          .center-glow {{ left: 15%; right: 15%; top: 140px; bottom: 92px; }}
          .stat-strip {{ left: 12px; right: 12px; bottom: 104px; }}
          .bottom {{ grid-template-columns: repeat(2, 1fr); }}
          .wide-btn {{ grid-column: span 2; }}
        }}
      </style>
    </head>
    <body>
      <main class="lobby">
        <section class="top">
          <div class="plate">
            <div class="avatar">Lv</div>
            <div><div class="name">Sensei Lv {level}</div><div class="sub">EXP {current}/{needed} / {progress_percent}%</div></div>
          </div>
          <div class="resources">
            <div class="pill">AP {80 + level}</div>
            <div class="pill">石 {340 + int(records.get("experience", 0)) // 10}</div>
            <div class="pill">曲 {len(songs)}</div>
            <div class="pill">PLAY {plays}</div>
          </div>
          <div class="tools">
            <button class="icon-btn" type="button" onclick="nav('settings')">⚙</button>
            <button class="icon-btn" type="button" onclick="nav('live')">☰</button>
            <button class="icon-btn" type="button" onclick="nav('records')">i</button>
          </div>
        </section>

        <section class="left">
          <button class="panel-btn panel" type="button" onclick="nav('records')"><div class="panel-label">MISSION</div><div class="panel-title">今日のライブを1回プレイ</div></button>
          <button class="panel-btn panel" type="button" onclick="nav('chart')"><div class="panel-label">LESSON</div><div class="panel-title">音源を解析して譜面更新</div></button>
          <button class="panel-btn panel" type="button" onclick="nav('live')"><div class="panel-label">SHOP</div><div class="panel-title">楽曲ライブラリ</div></button>
        </section>

        <div class="center-glow"></div>
        <div class="name-tag">Festival Beat Live</div>
        <div class="bubble" id="toast">ロビー上のボタンから各機能へ移動できます。音源の発音、裏拍、曲展開に合わせて譜面を作成します。</div>

        <section class="right">
          <button class="notice panel" type="button" onclick="nav('chart')"><div class="notice-head">NOTICE</div><div class="notice-body">BPM固定ではなく、実音の発音を優先して譜面を生成します。</div></button>
          <button class="event" type="button" onclick="nav('chart')"><div class="event-title">RHYTHM<br>ANALYSIS</div><div class="event-sub">Aメロ / Bメロ / サビで密度が変化</div></button>
        </section>

        <section class="stat-strip">
          <div class="tile"><small>LEVEL</small><strong>{level}</strong></div>
          <div class="tile"><small>SONGS</small><strong>{len(songs)}</strong></div>
          <div class="tile"><small>PLAYS</small><strong>{plays}</strong></div>
        </section>

        <nav class="bottom">
          <button class="wide-btn" type="button" onclick="nav('live')">LIVE START</button>
          <button class="nav-btn" type="button" onclick="nav('install')">UPLOAD</button>
          <button class="nav-btn" type="button" onclick="nav('chart')">CHART</button>
          <button class="nav-btn" type="button" onclick="nav('records')">RECORD</button>
          <button class="nav-btn" type="button" onclick="nav('settings')">CONFIG</button>
        </nav>
      </main>
      <script>
        function nav(screen) {{
          const url = new URL(window.parent.location.href);
          url.searchParams.set("screen", screen);
          window.parent.location.href = url.toString();
        }}
        function showToast(text) {{
          const toast = document.getElementById("toast");
          toast.textContent = text;
          toast.animate([{{ transform: "translateY(0)" }}, {{ transform: "translateY(-4px)" }}, {{ transform: "translateY(0)" }}], {{ duration: 240 }});
        }}
      </script>
    </body>
    </html>
    """
    components.html(lobby_html, height=666, scrolling=False)


def render_install() -> None:
    st.markdown('<div class="content"><div class="soft-card">', unsafe_allow_html=True)
    st.subheader("楽曲アップロード")
    uploaded_file = st.file_uploader("音源ファイル", type=SUPPORTED_AUDIO_TYPES)
    title = st.text_input("曲名")
    artist = st.text_input("アーティスト", value="Unknown")
    st.caption("保存後に曲長、推定BPM、打楽器、メロディーの入り、裏拍、曲展開を解析します。MP3は環境によって読み込みに少し時間がかかります。")
    if st.button("解析して保存", type="primary", disabled=uploaded_file is None or not title.strip(), width="stretch"):
        with st.spinner("音源を解析して譜面を作成中..."):
            song = install_song(uploaded_file, title, artist)
            for difficulty_key in DIFFICULTIES:
                write_json(chart_path(song, difficulty_key), generate_chart(song, difficulty_key))
        st.success("保存と解析が完了しました。")
        st.session_state["selected_song_id"] = song["song_id"]
        st.session_state["screen"] = "live"
        st.rerun()
    st.markdown("</div></div>", unsafe_allow_html=True)


def render_chart_builder(songs: list[dict[str, Any]]) -> None:
    st.markdown('<div class="content"><div class="soft-card">', unsafe_allow_html=True)
    st.subheader("解析譜面")
    if not songs:
        st.warning("先に楽曲をアップロードしてください。")
        if st.button("アップロードへ", type="primary", width="stretch"):
            go("install")
        st.markdown("</div></div>", unsafe_allow_html=True)
        return
    labels = [f"{song.get('title', song['song_id'])} / {song.get('artist', 'Unknown')}" for song in songs]
    song = songs[st.selectbox("楽曲", range(len(songs)), format_func=lambda index: labels[index])]
    difficulty_key = st.selectbox(
        "難易度",
        list(DIFFICULTIES.keys()),
        format_func=lambda key: f"{DIFFICULTIES[key]['label']} ★{DIFFICULTIES[key]['level']}",
    )
    if st.button("音源解析から譜面を再生成", type="primary", width="stretch"):
        with st.spinner("実音のアタック、裏拍、メロディー、曲展開を解析中..."):
            chart = generate_chart(song, difficulty_key)
            write_json(chart_path(song, difficulty_key), chart)
        st.success(f"{chart['difficulty_label']} を生成しました。ノーツ数: {len(chart['notes'])}")
    chart = load_chart(song, difficulty_key)
    if chart:
        st.write(f"BPM目安: {chart.get('bpm')} / ノーツ: {len(chart.get('notes', []))} / 方式: {chart.get('analysis', {}).get('method', '-')}")
        st.dataframe(chart.get("notes", [])[:40], width="stretch")
    st.markdown("</div></div>", unsafe_allow_html=True)


def render_live_select(songs: list[dict[str, Any]]) -> None:
    st.markdown('<div class="content">', unsafe_allow_html=True)
    st.subheader("ライブ")
    if not songs:
        st.warning("楽曲がありません。")
        if st.button("アップロードへ", type="primary", width="stretch"):
            go("install")
        st.markdown("</div>", unsafe_allow_html=True)
        return
    for index, song in enumerate(songs):
        st.markdown(
            f"""
            <div class="song-card">
              <div class="song-title">{escape(song.get('title', song['song_id']))}</div>
              <div class="song-meta">{escape(song.get('artist', 'Unknown'))} / BPM {song.get('bpm', '-')} / {song.get('duration_seconds', '-')}秒</div>
              <span class="chip">解析譜面</span><span class="chip">クリック操作</span><span class="chip">音源同期</span>
            </div>
            """,
            unsafe_allow_html=True,
        )
        cols = st.columns(4)
        for col, difficulty_key in zip(cols, DIFFICULTIES):
            with col:
                if st.button(DIFFICULTIES[difficulty_key]["label"], key=f"start_{index}_{difficulty_key}", width="stretch"):
                    st.session_state["selected_song_id"] = song["song_id"]
                    st.session_state["selected_difficulty"] = difficulty_key
                    st.session_state["screen"] = "game"
                    st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)


def get_selected_song(songs: list[dict[str, Any]]) -> dict[str, Any] | None:
    selected_song_id = st.session_state.get("selected_song_id")
    for song in songs:
        if song["song_id"] == selected_song_id:
            return song
    return songs[0] if songs else None


def render_rhythm_component(song: dict[str, Any], difficulty_key: str, chart: dict[str, Any]) -> None:
    stage_uri = file_data_uri(str(GAME_STAGE_PATH))
    audio_path = Path(song["folder"]) / song["audio_file"]
    audio_uri = file_data_uri(str(audio_path))
    notes = [
        {
            "time": float(note.get("time", 0)),
            "type": str(note.get("type", "don")),
            "label": NOTE_LABELS.get(str(note.get("type", "don")), "面"),
        }
        for note in chart.get("notes", [])[:800]
    ]
    payload = json.dumps(notes, ensure_ascii=False)
    title = json.dumps(song.get("title", song["song_id"]), ensure_ascii=False)
    difficulty_label = json.dumps(DIFFICULTIES[difficulty_key]["label"], ensure_ascii=False)
    judge_offset = float(st.session_state.get("judge_offset_ms", 0)) / 1000
    audio_display = "block" if bool(st.session_state.get("show_audio_controls", True)) else "none"
    html = f"""
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        * {{ box-sizing: border-box; -webkit-tap-highlight-color: transparent; user-select: none; }}
        body {{ margin: 0; font-family: "Segoe UI", sans-serif; background: transparent; }}
        .game {{
          position: relative;
          height: min(640px, 82vh);
          min-height: 520px;
          overflow: hidden;
          border-radius: 18px;
          color: #fff;
          background-image: linear-gradient(90deg, rgba(13,25,55,.24), rgba(13,25,55,.58)), url('{stage_uri}');
          background-size: cover;
          background-position: center;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.28);
        }}
        .top {{
          position: absolute; inset: 14px 14px auto;
          display: flex; justify-content: space-between; gap: 10px; z-index: 4;
        }}
        .title, .stat {{
          border-radius: 18px; padding: 10px 12px;
          background: rgba(24,45,86,.55); backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,.24);
        }}
        .title h1 {{ margin: 0; font-size: 20px; line-height: 1.1; letter-spacing: 0; }}
        .title p {{ margin: 5px 0 0; font-size: 12px; opacity: .82; font-weight: 800; }}
        .stat {{ min-width: 96px; text-align: center; }}
        .stat small {{ display: block; opacity: .72; font-weight: 900; font-size: 10px; }}
        .stat strong {{ font-size: 24px; }}
        .lane {{
          position: absolute; left: 0; right: 0; top: 205px; height: 170px; z-index: 2;
          background: linear-gradient(90deg, rgba(13,24,50,.96), rgba(27,56,107,.82));
          border-top: 3px solid rgba(255,255,255,.4);
          border-bottom: 4px solid #72e3ff;
          box-shadow: 0 0 30px rgba(114,227,255,.38);
        }}
        .hit {{
          position: absolute; left: 76px; top: 24px; width: 122px; height: 122px;
          border-radius: 50%; border: 5px solid rgba(255,255,255,.82);
          box-shadow: 0 0 0 13px rgba(255,255,255,.1), 0 0 34px rgba(255,216,107,.56);
        }}
        .judge {{
          position: absolute; left: 68px; top: 72px; width: 146px; text-align: center;
          font-size: 18px; font-weight: 950; color: #ffd86b; text-shadow: 0 2px 8px #000;
        }}
        .note {{
          position: absolute; top: 50px; width: 84px; height: 84px; display: grid; place-items: center;
          border-radius: 50%; font-weight: 950; font-size: 18px; transform: translateX(-50%);
          border: 4px solid rgba(255,255,255,.86);
          box-shadow: 0 10px 22px rgba(0,0,0,.34), inset 0 8px 18px rgba(255,255,255,.2);
        }}
        .don {{ background: radial-gradient(circle at 35% 30%, #ffb58d, #ff574d 58%, #c91d2b); }}
        .ka {{ background: radial-gradient(circle at 35% 30%, #a7efff, #4ba4ff 58%, #2457c8); }}
        .big_don, .big_ka {{ width: 102px; height: 102px; top: 41px; }}
        .tap {{
          position: absolute; left: 26%; right: 26%; bottom: 88px; height: 96px; z-index: 5;
          display: grid; place-items: center; border-radius: 28px;
          background: linear-gradient(180deg, rgba(255,255,255,.26), rgba(255,255,255,.12));
          border: 1px solid rgba(255,255,255,.38); backdrop-filter: blur(8px);
          font-size: 22px; font-weight: 950; text-shadow: 0 2px 10px rgba(0,0,0,.36);
        }}
        .tap:active {{ transform: translateY(2px); background: rgba(255,216,107,.42); }}
        .controls {{
          position: absolute; left: 26%; right: 26%; bottom: 18px; z-index: 6;
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
        }}
        button {{
          height: 56px; border: 0; border-radius: 18px; color: #fff;
          background: linear-gradient(135deg, #55bcff, #7283ff);
          font-weight: 950; font-size: 16px; box-shadow: 0 10px 24px rgba(55,100,200,.34);
        }}
        button.secondary {{ background: rgba(26,49,91,.72); border: 1px solid rgba(255,255,255,.28); }}
        audio {{ position: absolute; right: 18px; bottom: 18px; z-index: 6; width: min(290px, 30%); opacity: .82; display: {audio_display}; }}
        .flash {{ position: absolute; inset: 0; z-index: 1; opacity: 0; background: radial-gradient(circle at 120px 344px, rgba(255,255,255,.5), transparent 180px); transition: opacity .08s; }}
        .result {{
          position: absolute; inset: 0; z-index: 9; display: none; place-items: center;
          background: rgba(28,49,90,.62); backdrop-filter: blur(10px);
        }}
        .result-card {{
          width: calc(100% - 44px); border-radius: 24px; padding: 24px;
          color: #20304d; text-align: center;
          background: linear-gradient(180deg, rgba(255,255,255,.97), rgba(233,247,255,.96));
          box-shadow: 0 16px 48px rgba(0,0,0,.26);
        }}
        .rank {{ font-size: 76px; line-height: 1; font-weight: 950; color: #5aaeff; }}
        @media (max-width: 760px) {{
          .game {{ height: 560px; }}
          .tap, .controls {{ left: 18px; right: 18px; }}
          audio {{ width: calc(100% - 36px); bottom: 196px; }}
          .lane {{ top: 180px; }}
        }}
      </style>
    </head>
    <body>
      <div class="game" id="game">
        <div class="flash" id="flash"></div>
        <div class="top">
          <div class="title"><h1 id="title"></h1><p id="subtitle"></p></div>
          <div class="stat"><small>SCORE</small><strong id="score">0</strong></div>
        </div>
        <div class="lane" id="lane"><div class="hit"></div><div class="judge" id="judge">READY</div></div>
        <audio id="audio" src="{audio_uri}" preload="auto" controls></audio>
        <div class="tap" id="tap">TAP / CLICK</div>
        <div class="controls"><button id="start">ライブ開始</button><button class="secondary" id="pause">一時停止</button></div>
        <div class="result" id="result"><div class="result-card"><div class="rank" id="rank">A</div><h2>ライブ終了</h2><p id="resultText"></p></div></div>
      </div>
      <script>
        const notes = {payload};
        const title = {title};
        const difficulty = {difficulty_label};
        const judgeOffset = {judge_offset};
        const audio = document.getElementById("audio");
        const lane = document.getElementById("lane");
        const noteEls = [];
        let running = false, score = 0, combo = 0, maxCombo = 0, good = 0, miss = 0, raf = 0;
        const travel = 2.05;
        document.getElementById("title").textContent = title;
        document.getElementById("subtitle").textContent = difficulty + " / クリックで叩く";

        function hud() {{ document.getElementById("score").textContent = score.toLocaleString(); }}
        function judge(text) {{ document.getElementById("judge").textContent = text; document.getElementById("judge").style.color = text === "MISS" ? "#9ee8ff" : "#ffd86b"; }}
        function flash() {{ const f = document.getElementById("flash"); f.style.opacity = "1"; setTimeout(() => f.style.opacity = "0", 75); }}
        function setupNotes() {{
          for (const el of noteEls) el.remove();
          noteEls.length = 0;
          notes.forEach((note, i) => {{
            note.hit = false; note.missed = false;
            const el = document.createElement("div");
            el.className = "note " + note.type;
            el.textContent = note.label;
            el.style.display = "none";
            lane.appendChild(el);
            noteEls.push(el);
          }});
        }}
        function tap() {{
          if (!running) return;
          flash();
          const now = audio.currentTime + judgeOffset;
          let best = null, bestDelta = Infinity;
          for (const note of notes) {{
            if (note.hit || note.missed) continue;
            const delta = Math.abs(note.time - now);
            if (delta < bestDelta) {{ best = note; bestDelta = delta; }}
          }}
          if (best && bestDelta <= 0.18) {{
            best.hit = true; combo += 1; maxCombo = Math.max(maxCombo, combo); good += 1;
            score += bestDelta <= 0.075 ? 1200 : 850;
            judge(bestDelta <= 0.075 ? "PERFECT" : "GOOD");
          }} else {{
            combo = 0; miss += 1; judge("MISS");
          }}
          hud();
        }}
        function draw() {{
          const now = audio.currentTime;
          const width = lane.clientWidth;
          const hitX = 138;
          const spawnX = width + 88;
          let active = false;
          notes.forEach((note, i) => {{
            const dt = note.time - now;
            const el = noteEls[i];
            if (dt < travel && dt > -0.38 && !note.hit) {{
              active = true;
              const x = spawnX + (hitX - spawnX) * (1 - dt / travel);
              el.style.left = x + "px";
              el.style.display = "grid";
              el.style.opacity = dt < -0.22 ? ".35" : "1";
            }} else {{
              el.style.display = "none";
            }}
            if (dt < -0.2 && !note.hit && !note.missed) {{
              note.missed = true; combo = 0; miss += 1; judge("MISS"); hud();
            }}
          }});
          if (running && (!audio.ended || active)) raf = requestAnimationFrame(draw);
          else if (running) finish();
        }}
        function finish() {{
          running = false; cancelAnimationFrame(raf);
          const total = Math.max(notes.length, 1);
          const rate = good / total;
          const rank = rate > .94 ? "S" : rate > .82 ? "A" : rate > .68 ? "B" : "C";
          document.getElementById("rank").textContent = rank;
          document.getElementById("resultText").textContent = `Score ${{score.toLocaleString()}} / Good ${{good}} / Miss ${{miss}} / Max Combo ${{maxCombo}}`;
          document.getElementById("result").style.display = "grid";
        }}
        document.getElementById("start").addEventListener("click", async () => {{
          score = 0; combo = 0; maxCombo = 0; good = 0; miss = 0; hud(); judge("GO");
          document.getElementById("result").style.display = "none";
          setupNotes(); audio.currentTime = 0; running = true;
          await audio.play().catch(() => {{ judge("PLAYを許可"); }});
          cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
        }});
        document.getElementById("pause").addEventListener("click", () => {{ if (audio.paused) audio.play(); else audio.pause(); }});
        document.getElementById("tap").addEventListener("pointerdown", tap);
        lane.addEventListener("pointerdown", tap);
        window.addEventListener("keydown", (e) => {{ if (e.code === "Space" || e.key.toLowerCase() === "d" || e.key.toLowerCase() === "k") tap(); }});
        audio.addEventListener("ended", finish);
        setupNotes(); hud();
      </script>
    </body>
    </html>
    """
    components.html(html, height=660, scrolling=False)


def render_game(songs: list[dict[str, Any]]) -> None:
    st.markdown('<div class="content">', unsafe_allow_html=True)
    song = get_selected_song(songs)
    if not song:
        st.warning("楽曲がありません。")
        st.markdown("</div>", unsafe_allow_html=True)
        return
    difficulty_key = st.session_state.get("selected_difficulty", "normal")
    with st.spinner("譜面を準備中..."):
        chart = get_or_create_chart(song, difficulty_key)
    render_rhythm_component(song, difficulty_key, chart)
    c1, c2 = st.columns(2)
    if c1.button("結果を保存", type="primary", width="stretch"):
        play = add_demo_play(song, difficulty_key, chart)
        st.success(f"{play['score']:,} 点を保存しました。")
    if c2.button("戻る", width="stretch"):
        go("live")
    st.markdown("</div>", unsafe_allow_html=True)


def render_records() -> None:
    st.markdown('<div class="content"><div class="soft-card">', unsafe_allow_html=True)
    st.subheader("記録")
    records = load_records()
    level, current, needed = level_status(int(records.get("experience", 0)))
    cols = st.columns(3)
    cols[0].metric("Lv", level)
    cols[1].metric("EXP", int(records.get("experience", 0)))
    cols[2].metric("次", needed - current)
    st.progress(current / needed)
    best_scores = list(records.get("best_scores", {}).values())
    st.markdown("#### ベスト")
    st.dataframe(best_scores, width="stretch") if best_scores else st.info("まだありません。")
    plays = records.get("plays", [])
    st.markdown("#### 履歴")
    st.dataframe(plays, width="stretch") if plays else st.info("まだありません。")
    st.markdown("</div></div>", unsafe_allow_html=True)


def render_settings() -> None:
    st.markdown('<div class="content"><div class="soft-card">', unsafe_allow_html=True)
    st.subheader("設定")
    st.caption("ロビー画面の歯車から開く設定ページです。ゲーム内の判定や表示の調整に使います。")
    st.slider("判定オフセット ms", min_value=-150, max_value=150, value=int(st.session_state.get("judge_offset_ms", 0)), step=5, key="judge_offset_ms")
    st.toggle("譜面生成時にメロディーを強めに拾う", value=bool(st.session_state.get("prefer_melody", True)), key="prefer_melody")
    st.toggle("ゲーム画面で音声コントロールを表示", value=bool(st.session_state.get("show_audio_controls", True)), key="show_audio_controls")
    c1, c2 = st.columns(2)
    if c1.button("ホームへ戻る", type="primary", width="stretch", key="settings_home"):
        go("home")
    if c2.button("ライブへ", width="stretch", key="settings_live"):
        go("live")
    st.markdown("</div></div>", unsafe_allow_html=True)


def main() -> None:
    ensure_library()
    render_header()
    songs = list_songs()
    query_screen = st.query_params.get("screen", None)
    valid_screens = {"home", "live", "install", "chart", "game", "records", "settings"}
    if query_screen in valid_screens:
        st.session_state["screen"] = str(query_screen)
    else:
        st.session_state.setdefault("screen", "home")
    render_frame(songs)
    screen = st.session_state.get("screen", "home")
    if screen == "home":
        render_home(songs)
    elif screen == "live":
        render_live_select(songs)
    elif screen == "install":
        render_install()
    elif screen == "chart":
        render_chart_builder(songs)
    elif screen == "game":
        render_game(songs)
    elif screen == "records":
        render_records()
    elif screen == "settings":
        render_settings()
    if screen != "home":
        render_bottom_nav()
    st.markdown("</div>", unsafe_allow_html=True)


if __name__ == "__main__":
    main()
