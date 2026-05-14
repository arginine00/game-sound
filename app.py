import io
import json
import os
import re
import shutil
import threading
import time
from collections import Counter
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import streamlit as st
from PIL import ExifTags, Image, ImageFilter

ASYNC_JOBS: Dict[str, Dict[str, object]] = {}
ASYNC_LOCK = threading.Lock()


RHYTHM_GAME_DIR = Path("rhythm_game_library")
RHYTHM_SONGS_DIR = RHYTHM_GAME_DIR / "songs"
RHYTHM_RECORDS_PATH = RHYTHM_GAME_DIR / "records.json"
RHYTHM_DIFFICULTIES = {
    "easy": {"label": "かんたん", "level": 2, "beat_step": 2.0},
    "normal": {"label": "ふつう", "level": 4, "beat_step": 1.5},
    "hard": {"label": "むずかしい", "level": 6, "beat_step": 1.0},
    "oni": {"label": "おに", "level": 8, "beat_step": 0.5},
}


def ensure_rhythm_game_dirs() -> None:
    RHYTHM_SONGS_DIR.mkdir(parents=True, exist_ok=True)


def slugify_song_id(title: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_\-]+", "_", title.strip().lower()).strip("_")
    return slug or f"song_{int(time.time())}"


def rhythm_default_records() -> dict:
    return {"plays": [], "records": {}, "experience": 0}


