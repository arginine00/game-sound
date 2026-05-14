import json
import re
import time
from pathlib import Path
from typing import Any

import streamlit as st


APP_TITLE = "和太鼓リズムゲーム"
LIBRARY_DIR = Path("rhythm_game_library")
SONGS_DIR = LIBRARY_DIR / "songs"
RECORDS_PATH = LIBRARY_DIR / "records.json"
SUPPORTED_AUDIO_TYPES = ("mp3", "wav", "ogg", "m4a")

DIFFICULTIES = {
    "easy": {"label": "かんたん", "level": 2, "beat_step": 2.0},
    "normal": {"label": "ふつう", "level": 4, "beat_step": 1.5},
    "hard": {"label": "むずかしい", "level": 6, "beat_step": 1.0},
    "oni": {"label": "おに", "level": 8, "beat_step": 0.5},
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


def song_options(songs: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        f"{song.get('title', song['song_id'])} / {song.get('artist', 'Unknown')}": song
        for song in songs
    }


def install_song(uploaded_file: Any, title: str, artist: str, bpm: int, duration: int) -> str:
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
    write_json(
        song_dir / "song.json",
        {
            "id": song_id,
            "title": title.strip(),
            "artist": artist.strip() or "Unknown",
            "bpm": bpm,
            "duration_seconds": duration,
            "audio_file": audio_path.name,
            "created_at": int(time.time()),
        },
    )
    return song_id


def generate_chart(song: dict[str, Any], difficulty_key: str) -> dict[str, Any]:
    difficulty = DIFFICULTIES[difficulty_key]
    bpm = max(int(song.get("bpm", 120)), 1)
    duration = max(int(song.get("duration_seconds", 90)), 5)
    beat_seconds = 60 / bpm
    step = float(difficulty["beat_step"])
    notes = []
    beat = 0.0
    note_index = 0

    while beat * beat_seconds < duration:
        note_type = "don" if note_index % 4 in (0, 2) else "ka"
        if difficulty_key in {"hard", "oni"} and note_index % 12 == 0:
            note_type = "big_don"
        if difficulty_key == "oni" and note_index % 16 == 8:
            note_type = "big_ka"
        notes.append(
            {
                "time": round(beat * beat_seconds, 3),
                "beat": round(beat, 2),
                "type": note_type,
            }
        )
        beat += step
        note_index += 1

    return {
        "song_id": song["song_id"],
        "difficulty": difficulty_key,
        "difficulty_label": difficulty["label"],
        "level": difficulty["level"],
        "bpm": bpm,
        "duration_seconds": duration,
        "notes": notes,
        "generated_at": int(time.time()),
    }


def chart_path(song: dict[str, Any], difficulty_key: str) -> Path:
    return Path(song["folder"]) / f"chart_{difficulty_key}.json"


def load_chart(song: dict[str, Any], difficulty_key: str) -> dict[str, Any] | None:
    chart = load_json(chart_path(song, difficulty_key), None)
    return chart if isinstance(chart, dict) else None


def add_demo_play(song: dict[str, Any], difficulty_key: str, chart: dict[str, Any]) -> None:
    records = load_records()
    notes_count = len(chart.get("notes", []))
    good = max(notes_count - max(notes_count // 8, 1), 0)
    ok = notes_count - good
    score = good * 1000 + ok * 450
    full_combo = ok == 0
    all_good = ok == 0
    exp_gain = max(score // 120, 1) + (150 if full_combo else 0) + (250 if all_good else 0)
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
        "full_combo": full_combo,
        "all_good": all_good,
        "exp_gain": exp_gain,
    }

    records["plays"].insert(0, play)
    records["plays"] = records["plays"][:100]
    previous_best = records["best_scores"].get(key, {})
    if score > int(previous_best.get("score", 0)):
        records["best_scores"][key] = play
    records["experience"] = int(records.get("experience", 0)) + exp_gain
    save_records(records)


def level_status(exp: int) -> tuple[int, int, int]:
    level = exp // 1000 + 1
    current = exp % 1000
    return level, current, 1000


def render_header() -> None:
    st.set_page_config(page_title=APP_TITLE, page_icon="🥁", layout="wide")
    st.markdown(
        """
        <style>
        .stApp { background: #fffaf2; }
        [data-testid="stMetricValue"] { font-size: 1.8rem; }
        .note-lane {
            min-height: 96px;
            border: 2px solid #2b2b2b;
            background: linear-gradient(90deg, #32221d, #53362b);
            border-radius: 8px;
            padding: 16px;
            overflow-x: auto;
            white-space: nowrap;
        }
        .note {
            display: inline-flex;
            width: 48px;
            height: 48px;
            margin-right: 14px;
            border-radius: 999px;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            color: #fff;
            border: 3px solid rgba(255,255,255,.75);
        }
        .don { background: #d73b2c; }
        .ka { background: #2874c9; }
        .big_don { background: #b91f16; width: 60px; height: 60px; }
        .big_ka { background: #1557a8; width: 60px; height: 60px; }
        </style>
        """,
        unsafe_allow_html=True,
    )
    st.title("🥁 和太鼓リズムゲーム")
    st.caption("楽曲インストール、譜面生成、プレイ記録、経験値管理を行うローカル向けプロトタイプです。")


def render_home(songs: list[dict[str, Any]]) -> None:
    records = load_records()
    level, current, needed = level_status(int(records.get("experience", 0)))
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("登録楽曲", len(songs))
    col2.metric("プレイ回数", len(records.get("plays", [])))
    col3.metric("レベル", level)
    col4.metric("次レベルまで", needed - current)
    st.progress(current / needed)

    st.subheader("現在できること")
    st.write(
        "- 音源をローカルライブラリへ登録\n"
        "- BPM と曲長から難易度別の簡易譜面を生成\n"
        "- 音源を再生しながら譜面プレビューを確認\n"
        "- デモプレイ結果を保存してスコア、履歴、経験値を確認"
    )
    st.info(f"保存先: {LIBRARY_DIR}")


def render_install() -> None:
    st.subheader("楽曲インストール")
    uploaded_file = st.file_uploader("音源ファイル", type=SUPPORTED_AUDIO_TYPES)
    title = st.text_input("曲名")
    artist = st.text_input("アーティスト", value="Unknown")
    bpm = st.number_input("BPM", min_value=40, max_value=260, value=120, step=1)
    duration = st.number_input("曲長（秒）", min_value=5, max_value=900, value=90, step=5)

    if st.button("楽曲を保存", type="primary", disabled=uploaded_file is None or not title.strip()):
        song_id = install_song(uploaded_file, title, artist, int(bpm), int(duration))
        st.success(f"保存しました: {song_id}")
        st.rerun()


def render_chart_builder(songs: list[dict[str, Any]]) -> None:
    st.subheader("リズムゲーム化")
    options = song_options(songs)
    if not options:
        st.warning("先に楽曲をインストールしてください。")
        return

    song = options[st.selectbox("楽曲", list(options.keys()))]
    difficulty_key = st.selectbox(
        "難易度",
        list(DIFFICULTIES.keys()),
        format_func=lambda key: f"{DIFFICULTIES[key]['label']} ★{DIFFICULTIES[key]['level']}",
    )
    if st.button("譜面を生成・再生成", type="primary"):
        chart = generate_chart(song, difficulty_key)
        write_json(chart_path(song, difficulty_key), chart)
        st.success(f"{chart['difficulty_label']} の譜面を生成しました。ノーツ数: {len(chart['notes'])}")

    chart = load_chart(song, difficulty_key)
    if chart:
        st.write(f"ノーツ数: {len(chart.get('notes', []))}")
        st.dataframe(chart.get("notes", [])[:24], use_container_width=True)


def render_play(songs: list[dict[str, Any]]) -> None:
    st.subheader("プレイ")
    options = song_options(songs)
    if not options:
        st.warning("先に楽曲をインストールしてください。")
        return

    song = options[st.selectbox("楽曲", list(options.keys()), key="play_song")]
    difficulty_key = st.selectbox(
        "難易度",
        list(DIFFICULTIES.keys()),
        key="play_difficulty",
        format_func=lambda key: f"{DIFFICULTIES[key]['label']} ★{DIFFICULTIES[key]['level']}",
    )
    chart = load_chart(song, difficulty_key)
    if not chart:
        st.warning("この難易度の譜面がありません。先に「リズムゲーム化」で生成してください。")
        return

    audio_path = Path(song["folder"]) / song["audio_file"]
    if audio_path.exists():
        st.audio(str(audio_path))

    notes = chart.get("notes", [])[:48]
    html_notes = "".join(
        f'<span class="note {note["type"]}">{NOTE_LABELS.get(note["type"], note["type"])}</span>'
        for note in notes
    )
    st.markdown(f'<div class="note-lane">{html_notes}</div>', unsafe_allow_html=True)
    st.caption("現在は譜面プレビューとデモ記録保存の段階です。リアルタイム入力判定は次の実装候補です。")

    if st.button("デモプレイ結果を保存", type="primary"):
        add_demo_play(song, difficulty_key, chart)
        st.success("プレイ結果を保存しました。")
        st.rerun()


def render_records() -> None:
    st.subheader("記録")
    records = load_records()
    level, current, needed = level_status(int(records.get("experience", 0)))
    st.metric("総経験値", int(records.get("experience", 0)))
    st.write(f"レベル {level}: {current} / {needed}")
    st.progress(current / needed)

    st.markdown("### ベストスコア")
    best_scores = list(records.get("best_scores", {}).values())
    if best_scores:
        st.dataframe(best_scores, use_container_width=True)
    else:
        st.info("まだベストスコアがありません。")

    st.markdown("### プレイ履歴")
    plays = records.get("plays", [])
    if plays:
        st.dataframe(plays, use_container_width=True)
    else:
        st.info("まだプレイ履歴がありません。")


def main() -> None:
    ensure_library()
    render_header()
    songs = list_songs()
    tabs = st.tabs(["ホーム", "楽曲インストール", "リズムゲーム化", "プレイ", "記録"])
    with tabs[0]:
        render_home(songs)
    with tabs[1]:
        render_install()
    with tabs[2]:
        render_chart_builder(songs)
    with tabs[3]:
        render_play(songs)
    with tabs[4]:
        render_records()


if __name__ == "__main__":
    main()