def load_rhythm_records() -> dict:
    ensure_rhythm_game_dirs()
    if not RHYTHM_RECORDS_PATH.exists():
        return rhythm_default_records()
    try:
        data = json.loads(RHYTHM_RECORDS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return rhythm_default_records()
    if not isinstance(data, dict):
        return rhythm_default_records()
    default = rhythm_default_records()
    default.update({k: data.get(k, default[k]) for k in default})
    return default


def save_rhythm_records(records: dict) -> None:
    ensure_rhythm_game_dirs()
    RHYTHM_RECORDS_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def rhythm_level_from_exp(exp: int) -> Tuple[int, int, int]:
    level = int(exp // 1000) + 1
    current = int(exp % 1000)
    return level, current, 1000


def list_installed_rhythm_songs() -> List[dict]:
    ensure_rhythm_game_dirs()
    songs: List[dict] = []
    for song_json in sorted(RHYTHM_SONGS_DIR.glob("*/song.json")):
        try:
            data = json.loads(song_json.read_text(encoding="utf-8"))
        except Exception:
            continue
        data["folder"] = str(song_json.parent)
        songs.append(data)
    return songs


def generate_rhythm_chart(duration_sec: int, bpm: int, difficulty_key: str, offset_ms: int = 0) -> dict:
    spec = RHYTHM_DIFFICULTIES[difficulty_key]
    beat_ms = 60000.0 / max(1, bpm)
    step_ms = beat_ms * float(spec["beat_step"])
    start_ms = max(500, offset_ms + int(beat_ms * 2))
    end_ms = max(start_ms, int(duration_sec * 1000) - 1200)
    notes = []
    idx = 0
    t = start_ms
    while t <= end_ms:
        if difficulty_key in {"hard", "oni"} and idx > 0 and idx % 32 == 0:
            notes.append({"timeMs": int(t), "type": "roll", "durationMs": int(beat_ms * 2)})
            t += step_ms * 2
            idx += 1
            continue
        if idx % 16 == 0 and difficulty_key in {"normal", "hard", "oni"}:
            note_type = "bigDon" if idx % 32 == 0 else "bigKa"
        else:
            note_type = "don" if idx % 3 != 1 else "ka"
        notes.append({"timeMs": int(t), "type": note_type})
        t += step_ms
        idx += 1
    return {
        "difficulty": difficulty_key,
        "label": spec["label"],
        "level": spec["level"],
        "offsetMs": offset_ms,
        "notes": notes,
    }


def write_rhythm_charts(song_dir: Path, duration_sec: int, bpm: int, offset_ms: int = 0) -> dict:
    chart_dir = song_dir / "charts"
    chart_dir.mkdir(parents=True, exist_ok=True)
    summary = {}
    for difficulty_key in RHYTHM_DIFFICULTIES:
        chart = generate_rhythm_chart(duration_sec, bpm, difficulty_key, offset_ms)
        (chart_dir / f"{difficulty_key}.json").write_text(json.dumps(chart, ensure_ascii=False, indent=2), encoding="utf-8")
        summary[difficulty_key] = len(chart["notes"])
    return summary


def install_rhythm_song(uploaded_audio, title: str, artist: str, bpm: int, duration_sec: int, genre: str) -> dict:
    ensure_rhythm_game_dirs()
    base_id = slugify_song_id(title)
    song_id = base_id
    counter = 2
    while (RHYTHM_SONGS_DIR / song_id).exists():
        song_id = f"{base_id}_{counter}"
        counter += 1
    song_dir = RHYTHM_SONGS_DIR / song_id
    song_dir.mkdir(parents=True, exist_ok=True)
    source_name = Path(uploaded_audio.name)
    audio_suffix = source_name.suffix.lower() if source_name.suffix else ".audio"
    audio_name = f"audio{audio_suffix}"
    (song_dir / audio_name).write_bytes(uploaded_audio.getbuffer())
    chart_counts = write_rhythm_charts(song_dir, duration_sec, bpm)
    song = {
        "id": song_id,
        "title": title.strip() or song_id,
        "artist": artist.strip() or "Unknown",
        "bpm": int(bpm),
        "durationSec": int(duration_sec),
        "genre": genre.strip() or "未分類",
        "audio": audio_name,
        "preview": audio_name,
        "jacket": "",
        "backgrounds": {},
        "installedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "chartCounts": chart_counts,
    }
    (song_dir / "song.json").write_text(json.dumps(song, ensure_ascii=False, indent=2), encoding="utf-8")
    return song


def calculate_rank(score: int) -> str:
    if score >= 980000:
        return "SS"
    if score >= 920000:
        return "S"
    if score >= 850000:
        return "A"
    if score >= 750000:
        return "B"
    if score >= 600000:
        return "C"
    return "D"


def add_rhythm_play_record(song: dict, difficulty: str, score: int, full_combo: bool, all_perfect: bool) -> dict:
    records = load_rhythm_records()
    rank = calculate_rank(score)
    exp_gain = max(10, int(score / 10000)) + (80 if full_combo else 0) + (150 if all_perfect else 0)
    play = {
        "playedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "songId": song["id"],
        "title": song["title"],
        "difficulty": difficulty,
        "score": int(score),
        "rank": rank,
        "fullCombo": bool(full_combo),
        "allPerfect": bool(all_perfect),
        "expGain": exp_gain,
    }
    records["plays"].insert(0, play)
    records["plays"] = records["plays"][:100]
    song_records = records["records"].setdefault(song["id"], {})
    previous = song_records.get(difficulty, {})
    if int(score) > int(previous.get("bestScore", 0)):
        song_records[difficulty] = {
            "title": song["title"],
            "bestScore": int(score),
            "bestRank": rank,
            "fullCombo": bool(full_combo) or bool(previous.get("fullCombo", False)),
            "allPerfect": bool(all_perfect) or bool(previous.get("allPerfect", False)),
            "updatedAt": play["playedAt"],
        }
    else:
        previous["fullCombo"] = bool(full_combo) or bool(previous.get("fullCombo", False))
        previous["allPerfect"] = bool(all_perfect) or bool(previous.get("allPerfect", False))
        song_records[difficulty] = previous
    records["experience"] = int(records.get("experience", 0)) + exp_gain
    save_rhythm_records(records)
    return play


def flatten_rhythm_scores(records: dict) -> List[dict]:
    rows = []
    for song_id, difficulties in records.get("records", {}).items():
        for difficulty, row in difficulties.items():
            rows.append({"songId": song_id, "difficulty": difficulty, **row})
    return sorted(rows, key=lambda row: int(row.get("bestScore", 0)), reverse=True)


def render_rhythm_game_home() -> None:
    ensure_rhythm_game_dirs()
    songs = list_installed_rhythm_songs()
    records = load_rhythm_records()
    plays = records.get("plays", [])
    score_rows = flatten_rhythm_scores(records)
    best_score = max([int(row.get("bestScore", 0)) for row in score_rows], default=0)
    exp = int(records.get("experience", 0))
    level, current_exp, next_exp = rhythm_level_from_exp(exp)

    st.subheader("🥁 リズムゲーム ホーム")
    st.caption("現状: 画像ビューアに、楽曲インストール、簡易譜面生成によるリズムゲーム化、履歴・スコア・経験値管理を追加しています。")
    metric_cols = st.columns(4)
    metric_cols[0].metric("インストール楽曲", len(songs))
    metric_cols[1].metric("プレイ履歴", len(plays))
    metric_cols[2].metric("最高スコア", f"{best_score:,}")
    metric_cols[3].metric("経験値", f"Lv.{level} / {exp} EXP")
    st.progress(current_exp / next_exp, text=f"次のレベルまで {next_exp - current_exp} EXP")

    if "rhythm_home_panel" not in st.session_state:
        st.session_state.rhythm_home_panel = "現状"
    button_cols = st.columns(6)
    panels = ["現状", "楽曲インストール", "リズムゲーム化", "履歴", "スコア", "経験値"]
    for col, panel in zip(button_cols, panels):
        if col.button(panel, key=f"rhythm_panel_{panel}"):
            st.session_state.rhythm_home_panel = panel

    panel = st.session_state.rhythm_home_panel
    if panel == "現状":
        st.markdown("#### 現状まとめ")
        st.write(
            {
                "追加済み": ["楽曲ファイル保存", "BPMと曲長からの簡易譜面生成", "プレイ履歴保存", "ベストスコア保存", "経験値・レベル表示"],
                "保存先": str(RHYTHM_GAME_DIR),
                "次の実装候補": ["実音源に同期したゲーム画面", "譜面エディタ", "リザルト画面との自動連携"],
            }
        )
    elif panel == "楽曲インストール":
        st.markdown("#### 楽曲のインストール")
        with st.form("rhythm_install_form"):
            uploaded_audio = st.file_uploader("音源ファイル", type=["mp3", "wav", "ogg", "m4a"], key="rhythm_audio_upload")
            title = st.text_input("曲名", value="新しい楽曲")
            artist = st.text_input("アーティスト", value="Unknown")
            bpm = st.number_input("BPM", min_value=40, max_value=300, value=120, step=1)
            duration_sec = st.number_input("曲の長さ（秒）", min_value=10, max_value=900, value=90, step=5)
            genre = st.text_input("ジャンル", value="未分類")
            submitted = st.form_submit_button("インストールして譜面を生成")
        if submitted:
            if uploaded_audio is None:
                st.warning("音源ファイルを選択してください。")
            else:
                song = install_rhythm_song(uploaded_audio, title, artist, int(bpm), int(duration_sec), genre)
                st.success(f"{song['title']} をインストールしました。")
                st.json(song)
    elif panel == "リズムゲーム化":
        st.markdown("#### リズムゲーム化機能")
        if not songs:
            st.info("先に楽曲をインストールしてください。")
        else:
            song_options = {f"{song['title']} / {song['artist']} ({song['id']})": song for song in songs}
            selected_label = st.selectbox("対象楽曲", list(song_options))
            song = song_options[selected_label]
            song_dir = Path(song["folder"])
            offset_ms = st.number_input("判定オフセット（ms）", min_value=-5000, max_value=5000, value=0, step=10)
            if st.button("譜面を再生成", key="regenerate_rhythm_chart"):
                counts = write_rhythm_charts(song_dir, int(song["durationSec"]), int(song["bpm"]), int(offset_ms))
                song["chartCounts"] = counts
                song["offsetMs"] = int(offset_ms)
                (song_dir / "song.json").write_text(json.dumps({k: v for k, v in song.items() if k != "folder"}, ensure_ascii=False, indent=2), encoding="utf-8")
                st.success("譜面を再生成しました。")
                st.json(counts)
            st.markdown("##### 動作確認用プレイ記録")
            difficulty = st.selectbox("難易度", list(RHYTHM_DIFFICULTIES.keys()), format_func=lambda key: RHYTHM_DIFFICULTIES[key]["label"])
            score = st.slider("スコア", 0, 1000000, 850000, 1000)
            full_combo = st.checkbox("フルコンボ")
            all_perfect = st.checkbox("全良")
            if st.button("プレイ結果を保存", key="save_rhythm_play"):
                play = add_rhythm_play_record(song, difficulty, int(score), full_combo, all_perfect)
                st.success(f"履歴・スコア・経験値を更新しました（+{play['expGain']} EXP）。")
                st.json(play)
    elif panel == "履歴":
        st.markdown("#### プレイ履歴")
        if plays:
            st.dataframe(plays, use_container_width=True)
        else:
            st.info("プレイ履歴はまだありません。")
    elif panel == "スコア":
        st.markdown("#### ベストスコア")
        if score_rows:
            st.dataframe(score_rows, use_container_width=True)
        else:
            st.info("スコア記録はまだありません。")
    elif panel == "経験値":
        st.markdown("#### 経験値")
        st.write({"level": level, "totalExp": exp, "currentLevelExp": current_exp, "nextLevelExp": next_exp})
        st.progress(current_exp / next_exp, text=f"Lv.{level}: {current_exp}/{next_exp} EXP")
        st.caption("スコア保存時に、スコア量・フルコンボ・全良ボーナスから経験値を加算します。")


@dataclass
class ImageItem:
    name: str
    image: Image.Image
    bytes_data: bytes
    raw_image: Image.Image


@st.cache_resource
def get_vit_embedder():
    from transformers import AutoImageProcessor, AutoModel

    model_id = "google/vit-small-patch16-224"
    processor = AutoImageProcessor.from_pretrained(model_id)
    model = AutoModel.from_pretrained(model_id)
    model.eval()
    return processor, model


@st.cache_resource
def get_unet_encoder():
    import segmentation_models_pytorch as smp

    encoder = smp.encoders.get_encoder("mobilenet_v2", in_channels=3, depth=5, weights="imagenet")
    encoder.eval()
    return encoder


def extract_exif(image: Image.Image) -> dict:
    exif_data = {}
    try:
        raw_exif = image.getexif()
        if not raw_exif:
            return exif_data
        for tag, value in raw_exif.items():
            decoded = ExifTags.TAGS.get(tag, tag)
            exif_data[str(decoded)] = str(value)
    except Exception as e:
        exif_data["error"] = f"EXIF読み取り失敗: {e}"
    return exif_data


def extract_embedded_sd_tags(raw_image: Image.Image) -> List[str]:
    """Stable Diffusion生成画像でよく使われる埋め込みメタデータからタグを抽出。"""
    tag_candidates: List[str] = []

    for key in ["parameters", "prompt", "Prompt", "Comment", "Description"]:
        value = raw_image.info.get(key)
        if not value:
            continue

        text = str(value)
        if "Negative prompt:" in text:
            text = text.split("Negative prompt:", 1)[0]
        if "Steps:" in text:
            text = text.split("Steps:", 1)[0]

        parts = [p.strip() for p in re.split(r",|\n", text) if p.strip()]
        tag_candidates.extend(parts)

    cleaned = []
    for t in tag_candidates:
        t2 = re.sub(r"\s+", " ", t).strip().lower()
        if t2 and t2 not in cleaned:
            cleaned.append(t2)

    return cleaned[:50]


def recognize_tags_vit(image: Image.Image) -> List[str]:
    try:
        from transformers import pipeline

        classifier = pipeline("image-classification", model="google/vit-base-patch16-224")
        results = classifier(image)
        return [r["label"].lower() for r in results[:8] if float(r.get("score", 0)) > 0.08]
    except Exception:
        return []


def recognize_tags_wd14(image: Image.Image, threshold: float = 0.35) -> List[str]:
    """Danbooru系のWD14タグger（SmilingWolf）を利用。"""
    try:
        from huggingface_hub import hf_hub_download
        import numpy as np
        import onnxruntime as ort
        import pandas as pd

        model_repo = "SmilingWolf/wd-v1-4-convnextv2-tagger-v2"
        model_path = hf_hub_download(model_repo, "model.onnx")
        csv_path = hf_hub_download(model_repo, "selected_tags.csv")

        tags_df = pd.read_csv(csv_path)

        img = image.resize((448, 448)).convert("RGB")
        x = np.array(img, dtype=np.float32)[:, :, ::-1]
        x = np.expand_dims(x, 0)

        sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        input_name = sess.get_inputs()[0].name
        output = sess.run(None, {input_name: x})[0][0]

        names = tags_df["name"].tolist()
        category = tags_df["category"].tolist()

        results = []
        for i, score in enumerate(output):
            if i >= len(names):
                break
            if category[i] == 9:
                continue
            if float(score) >= threshold:
                results.append((names[i].replace("_", " "), float(score)))

        results.sort(key=lambda z: z[1], reverse=True)
        return [name for name, _ in results[:50]]
    except Exception:
        return []


def stable_diffusion_fallback(image: Image.Image) -> List[str]:
    try:
        from clip_interrogator import Config, Interrogator

        ci = Interrogator(Config(quiet=True))
        prompt = ci.interrogate_fast(image)
        return [w.strip().lower() for w in prompt.split(",") if w.strip()][:20]
    except Exception:
        return []






def detect_mosaic_region(image: Image.Image) -> Tuple[bool, float]:
    """簡易モザイク検出: ブロック境界強度と局所分散の偏りを利用。"""
    gray = np.asarray(image.convert("L").resize((256, 256)), dtype=np.float32)

    # 8pxブロック境界での差分強度
    v_edges = np.abs(gray[:, 8::8] - gray[:, 7::8]).mean() if gray.shape[1] > 8 else 0.0
    h_edges = np.abs(gray[8::8, :] - gray[7::8, :]).mean() if gray.shape[0] > 8 else 0.0
    edge_score = float((v_edges + h_edges) / 2.0)

    # 局所分散（モザイクは局所テクスチャが潰れやすい）
    small = gray.reshape(32, 8, 32, 8).mean(axis=(1, 3))
    local_var = float(np.var(small))

    # 正規化スコア（経験則）
    mosaic_score = max(0.0, min(1.0, (edge_score / 18.0) * 0.65 + (1.0 / (1.0 + local_var / 1200.0)) * 0.35))
    return mosaic_score >= 0.55, mosaic_score

def load_images_from_folder(
    folder_path: str,
    max_images: int = 120,
    max_side: int = 768,
    include_subfolders: bool = False,
) -> Tuple[List[ImageItem], Dict[str, object]]:
    items: List[ImageItem] = []
    supported_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    skipped_exts: Dict[str, int] = {}

    folder = Path(folder_path)
    paths = sorted(folder.rglob("*") if include_subfolders else folder.glob("*"))

    for path in paths:
        if len(items) >= max_images:
            break
        if path.is_dir():
            continue

        ext = path.suffix.lower()
        if ext not in supported_exts:
            skipped_exts[ext or "(no_ext)"] = skipped_exts.get(ext or "(no_ext)", 0) + 1
            continue

        try:
            bytes_data = path.read_bytes()
            raw = Image.open(io.BytesIO(bytes_data))
            img = raw.convert("RGB")
            img.thumbnail((max_side, max_side))
            rel_name = str(path.relative_to(folder)) if include_subfolders else path.name
            items.append(ImageItem(name=rel_name, image=img, bytes_data=bytes_data, raw_image=raw))
        except Exception:
            skipped_exts[f"{ext or '(no_ext)'}(read_error)"] = skipped_exts.get(f"{ext or '(no_ext)'}(read_error)", 0) + 1

    stats = {
        "supported_exts": sorted(list(supported_exts)),
        "skipped_exts": skipped_exts,
        "include_subfolders": include_subfolders,
    }
    return items, stats


def extract_features_vit(items: List[ImageItem]) -> np.ndarray:
    from transformers import AutoImageProcessor, AutoModel
    import torch

    processor, model = get_vit_embedder()

    feats = []
    with torch.no_grad():
        for item in items:
            inputs = processor(images=item.image, return_tensors="pt")
            out = model(**inputs)
            vec = out.last_hidden_state[:, 0, :].squeeze(0).cpu().numpy()
            feats.append(vec)
    return np.vstack(feats)


def extract_features_unet(items: List[ImageItem]) -> np.ndarray:
    import torch
    import torch.nn.functional as F

    encoder = get_unet_encoder()

    feats = []
    with torch.no_grad():
        for item in items:
            x = np.array(item.image.resize((256, 256)), dtype=np.float32) / 255.0
            x = torch.from_numpy(x).permute(2, 0, 1).unsqueeze(0)
            fmaps = encoder(x)[-1]
            pooled = F.adaptive_avg_pool2d(fmaps, (1, 1)).flatten(1).squeeze(0).cpu().numpy()
            feats.append(pooled)
    return np.vstack(feats)


def cluster_and_embed(features: np.ndarray, n_clusters: int, use_tsne: bool = True) -> Tuple[np.ndarray, np.ndarray]:
    from sklearn.cluster import MiniBatchKMeans
    from sklearn.decomposition import PCA
    from sklearn.manifold import TSNE

    reduced = PCA(n_components=min(64, features.shape[1], features.shape[0]), random_state=42).fit_transform(features)
    clusters = MiniBatchKMeans(n_clusters=n_clusters, random_state=42, batch_size=32, n_init="auto").fit_predict(reduced)

    if not use_tsne:
        coords = PCA(n_components=2, random_state=42).fit_transform(reduced)
        return clusters, coords

    perplexity = max(5, min(30, reduced.shape[0] // 3))
    coords = TSNE(n_components=2, random_state=42, init="pca", learning_rate="auto", perplexity=perplexity).fit_transform(reduced)
    return clusters, coords

def load_images(uploaded_files, max_side: int = 1024) -> List[ImageItem]:
    items = []
    for file in uploaded_files:
        bytes_data = file.read()
        raw = Image.open(io.BytesIO(bytes_data))
        img = raw.convert("RGB")
        img.thumbnail((max_side, max_side))
        items.append(ImageItem(name=file.name, image=img, bytes_data=bytes_data, raw_image=raw))
    return items


def init_state(n_images: int):
    if "selected_index" not in st.session_state:
        st.session_state.selected_index = 0
    if st.session_state.selected_index >= n_images:
        st.session_state.selected_index = 0




def extract_embedded_sd_tags_scored(raw_image: Image.Image) -> List[Tuple[str, float]]:
    return [(t, 1.0) for t in extract_embedded_sd_tags(raw_image)]


def recognize_tags_vit_scored(image: Image.Image) -> List[Tuple[str, float]]:
    try:
        from transformers import pipeline

        classifier = pipeline("image-classification", model="google/vit-base-patch16-224")
        results = classifier(image)
        return [(r["label"].lower(), float(r.get("score", 0))) for r in results[:15]]
    except Exception:
        return []


def recognize_tags_wd14_scored(image: Image.Image, threshold: float = 0.35) -> List[Tuple[str, float]]:
    try:
        from huggingface_hub import hf_hub_download
        import onnxruntime as ort
        import pandas as pd

        model_repo = "SmilingWolf/wd-v1-4-convnextv2-tagger-v2"
        model_path = hf_hub_download(model_repo, "model.onnx")
        csv_path = hf_hub_download(model_repo, "selected_tags.csv")

        tags_df = pd.read_csv(csv_path)
        img = image.resize((448, 448)).convert("RGB")
        x = np.array(img, dtype=np.float32)[:, :, ::-1]
        x = np.expand_dims(x, 0)

        sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        output = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]

        results = []
        for i, score in enumerate(output):
            if i >= len(tags_df):
                break
            if int(tags_df.iloc[i]["category"]) == 9:
                continue
            name = str(tags_df.iloc[i]["name"]).replace("_", " ")
            sc = float(score)
            if sc >= threshold:
                results.append((name, sc))
        results.sort(key=lambda z: z[1], reverse=True)
        return results[:80]
    except Exception:
        return []


def get_tags_by_source(item: ImageItem, source: str, wd_threshold: float) -> Tuple[str, List[Tuple[str, float]]]:
    if source == "埋め込みメタデータ（Stable Diffusion）":
        return "embedded_sd_metadata", extract_embedded_sd_tags_scored(item.raw_image)
    if source == "Danbooru系（WD14）":
        return "wd14", recognize_tags_wd14_scored(item.image, wd_threshold)
    return "vit", recognize_tags_vit_scored(item.image)




def recalibrate_tag_confidence(multi_source_tags: Dict[str, List[Tuple[str, float]]]) -> List[Tuple[str, float, List[str]]]:
    """複数モデルのタグと確率から、モデル信頼度と一致度を使って再信頼度を算出。"""
    # モデルごとの事前信頼重み（経験則）
    source_weight = {
        "wd14": 1.0,
        "vit": 0.75,
        "embedded_sd_metadata": 0.65,
        "clip_interrogator_fallback": 0.55,
    }

    bucket: Dict[str, List[Tuple[str, float]]] = {}
    for src, pairs in multi_source_tags.items():
        for t, p in pairs:
            bucket.setdefault(t, []).append((src, float(p)))

    fused = []
    for tag, vals in bucket.items():
        # 重み付き平均
        wsum = 0.0
        psum = 0.0
        used_sources = []
        for src, p in vals:
            w = source_weight.get(src, 0.6)
            wsum += w
            psum += w * p
            used_sources.append(src)

        base = psum / wsum if wsum > 0 else 0.0
        # 複数モデル一致ボーナス
        agreement = len(set(used_sources))
        bonus = min(0.2, 0.06 * (agreement - 1))
        recalibrated = max(0.0, min(1.0, base + bonus))
        fused.append((tag, recalibrated, sorted(set(used_sources))))

    fused.sort(key=lambda x: x[1], reverse=True)
    return fused

def categorize_tag(tag: str) -> str:
    t = tag.lower()
    if any(k in t for k in ["1girl", "1boy", "2girls", "2boys", "solo", "group", "people", "person"]):
        return "人数"
    if any(k in t for k in ["background", "outdoor", "indoor", "sky", "city", "forest", "street", "room"]):
        return "背景"
    if any(k in t for k in ["hair", "eyes", "smile", "glasses", "hat", "dress", "uniform", "animal"]):
        return "キャラ特徴"
    if any(k in t for k in ["standing", "sitting", "pose", "running", "jump", "looking", "hand"]):
        return "姿勢/動作"
    if any(k in t for k in ["girl", "boy", "character", "anime", "portrait", "face"]):
        return "キャラ"
    return "その他"


def eval_tag_query(tags: set, mode: str, and_tags: set, or_tags: set, not_tags: set) -> bool:
    if not_tags & tags:
        return False
    if mode == "AND":
        return and_tags.issubset(tags)
    if mode == "OR":
        return len(or_tags & tags) > 0
    if mode == "NAND":
        return not and_tags.issubset(tags)
    return True

def select_tags(item: ImageItem, tag_source: str, wd_threshold: float) -> Dict[str, object]:
    mosaic_flag, mosaic_score = detect_mosaic_region(item.image)
    if tag_source == "埋め込みメタデータ（Stable Diffusion）":
        tags = extract_embedded_sd_tags(item.raw_image)
        if tags:
            if mosaic_flag and "mosaic" not in tags:
                tags = ["mosaic"] + tags
            return {"tags": tags, "source": "embedded_sd_metadata", "fallback_used": False, "mosaic_detected": mosaic_flag, "mosaic_score": mosaic_score}
        fallback = stable_diffusion_fallback(item.image)
        tags2 = fallback or ["untagged"]
        if mosaic_flag and "mosaic" not in tags2:
            tags2 = ["mosaic"] + tags2
        return {"tags": tags2, "source": "clip_interrogator_fallback", "fallback_used": True, "mosaic_detected": mosaic_flag, "mosaic_score": mosaic_score}

    if tag_source == "Danbooru系（WD14）":
        tags = recognize_tags_wd14(item.image, threshold=wd_threshold)
        if tags:
            if mosaic_flag and "mosaic" not in tags:
                tags = ["mosaic"] + tags
            return {"tags": tags, "source": "wd14", "fallback_used": False, "mosaic_detected": mosaic_flag, "mosaic_score": mosaic_score}
        fallback = stable_diffusion_fallback(item.image)
        tags2 = fallback or ["untagged"]
        if mosaic_flag and "mosaic" not in tags2:
            tags2 = ["mosaic"] + tags2
        return {"tags": tags2, "source": "clip_interrogator_fallback", "fallback_used": True, "mosaic_detected": mosaic_flag, "mosaic_score": mosaic_score}

    tags = recognize_tags_vit(item.image)
    if tags:
        if mosaic_flag and "mosaic" not in tags:
            tags = ["mosaic"] + tags
        return {"tags": tags, "source": "vit", "fallback_used": False, "mosaic_detected": mosaic_flag, "mosaic_score": mosaic_score}
    fallback = stable_diffusion_fallback(item.image)
    return {"tags": fallback or ["untagged"], "source": "clip_interrogator_fallback", "fallback_used": True}




def detect_system_profile() -> Dict[str, object]:
    profile = {"ram_gb": None, "has_gpu": False, "gpu_name": "N/A", "recommended_mode": "low"}
    try:
        import psutil

        ram_gb = psutil.virtual_memory().total / (1024**3)
        profile["ram_gb"] = round(ram_gb, 1)
    except Exception:
        pass

    try:
        import torch

        if torch.cuda.is_available():
            profile["has_gpu"] = True
            profile["gpu_name"] = torch.cuda.get_device_name(0)
    except Exception:
        pass

    ram_gb = profile["ram_gb"] or 0
    if profile["has_gpu"] or ram_gb >= 16:
        profile["recommended_mode"] = "high"
    elif ram_gb >= 8:
        profile["recommended_mode"] = "balanced"

    return profile


def get_default_analysis_params(profile: Dict[str, object]) -> Dict[str, object]:
    mode = profile["recommended_mode"]
    if mode == "high":
        return {"max_images": 200, "max_side": 1024, "use_tsne": True, "feature_source": "ViT (高精度)"}
    if mode == "balanced":
        return {"max_images": 120, "max_side": 768, "use_tsne": False, "feature_source": "U-Net Encoder (軽量)"}
    return {"max_images": 80, "max_side": 640, "use_tsne": False, "feature_source": "U-Net Encoder (軽量)"}



def slugify_tag(text: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9_\- ]+", "", text.lower()).strip()
    text = re.sub(r"\s+", "_", text)
    return text[:24] if text else "untagged"


def export_tagged_pngs(
    folder_items: List[ImageItem],
    folder_path: str,
    keep_original_name: bool,
    delete_original: bool,
    tag_source: str,
    wd_threshold: float,
) -> Dict[str, int]:
    out_dir = Path(folder_path) / "tagged_png"
    out_dir.mkdir(parents=True, exist_ok=True)

    converted = 0
    deleted = 0
    for item in folder_items:
        tag_result = select_tags(item, tag_source, wd_threshold)
        first_tag = slugify_tag(tag_result["tags"][0]) if tag_result["tags"] else "untagged"

        stem = Path(item.name).stem if keep_original_name else f"{Path(item.name).stem}_{first_tag}"
        out_path = out_dir / f"{stem}.png"

        pnginfo = None
        try:
            from PIL import PngImagePlugin

            pnginfo = PngImagePlugin.PngInfo()
            pnginfo.add_text("tags", ", ".join(tag_result["tags"]))
            pnginfo.add_text("tag_source", str(tag_result["source"]))
        except Exception:
            pnginfo = None

        item.image.save(out_path, format="PNG", pnginfo=pnginfo)
        converted += 1

        if delete_original:
            original = Path(folder_path) / item.name
            if original.exists() and original.suffix.lower() != ".png":
                original.unlink()
                deleted += 1

    return {"converted": converted, "deleted": deleted}



def analyze_tag_cooccurrence(tag_records: List[Dict[str, object]], min_count: int = 2) -> List[Tuple[str, str, int, float]]:
    image_to_tags: Dict[str, set] = {}
    for r in tag_records:
        image_to_tags.setdefault(str(r["image"]), set()).add(str(r["tag"]))

    tag_count = Counter()
    pair_count = Counter()
    n_images = max(1, len(image_to_tags))

    for tags in image_to_tags.values():
        for t in tags:
            tag_count[t] += 1
        for a, b in combinations(sorted(tags), 2):
            pair_count[(a, b)] += 1

    results = []
    for (a, b), c in pair_count.items():
        if c < min_count:
            continue
        # 簡易PMIライク指標（共起しやすさ）
        pa = tag_count[a] / n_images
        pb = tag_count[b] / n_images
        pab = c / n_images
        affinity = float(np.log((pab + 1e-9) / ((pa * pb) + 1e-9)))
        results.append((a, b, c, affinity))

    results.sort(key=lambda x: (x[3], x[2]), reverse=True)
    return results



def render_clickable_scatter(folder_items: List[ImageItem], coords: np.ndarray, clusters: np.ndarray):
    try:
        import pandas as pd
        import plotly.express as px

        df = pd.DataFrame(
            {
                "x": coords[:, 0],
                "y": coords[:, 1],
                "cluster": clusters.astype(str),
                "name": [item.name for item in folder_items],
                "idx": list(range(len(folder_items))),
            }
        )
        fig = px.scatter(df, x="x", y="y", color="cluster", hover_name="name", custom_data=["idx"])
        fig.update_layout(height=520, margin=dict(l=10, r=10, t=30, b=10))

        event = st.plotly_chart(fig, use_container_width=True, key="cluster_scatter", on_select="rerun")
        selected_idx = None
        if event and isinstance(event, dict):
            points = event.get("selection", {}).get("points", [])
            if points:
                selected_idx = int(points[0].get("customdata", [None])[0])

        if selected_idx is not None and 0 <= selected_idx < len(folder_items):
            st.markdown("#### プロット選択画像")
            st.image(folder_items[selected_idx].image, caption=folder_items[selected_idx].name, use_container_width=True)
    except Exception as e:
        st.info(f"プロット表示でクリック選択が使えない環境です: {e}")



def dhash(image: Image.Image, hash_size: int = 16) -> int:
    img = image.convert("L").resize((hash_size + 1, hash_size))
    pixels = np.asarray(img)
    diff = pixels[:, 1:] > pixels[:, :-1]
    bits = 0
    for v in diff.flatten():
        bits = (bits << 1) | int(v)
    return bits


def hamming_distance(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def quality_signature(image: Image.Image) -> Dict[str, float]:
    gray = image.convert("L").resize((256, 256))
    arr = np.asarray(gray, dtype=np.float32)
    # シャープネス(低いほど劣化/モザイク傾向)
    gy, gx = np.gradient(arr)
    sharpness = float(np.mean(np.sqrt(gx * gx + gy * gy)))
    return {"sharpness": sharpness}


def group_near_duplicates(folder_items: List[ImageItem], folder_path: str, max_hamming: int = 18) -> List[Dict[str, object]]:
    sigs = []
    for i, item in enumerate(folder_items):
        h = dhash(item.image)
        q = quality_signature(item.image)
        full_path = Path(folder_path) / item.name
        file_size = full_path.stat().st_size if full_path.exists() else len(item.bytes_data)
        sigs.append({"idx": i, "name": item.name, "path": str(full_path), "file_size": int(file_size), "hash": h, "sharpness": q["sharpness"]})

    parent = list(range(len(sigs)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(len(sigs)):
        for j in range(i + 1, len(sigs)):
            if hamming_distance(sigs[i]["hash"], sigs[j]["hash"]) <= max_hamming:
                union(i, j)

    groups = {}
    for i in range(len(sigs)):
        r = find(i)
        groups.setdefault(r, []).append(sigs[i])

    result = []
    for members in groups.values():
        if len(members) < 2:
            continue
        # サイズ降順で左→右に表示（最大サイズを先頭に保持）
        sorted_members = sorted(members, key=lambda x: x["file_size"], reverse=True)
        result.append({
            "members": sorted_members,
            "count": len(sorted_members),
            "keep_largest": sorted_members[0]["name"],
        })

    result.sort(key=lambda g: g["count"], reverse=True)
    return result



def delete_duplicate_group_except_largest(group: Dict[str, object]) -> Dict[str, int]:
    members = group.get("members", [])
    if not members:
        return {"deleted": 0, "kept": 0}

    kept = 0
    deleted = 0
    for i, m in enumerate(members):
        p = Path(str(m["path"]))
        if i == 0:
            kept += 1
            continue
        if p.exists():
            p.unlink()
            deleted += 1
    return {"deleted": deleted, "kept": kept}


def list_image_files(folder_path: str, include_subfolders: bool = True) -> List[Path]:
    folder = Path(folder_path)
    exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    it = folder.rglob("*") if include_subfolders else folder.glob("*")
    return sorted([p for p in it if p.is_file() and p.suffix.lower() in exts])


def merge_child_into_parent_with_dedup(parent_folder: str, child_folder: str, max_hamming: int = 18) -> Dict[str, object]:
    parent_files = list_image_files(parent_folder, include_subfolders=True)
    child_files = list_image_files(child_folder, include_subfolders=True)
    if not child_files:
        return {"child_total": 0, "child_unique_after_self_dedup": 0, "duplicates_in_child": 0, "duplicates_with_parent": 0, "merged": 0}

    child_entries = []
    for p in child_files:
        with Image.open(p) as im:
            h = dhash(im)
        child_entries.append({"path": p, "hash": h, "size": p.stat().st_size})

    kept_child = []
    duplicates_in_child = 0
    used = [False] * len(child_entries)
    for i in range(len(child_entries)):
        if used[i]:
            continue
        group = [child_entries[i]]
        used[i] = True
        for j in range(i + 1, len(child_entries)):
            if used[j]:
                continue
            if hamming_distance(child_entries[i]["hash"], child_entries[j]["hash"]) <= max_hamming:
                group.append(child_entries[j])
                used[j] = True
        group_sorted = sorted(group, key=lambda x: x["size"], reverse=True)
        kept_child.append(group_sorted[0])
        duplicates_in_child += max(0, len(group_sorted) - 1)

    parent_hashes = []
    for p in parent_files:
        with Image.open(p) as im:
            parent_hashes.append(dhash(im))

    to_merge = []
    duplicates_with_parent = 0
    for e in kept_child:
        is_dup = False
        for ph in parent_hashes:
            if hamming_distance(e["hash"], ph) <= max_hamming:
                is_dup = True
                break
        if is_dup:
            duplicates_with_parent += 1
        else:
            to_merge.append(e["path"])

    parent_dir = Path(parent_folder)
    merged = 0
    for src in to_merge:
        target = parent_dir / src.name
        if target.exists():
            stem, suffix = target.stem, target.suffix
            n = 1
            while True:
                cand = parent_dir / f"{stem}_{n}{suffix}"
                if not cand.exists():
                    target = cand
                    break
                n += 1
        shutil.copy2(src, target)
        merged += 1

    return {
        "child_total": len(child_files),
        "child_unique_after_self_dedup": len(kept_child),
        "duplicates_in_child": duplicates_in_child,
        "duplicates_with_parent": duplicates_with_parent,
        "merged": merged,
    }



def handle_double_click_detail(key_base: str, item: ImageItem, extra: str = ""):
    click_key = f"dbl_cnt_{key_base}"
    last_key = f"dbl_last_{key_base}"
    if click_key not in st.session_state:
        st.session_state[click_key] = 0
    if last_key not in st.session_state:
        st.session_state[last_key] = 0.0

    if st.button("詳細（ダブルクリック）", key=f"btn_{key_base}"):
        now = time.time()
        if now - st.session_state[last_key] <= 0.7:
            st.session_state[click_key] = 0
            st.session_state[last_key] = 0.0
            st.markdown(f"**{item.name} の詳細**")
            st.json({
                "name": item.name,
                "size": item.image.size,
                "mode": item.image.mode,
                "format": item.raw_image.format,
                "extra": extra,
                "exif": extract_exif(item.raw_image),
            })
        else:
            st.session_state[click_key] = 1
            st.session_state[last_key] = now
            st.caption("もう一度押すと詳細を表示します（0.7秒以内）")



def extract_image_date(item: ImageItem) -> str:
    exif = extract_exif(item.raw_image)
    for k in ["DateTimeOriginal", "DateTime", "DateTimeDigitized"]:
        if k in exif:
            return exif[k]
    return "unknown"


def group_tags_for_display(tags: List[str]) -> Dict[str, List[str]]:
    buckets: Dict[str, List[str]] = {"キャラ": [], "人数": [], "背景": [], "キャラ特徴": [], "姿勢/動作": [], "その他": []}
    for t in tags:
        c = categorize_tag(t)
        buckets.setdefault(c, []).append(t)
    return buckets


def run_folder_analysis_job(job_id: str, params: Dict[str, object]):
    try:
        with ASYNC_LOCK:
            ASYNC_JOBS[job_id] = {"status": "running", "message": "フォルダ読み込み中..."}

        folder_items, load_stats = load_images_from_folder(
            str(params["folder_path"]),
            max_images=int(params["max_images"]),
            max_side=int(params["max_side"]),
            include_subfolders=bool(params["include_subfolders"]),
        )
        if len(folder_items) < 2:
            with ASYNC_LOCK:
                ASYNC_JOBS[job_id] = {"status": "done", "folder_items": folder_items, "load_stats": load_stats, "warning": "クラスタリングには2枚以上の画像が必要です。"}
            return

        with ASYNC_LOCK:
            ASYNC_JOBS[job_id] = {"status": "running", "message": "特徴抽出・クラスタリング中..."}

        if params["feature_source"] == "U-Net Encoder (軽量)":
            features = extract_features_unet(folder_items)
        else:
            features = extract_features_vit(folder_items)
        clusters, coords = cluster_and_embed(features, n_clusters=int(params["n_clusters"]), use_tsne=bool(params["use_tsne"]))

        with ASYNC_LOCK:
            ASYNC_JOBS[job_id] = {
                "status": "done",
                "folder_items": folder_items,
                "load_stats": load_stats,
                "clusters": clusters,
                "coords": coords,
            }
    except Exception as e:
        with ASYNC_LOCK:
            ASYNC_JOBS[job_id] = {"status": "error", "error": str(e)}

def main():
    st.set_page_config(page_title="画像タイルビューア", layout="wide")
    st.title("🖼️ 画像タイル + スライドショー + 詳細情報")

    render_rhythm_game_home()
    st.divider()

    profile = detect_system_profile()
    defaults = get_default_analysis_params(profile)

    st.caption(f"推定スペック: RAM={profile['ram_gb']}GB / GPU={profile['gpu_name']} / 推奨モード={profile['recommended_mode']}")

    uploaded_files = st.file_uploader(
        "画像を複数選択してください", type=["png", "jpg", "jpeg", "webp"], accept_multiple_files=True
    )
    if not uploaded_files:
        st.info("まずは画像をアップロードしてください。")
        return

    images = load_images(uploaded_files)
    init_state(len(images))

    st.subheader("1) タイル表示")
    cols_per_row = st.slider("1行の表示数", min_value=2, max_value=6, value=4)

    for i in range(0, len(images), cols_per_row):
        cols = st.columns(cols_per_row)
        for j, col in enumerate(cols):
            idx = i + j
            if idx >= len(images):
                continue
            with col:
                st.image(images[idx].image, caption=images[idx].name, use_container_width=True)
                if st.button("この画像を選択", key=f"sel_{idx}"):
                    st.session_state.selected_index = idx

    st.divider()
    st.subheader("2) 画像詳細ビュー")

    if "detail_zoom" not in st.session_state:
        st.session_state.detail_zoom = 100
    if "slide_interval" not in st.session_state:
        st.session_state.slide_interval = 2
    if "last_slide_advance_at" not in st.session_state:
        st.session_state.last_slide_advance_at = 0.0

    top1, top2, top3, top4, top5, top6 = st.columns([1, 1, 1.5, 1.5, 1.2, 2])
    with top1:
        if st.button("◀ 前へ", key="detail_prev"):
            st.session_state.selected_index = (st.session_state.selected_index - 1) % len(images)
    with top2:
        if st.button("次へ ▶", key="detail_next"):
            st.session_state.selected_index = (st.session_state.selected_index + 1) % len(images)
    with top3:
        if st.button("スライドショー開始", key="go_slideshow"):
            st.session_state.auto_play_detail = True
            st.session_state.last_slide_advance_at = time.time()
        if st.button("停止", key="stop_slideshow"):
            st.session_state.auto_play_detail = False
    with top4:
        st.session_state.detail_zoom = st.selectbox("表示倍率", [50, 75, 100, 125, 150, 200], index=[50,75,100,125,150,200].index(st.session_state.detail_zoom) if st.session_state.detail_zoom in [50,75,100,125,150,200] else 2)
    with top5:
        st.caption(f"現在倍率: {st.session_state.detail_zoom}%")
    with top6:
        st.session_state.slide_interval = st.slider("スライド表示時間（秒）", 1, 15, int(st.session_state.slide_interval), 1, key="slide_interval_slider")

    if st.session_state.get("auto_play_detail", False):
        now = time.time()
        if now - float(st.session_state.last_slide_advance_at) >= float(st.session_state.slide_interval):
            st.session_state.selected_index = (st.session_state.selected_index + 1) % len(images)
            st.session_state.last_slide_advance_at = now
            st.rerun()

    selected = images[st.session_state.selected_index]

    st.markdown("#### スライドショー表示（ウィンドウ最大）")
    slide_img = selected.image.copy()
    if st.session_state.detail_zoom != 100:
        z = st.session_state.detail_zoom / 100.0
        slide_img = slide_img.resize((max(1, int(slide_img.width * z)), max(1, int(slide_img.height * z))))
    st.image(slide_img, caption=selected.name, use_container_width=True)

    st.divider()
    st.subheader("3) 詳細情報（左:画像 / 右:メタデータ・タグ）")

    tag_source = st.radio(
        "表示するタグ付けシステム",
        ["埋め込みメタデータ（Stable Diffusion）", "Danbooru系（WD14）", "汎用分類（ViT）"],
        horizontal=True,
        key="detail_tag_source",
    )
    wd_threshold = st.slider("WD14 閾値", 0.05, 0.95, 0.35, 0.05, key="detail_wd")

    tag_result = select_tags(selected, tag_source, wd_threshold)
    grouped = group_tags_for_display(tag_result["tags"])

    left, right = st.columns([2, 1])
    with left:
        img = selected.image.copy()
        if st.session_state.detail_zoom != 100:
            z = st.session_state.detail_zoom / 100.0
            img = img.resize((max(1, int(img.width * z)), max(1, int(img.height * z))))
        st.image(img, caption=selected.name, use_container_width=True)

    with right:
        st.markdown("#### 画像情報")
        st.write({
            "path": selected.name,
            "size": f"{selected.image.size[0]}x{selected.image.size[1]}",
            "取得日": extract_image_date(selected),
            "タグシステム": tag_result["source"],
        })
        st.markdown("#### グループ化タグ")
        for cat, tags in grouped.items():
            if not tags:
                continue
            st.markdown(f"**{cat}**")
            cols = st.columns(2)
            for i, t in enumerate(tags):
                if cols[i % 2].button(t, key=f"tagbtn_{st.session_state.selected_index}_{cat}_{i}"):
                    st.session_state.detail_tag_filter = t

    if st.session_state.get("detail_tag_filter"):
        tf = st.session_state.detail_tag_filter
        st.markdown(f"#### タグ『{tf}』の画像タイル")
        matched = []
        for it in images:
            tr = select_tags(it, tag_source, wd_threshold)
            if tf in tr["tags"]:
                matched.append(it)
        if matched:
            cols = st.columns(4)
            for i, it in enumerate(matched):
                with cols[i % 4]:
                    st.image(it.image, caption=it.name, use_container_width=True)
        else:
            st.info("同じタグの画像は見つかりませんでした。")

    st.divider()
    st.subheader("4) フォルダ画像の特徴量クラスタリング（低RAM/CPU対応）")
    folder_path = st.text_input("画像フォルダのパス", value="")
    feature_source = st.radio("特徴抽出", ["ViT (高精度)", "U-Net Encoder (軽量)"], index=0 if defaults["feature_source"]=="ViT (高精度)" else 1, horizontal=True)
    n_clusters = st.slider("クラスタ数", 2, 10, 4)
    max_images = st.slider("最大読み込み枚数（メモリ節約）", 10, 300, int(defaults["max_images"]), 10)
    max_side = st.slider("最大画像サイズ（長辺px）", 256, 1536, int(defaults["max_side"]), 64)
    include_subfolders = st.toggle("サブフォルダも解析する", value=False)
    use_tsne = st.toggle("t-SNEを使う（重い処理）", value=bool(defaults["use_tsne"]))

    st.markdown("#### PNG出力オプション（タグ付け後）")
    folder_tag_source = st.radio("フォルダ画像のタグソース", ["埋め込みメタデータ（Stable Diffusion）", "Danbooru系（WD14）", "汎用分類（ViT）"], horizontal=True, key="folder_tag_source")
    keep_original_name = st.toggle("元画像名を保持する", value=True)
    delete_original = st.toggle("元画像を削除する（非PNGのみ）", value=False)

    st.markdown("#### タグ検索・統合")
    search_sources = st.multiselect("タグ取得ソース（複数選択可）", ["埋め込みメタデータ（Stable Diffusion）", "Danbooru系（WD14）", "汎用分類（ViT）"], default=["Danbooru系（WD14）"])
    merge_mode = st.radio("複数ソース時の統合", ["統合する（最大確率）", "統合する（平均確率）", "統合しない（ソース別）"], horizontal=True)
    st.caption("統合時は同一タグのスコアを最大値または平均値で統合します。")
    prob_threshold = st.slider("タグ確率しきい値", 0.0, 1.0, 0.35, 0.01)
    query_mode = st.selectbox("検索モード", ["AND", "OR", "NAND"])

    col_run, col_refresh = st.columns([1, 1])
    with col_run:
        run_clicked = st.button("フォルダを解析（バックグラウンド実行）")
    with col_refresh:
        if st.button("解析結果を更新", key="refresh_analysis"):
            st.rerun()

    if run_clicked:
        if not folder_path:
            st.warning("フォルダパスを入力してください。")
        else:
            job_id = f"analysis_{int(time.time()*1000)}"
            st.session_state["folder_analysis_job_id"] = job_id
            t = threading.Thread(
                target=run_folder_analysis_job,
                args=(job_id, {
                    "folder_path": folder_path,
                    "max_images": max_images,
                    "max_side": max_side,
                    "include_subfolders": include_subfolders,
                    "feature_source": feature_source,
                    "n_clusters": n_clusters,
                    "use_tsne": use_tsne,
                }),
                daemon=True,
            )
            t.start()
            st.info("バックグラウンド解析を開始しました。画像閲覧/スライドショーを継続できます。")

    job_id = st.session_state.get("folder_analysis_job_id")
    if job_id:
        with ASYNC_LOCK:
            job_data = ASYNC_JOBS.get(job_id, {"status": "unknown"})
        status = job_data.get("status", "unknown")
        if status == "running":
            st.warning(f"解析実行中: {job_data.get('message', '')}（他のUI操作は継続可能です）")
        elif status == "error":
            st.error(f"バックグラウンド解析に失敗しました: {job_data.get('error')}")
        elif status == "done":
            try:
                folder_items = job_data["folder_items"]
                load_stats = job_data["load_stats"]

                st.caption(f"対応拡張子: {', '.join(load_stats['supported_exts'])}")
                if load_stats["skipped_exts"]:
                    st.warning("未対応または読み込み失敗でスキップした拡張子があります。")
                    st.json(load_stats["skipped_exts"])
                if "warning" in job_data:
                    st.warning(job_data["warning"])
                else:
                    clusters = job_data["clusters"]
                    coords = job_data["coords"]

                    st.success(f"解析完了: {len(folder_items)}枚")
                    # タグインデックス作成
                    tag_records = []
                    for item in folder_items:
                        per_source = []
                        for src in search_sources:
                            src_name, scored = get_tags_by_source(item, src, wd_threshold)
                            scored = [(t, p) for t, p in scored if p >= prob_threshold]
                            per_source.append((src_name, scored))

                        if merge_mode != "統合しない（ソース別）":
                            tag_to_scores: Dict[str, List[float]] = {}
                            tag_to_sources: Dict[str, List[str]] = {}
                            for src_name, scored in per_source:
                                for t, p in scored:
                                    tag_to_scores.setdefault(t, []).append(float(p))
                                    tag_to_sources.setdefault(t, []).append(src_name)
                            for t, scores in tag_to_scores.items():
                                score = max(scores) if "最大" in merge_mode else sum(scores) / len(scores)
                                tag_records.append({"image": item.name, "tag": t, "score": score, "source": "+".join(sorted(set(tag_to_sources[t])))})
                        else:
                            for src_name, scored in per_source:
                                for t, p in scored:
                                    tag_records.append({"image": item.name, "tag": t, "score": p, "source": src_name})

                    all_tags = sorted(set(r["tag"] for r in tag_records))
                    selected_and = set(st.multiselect("ANDタグ", all_tags, default=[]))
                    selected_or = set(st.multiselect("ORタグ", all_tags, default=[]))
                    selected_not = set(st.multiselect("NOTタグ", all_tags, default=[]))

                    image_to_tags = {}
                    for r in tag_records:
                        image_to_tags.setdefault(r["image"], set()).add(r["tag"])
                    hit_images = [img for img, ts in image_to_tags.items() if eval_tag_query(ts, query_mode, selected_and, selected_or, selected_not)]

                    st.markdown(f"#### タグ検索結果: {len(hit_images)}件")
                    st.write(hit_images)

                    tag_counter = Counter([r["tag"] for r in tag_records])
                    top_tags = tag_counter.most_common(30)
                    st.markdown("#### よく付くタグ")
                    st.write(top_tags)

                    category_counter = Counter([categorize_tag(t) for t, _ in top_tags])
                    st.markdown("#### タグカテゴリ傾向（キャラ/人数/背景/特徴/姿勢など）")
                    st.write(dict(category_counter))


                    st.markdown("#### 重複画像解析（劣化・モザイク・縮小を含む類似判定）")
                    dup_threshold = st.slider("重複判定ハミング距離しきい値", 4, 40, 18, 1)
                    dup_groups = group_near_duplicates(folder_items, folder_path=folder_path, max_hamming=dup_threshold)
                    st.write(f"重複グループ数: {len(dup_groups)}")
                    for gi, g in enumerate(dup_groups[:20], start=1):
                        st.markdown(f"##### 重複グループ {gi}（{g['count']}枚 / 最大サイズ保持: {g['keep_largest']}）")
                        cols = st.columns(min(4, g["count"]))
                        for k, m in enumerate(g["members"]):
                            idx = int(m["idx"])
                            with cols[k % len(cols)]:
                                st.image(folder_items[idx].image, caption=f"{m['name']} | size={m['file_size']/1024:.1f}KB", use_container_width=True)

                    st.markdown("#### タグ共起解析（共存しやすいタグ）")
                    min_cooccur = st.slider("共起の最小出現回数", 1, 10, 2, 1)
                    cooccur = analyze_tag_cooccurrence(tag_records, min_count=min_cooccur)
                    if cooccur:
                        st.dataframe([
                            {"tag_a": a, "tag_b": b, "cooccur_count": c, "affinity(pmi_like)": round(score, 4)}
                            for a, b, c, score in cooccur[:100]
                        ])
                    else:
                        st.info("条件を満たす共起タグがありません。")
                    for cluster_id in sorted(set(clusters.tolist())):
                        st.markdown(f"#### グループ {cluster_id}")
                        idxs = [i for i, c in enumerate(clusters) if c == cluster_id]
                        cols = st.columns(min(4, max(1, len(idxs))))
                        for k, idx in enumerate(idxs):
                            with cols[k % len(cols)]:
                                st.image(folder_items[idx].image, caption=f"{folder_items[idx].name} (x={coords[idx][0]:.2f}, y={coords[idx][1]:.2f})", use_container_width=True)

                    st.markdown("#### クラスタプロット（クリックで画像表示）")
                    render_clickable_scatter(folder_items, coords, clusters)

                    if st.button("タグ付けしてPNG出力", key="export_png"):
                        result = export_tagged_pngs(
                            folder_items=folder_items,
                            folder_path=folder_path,
                            keep_original_name=keep_original_name,
                            delete_original=delete_original,
                            tag_source=folder_tag_source,
                            wd_threshold=wd_threshold,
                        )
                        st.success(f"PNG出力: {result['converted']}件 / 元画像削除: {result['deleted']}件")

                    st.markdown("#### フォルダ統合（子→親）")
                    merge_parent = st.text_input("統合先（親フォルダ）", value=folder_path, key="merge_parent")
                    merge_child = st.text_input("統合元（子フォルダ）", value="", key="merge_child")
                    merge_threshold = st.slider("統合時の重複判定ハミング距離", 4, 40, 18, 1, key="merge_threshold")
                    if st.button("重複確認して統合を実行", key="run_merge"):
                        if not merge_parent or not merge_child:
                            st.warning("親フォルダと子フォルダの両方を指定してください。")
                        else:
                            merge_result = merge_child_into_parent_with_dedup(
                                parent_folder=merge_parent,
                                child_folder=merge_child,
                                max_hamming=merge_threshold,
                            )
                            st.success("統合フロー完了（子内重複チェック → 親重複チェック → 統合）")
                            st.json(merge_result)
            except Exception as e:
                st.error(f"結果表示に失敗しました: {e}")


if __name__ == "__main__":
    main()
