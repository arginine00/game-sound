import importlib
import configparser
import csv
import io
import json
import os
import re
import shutil
import site
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import ExifTags, Image, PngImagePlugin
from PIL.ImageQt import ImageQt
from PySide6.QtCore import QObject, QPointF, QRectF, Qt, QThread, QTimer, Signal
from PySide6.QtGui import QBrush, QColor, QPainter, QPen, QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFileDialog,
    QFormLayout,
    QGraphicsEllipseItem,
    QGraphicsScene,
    QGraphicsTextItem,
    QGraphicsView,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSlider,
    QSpinBox,
    QSplitter,
    QTabWidget,
    QTableWidget,
    QTableWidgetItem,
    QToolBar,
    QVBoxLayout,
    QWidget,
)


MAJOR_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}
DEFAULT_ALWAYS_EXTS = ".png, .jpg, .jpeg, .webp, .bmp, .tif"
PROMPT_KEYS = ["parameters", "prompt", "Prompt", "Comment", "Description", "tags", "group_tags"]
TAG_CATEGORY_RULES = [
    ("人数", ["solo", "1girl", "1boy", "2girls", "2boys", "multiple", "girls", "boys", "group"]),
    ("姿勢", ["standing", "sitting", "lying", "kneeling", "walking", "running", "pose", "looking", "facing", "from "]),
    ("背景", ["background", "outdoors", "indoors", "sky", "street", "room", "forest", "beach", "city", "night", "day"]),
    ("キャラ名", ["(", ")"]),
    ("作品名", ["series", "copyright", "kantai", "genshin", "touhou", "pokemon", "idolmaster", "fate"]),
    ("顔", ["face", "eyes", "smile", "mouth", "nose", "blush", "expression", "crying", "laughing"]),
    ("髪/目/色", ["hair", "eyes", "red ", "blue ", "green ", "black ", "white ", "blonde", "brown ", "pink ", "purple "]),
    ("服装/パーツ", ["shirt", "dress", "skirt", "pants", "hat", "shoes", "sleeves", "ribbon", "tail", "ears", "wings"]),
]
TAGGER_MODELS = {
    "WD Tagger v3": "wd14",
    "DeepDanbooru": "deepdanbooru",
    "Camie Tagger v2": "camie",
}
MODEL_FILES = {
    ("SmilingWolf/wd-eva02-large-tagger-v3", "model.onnx"): ("wd14", "model.onnx"),
    ("SmilingWolf/wd-eva02-large-tagger-v3", "selected_tags.csv"): ("wd14", "selected_tags.csv"),
    ("skytnt/deepdanbooru_onnx", "deepdanbooru.onnx"): ("deepdanbooru", "deepdanbooru.onnx"),
    ("Camais03/camie-tagger-v2", "camie-tagger-v2.onnx"): ("camie", "camie-tagger-v2.onnx"),
    ("Camais03/camie-tagger-v2", "camie-tagger-v2-metadata.json"): ("camie", "camie-tagger-v2-metadata.json"),
}
CUSTOM_MODEL_ROOT: Path | None = None
MODEL_FILE_GROUPS = {
    "wd14": [
        ("SmilingWolf/wd-eva02-large-tagger-v3", "model.onnx"),
        ("SmilingWolf/wd-eva02-large-tagger-v3", "selected_tags.csv"),
    ],
    "deepdanbooru": [
        ("skytnt/deepdanbooru_onnx", "deepdanbooru.onnx"),
    ],
    "camie": [
        ("Camais03/camie-tagger-v2", "camie-tagger-v2.onnx"),
        ("Camais03/camie-tagger-v2", "camie-tagger-v2-metadata.json"),
    ],
}
ONNX_SESSION_CACHE = {}
TRANSLATION_MODEL_DIRNAME = "tag_translation"
TAG_DICTIONARY_DIRNAME = "tag_dictionary"
TRANSLATION_MODEL_REPO = "Helsinki-NLP/opus-mt-en-jap"
TRANSLATION_REQUIRED_FILES = {
    "config.json",
    "generation_config.json",
    "pytorch_model.bin",
    "source.spm",
    "target.spm",
    "tokenizer_config.json",
    "vocab.json",
}
BUILTIN_TAG_TRANSLATIONS = {
    "1boy": "男性1人",
    "1girl": "女性1人",
    "2boys": "男性2人",
    "2girls": "女性2人",
    "animal ears": "獣耳",
    "arms up": "腕を上げる",
    "bare shoulders": "肩出し",
    "beach": "砂浜",
    "black eyes": "黒い目",
    "black hair": "黒髪",
    "blue background": "青い背景",
    "blue eyes": "青い目",
    "blue hair": "青髪",
    "blonde hair": "金髪",
    "blush": "赤面",
    "brown eyes": "茶色の目",
    "brown hair": "茶髪",
    "city": "街",
    "closed eyes": "閉じた目",
    "dress": "ドレス",
    "face": "顔",
    "forest": "森",
    "green eyes": "緑の目",
    "green hair": "緑髪",
    "hair ornament": "髪飾り",
    "hat": "帽子",
    "indoors": "屋内",
    "long hair": "長髪",
    "looking at viewer": "こちらを見る",
    "lying": "横たわる",
    "multiple girls": "複数の女性",
    "night": "夜",
    "open mouth": "開いた口",
    "outdoors": "屋外",
    "pink hair": "ピンク髪",
    "purple eyes": "紫の目",
    "red eyes": "赤い目",
    "red hair": "赤髪",
    "ribbon": "リボン",
    "short hair": "短髪",
    "sitting": "座る",
    "sky": "空",
    "skirt": "スカート",
    "smile": "笑顔",
    "solo": "1人",
    "standing": "立つ",
    "street": "通り",
    "tail": "尻尾",
    "twintails": "ツインテール",
    "white background": "白背景",
    "white hair": "白髪",
    "yellow eyes": "黄色い目",
}

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "0")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def integrated_internal_dirs():
    seen = set()
    candidates = [
        Path.cwd() / "IntegratedTagViewer" / "_internal",
        Path(__file__).resolve().parent / "IntegratedTagViewer" / "_internal",
        Path(sys.executable).resolve().parent.parent.parent / "IntegratedTagViewer" / "_internal",
        Path(sys.executable).resolve().parent.parent / "IntegratedTagViewer" / "_internal",
        Path(sys.executable).resolve().parent / "IntegratedTagViewer" / "_internal",
    ]
    for base in candidates:
        try:
            resolved = base.resolve()
        except Exception:
            resolved = base
        key = str(resolved).lower()
        if resolved.exists() and key not in seen:
            seen.add(key)
            yield resolved


def iter_external_site_packages():
    for base in integrated_internal_dirs():
        yield str(base)
        for child in base.iterdir():
            if child.is_dir() and (child.name.endswith(".libs") or child.name in {"cv2", "onnxruntime", "sklearn", "scipy", "numpy", "pandas"}):
                yield str(child)
    yield site.getusersitepackages()
    yield from site.getsitepackages()
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        programs = Path(local_appdata) / "Programs" / "Python"
        if programs.exists():
            for candidate in programs.glob("Python*/Lib/site-packages"):
                yield str(candidate)
    for candidate in [
        Path.home() / "AppData/Local/Programs/Python/Python311/Lib/site-packages",
        Path(sys.executable).parent.parent / "Lib/site-packages",
    ]:
        yield str(candidate)


def iter_external_dll_dirs():
    dll_names = {"cv2", "onnxruntime", "numpy.libs", "scipy.libs", "pandas.libs", "sklearn.libs", "llvmlite.libs"}
    for base in integrated_internal_dirs():
        yield str(base)
        for name in dll_names:
            candidate = base / name
            if candidate.exists():
                yield str(candidate)


for dll_path in iter_external_dll_dirs():
    try:
        if hasattr(os, "add_dll_directory"):
            os.add_dll_directory(dll_path)
        os.environ["PATH"] = dll_path + os.pathsep + os.environ.get("PATH", "")
    except Exception:
        pass


def app_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def default_model_dir() -> Path:
    return app_base_dir() / "models"


def user_translation_path() -> Path:
    return app_base_dir() / "tag_translations_user.json"


def default_translation_model_dir() -> Path:
    return default_model_dir() / TRANSLATION_MODEL_DIRNAME


def default_tag_dictionary_path() -> Path:
    dictionary_dir = default_model_dir() / TAG_DICTIONARY_DIRNAME
    preferred = dictionary_dir / "Danbooru_JPTag_over100used.csv"
    if preferred.exists():
        return preferred
    fallback = dictionary_dir / "danbooru_jp.csv"
    if fallback.exists():
        return fallback
    return preferred


def translation_model_ready(model_dir: Path) -> bool:
    return all((model_dir / filename).exists() for filename in TRANSLATION_REQUIRED_FILES)


def external_python_commands() -> list[list[str]]:
    commands: list[list[str]] = []
    candidates: list[Path] = []
    base_executable = getattr(sys, "_base_executable", "")
    if base_executable:
        candidates.append(Path(base_executable))
    python_path = shutil.which("python")
    if python_path:
        candidates.append(Path(python_path))
    py_path = shutil.which("py")
    if py_path:
        commands.append([py_path, "-3"])
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        candidates.extend(Path(local_appdata).glob("Programs/Python/Python*/python.exe"))
    seen = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except Exception:
            resolved = candidate
        key = str(resolved).lower()
        if key in seen or not resolved.exists() or not resolved.name.lower().startswith("python"):
            continue
        seen.add(key)
        commands.append([str(resolved)])
    return commands


def run_external_python(code: str, args: list[str], timeout: int = 300) -> subprocess.CompletedProcess:
    errors = []
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("HF_HUB_DISABLE_XET", "1")
    env.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "0")
    env.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    startupinfo = None
    creationflags = 0
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    for command in external_python_commands():
        try:
            result = subprocess.run(
                command + ["-B", "-c", code, *args],
                cwd=str(app_base_dir()),
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout,
                startupinfo=startupinfo,
                creationflags=creationflags,
            )
        except Exception as exc:
            errors.append(f"{' '.join(command)}: {exc}")
            continue
        if result.returncode == 0:
            return result
        errors.append(f"{' '.join(command)}: {result.stderr or result.stdout}")
    raise RuntimeError("外部Pythonで処理を実行できませんでした。\n" + "\n".join(errors[-3:]))


for package_path in iter_external_site_packages():
    if package_path and package_path not in sys.path:
        sys.path.append(package_path)


@dataclass
class ImageItem:
    path: Path
    name: str
    image: Image.Image
    raw_image: Image.Image
    bytes_data: bytes
    tags: set[str]
    tag_scores: dict[str, float]
    tag_model: str = ""


def normalize_ext(value: str) -> str:
    value = value.strip().lower()
    if not value:
        return ""
    return value if value.startswith(".") else f".{value}"


def parse_ext_text(text: str) -> set[str]:
    return {ext for ext in (normalize_ext(part) for part in re.split(r"[,;\s]+", text)) if ext}


def normalize_tag_token(token: str) -> str:
    return re.sub(r"[_-]+", " ", token).strip().lower()


def parse_tag_text(text: str) -> set[str]:
    return {tag for tag in (normalize_tag_token(part) for part in re.split(r"[,;\n\r\t|]+", text)) if len(tag) >= 2}


def clean_translated_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    japanese = r"\u3040-\u30ff\u3400-\u9fff"
    text = re.sub(fr"(?<=[{japanese}])\s+(?=[{japanese}])", "", text)
    text = re.sub(r"\s+([。、,.!?！？])", r"\1", text)
    return text


def looks_mojibake(text: str) -> bool:
    if not text:
        return False
    bad_chars = sum(text.count(ch) for ch in "縺繧繝荳蟄逶邱�")
    return bad_chars >= max(2, len(text) // 3)


class TagTranslationStore:
    def __init__(self, path: Path | None = None):
        self.path = path or user_translation_path()
        self.user_translations: dict[str, str] = {}
        self.external_translations: dict[str, str] = {}
        self.load()

    def load(self):
        self.user_translations = {}
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return
        if isinstance(data, dict):
            self.user_translations = {
                normalize_tag_token(str(key)): str(value).strip()
                for key, value in data.items()
                if str(key).strip() and str(value).strip()
            }

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = dict(sorted(self.user_translations.items()))
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def load_external_csv(self, path: Path) -> tuple[int, int]:
        translations: dict[str, str] = {}
        skipped = 0
        if not path.exists():
            self.external_translations = {}
            return 0, 0
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle)
            for row in reader:
                if len(row) < 2:
                    skipped += 1
                    continue
                english = normalize_tag_token(row[0])
                japanese = str(row[1]).strip()
                if not english or not japanese or english in {"english_tag", "tag"}:
                    skipped += 1
                    continue
                if looks_mojibake(japanese):
                    skipped += 1
                    continue
                translations[english] = japanese
        self.external_translations = translations
        return len(translations), skipped

    def translate(self, tag: str) -> str:
        key = normalize_tag_token(tag)
        return self.user_translations.get(key) or self.external_translations.get(key) or BUILTIN_TAG_TRANSLATIONS.get(key, "")

    def set_translation(self, tag: str, japanese: str):
        key = normalize_tag_token(tag)
        value = japanese.strip()
        if not key:
            return
        if value:
            self.user_translations[key] = value
        else:
            self.user_translations.pop(key, None)
        self.save()

    def merge_translations(self, translations: dict[str, str]):
        changed = False
        for tag, japanese in translations.items():
            key = normalize_tag_token(tag)
            value = japanese.strip()
            if key and value and not self.translate(key):
                self.user_translations[key] = value
                changed = True
        if changed:
            self.save()

    def all_rows(self):
        keys = sorted(set(BUILTIN_TAG_TRANSLATIONS) | set(self.external_translations) | set(self.user_translations))
        return [
            (
                key,
                self.external_translations.get(key) or BUILTIN_TAG_TRANSLATIONS.get(key, ""),
                self.user_translations.get(key, ""),
            )
            for key in keys
        ]


def scan_folder_extensions(folder_path: str, include_subfolders: bool) -> dict[str, int]:
    folder = Path(folder_path)
    iterator = folder.rglob("*") if include_subfolders else folder.glob("*")
    counts: dict[str, int] = {}
    for path in iterator:
        if path.is_file():
            ext = path.suffix.lower() or "(no_ext)"
            counts[ext] = counts.get(ext, 0) + 1
    return dict(sorted(counts.items()))


def extract_metadata_text(raw_image: Image.Image) -> str:
    texts = []
    for key in PROMPT_KEYS:
        value = raw_image.info.get(key)
        if value:
            texts.append(str(value))
    return "\n".join(texts)


def extract_prompt_entries(raw_image: Image.Image) -> list[tuple[str, str]]:
    return [(key, str(raw_image.info.get(key))) for key in PROMPT_KEYS if raw_image.info.get(key)]


def extract_tags(path: Path, raw_image: Image.Image) -> set[str]:
    text = f"{path.stem} {extract_metadata_text(raw_image)}"
    text = re.sub(r"Negative prompt:.*", "", text, flags=re.IGNORECASE | re.DOTALL)
    tokens = re.split(r"[,;\n\r\t /\\|]+", text.lower())
    tags = {re.sub(r"[_-]+", " ", token).strip() for token in tokens}
    return {tag for tag in tags if len(tag) >= 2}


def extract_ai_tag_scores(raw_image: Image.Image) -> tuple[dict[str, float], str]:
    scores: dict[str, float] = {}
    model = str(raw_image.info.get("ai_tag_model", ""))
    text = raw_image.info.get("ai_tags") or raw_image.info.get("tags")
    if not text:
        return scores, model
    for part in re.split(r"[,;\n]+", str(text)):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            name, value = part.rsplit(":", 1)
            try:
                scores[name.strip().replace("_", " ").lower()] = float(value)
            except ValueError:
                scores[name.strip().replace("_", " ").lower()] = 1.0
        else:
            scores[part.replace("_", " ").lower()] = 1.0
    return scores, model


def has_generation_prompt(raw_image: Image.Image) -> bool:
    text = extract_metadata_text(raw_image).lower()
    return bool(text and ("negative prompt:" in text or "steps:" in text or "sampler:" in text or "cfg scale:" in text))


def tag_category(tag: str) -> str:
    value = tag.lower()
    for category, needles in TAG_CATEGORY_RULES:
        if any(needle in value for needle in needles):
            return category
    return "その他"


def display_tag_source(source: str) -> str:
    return {
        "wd14": "WD系",
        "deepdanbooru": "DeepDanbooru",
        "camie": "Camie",
    }.get(source, source or "不明")


def prompt_tag_set(item: ImageItem) -> set[str]:
    text = extract_metadata_text(item.raw_image)
    tokens = re.split(r"[,;\n\r\t /\\|]+", text.lower())
    tags = {re.sub(r"[_-]+", " ", token).strip() for token in tokens}
    return {tag for tag in tags if len(tag) >= 2}


def group_tag_set(raw_image: Image.Image) -> set[str]:
    text = raw_image.info.get("group_tags")
    if not text:
        return set()
    return parse_tag_text(str(text))


def tag_records(item: ImageItem, unknown_score: float = 1.0) -> list[dict]:
    prompt_tags = prompt_tag_set(item)
    group_tags = group_tag_set(item.raw_image)
    stem_tokens = {
        re.sub(r"[_-]+", " ", token).strip()
        for token in re.split(r"[,;\n\r\t /\\|]+", item.path.stem.lower())
        if len(token.strip()) >= 2
    }
    records = []
    for tag in item.tags:
        key = tag.lower()
        if key in item.tag_scores:
            source = display_tag_source(item.tag_model or "AIタグ")
            score = float(item.tag_scores[key])
        elif key in group_tags:
            source = "グループタグ"
            score = unknown_score
        elif key in prompt_tags:
            source = "生成Prompt/メタデータ"
            score = unknown_score
        elif key in stem_tokens:
            source = "ファイル名"
            score = unknown_score
        else:
            source = "不明"
            score = unknown_score
        records.append(
            {
                "tag": tag,
                "source": source,
                "score": score,
                "category": tag_category(tag),
            }
        )
    category_order = {category: index for index, (category, _needles) in enumerate(TAG_CATEGORY_RULES)}
    return sorted(records, key=lambda row: (category_order.get(row["category"], 999), -row["score"], row["tag"]))


def load_images_from_folder(
    folder_path: str,
    max_images: int,
    max_side: int,
    include_subfolders: bool,
    enabled_exts: set[str],
):
    folder = Path(folder_path)
    iterator = folder.rglob("*") if include_subfolders else folder.glob("*")
    items = []
    skipped: dict[str, int] = {}

    for path in sorted(iterator):
        if len(items) >= max_images:
            break
        if path.is_dir():
            continue

        ext = path.suffix.lower()
        if ext not in enabled_exts:
            skipped[ext or "(no_ext)"] = skipped.get(ext or "(no_ext)", 0) + 1
            continue

        try:
            bytes_data = path.read_bytes()
            raw = Image.open(io.BytesIO(bytes_data))
            image = raw.convert("RGB")
            image.thumbnail((max_side, max_side))
            name = str(path.relative_to(folder)) if include_subfolders else path.name
            tag_scores, tag_model = extract_ai_tag_scores(raw)
            tags = extract_tags(path, raw) | set(tag_scores) | group_tag_set(raw)
            items.append(
                ImageItem(
                    path=path,
                    name=name,
                    image=image,
                    raw_image=raw,
                    bytes_data=bytes_data,
                    tags=tags,
                    tag_scores=tag_scores,
                    tag_model=tag_model,
                )
            )
        except Exception:
            key = f"{ext or '(no_ext)'}(read_error)"
            skipped[key] = skipped.get(key, 0) + 1

    return items, skipped


def extract_exif(image: Image.Image) -> dict:
    exif_data = {}
    try:
        for tag, value in image.getexif().items():
            decoded = ExifTags.TAGS.get(tag, tag)
            exif_data[str(decoded)] = str(value)
    except Exception as exc:
        exif_data["error"] = str(exc)
    return exif_data


def add_existing_text_metadata(meta: PngImagePlugin.PngInfo, image: Image.Image, skip_keys: set[str] | None = None):
    skip_keys = skip_keys or set()
    for key, value in image.info.items():
        if key in skip_keys:
            continue
        if isinstance(value, (str, int, float)):
            meta.add_text(str(key), str(value))


def save_tagged_png(item: ImageItem, scored_tags: list[tuple[str, float]], model_key: str = "") -> Path:
    tags_text = ", ".join(tag for tag, _score in scored_tags)
    scores_text = ", ".join(f"{tag}:{score:.4f}" for tag, score in scored_tags)
    png_path = item.path if item.path.suffix.lower() == ".png" else item.path.with_suffix(".png")
    if png_path != item.path and png_path.exists():
        counter = 1
        while True:
            candidate = item.path.with_name(f"{item.path.stem}_{counter}.png")
            if not candidate.exists():
                png_path = candidate
                break
            counter += 1

    meta = PngImagePlugin.PngInfo()
    add_existing_text_metadata(
        meta,
        item.raw_image,
        {"tags", "ai_tags", "ai_tag_model", "source_file", "source_metadata"},
    )
    existing_text = extract_metadata_text(item.raw_image)
    if existing_text:
        meta.add_text("source_metadata", existing_text)
    meta.add_text("tags", tags_text)
    meta.add_text("ai_tags", scores_text)
    if model_key:
        meta.add_text("ai_tag_model", model_key)
    meta.add_text("source_file", str(item.path))
    item.raw_image.convert("RGB").save(png_path, "PNG", pnginfo=meta)
    return png_path


def save_group_tags_to_png(item: ImageItem, tags: set[str]) -> Path:
    current_tags = group_tag_set(item.raw_image)
    merged_tags = sorted(current_tags | tags)
    png_path = item.path if item.path.suffix.lower() == ".png" else item.path.with_suffix(".png")
    if png_path != item.path and png_path.exists():
        counter = 1
        while True:
            candidate = item.path.with_name(f"{item.path.stem}_group_{counter}.png")
            if not candidate.exists():
                png_path = candidate
                break
            counter += 1

    meta = PngImagePlugin.PngInfo()
    add_existing_text_metadata(meta, item.raw_image, {"group_tags"})
    meta.add_text("group_tags", ", ".join(merged_tags))
    item.raw_image.convert("RGB").save(png_path, "PNG", pnginfo=meta)
    return png_path


def local_model_roots(model_root: str | Path | None = None):
    roots = []
    if model_root:
        roots.append(Path(model_root))
    if CUSTOM_MODEL_ROOT is not None:
        roots.append(CUSTOM_MODEL_ROOT)
    roots.extend([
        default_model_dir(),
        Path.cwd() / "models",
        Path.cwd() / "dist" / "ImageFolderViewer" / "models",
        app_base_dir().parent / "dist" / "ImageFolderViewer" / "models",
    ])
    seen = set()
    for root in roots:
        try:
            resolved = root.expanduser().resolve()
        except Exception:
            resolved = root
        key = str(resolved).lower()
        if key not in seen:
            seen.add(key)
            yield resolved


def local_model_candidates(repo_id: str, filename: str, model_root: str | Path | None = None):
    mapped = MODEL_FILES.get((repo_id, filename))
    for root in local_model_roots(model_root):
        if mapped:
            model_name, local_name = mapped
            yield root / model_name / local_name
        yield root / repo_id.replace("/", "__") / filename
        yield root / repo_id / filename
        yield root / Path(filename).name


def hf_download_file(repo_id: str, filename: str, model_root: str | Path | None = None):
    for candidate in local_model_candidates(repo_id, filename, model_root):
        if candidate.exists() and candidate.stat().st_size > 0:
            return str(candidate)

    target = next(local_model_candidates(repo_id, filename, model_root))
    if target.exists() and target.stat().st_size > 0:
        return str(target)

    target.parent.mkdir(parents=True, exist_ok=True)
    quoted_repo = "/".join(urllib.parse.quote(part, safe="") for part in repo_id.split("/"))
    quoted_file = "/".join(urllib.parse.quote(part, safe="") for part in filename.split("/"))
    url = f"https://huggingface.co/{quoted_repo}/resolve/main/{quoted_file}"
    tmp = target.with_suffix(target.suffix + ".download")
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "ImageFolderViewer/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response, open(tmp, "wb") as out:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        tmp.replace(target)
        return str(target)
    except Exception:
        if tmp.exists():
            try:
                tmp.unlink()
            except Exception:
                pass
        os.environ["HF_HUB_DISABLE_XET"] = "1"
        os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"
        try:
            hf_hub_download = importlib.import_module("huggingface_hub").hf_hub_download
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "モデルをローカルに用意できませんでした。\n"
                f"配置先: {target}\n"
                f"取得元: {url}"
            ) from exc
        return hf_hub_download(repo_id=repo_id, filename=filename)


def onnx_providers():
    ort = importlib.import_module("onnxruntime")
    providers = ["CPUExecutionProvider"]
    try:
        available = ort.get_available_providers()
        if "CUDAExecutionProvider" in available:
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    except Exception:
        pass
    return ort, providers


def cached_onnx_session(model_path: str, providers: list[str]):
    ort = importlib.import_module("onnxruntime")
    key = (str(Path(model_path).resolve()), tuple(providers))
    if key not in ONNX_SESSION_CACHE:
        ONNX_SESSION_CACHE[key] = ort.InferenceSession(model_path, providers=providers)
    return ONNX_SESSION_CACHE[key]


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def make_square(image: Image.Image, size: int, fill=(255, 255, 255)) -> Image.Image:
    image = image.convert("RGB")
    scale = size / max(image.size)
    resized = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), fill)
    canvas.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def recognize_tags_integrated(
    image: Image.Image,
    model_name: str,
    threshold: float = 0.35,
    model_root: str | Path | None = None,
) -> list[tuple[str, float]]:
    if model_name == "deepdanbooru":
        return recognize_tags_deepdanbooru(image, threshold, model_root)
    if model_name == "camie":
        return recognize_tags_camie(image, threshold, model_root)
    return recognize_tags_wd14_v3(image, threshold, model_root)


def recognize_tags_wd14_v3(image: Image.Image, threshold: float = 0.35, model_root: str | Path | None = None) -> list[tuple[str, float]]:
    ort, providers = onnx_providers()

    model_repo = "SmilingWolf/wd-eva02-large-tagger-v3"
    model_path = hf_download_file(model_repo, "model.onnx", model_root)
    csv_path = hf_download_file(model_repo, "selected_tags.csv", model_root)
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        tags_rows = list(csv.DictReader(f))

    img = make_square(image, 448).convert("RGB")
    x = np.array(img, dtype=np.float32)[:, :, ::-1]
    x = np.expand_dims(x, 0)

    sess = cached_onnx_session(model_path, providers)
    output = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]

    results = []
    for i, score in enumerate(output):
        if i >= len(tags_rows):
            break
        row = tags_rows[i]
        try:
            if int(row.get("category", 0)) == 9:
                continue
        except ValueError:
            continue
        value = float(score)
        if value >= threshold:
            name = str(row.get("name", "")).replace("_", " ").strip()
            if not name:
                continue
            results.append((name, value))
    results.sort(key=lambda pair: pair[1], reverse=True)
    return results[:80]


def recognize_tags_deepdanbooru(image: Image.Image, threshold: float = 0.35, model_root: str | Path | None = None) -> list[tuple[str, float]]:
    ort, providers = onnx_providers()
    model_path = hf_download_file("skytnt/deepdanbooru_onnx", "deepdanbooru.onnx", model_root)
    sess = cached_onnx_session(model_path, providers)
    meta = sess.get_modelmeta().custom_metadata_map
    tags = []
    try:
        tags = list(eval(meta.get("tags", "[]")))
    except Exception:
        tags = []
    img = make_square(image, 512)
    x = np.array(img, dtype=np.float32) / 255.0
    x = np.expand_dims(x, 0)
    output = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]
    probs = sigmoid(output) if np.max(output) > 1.0 or np.min(output) < 0.0 else output
    results = [(str(tags[i]).replace("_", " "), float(score)) for i, score in enumerate(probs) if i < len(tags) and float(score) >= threshold]
    results.sort(key=lambda pair: pair[1], reverse=True)
    return results[:80]


def recognize_tags_camie(image: Image.Image, threshold: float = 0.35, model_root: str | Path | None = None) -> list[tuple[str, float]]:
    ort, providers = onnx_providers()
    model_path = hf_download_file("Camais03/camie-tagger-v2", "camie-tagger-v2.onnx", model_root)
    metadata_path = hf_download_file("Camais03/camie-tagger-v2", "camie-tagger-v2-metadata.json", model_root)
    import json

    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)
    dataset_info = metadata.get("dataset_info", {})
    tag_mapping = dataset_info.get("tag_mapping", {})
    idx_to_tag = tag_mapping.get("idx_to_tag", {})
    img_size = int(metadata.get("model_info", {}).get("img_size", 512))

    img = make_square(image, img_size, fill=(124, 116, 104))
    x = np.array(img, dtype=np.float32) / 255.0
    x = (x - np.array((0.485, 0.456, 0.406), dtype=np.float32)) / np.array((0.229, 0.224, 0.225), dtype=np.float32)
    x = np.expand_dims(np.transpose(x, (2, 0, 1)), 0).astype(np.float32)

    sess = cached_onnx_session(model_path, providers)
    output = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]
    probs = sigmoid(output) if np.max(output) > 1.0 or np.min(output) < 0.0 else output
    results = []
    for i, score in enumerate(probs):
        tag = idx_to_tag.get(str(i), idx_to_tag.get(i))
        if tag and float(score) >= threshold:
            results.append((str(tag).replace("_", " "), float(score)))
    results.sort(key=lambda pair: pair[1], reverse=True)
    return results[:80]


def bits_to_int(bits) -> int:
    value = 0
    for bit in bits:
        value = (value << 1) | int(bool(bit))
    return value


def compute_phash(image: Image.Image, hash_size: int = 8) -> int:
    cv2 = importlib.import_module("cv2")
    gray = image.convert("L").resize((hash_size * 4, hash_size * 4), Image.Resampling.LANCZOS)
    arr = np.array(gray, dtype=np.float32)
    dct = cv2.dct(arr)
    low = dct[:hash_size, :hash_size]
    med = np.median(low[1:, 1:])
    return bits_to_int((low > med).flatten())


def compute_dhash(image: Image.Image, hash_size: int = 8) -> int:
    gray = image.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    arr = np.array(gray)
    diff = arr[:, 1:] > arr[:, :-1]
    return bits_to_int(diff.flatten())


def hamming_distance(left: int, right: int) -> int:
    return (left ^ right).bit_count()


def find_duplicate_groups(items, threshold: int):
    hashes = [(compute_phash(item.raw_image), compute_dhash(item.raw_image)) for item in items]
    groups = []
    used = set()
    for i in range(len(items)):
        if i in used:
            continue
        members = [i]
        for j in range(i + 1, len(items)):
            if j in used:
                continue
            phash_distance = hamming_distance(hashes[i][0], hashes[j][0])
            dhash_distance = hamming_distance(hashes[i][1], hashes[j][1])
            if min(phash_distance, dhash_distance) <= threshold:
                members.append(j)
        if len(members) > 1:
            used.update(members)
            groups.append(members)
    return groups


def extract_color_features(items: list[ImageItem]) -> np.ndarray:
    feats = []
    for item in items:
        img = item.image.resize((64, 64)).convert("RGB")
        arr = np.asarray(img, dtype=np.float32) / 255.0
        hist_parts = []
        for channel in range(3):
            hist, _ = np.histogram(arr[:, :, channel], bins=16, range=(0, 1), density=True)
            hist_parts.append(hist)
        feats.append(np.concatenate(hist_parts))
    return np.vstack(feats)


def compute_tsne(items: list[ImageItem]) -> tuple[np.ndarray, np.ndarray]:
    features = extract_color_features(items)
    n_samples = features.shape[0]
    n_components = min(16, features.shape[1], max(1, n_samples - 1))
    try:
        PCA = importlib.import_module("sklearn.decomposition").PCA
        reduced = PCA(n_components=n_components, random_state=42).fit_transform(features)
    except Exception:
        centered = features - features.mean(axis=0, keepdims=True)
        _, _, vt = np.linalg.svd(centered, full_matrices=False)
        reduced = centered @ vt[:n_components].T

    cluster_count = min(6, max(2, len(items) // 8))
    try:
        MiniBatchKMeans = importlib.import_module("sklearn.cluster").MiniBatchKMeans
        clusters = MiniBatchKMeans(
            n_clusters=cluster_count,
            random_state=42,
            batch_size=32,
            n_init="auto",
        ).fit_predict(reduced)
    except Exception:
        order = np.argsort(reduced[:, 0])
        clusters = np.zeros(len(items), dtype=int)
        for rank, original_index in enumerate(order):
            clusters[original_index] = min(cluster_count - 1, rank * cluster_count // len(items))

    try:
        umap_module = importlib.import_module("umap")
        reducer = umap_module.UMAP(
            n_components=2,
            n_neighbors=min(15, max(2, len(items) - 1)),
            min_dist=0.1,
            metric="euclidean",
            random_state=42,
        )
        coords = reducer.fit_transform(reduced)
    except Exception:
        try:
            TSNE = importlib.import_module("sklearn.manifold").TSNE
            perplexity = max(2, min(30, len(items) - 1, len(items) // 3))
            coords = TSNE(
                n_components=2,
                random_state=42,
                init="pca",
                learning_rate="auto",
                perplexity=perplexity,
            ).fit_transform(reduced)
        except Exception:
            coords = reduced[:, :2] if reduced.shape[1] >= 2 else np.column_stack([reduced[:, 0], np.zeros(len(items))])
    return clusters, coords


def pil_to_pixmap(image: Image.Image) -> QPixmap:
    return QPixmap.fromImage(ImageQt(image.convert("RGBA")))


class ZoomImageView(QScrollArea):
    def __init__(self):
        super().__init__()
        self.setWidgetResizable(False)
        self.label = QLabel()
        self.label.setAlignment(Qt.AlignCenter)
        self.label.setStyleSheet("QLabel { background: #111; }")
        self.setWidget(self.label)
        self.original = QPixmap()
        self.zoom_factor = 1.0
        self.fit_mode = True
        self.dragging = False
        self.drag_start = None
        self.drag_h = 0
        self.drag_v = 0

    def set_image(self, image: Image.Image):
        self.original = pil_to_pixmap(image)
        self.fit_to_view()

    def fit_to_view(self):
        if self.original.isNull():
            return
        view_size = self.viewport().size()
        self.zoom_factor = min(
            view_size.width() / max(1, self.original.width()),
            view_size.height() / max(1, self.original.height()),
        )
        self.zoom_factor = max(0.01, self.zoom_factor)
        self.fit_mode = True
        self._render()

    def set_zoom_percent(self, percent: int):
        self.fit_mode = False
        self.zoom_factor = max(0.05, min(8.0, percent / 100.0))
        self._render()

    def zoom_by(self, multiplier: float, center_pos=None):
        if self.original.isNull():
            return
        old_zoom = self.zoom_factor
        old_h = self.horizontalScrollBar().value()
        old_v = self.verticalScrollBar().value()
        if center_pos is None:
            center_pos = self.viewport().rect().center()
        image_x = (old_h + center_pos.x()) / max(old_zoom, 0.01)
        image_y = (old_v + center_pos.y()) / max(old_zoom, 0.01)
        self.fit_mode = False
        self.zoom_factor = max(0.05, min(8.0, self.zoom_factor * multiplier))
        self._render()
        self.horizontalScrollBar().setValue(int(image_x * self.zoom_factor - center_pos.x()))
        self.verticalScrollBar().setValue(int(image_y * self.zoom_factor - center_pos.y()))

    def _render(self):
        if self.original.isNull():
            self.label.clear()
            return
        width = max(1, int(self.original.width() * self.zoom_factor))
        height = max(1, int(self.original.height() * self.zoom_factor))
        scaled = self.original.scaled(width, height, Qt.KeepAspectRatio, Qt.SmoothTransformation)
        self.label.setPixmap(scaled)
        self.label.resize(scaled.size())

    def wheelEvent(self, event):
        multiplier = 1.15 if event.angleDelta().y() > 0 else 1 / 1.15
        self.zoom_by(multiplier, event.position().toPoint())
        event.accept()

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.dragging = True
            self.drag_start = event.position().toPoint()
            self.drag_h = self.horizontalScrollBar().value()
            self.drag_v = self.verticalScrollBar().value()
            self.viewport().setCursor(Qt.ClosedHandCursor)
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self.dragging and self.drag_start is not None:
            pos = event.position().toPoint()
            delta = pos - self.drag_start
            self.horizontalScrollBar().setValue(self.drag_h - delta.x())
            self.verticalScrollBar().setValue(self.drag_v - delta.y())
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton and self.dragging:
            self.dragging = False
            self.drag_start = None
            self.viewport().unsetCursor()
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.fit_mode:
            self.fit_to_view()


class TsnePointItem(QGraphicsEllipseItem):
    def __init__(self, rect: QRectF, owner, item_index: int):
        super().__init__(rect)
        self.owner = owner
        self.item_index = item_index
        self.setCursor(Qt.PointingHandCursor)
        self.setAcceptHoverEvents(True)

    def mousePressEvent(self, event):
        self.owner.open_image(self.item_index)
        event.accept()

    def mouseDoubleClickEvent(self, event):
        self.owner.open_nearest_group_at(event.scenePos())
        event.accept()


class TsnePlotView(QGraphicsView):
    def __init__(self, owner):
        super().__init__()
        self.owner = owner
        self.setRenderHints(QPainter.Antialiasing | QPainter.SmoothPixmapTransform)
        self.setDragMode(QGraphicsView.ScrollHandDrag)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.AnchorUnderMouse)
        self.setBackgroundBrush(QColor("#101114"))
        self.zoom_factor = 1.0
        self.scene_points: list[tuple[QPointF, int]] = []

    def wheelEvent(self, event):
        factor = 1.15 if event.angleDelta().y() > 0 else 1 / 1.15
        next_zoom = self.zoom_factor * factor
        if 0.05 <= next_zoom <= 20:
            self.zoom_factor = next_zoom
            self.scale(factor, factor)
        event.accept()

    def set_plot(self, items: list[ImageItem], item_indexes: list[int], clusters: np.ndarray, coords: np.ndarray):
        scene = QGraphicsScene(self)
        self.scene_points = []
        coords = np.asarray(coords, dtype=float)
        min_xy = coords.min(axis=0)
        max_xy = coords.max(axis=0)
        span = np.maximum(max_xy - min_xy, 1e-6)
        palette = [
            QColor("#4cc9f0"),
            QColor("#f72585"),
            QColor("#80ed99"),
            QColor("#ffd166"),
            QColor("#b5179e"),
            QColor("#f77f00"),
            QColor("#90be6d"),
            QColor("#577590"),
        ]
        width = 1800.0
        height = 1200.0
        margin = 90.0
        scene.addLine(margin, height - margin, width - margin, height - margin, QPen(QColor("#6d727d"), 2))
        scene.addLine(margin, margin, margin, height - margin, QPen(QColor("#6d727d"), 2))
        for label, x, y in [("x", width - margin + 18, height - margin - 16), ("y", margin - 30, margin - 45)]:
            text = QGraphicsTextItem(label)
            text.setDefaultTextColor(QColor("#d8dde6"))
            text.setPos(x, y)
            scene.addItem(text)

        for i, item in enumerate(items):
            x = margin + ((coords[i, 0] - min_xy[0]) / span[0]) * (width - margin * 2)
            y = height - margin - ((coords[i, 1] - min_xy[1]) / span[1]) * (height - margin * 2)
            color = palette[int(clusters[i]) % len(palette)]
            point = TsnePointItem(QRectF(x - 8, y - 8, 16, 16), self.owner, item_indexes[i])
            point.setBrush(QBrush(color))
            point.setPen(QPen(QColor("#ffffff"), 1.2))
            point.setToolTip(f"{item.name}\ncluster {int(clusters[i])}\nx={coords[i, 0]:.3f}, y={coords[i, 1]:.3f}")
            scene.addItem(point)
            self.scene_points.append((QPointF(x, y), item_indexes[i]))

        self.setScene(scene)
        self.setSceneRect(0, 0, width, height)
        self.resetTransform()
        self.zoom_factor = 1.0
        self.fitInView(scene.sceneRect(), Qt.KeepAspectRatio)

    def mouseDoubleClickEvent(self, event):
        self.owner.open_nearest_group_at(self.mapToScene(event.position().toPoint()))
        event.accept()


class TsnePlotWindow(QMainWindow):
    def __init__(self, owner):
        super().__init__(owner)
        self.owner = owner
        self.setWindowTitle("t-SNE / UMAP プロット")
        self.resize(1100, 760)
        self.plot_view = TsnePlotView(self)
        self.setCentralWidget(self.plot_view)

    def set_results(self, items: list[ImageItem], item_indexes: list[int], clusters: np.ndarray, coords: np.ndarray):
        self.plot_view.set_plot(items, item_indexes, clusters, coords)

    def open_image(self, item_index: int):
        self.owner.select_image(item_index, open_detail=True)

    def open_nearest_group_at(self, scene_pos: QPointF):
        points = self.plot_view.scene_points
        if not points:
            return
        ranked = sorted(
            points,
            key=lambda pair: (pair[0].x() - scene_pos.x()) ** 2 + (pair[0].y() - scene_pos.y()) ** 2,
        )
        self.owner.open_tsne_group([item_index for _point, item_index in ranked[:30]])


class DetailWindow(QMainWindow):
    def __init__(self, owner):
        super().__init__(owner)
        self.owner = owner
        self.item: ImageItem | None = None
        self.setWindowTitle("画像詳細")
        self.resize(1120, 760)

        self.image_view = ZoomImageView()
        self.info_table = QTableWidget(0, 2)
        self.info_table.setHorizontalHeaderLabels(["項目", "値"])
        self.info_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.info_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.info_table.verticalHeader().setVisible(False)
        self.info_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.info_table.itemChanged.connect(self.on_info_item_changed)
        self.updating_table = False

        self.tag_buttons: dict[str, QPushButton] = {}
        self.show_ai_tags = QCheckBox("AI")
        self.show_prompt_tags = QCheckBox("Prompt")
        self.show_group_tags = QCheckBox("グループ")
        self.show_filename_tags = QCheckBox("ファイル名")
        self.show_unknown_tags = QCheckBox("不明")
        for checkbox in [
            self.show_ai_tags,
            self.show_prompt_tags,
            self.show_group_tags,
            self.show_filename_tags,
            self.show_unknown_tags,
        ]:
            checkbox.setChecked(True)
            checkbox.stateChanged.connect(self.update_info)
        self.detail_min_score = QSpinBox()
        self.detail_min_score.setRange(0, 100)
        self.detail_min_score.setSuffix("%")
        self.detail_min_score.valueChanged.connect(self.update_info)
        self.unknown_score_mode = QComboBox()
        self.unknown_score_mode.addItems(["値なし=1", "値なし=0"])
        self.unknown_score_mode.currentIndexChanged.connect(self.update_info)
        self._build_ui()

    def _build_ui(self):
        toolbar = QToolBar("detail")
        self.addToolBar(toolbar)
        prev_button = QPushButton("前へ")
        next_button = QPushButton("次へ")
        fit_button = QPushButton("フィット")
        zoom_out_button = QPushButton("-")
        zoom_100_button = QPushButton("100%")
        zoom_in_button = QPushButton("+")
        prev_button.clicked.connect(self.owner.prev_image)
        next_button.clicked.connect(self.owner.next_image)
        fit_button.clicked.connect(self.image_view.fit_to_view)
        zoom_out_button.clicked.connect(lambda: self.image_view.zoom_by(1 / 1.25))
        zoom_100_button.clicked.connect(lambda: self.image_view.set_zoom_percent(100))
        zoom_in_button.clicked.connect(lambda: self.image_view.zoom_by(1.25))
        for button in [prev_button, next_button, fit_button, zoom_out_button, zoom_100_button, zoom_in_button]:
            toolbar.addWidget(button)

        tag_bar = QWidget()
        tag_layout = QHBoxLayout(tag_bar)
        tag_layout.setContentsMargins(4, 4, 4, 4)
        for key, label in [
            ("basic", "基本"),
            ("exif", "EXIF"),
            ("prompt", "Prompt"),
            ("tags", "抽出タグ"),
            ("all", "すべて"),
        ]:
            button = QPushButton(label)
            button.setCheckable(True)
            button.clicked.connect(lambda _checked=False, mode=key: self.set_tag_mode(mode))
            self.tag_buttons[key] = button
            tag_layout.addWidget(button)
        tag_layout.addStretch(1)
        self.tag_buttons["basic"].setChecked(True)

        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.addWidget(tag_bar)
        filter_bar = QWidget()
        filter_layout = QHBoxLayout(filter_bar)
        filter_layout.setContentsMargins(4, 0, 4, 4)
        filter_layout.addWidget(QLabel("由来"))
        for checkbox in [
            self.show_ai_tags,
            self.show_prompt_tags,
            self.show_group_tags,
            self.show_filename_tags,
            self.show_unknown_tags,
        ]:
            filter_layout.addWidget(checkbox)
        filter_layout.addWidget(QLabel("最小信頼度"))
        filter_layout.addWidget(self.detail_min_score)
        filter_layout.addWidget(self.unknown_score_mode)
        filter_layout.addStretch(1)
        right_layout.addWidget(filter_bar)
        right_layout.addWidget(self.info_table, 1)

        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(self.image_view)
        splitter.addWidget(right)
        splitter.setSizes([760, 360])
        splitter.setStretchFactor(0, 1)

        container = QWidget()
        layout = QHBoxLayout(container)
        layout.addWidget(splitter)
        self.setCentralWidget(container)

    def set_item(self, item: ImageItem):
        self.item = item
        self.setWindowTitle(f"画像詳細 - {item.name}")
        self.image_view.set_image(item.raw_image)
        self.update_info()

    def set_tag_mode(self, mode: str):
        for key, button in self.tag_buttons.items():
            button.setChecked(key == mode)
        self.update_info()

    def current_mode(self):
        for key, button in self.tag_buttons.items():
            if button.isChecked():
                return key
        return "basic"

    def update_info(self):
        if not self.item:
            return
        mode = self.current_mode()
        rows = self.rows_for_mode(mode)
        is_tag_mode = mode == "tags"
        self.updating_table = True
        self.info_table.blockSignals(True)
        self.info_table.clear()
        if is_tag_mode:
            self.info_table.setColumnCount(4)
            self.info_table.setHorizontalHeaderLabels(["由来", "英語タグ", "日本語", "信頼度"])
            self.info_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
            self.info_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
            self.info_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
            self.info_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
            self.info_table.setEditTriggers(QTableWidget.DoubleClicked | QTableWidget.EditKeyPressed)
        else:
            self.info_table.setColumnCount(2)
            self.info_table.setHorizontalHeaderLabels(["項目", "値"])
            self.info_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
            self.info_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
            self.info_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.info_table.setRowCount(len(rows))
        for row, values in enumerate(rows):
            for col, value in enumerate(values):
                cell = QTableWidgetItem(str(value))
                editable = is_tag_mode and col == 2 and not str(values[0]).startswith("[")
                if not editable:
                    cell.setFlags(cell.flags() & ~Qt.ItemIsEditable)
                self.info_table.setItem(row, col, cell)
        self.info_table.blockSignals(False)
        self.updating_table = False

    def on_info_item_changed(self, item: QTableWidgetItem):
        if self.updating_table or self.current_mode() != "tags" or item.column() != 2:
            return
        english_item = self.info_table.item(item.row(), 1)
        if english_item is None:
            return
        english = normalize_tag_token(english_item.text())
        if not english:
            return
        self.owner.translation_store.set_translation(english, item.text())
        self.owner.statusBar().showMessage(f"タグ翻訳を保存しました: {english}")

    def translated_tag(self, tag: str) -> str:
        if not getattr(self.owner, "show_tag_translations", None) or not self.owner.show_tag_translations.isChecked():
            return ""
        return self.owner.translation_store.translate(tag)

    def rows_for_mode(self, mode: str):
        item = self.item
        basic = [
            ("ファイル", item.name),
            ("パス", str(item.path)),
            ("拡張子", item.path.suffix.lower()),
            ("形式", item.raw_image.format or "N/A"),
            ("表示サイズ", f"{item.image.width} x {item.image.height}"),
            ("元サイズ", f"{item.raw_image.width} x {item.raw_image.height}"),
            ("ファイルサイズ", f"{len(item.bytes_data) / 1024:.1f} KB"),
            ("更新日時", time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(item.path.stat().st_mtime))),
        ]
        exif_rows = [(f"EXIF:{key}", value) for key, value in extract_exif(item.raw_image).items()]
        prompt_rows = [(f"Prompt:{key}", value) for key, value in extract_prompt_entries(item.raw_image)]
        unknown_score = 0.0 if self.unknown_score_mode.currentIndex() == 1 else 1.0
        min_score = self.detail_min_score.value() / 100.0
        allowed_sources = set()
        if self.show_ai_tags.isChecked():
            allowed_sources.update({"WD系", "DeepDanbooru", "Camie", "AIタグ"})
        if self.show_prompt_tags.isChecked():
            allowed_sources.add("生成Prompt/メタデータ")
        if self.show_group_tags.isChecked():
            allowed_sources.add("グループタグ")
        if self.show_filename_tags.isChecked():
            allowed_sources.add("ファイル名")
        if self.show_unknown_tags.isChecked():
            allowed_sources.add("不明")

        tag_rows = []
        current_category = None
        for record in tag_records(item, unknown_score):
            if record["source"] not in allowed_sources:
                continue
            if record["score"] < min_score:
                continue
            if record["category"] != current_category:
                current_category = record["category"]
                tag_rows.append((f"[{current_category}]", "", "", ""))
            tag_rows.append((record["source"], record["tag"], self.translated_tag(record["tag"]), f"{record['score']:.4f}"))
        if mode == "basic":
            return basic
        if mode == "exif":
            return exif_rows or [("EXIF", "なし")]
        if mode == "prompt":
            return prompt_rows or [("Prompt", "なし")]
        if mode == "tags":
            return tag_rows or [("Tag", "なし", "", "")]
        compact_tag_rows = []
        for row in tag_rows:
            if row[0].startswith("["):
                compact_tag_rows.append((row[0], ""))
            else:
                japanese = f" / {row[2]}" if row[2] else ""
                compact_tag_rows.append((f"Tag:{row[0]}", f"{row[1]}{japanese} ({row[3]})"))
        return basic + exif_rows + prompt_rows + compact_tag_rows


class SlideshowWindow(QMainWindow):
    def __init__(self, owner):
        super().__init__(owner)
        self.owner = owner
        self.setWindowTitle("スライドショー")
        self.resize(980, 720)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.owner.next_image)

        self.image_view = ZoomImageView()
        self.interval_slider = QSlider(Qt.Horizontal)
        self.interval_slider.setRange(1, 30)
        self.interval_slider.setValue(self.owner.slide_interval.value())
        self.interval_label = QLabel()
        self.interval_slider.valueChanged.connect(self.update_interval)

        self._build_ui()
        self.update_interval(self.interval_slider.value())

    def _build_ui(self):
        toolbar = QToolBar("slideshow")
        self.addToolBar(toolbar)
        prev_button = QPushButton("前へ")
        next_button = QPushButton("次へ")
        start_button = QPushButton("開始")
        stop_button = QPushButton("停止")
        fit_button = QPushButton("フィット")
        prev_button.clicked.connect(self.owner.prev_image)
        next_button.clicked.connect(self.owner.next_image)
        start_button.clicked.connect(self.start)
        stop_button.clicked.connect(self.stop)
        detail_button = QPushButton("詳細")
        fit_button.clicked.connect(self.image_view.fit_to_view)
        detail_button.clicked.connect(self.open_detail_for_current)
        for button in [prev_button, next_button, start_button, stop_button, fit_button, detail_button]:
            toolbar.addWidget(button)
        toolbar.addWidget(QLabel(" 更新時間 "))
        toolbar.addWidget(self.interval_slider)
        toolbar.addWidget(self.interval_label)

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.addWidget(self.image_view, 1)
        self.setCentralWidget(container)

    def update_interval(self, value: int):
        self.owner.slide_interval.setValue(value)
        self.interval_label.setText(f"{value}秒")
        if self.timer.isActive():
            self.timer.start(value * 1000)

    def set_item(self, item: ImageItem):
        self.setWindowTitle(f"スライドショー - {item.name}")
        self.image_view.set_image(item.raw_image)

    def open_detail_for_current(self):
        self.owner.open_detail_window(freeze=True)

    def start(self):
        self.timer.start(self.interval_slider.value() * 1000)

    def stop(self):
        self.timer.stop()

    def closeEvent(self, event):
        self.stop()
        super().closeEvent(event)


class DuplicateWindow(QMainWindow):
    def __init__(self, groups: list[list[ImageItem]], threshold: int):
        super().__init__()
        self.setWindowTitle("重複確認")
        self.resize(980, 720)
        self.groups = groups
        self.threshold = threshold
        self._build_ui()

    def _build_ui(self):
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content = QWidget()
        layout = QVBoxLayout(content)
        layout.addWidget(QLabel(f"重複候補: {len(self.groups)}グループ / しきい値: {self.threshold}"))

        for group_index, group in enumerate(self.groups, start=1):
            group_box = QGroupBox(f"グループ {group_index} ({len(group)}枚)")
            grid = QGridLayout(group_box)
            for idx, item in enumerate(group):
                cell = QWidget()
                cell_layout = QVBoxLayout(cell)
                thumb = QLabel()
                thumb.setAlignment(Qt.AlignCenter)
                pixmap = pil_to_pixmap(item.image).scaled(180, 180, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                thumb.setPixmap(pixmap)
                name = QLabel(f"{item.name}\n{len(item.bytes_data) / 1024:.1f} KB")
                name.setWordWrap(True)
                name.setAlignment(Qt.AlignCenter)
                cell_layout.addWidget(thumb)
                cell_layout.addWidget(name)
                grid.addWidget(cell, idx // 4, idx % 4)
            layout.addWidget(group_box)

        layout.addStretch(1)
        scroll.setWidget(content)
        self.setCentralWidget(scroll)


class DuplicateReviewWindow(QMainWindow):
    def __init__(self, groups: list[list[ImageItem]], threshold: int, on_deleted=None):
        super().__init__()
        self.setWindowTitle("重複確認")
        self.resize(1040, 760)
        self.groups = groups
        self.threshold = threshold
        self.on_deleted = on_deleted
        self.keep_checks: list[tuple[ImageItem, QCheckBox]] = []
        self._build_ui()

    def _build_ui(self):
        content = QWidget()
        root_layout = QVBoxLayout(content)
        root_layout.addWidget(QLabel(f"重複候補: {len(self.groups)}グループ / しきい値: {self.threshold}"))

        for group_index, group in enumerate(self.groups, start=1):
            group_box = QGroupBox(f"グループ {group_index} ({len(group)}枚)")
            group_layout = QVBoxLayout(group_box)
            row_content = QWidget()
            row_layout = QHBoxLayout(row_content)
            row_layout.setAlignment(Qt.AlignLeft)
            largest = max(group, key=lambda item: len(item.bytes_data))

            for item in group:
                cell = QWidget()
                cell_layout = QVBoxLayout(cell)
                thumb = QLabel()
                thumb.setAlignment(Qt.AlignCenter)
                pixmap = pil_to_pixmap(item.image).scaled(180, 180, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                thumb.setPixmap(pixmap)
                name = QLabel(f"{item.name}\n{len(item.bytes_data) / 1024:.1f} KB")
                name.setWordWrap(True)
                name.setAlignment(Qt.AlignCenter)
                keep_check = QCheckBox("残す")
                keep_check.setChecked(item is largest)
                keep_check.setToolTip("チェックありの画像は削除しません")
                self.keep_checks.append((item, keep_check))
                cell_layout.addWidget(thumb)
                cell_layout.addWidget(name)
                cell_layout.addWidget(keep_check, alignment=Qt.AlignCenter)
                row_layout.addWidget(cell)
            row_layout.addStretch(1)

            row_scroll = QScrollArea()
            row_scroll.setWidgetResizable(True)
            row_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
            row_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
            row_scroll.setWidget(row_content)
            row_scroll.setMinimumHeight(270)
            group_layout.addWidget(row_scroll)
            root_layout.addWidget(group_box)

        button_row = QWidget()
        button_layout = QHBoxLayout(button_row)
        button_layout.addStretch(1)
        delete_button = QPushButton("削除")
        delete_button.clicked.connect(self.delete_unchecked)
        button_layout.addWidget(delete_button)
        root_layout.addWidget(button_row)

        page_scroll = QScrollArea()
        page_scroll.setWidgetResizable(True)
        page_scroll.setWidget(content)
        self.setCentralWidget(page_scroll)

    def delete_unchecked(self):
        targets = [item for item, check in self.keep_checks if not check.isChecked()]
        if not targets:
            QMessageBox.information(self, "削除", "削除対象がありません。")
            return
        answer = QMessageBox.question(
            self,
            "削除確認",
            f"チェックされていない {len(targets)} 件の画像を削除しますか？",
        )
        if answer != QMessageBox.Yes:
            return
        deleted_paths = []
        errors = []
        for item in targets:
            try:
                if item.path.exists():
                    item.path.unlink()
                    deleted_paths.append(item.path)
            except Exception as exc:
                errors.append(f"{item.name}: {exc}")
        if self.on_deleted:
            self.on_deleted(set(deleted_paths))
        if errors:
            QMessageBox.warning(self, "削除結果", "一部削除に失敗しました:\n" + "\n".join(errors[:10]))
        else:
            QMessageBox.information(self, "削除結果", f"{len(deleted_paths)} 件を削除しました。")
        self.close()


class TileWidget(QWidget):
    def __init__(self, item: ImageItem, index: int, tile_size: int, on_select, pixmap: QPixmap | None = None):
        super().__init__()
        self.index = index
        self.on_select = on_select
        self.setFixedSize(tile_size, tile_size)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.button = QPushButton()
        self.button.setFixedSize(tile_size, tile_size)
        self.button.clicked.connect(lambda: self.on_select(self.index))
        if pixmap is None:
            pixmap = pil_to_pixmap(item.image).scaled(tile_size, tile_size, Qt.KeepAspectRatio, Qt.FastTransformation)
        self.button.setIcon(pixmap)
        self.button.setIconSize(pixmap.size())
        layout.addWidget(self.button, alignment=Qt.AlignCenter)


class TileGroupWindow(QMainWindow):
    def __init__(self, owner):
        super().__init__(owner)
        self.owner = owner
        self.setWindowTitle("近傍画像グループ")
        self.resize(900, 650)
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.container = QWidget()
        self.grid = QGridLayout(self.container)
        self.grid.setAlignment(Qt.AlignTop | Qt.AlignLeft)
        self.grid.setContentsMargins(4, 4, 4, 4)
        self.grid.setSpacing(4)
        self.scroll.setWidget(self.container)
        start_button = QPushButton("このグループでスライドショー")
        start_button.clicked.connect(self.start_group_slideshow)
        self.group_tag_input = QLineEdit()
        self.group_tag_input.setPlaceholderText("例: blue background, standing pose")
        add_group_tag_button = QPushButton("グループタグを追加")
        add_group_tag_button.clicked.connect(self.add_group_tags)

        action_row = QWidget()
        action_layout = QHBoxLayout(action_row)
        action_layout.setContentsMargins(0, 0, 0, 0)
        action_layout.addWidget(start_button)
        action_layout.addWidget(QLabel("グループタグ"))
        action_layout.addWidget(self.group_tag_input, 1)
        action_layout.addWidget(add_group_tag_button)

        wrapper = QWidget()
        layout = QVBoxLayout(wrapper)
        layout.addWidget(action_row)
        layout.addWidget(self.scroll, 1)
        self.setCentralWidget(wrapper)
        self.indexes: list[int] = []

    def set_indexes(self, indexes: list[int]):
        self.indexes = indexes
        while self.grid.count():
            item = self.grid.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.deleteLater()
        tile_size = max(100, min(220, self.owner.tile_size.value()))
        columns = max(1, self.width() // (tile_size + 8))
        for pos, item_index in enumerate(indexes):
            if 0 <= item_index < len(self.owner.items):
                widget = TileWidget(self.owner.items[item_index], item_index, tile_size, self.owner.select_image)
                self.grid.addWidget(widget, pos // columns, pos % columns)

    def start_group_slideshow(self):
        self.owner.start_slideshow_for_indexes(self.indexes)

    def add_group_tags(self):
        tags = parse_tag_text(self.group_tag_input.text())
        if not tags:
            QMessageBox.information(self, "グループタグ", "追加するタグを入力してください。")
            return
        self.owner.add_group_tags_to_indexes(self.indexes, tags)
        self.group_tag_input.clear()


class TranslationDictionaryWindow(QMainWindow):
    def __init__(self, owner):
        super().__init__(owner)
        self.owner = owner
        self.setWindowTitle("タグ翻訳辞書")
        self.resize(760, 620)
        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["英語タグ", "内蔵翻訳", "ユーザー翻訳"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.table.verticalHeader().setVisible(False)
        self._build_ui()
        self.reload()

    def _build_ui(self):
        add_button = QPushButton("行を追加")
        save_button = QPushButton("保存")
        reload_button = QPushButton("再読み込み")
        add_button.clicked.connect(self.add_empty_row)
        save_button.clicked.connect(self.save)
        reload_button.clicked.connect(self.reload)

        button_row = QWidget()
        button_layout = QHBoxLayout(button_row)
        button_layout.addWidget(add_button)
        button_layout.addStretch(1)
        button_layout.addWidget(reload_button)
        button_layout.addWidget(save_button)

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.addWidget(self.table, 1)
        layout.addWidget(button_row)
        self.setCentralWidget(container)

    def add_empty_row(self):
        row = self.table.rowCount()
        self.table.insertRow(row)
        self.table.setItem(row, 0, QTableWidgetItem(""))
        builtin_item = QTableWidgetItem("")
        builtin_item.setFlags(builtin_item.flags() & ~Qt.ItemIsEditable)
        self.table.setItem(row, 1, builtin_item)
        self.table.setItem(row, 2, QTableWidgetItem(""))

    def reload(self):
        rows = self.owner.translation_store.all_rows()
        self.table.setRowCount(len(rows))
        for row, (english, builtin, user_value) in enumerate(rows):
            english_item = QTableWidgetItem(english)
            builtin_item = QTableWidgetItem(builtin)
            builtin_item.setFlags(builtin_item.flags() & ~Qt.ItemIsEditable)
            user_item = QTableWidgetItem(user_value)
            self.table.setItem(row, 0, english_item)
            self.table.setItem(row, 1, builtin_item)
            self.table.setItem(row, 2, user_item)

    def save(self):
        translations: dict[str, str] = {}
        for row in range(self.table.rowCount()):
            english_item = self.table.item(row, 0)
            user_item = self.table.item(row, 2)
            if not english_item:
                continue
            english = normalize_tag_token(english_item.text())
            japanese = user_item.text().strip() if user_item else ""
            if english and japanese:
                translations[english] = japanese
        self.owner.translation_store.user_translations = translations
        self.owner.translation_store.save()
        self.owner.refresh_translation_views()
        self.owner.statusBar().showMessage("タグ翻訳辞書を保存しました。")


class TranslationWorker(QObject):
    finished = Signal(dict)
    error = Signal(str)

    def __init__(self, tags: list[str], model_dir: Path):
        super().__init__()
        self.tags = tags
        self.model_dir = model_dir

    def run(self):
        try:
            if not self.model_dir.exists():
                raise FileNotFoundError(f"翻訳モデルフォルダが見つかりません: {self.model_dir}")
            if not translation_model_ready(self.model_dir):
                missing = sorted(filename for filename in TRANSLATION_REQUIRED_FILES if not (self.model_dir / filename).exists())
                raise FileNotFoundError("翻訳モデルの必要ファイルが不足しています: " + ", ".join(missing))
            with tempfile.TemporaryDirectory(prefix="tag_translate_") as temp_dir:
                input_path = Path(temp_dir) / "input.json"
                output_path = Path(temp_dir) / "output.json"
                input_path.write_text(
                    json.dumps({"tags": self.tags, "model_dir": str(self.model_dir)}, ensure_ascii=False),
                    encoding="utf-8",
                )
                code = r'''
import json
import sys
from pathlib import Path

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

input_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
payload = json.loads(input_path.read_text(encoding="utf-8"))
tags = payload["tags"]
model_dir = payload["model_dir"]
tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
model = AutoModelForSeq2SeqLM.from_pretrained(model_dir, local_files_only=True)
model.eval()
translations = {}
for start in range(0, len(tags), 16):
    batch_tags = tags[start:start + 16]
    texts = [tag.replace("_", " ") for tag in batch_tags]
    inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        generated = model.generate(**inputs, max_length=48, renormalize_logits=True)
    decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
    for tag, translated in zip(batch_tags, decoded):
        translated = str(translated).strip()
        if translated:
            translations[tag] = translated
output_path.write_text(json.dumps(translations, ensure_ascii=False), encoding="utf-8")
'''
                run_external_python(code, [str(input_path), str(output_path)], timeout=900)
                translations = {
                    str(tag): clean_translated_text(str(translated))
                    for tag, translated in json.loads(output_path.read_text(encoding="utf-8")).items()
                    if str(translated).strip()
                }
            self.finished.emit(translations)
        except Exception:
            self.error.emit(traceback.format_exc())


class ImageLoadWorker(QObject):
    batch_loaded = Signal(list)
    progress = Signal(int, int)
    finished = Signal(dict)
    error = Signal(str)

    def __init__(
        self,
        folder_path: str,
        max_images: int,
        max_side: int,
        include_subfolders: bool,
        enabled_exts: set[str],
    ):
        super().__init__()
        self.folder_path = folder_path
        self.max_images = max_images
        self.max_side = max_side
        self.include_subfolders = include_subfolders
        self.enabled_exts = enabled_exts
        self.stop_requested = False

    def stop(self):
        self.stop_requested = True

    def run(self):
        try:
            folder = Path(self.folder_path)
            iterator = folder.rglob("*") if self.include_subfolders else folder.glob("*")
            batch: list[ImageItem] = []
            skipped: dict[str, int] = {}
            loaded = 0
            scanned = 0
            last_emit = time.monotonic()

            for path in iterator:
                if self.stop_requested or loaded >= self.max_images:
                    break
                scanned += 1
                if path.is_dir():
                    continue

                ext = path.suffix.lower()
                if ext not in self.enabled_exts:
                    skipped[ext or "(no_ext)"] = skipped.get(ext or "(no_ext)", 0) + 1
                    continue

                try:
                    bytes_data = path.read_bytes()
                    raw = Image.open(io.BytesIO(bytes_data))
                    image = raw.convert("RGB")
                    image.thumbnail((self.max_side, self.max_side))
                    name = str(path.relative_to(folder)) if self.include_subfolders else path.name
                    tag_scores, tag_model = extract_ai_tag_scores(raw)
                    tags = extract_tags(path, raw) | set(tag_scores) | group_tag_set(raw)
                    batch.append(
                        ImageItem(
                            path=path,
                            name=name,
                            image=image,
                            raw_image=raw,
                            bytes_data=bytes_data,
                            tags=tags,
                            tag_scores=tag_scores,
                            tag_model=tag_model,
                        )
                    )
                    loaded += 1
                except Exception:
                    key = f"{ext or '(no_ext)'}(read_error)"
                    skipped[key] = skipped.get(key, 0) + 1

                now = time.monotonic()
                if len(batch) >= 12 or (batch and now - last_emit >= 0.25):
                    self.batch_loaded.emit(batch)
                    batch = []
                    last_emit = now
                    self.progress.emit(loaded, scanned)

            if batch:
                self.batch_loaded.emit(batch)
            self.progress.emit(loaded, scanned)
            self.finished.emit(skipped)
        except Exception:
            self.error.emit(traceback.format_exc())


class TaggingWorker(QObject):
    progress = Signal(int, int)
    finished = Signal(list, list)
    error = Signal(str)

    def __init__(self, items: list[ImageItem], model_key: str, threshold: float, model_root: Path):
        super().__init__()
        self.items = items
        self.model_key = model_key
        self.threshold = threshold
        self.model_root = model_root

    def run(self):
        try:
            rows = []
            converted_originals: list[Path] = []
            total = len(self.items)
            for pos, item in enumerate(self.items, start=1):
                if item.tag_model == self.model_key or has_generation_prompt(item.raw_image):
                    rows.append((item.name, "skipped", "", ""))
                    self.progress.emit(pos, total)
                    continue
                scored = recognize_tags_integrated(item.image, self.model_key, self.threshold, self.model_root)
                for tag, _score in scored[:20]:
                    item.tags.add(tag.lower())
                item.tag_scores.update({tag.lower(): float(score) for tag, score in scored})
                item.tag_model = self.model_key
                save_tagged_png(item, scored, self.model_key)
                if item.path.suffix.lower() != ".png":
                    converted_originals.append(item.path)
                rows.append((item.name, ", ".join(f"{tag}:{score:.2f}" for tag, score in scored[:12]), "", ""))
                self.progress.emit(pos, total)
            self.finished.emit(rows, converted_originals)
        except Exception:
            self.error.emit(traceback.format_exc())


class ImageFolderViewer(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("画像フォルダビューア")
        self.resize(1220, 820)

        self.items: list[ImageItem] = []
        self.visible_indexes: list[int] = []
        self.slideshow_indexes: list[int] | None = None
        self.selected_index = -1
        self.tile_widgets: list[TileWidget] = []
        self.tile_pixmap_cache: dict[tuple[int, int], QPixmap] = {}
        self.last_tile_columns = 0
        self.last_tile_size = 0
        self.detail_window: DetailWindow | None = None
        self.detail_frozen = False
        self.slideshow_window: SlideshowWindow | None = None
        self.duplicate_window: DuplicateWindow | None = None
        self.tsne_window: TsnePlotWindow | None = None
        self.tsne_group_window: TileGroupWindow | None = None
        self.loading_thread: QThread | None = None
        self.loading_worker: ImageLoadWorker | None = None
        self.loading_session = 0
        self.tagging_thread: QThread | None = None
        self.tagging_worker: TaggingWorker | None = None
        self.translation_thread: QThread | None = None
        self.translation_worker: TranslationWorker | None = None
        self.translation_window: TranslationDictionaryWindow | None = None
        self.translation_store = TagTranslationStore()
        self.tagging_rows = []

        self.folder_input = QLineEdit()
        self.include_subfolders = QCheckBox("サブフォルダ含む")
        self.include_subfolders.setChecked(True)
        self.include_subfolders.stateChanged.connect(self.refresh_extensions)
        self.folder_ext_label = QLabel("フォルダを選択すると拡張子一覧を表示します。")
        self.folder_ext_label.setWordWrap(True)
        self.always_ext_input = QLineEdit(DEFAULT_ALWAYS_EXTS)
        self.extra_ext_input = QLineEdit()
        self.model_dir_input = QLineEdit(str(default_model_dir()))
        self.translation_csv_input = QLineEdit(str(default_tag_dictionary_path()))
        self.translation_model_input = QLineEdit(str(default_translation_model_dir()))
        self.show_tag_translations = QCheckBox("日本語タグを表示")
        self.show_tag_translations.setChecked(True)
        self.show_tag_translations.stateChanged.connect(self.refresh_translation_views)
        self.ai_translate_missing = QCheckBox("未翻訳タグをAI翻訳して辞書に保存")
        self.ai_translate_missing.setChecked(False)

        self.max_images = QSpinBox()
        self.max_images.setRange(10, 5000)
        self.max_images.setSingleStep(10)
        self.max_images.setValue(300)
        self.max_side = QSpinBox()
        self.max_side.setRange(256, 4096)
        self.max_side.setSingleStep(64)
        self.max_side.setValue(1280)
        self.tile_size = QSlider(Qt.Horizontal)
        self.tile_size.setRange(80, 320)
        self.tile_size.setSingleStep(10)
        self.tile_size.setPageStep(20)
        self.tile_size.setValue(150)
        self.tile_size_timer = QTimer(self)
        self.tile_size_timer.setSingleShot(True)
        self.tile_size_timer.timeout.connect(self.render_tiles)
        self.tile_size.sliderPressed.connect(self.on_tile_size_slider_pressed)
        self.tile_size.sliderReleased.connect(self.on_tile_size_slider_released)
        self.tile_size.valueChanged.connect(self.on_tile_size_changed)
        self.resizing_tiles = False
        self.tag_update_timer = QTimer(self)
        self.tag_update_timer.setSingleShot(True)
        self.tag_update_timer.timeout.connect(self.populate_tags)
        self.slide_interval = QSpinBox()
        self.slide_interval.setRange(1, 30)
        self.slide_interval.setValue(2)
        self.duplicate_threshold = QSpinBox()
        self.duplicate_threshold.setRange(0, 32)
        self.duplicate_threshold.setValue(8)
        self.wd_threshold = QSpinBox()
        self.wd_threshold.setRange(5, 95)
        self.wd_threshold.setSingleStep(5)
        self.wd_threshold.setValue(35)
        self.tagger_model = QComboBox()
        self.tagger_model.addItems(list(TAGGER_MODELS.keys()))

        self.and_input = QLineEdit()
        self.or_input = QLineEdit()
        self.not_input = QLineEdit()
        self.min_score = QSpinBox()
        self.min_score.setRange(0, 100)
        self.min_score.setValue(0)
        self.min_score.setSuffix("%")
        self.tag_list = QListWidget()

        self.tile_area = QScrollArea()
        self.tile_area.setWidgetResizable(True)
        self.tile_container = QWidget()
        self.tile_grid = QGridLayout(self.tile_container)
        self.tile_grid.setAlignment(Qt.AlignTop | Qt.AlignLeft)
        self.tile_grid.setContentsMargins(4, 4, 4, 4)
        self.tile_grid.setSpacing(4)
        self.tile_area.setWidget(self.tile_container)

        self.analysis_table = QTableWidget(0, 4)
        self.analysis_table.setHorizontalHeaderLabels(["画像", "タグ/クラスタ", "x", "y"])
        self.analysis_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.analysis_table.verticalHeader().setVisible(False)
        self.analysis_table.setEditTriggers(QTableWidget.NoEditTriggers)

        self.statusBar().showMessage("画像フォルダを選択してください。")
        self._build_ui()
        self.load_translation_csv(show_message=False)

    def _build_ui(self):
        toolbar = QToolBar("main")
        self.addToolBar(toolbar)

        choose_button = QPushButton("フォルダ選択")
        choose_button.clicked.connect(self.choose_folder)
        load_button = QPushButton("読み込み")
        load_button.clicked.connect(self.load_folder)
        prev_button = QPushButton("前へ")
        prev_button.clicked.connect(self.prev_image)
        next_button = QPushButton("次へ")
        next_button.clicked.connect(self.next_image)
        start_button = QPushButton("スライド開始")
        start_button.clicked.connect(self.start_slideshow)
        stop_button = QPushButton("停止")
        stop_button.clicked.connect(self.stop_slideshow)
        detail_button = QPushButton("詳細")
        detail_button.clicked.connect(self.open_detail_window)

        toolbar.addWidget(choose_button)
        toolbar.addWidget(self.folder_input)
        toolbar.addWidget(load_button)
        toolbar.addSeparator()
        for button in [start_button]:
            toolbar.addWidget(button)

        side_tabs = QTabWidget()
        side_tabs.addTab(self._build_tag_tab(), "タグ検索")
        side_tabs.addTab(self._build_settings_tab(), "設定")
        side_tabs.addTab(self._build_analysis_tab(), "解析")

        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(side_tabs)
        splitter.addWidget(self.tile_area)
        splitter.setSizes([360, 860])
        splitter.setStretchFactor(1, 1)

        container = QWidget()
        layout = QHBoxLayout(container)
        layout.addWidget(splitter)
        self.setCentralWidget(container)

    def _build_settings_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)

        read_group = QGroupBox("読み込み設定")
        read_layout = QFormLayout(read_group)
        read_layout.addRow(self.include_subfolders)
        read_layout.addRow("最大枚数", self.max_images)
        read_layout.addRow("長辺px", self.max_side)
        read_layout.addRow("タイルサイズ", self.tile_size)
        layout.addWidget(read_group)

        ext_group = QGroupBox("拡張子設定")
        ext_layout = QFormLayout(ext_group)
        refresh_button = QPushButton("拡張子一覧を更新")
        refresh_button.clicked.connect(self.refresh_extensions)
        ext_layout.addRow(refresh_button)
        ext_layout.addRow("検出拡張子", self.folder_ext_label)
        ext_layout.addRow("常に読む拡張子", self.always_ext_input)
        ext_layout.addRow("追加で読む拡張子", self.extra_ext_input)
        layout.addWidget(ext_group)

        model_group = QGroupBox("AIモデル")
        model_layout = QFormLayout(model_group)
        model_button = QPushButton("モデルフォルダ選択")
        model_button.clicked.connect(self.choose_model_folder)
        model_layout.addRow(model_button)
        model_layout.addRow("保存先", self.model_dir_input)
        prepare_button = QPushButton("選択モデルをローカル準備")
        prepare_button.clicked.connect(self.prepare_selected_model)
        model_layout.addRow(prepare_button)
        layout.addWidget(model_group)

        translation_group = QGroupBox("タグ翻訳")
        translation_layout = QFormLayout(translation_group)
        translation_layout.addRow(self.show_tag_translations)
        translation_layout.addRow(self.ai_translate_missing)
        translation_csv_button = QPushButton("タグ翻訳CSVを選択")
        translation_csv_button.clicked.connect(self.choose_translation_csv)
        translation_layout.addRow(translation_csv_button)
        translation_layout.addRow("タグ翻訳CSV", self.translation_csv_input)
        load_translation_csv_button = QPushButton("CSV辞書を読み込み")
        load_translation_csv_button.clicked.connect(self.load_translation_csv)
        translation_layout.addRow(load_translation_csv_button)
        translation_model_button = QPushButton("翻訳モデルフォルダ選択")
        translation_model_button.clicked.connect(self.choose_translation_model_folder)
        translation_layout.addRow(translation_model_button)
        translation_layout.addRow("翻訳モデル", self.translation_model_input)
        prepare_translation_button = QPushButton("翻訳モデルをローカル準備")
        prepare_translation_button.clicked.connect(self.prepare_translation_model)
        translation_layout.addRow(prepare_translation_button)
        ai_translate_button = QPushButton("表示中タグの未翻訳をAI翻訳")
        ai_translate_button.clicked.connect(self.run_ai_tag_translation)
        translation_layout.addRow(ai_translate_button)
        edit_translation_button = QPushButton("翻訳辞書を編集")
        edit_translation_button.clicked.connect(self.open_translation_dictionary)
        translation_layout.addRow(edit_translation_button)
        reload_translation_button = QPushButton("翻訳辞書を再読み込み")
        reload_translation_button.clicked.connect(self.reload_translation_dictionary)
        translation_layout.addRow(reload_translation_button)
        layout.addWidget(translation_group)

        dup_group = QGroupBox("重複確認")
        dup_layout = QFormLayout(dup_group)
        dup_layout.addRow("しきい値", self.duplicate_threshold)
        dup_button = QPushButton("表示中画像で重複確認")
        dup_button.clicked.connect(self.run_duplicate_check)
        dup_layout.addRow(dup_button)
        layout.addWidget(dup_group)
        layout.addStretch(1)
        return tab

    def _build_tag_tab(self):
        tab = QWidget()
        layout = QFormLayout(tab)
        self.and_input.setPlaceholderText("例: cat, smile")
        self.or_input.setPlaceholderText("例: outdoor, room")
        self.not_input.setPlaceholderText("例: blurry")
        layout.addRow("ANDタグ", self.and_input)
        layout.addRow("ORタグ", self.or_input)
        layout.addRow("NOTタグ", self.not_input)
        layout.addRow("最小確率", self.min_score)

        button_row = QWidget()
        button_layout = QHBoxLayout(button_row)
        search_button = QPushButton("検索")
        clear_button = QPushButton("解除")
        search_button.clicked.connect(self.apply_tag_filter)
        clear_button.clicked.connect(self.clear_tag_filter)
        button_layout.addWidget(search_button)
        button_layout.addWidget(clear_button)
        layout.addRow(button_row)

        self.tag_list.itemDoubleClicked.connect(self.add_tag_from_list)
        layout.addRow("タグ候補", self.tag_list)
        return tab

    def _build_analysis_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)

        wd_group = QGroupBox("Danbooru系 AIタグ付け")
        wd_layout = QFormLayout(wd_group)
        wd_layout.addRow("モデル", self.tagger_model)
        wd_layout.addRow("しきい値 x100", self.wd_threshold)
        wd_button = QPushButton("表示中画像にAIタグ付け")
        wd_button.clicked.connect(self.run_wd14_tagging)
        wd_layout.addRow(wd_button)
        layout.addWidget(wd_group)

        tsne_group = QGroupBox("t-SNE 解析")
        tsne_layout = QVBoxLayout(tsne_group)
        tsne_button = QPushButton("表示中画像をt-SNE解析")
        tsne_button.clicked.connect(self.run_tsne_analysis)
        tsne_layout.addWidget(tsne_button)
        layout.addWidget(tsne_group)
        layout.addWidget(self.analysis_table, 1)
        return tab

    def choose_folder(self):
        folder = QFileDialog.getExistingDirectory(self, "画像フォルダを選択")
        if folder:
            self.folder_input.setText(folder)
            self.refresh_extensions()
            self.load_folder()

    def choose_model_folder(self):
        folder = QFileDialog.getExistingDirectory(self, "AIモデルフォルダを選択", self.model_dir_input.text())
        if folder:
            self.model_dir_input.setText(folder)

    def choose_translation_model_folder(self):
        folder = QFileDialog.getExistingDirectory(self, "翻訳モデルフォルダを選択", self.translation_model_input.text())
        if folder:
            self.translation_model_input.setText(folder)

    def choose_translation_csv(self):
        path, _selected = QFileDialog.getOpenFileName(
            self,
            "タグ翻訳CSVを選択",
            self.translation_csv_input.text(),
            "CSV files (*.csv);;All files (*.*)",
        )
        if path:
            self.translation_csv_input.setText(path)
            self.load_translation_csv()

    def load_translation_csv(self, show_message: bool = True):
        path = Path(self.translation_csv_input.text().strip() or default_tag_dictionary_path())
        try:
            loaded, skipped = self.translation_store.load_external_csv(path)
        except Exception as exc:
            if show_message:
                QMessageBox.critical(self, "CSV辞書読み込み失敗", str(exc))
            return
        self.refresh_translation_views()
        if self.translation_window is not None and self.translation_window.isVisible():
            self.translation_window.reload()
        if show_message:
            self.statusBar().showMessage(f"CSV辞書を読み込みました: {loaded}件 / skipped {skipped}件")

    def open_translation_dictionary(self):
        if self.translation_window is None:
            self.translation_window = TranslationDictionaryWindow(self)
        else:
            self.translation_window.reload()
        self.translation_window.show()
        self.translation_window.raise_()
        self.translation_window.activateWindow()

    def reload_translation_dictionary(self):
        self.translation_store.load()
        self.load_translation_csv()
        self.refresh_translation_views()
        if self.translation_window is not None and self.translation_window.isVisible():
            self.translation_window.reload()
        self.statusBar().showMessage("タグ翻訳辞書を再読み込みしました。")

    def refresh_translation_views(self):
        if self.detail_window is not None and self.detail_window.isVisible():
            self.detail_window.update_info()

    def collect_visible_tags(self) -> list[str]:
        tags: set[str] = set()
        for index in self.visible_indexes:
            if 0 <= index < len(self.items):
                tags.update(self.items[index].tags)
        return sorted(tags)

    def untranslated_visible_tags(self) -> list[str]:
        return [tag for tag in self.collect_visible_tags() if not self.translation_store.translate(tag)]

    def prepare_translation_model(self):
        model_dir = Path(self.translation_model_input.text().strip() or default_translation_model_dir())
        model_dir.mkdir(parents=True, exist_ok=True)
        if translation_model_ready(model_dir):
            QMessageBox.information(self, "翻訳モデル準備完了", f"必要ファイルはすでに揃っています。\n{model_dir}")
            return
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            code = r'''
import sys
from pathlib import Path

from huggingface_hub import snapshot_download

repo_id = sys.argv[1]
model_dir = Path(sys.argv[2])
model_dir.mkdir(parents=True, exist_ok=True)
snapshot_download(repo_id=repo_id, local_dir=str(model_dir), local_dir_use_symlinks=False)
'''
            run_external_python(code, [TRANSLATION_MODEL_REPO, str(model_dir)], timeout=900)
            if not translation_model_ready(model_dir):
                missing = sorted(filename for filename in TRANSLATION_REQUIRED_FILES if not (model_dir / filename).exists())
                raise FileNotFoundError("翻訳モデルの必要ファイルが不足しています: " + ", ".join(missing))
        except Exception as exc:
            QMessageBox.critical(self, "翻訳モデル準備失敗", str(exc))
            return
        finally:
            QApplication.restoreOverrideCursor()
        QMessageBox.information(self, "翻訳モデル準備完了", str(model_dir))

    def run_ai_tag_translation(self):
        if self.translation_thread is not None and self.translation_thread.isRunning():
            QMessageBox.information(self, "AI翻訳", "AI翻訳はすでに実行中です。")
            return
        tags = self.untranslated_visible_tags()
        if not tags:
            QMessageBox.information(self, "AI翻訳", "表示中画像に未翻訳タグはありません。")
            return
        model_dir = Path(self.translation_model_input.text().strip() or default_translation_model_dir())
        self.translation_thread = QThread(self)
        self.translation_worker = TranslationWorker(tags, model_dir)
        self.translation_worker.moveToThread(self.translation_thread)
        self.translation_thread.started.connect(self.translation_worker.run)
        self.translation_worker.finished.connect(self.on_translation_finished)
        self.translation_worker.error.connect(self.on_translation_error)
        self.translation_worker.finished.connect(self.translation_thread.quit)
        self.translation_worker.error.connect(self.translation_thread.quit)
        self.translation_thread.finished.connect(self.translation_worker.deleteLater)
        self.translation_thread.finished.connect(self.translation_thread.deleteLater)
        self.translation_thread.finished.connect(self.clear_translation_thread)
        self.statusBar().showMessage(f"AI翻訳中: {len(tags)}タグ")
        self.translation_thread.start()

    def on_translation_finished(self, translations: dict):
        self.translation_store.merge_translations({str(key): str(value) for key, value in translations.items()})
        self.refresh_translation_views()
        if self.translation_window is not None and self.translation_window.isVisible():
            self.translation_window.reload()
        self.statusBar().showMessage(f"AI翻訳が完了しました: {len(translations)}タグ")

    def on_translation_error(self, message: str):
        QMessageBox.critical(self, "AI翻訳失敗", message)
        self.statusBar().showMessage("AI翻訳に失敗しました。")

    def clear_translation_thread(self):
        self.translation_thread = None
        self.translation_worker = None

    def refresh_extensions(self):
        folder = self.folder_input.text().strip()
        if not folder or not Path(folder).is_dir():
            self.folder_ext_label.setText("フォルダを選択すると拡張子一覧を表示します。")
            return
        counts = scan_folder_extensions(folder, self.include_subfolders.isChecked())
        if not counts:
            self.folder_ext_label.setText("ファイルが見つかりません。")
            return
        self.folder_ext_label.setText(", ".join(f"{ext}({count})" for ext, count in counts.items()))

    def enabled_extensions(self):
        return parse_ext_text(self.always_ext_input.text()) | parse_ext_text(self.extra_ext_input.text())

    def load_folder(self):
        folder = self.folder_input.text().strip()
        if not folder:
            QMessageBox.warning(self, "フォルダ未指定", "画像フォルダを指定してください。")
            return
        if not Path(folder).is_dir():
            QMessageBox.critical(self, "読み込み失敗", "指定されたフォルダが見つかりません。")
            return
        self.refresh_extensions()
        enabled_exts = self.enabled_extensions()
        if not enabled_exts:
            QMessageBox.warning(self, "拡張子未指定", "読み込む拡張子を指定してください。")
            return
        self.stop_slideshow()
        self.stop_loading()
        self.items = []
        self.visible_indexes = []
        self.selected_index = -1
        self.tile_widgets.clear()
        self.tile_pixmap_cache.clear()
        self.last_tile_columns = 0
        self.last_tile_size = 0
        self.tag_list.clear()
        self.clear_tile_grid()
        loading_label = QLabel("画像を読み込み中...")
        loading_label.setAlignment(Qt.AlignCenter)
        self.tile_grid.addWidget(loading_label, 0, 0)

        self.loading_thread = QThread(self)
        self.loading_worker = ImageLoadWorker(
            folder,
            max_images=self.max_images.value(),
            max_side=self.max_side.value(),
            include_subfolders=self.include_subfolders.isChecked(),
            enabled_exts=enabled_exts,
        )
        self.loading_session += 1
        session = self.loading_session
        self.loading_worker.moveToThread(self.loading_thread)
        self.loading_thread.started.connect(self.loading_worker.run)
        self.loading_worker.batch_loaded.connect(lambda batch, current=session: self.on_image_batch_loaded(current, batch))
        self.loading_worker.progress.connect(lambda loaded, scanned, current=session: self.on_image_load_progress(current, loaded, scanned))
        self.loading_worker.finished.connect(lambda skipped, current=session: self.on_image_load_finished(current, skipped))
        self.loading_worker.error.connect(lambda message, current=session: self.on_image_load_error(current, message))
        self.loading_worker.finished.connect(self.loading_thread.quit)
        self.loading_worker.error.connect(self.loading_thread.quit)
        self.loading_thread.finished.connect(self.loading_worker.deleteLater)
        self.loading_thread.finished.connect(self.loading_thread.deleteLater)
        self.loading_thread.finished.connect(lambda current=session: self.clear_loading_thread(current))
        self.statusBar().showMessage("画像を読み込み中: 0枚")
        self.loading_thread.start()

    def stop_loading(self):
        if self.loading_worker is not None:
            self.loading_worker.stop()

    def clear_loading_thread(self, session: int):
        if session != self.loading_session:
            return
        self.loading_thread = None
        self.loading_worker = None

    def on_image_batch_loaded(self, session: int, batch: list):
        if session != self.loading_session:
            return
        start_index = len(self.items)
        self.items.extend(batch)
        new_indexes = list(range(start_index, len(self.items)))
        self.visible_indexes.extend(new_indexes)
        self.append_tiles_for_indexes(new_indexes)
        if self.selected_index < 0 and self.items:
            self.select_image(0, open_detail=False)
        self.tag_update_timer.start(400)
        self.statusBar().showMessage(f"画像を読み込み中: {len(self.items)}枚")

    def on_image_load_progress(self, session: int, loaded: int, scanned: int):
        if session != self.loading_session:
            return
        self.statusBar().showMessage(f"画像を読み込み中: {loaded}枚 / scanned {scanned}")

    def on_image_load_finished(self, session: int, skipped: dict):
        if session != self.loading_session:
            return
        self.tag_update_timer.stop()
        self.populate_tags()
        skipped_text = f" / skipped: {sum(skipped.values())}" if skipped else ""
        self.statusBar().showMessage(f"読み込み完了: {len(self.items)}枚{skipped_text}")
        if self.ai_translate_missing.isChecked():
            QTimer.singleShot(0, self.run_ai_tag_translation)

    def on_image_load_error(self, session: int, message: str):
        if session != self.loading_session:
            return
        QMessageBox.critical(self, "読み込み失敗", message)
        self.statusBar().showMessage("画像読み込みに失敗しました。")

    def populate_tags(self):
        tag_counts: dict[str, int] = {}
        for item in self.items:
            for tag in item.tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        self.tag_list.clear()
        for tag, count in sorted(tag_counts.items(), key=lambda pair: (-pair[1], pair[0]))[:300]:
            self.tag_list.addItem(f"{tag} ({count})")

    def set_visible_indexes(self, indexes: list[int]):
        self.visible_indexes = indexes
        self.last_tile_columns = 0
        self.render_tiles()
        if indexes:
            self.select_image(indexes[0], open_detail=False)
        else:
            self.selected_index = -1

    def clear_tile_grid(self):
        while self.tile_grid.count():
            item = self.tile_grid.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()
        self.tile_widgets.clear()

    def on_tile_size_slider_pressed(self):
        self.resizing_tiles = True

    def on_tile_size_changed(self, _value: int):
        delay = 300 if self.resizing_tiles else 120
        self.tile_size_timer.start(delay)

    def on_tile_size_slider_released(self):
        self.resizing_tiles = False
        self.tile_size_timer.stop()
        self.render_tiles()

    def cached_tile_pixmap(self, item_index: int, tile_size: int) -> QPixmap:
        key = (item_index, tile_size)
        pixmap = self.tile_pixmap_cache.get(key)
        if pixmap is None:
            pixmap = pil_to_pixmap(self.items[item_index].image).scaled(
                tile_size,
                tile_size,
                Qt.KeepAspectRatio,
                Qt.FastTransformation,
            )
            self.tile_pixmap_cache[key] = pixmap
            if len(self.tile_pixmap_cache) > 2500:
                current_size = self.tile_size.value()
                self.tile_pixmap_cache = {
                    cache_key: cache_pixmap
                    for cache_key, cache_pixmap in self.tile_pixmap_cache.items()
                    if cache_key[1] == current_size
                }
        return pixmap

    def append_tiles_for_indexes(self, new_indexes: list[int]):
        if not new_indexes:
            return
        tile_size = self.tile_size.value()
        viewport_width = max(360, self.tile_area.viewport().width())
        columns = max(1, viewport_width // (tile_size + 8))
        if not self.tile_widgets or columns != self.last_tile_columns or tile_size != self.last_tile_size:
            self.render_tiles()
            return

        self.tile_area.setUpdatesEnabled(False)
        try:
            start_pos = len(self.visible_indexes) - len(new_indexes)
            for offset, item_index in enumerate(new_indexes):
                visible_pos = start_pos + offset
                widget = TileWidget(
                    self.items[item_index],
                    item_index,
                    tile_size,
                    self.select_image,
                    self.cached_tile_pixmap(item_index, tile_size),
                )
                self.tile_grid.addWidget(widget, visible_pos // columns, visible_pos % columns)
                self.tile_widgets.append(widget)
        finally:
            self.tile_area.setUpdatesEnabled(True)

    def render_tiles(self):
        self.tile_area.setUpdatesEnabled(False)
        try:
            self.clear_tile_grid()

            if not self.visible_indexes:
                empty = QLabel("該当する画像がありません。")
                empty.setAlignment(Qt.AlignCenter)
                self.tile_grid.addWidget(empty, 0, 0)
                return

            tile_size = self.tile_size.value()
            viewport_width = max(360, self.tile_area.viewport().width())
            columns = max(1, viewport_width // (tile_size + 8))
            for visible_pos, item_index in enumerate(self.visible_indexes):
                widget = TileWidget(
                    self.items[item_index],
                    item_index,
                    tile_size,
                    self.select_image,
                    self.cached_tile_pixmap(item_index, tile_size),
                )
                row = visible_pos // columns
                col = visible_pos % columns
                self.tile_grid.addWidget(widget, row, col)
                self.tile_widgets.append(widget)
            self.last_tile_columns = columns
            self.last_tile_size = tile_size
        finally:
            self.tile_area.setUpdatesEnabled(True)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        tile_size = self.tile_size.value()
        viewport_width = max(360, self.tile_area.viewport().width())
        columns = max(1, viewport_width // (tile_size + 8))
        if columns != self.last_tile_columns:
            self.tile_size_timer.start(160)

    def open_detail_window(self, freeze=False):
        if self.selected_index < 0 or self.selected_index >= len(self.items):
            return
        if self.detail_window is None:
            self.detail_window = DetailWindow(self)
        self.detail_frozen = freeze
        self.detail_window.set_item(self.items[self.selected_index])
        self.detail_window.show()
        self.detail_window.raise_()
        self.detail_window.activateWindow()

    def select_image(self, index: int, open_detail=True):
        if index < 0 or index >= len(self.items):
            return
        self.selected_index = index
        if open_detail:
            self.open_detail_window()
        if self.slideshow_window is not None and self.slideshow_window.isVisible():
            self.slideshow_window.set_item(self.items[index])
        self.statusBar().showMessage(f"{index + 1}/{len(self.items)}: {self.items[index].name}")

    def open_tsne_group(self, indexes: list[int]):
        if self.tsne_group_window is None:
            self.tsne_group_window = TileGroupWindow(self)
        self.tsne_group_window.set_indexes(indexes)
        self.tsne_group_window.show()
        self.tsne_group_window.raise_()
        self.tsne_group_window.activateWindow()

    def refresh_item_after_metadata_save(self, item: ImageItem, new_path: Path):
        old_side = max(item.image.width, item.image.height, 1)
        item.path = new_path
        try:
            root = Path(self.folder_input.text().strip())
            if root and item.path.is_relative_to(root):
                item.name = str(item.path.relative_to(root)) if self.include_subfolders.isChecked() else item.path.name
            else:
                item.name = item.path.name
        except Exception:
            item.name = item.path.name
        item.bytes_data = item.path.read_bytes()
        item.raw_image = Image.open(io.BytesIO(item.bytes_data))
        item.image = item.raw_image.convert("RGB")
        item.image.thumbnail((old_side, old_side))
        item_index = next((index for index, current in enumerate(self.items) if current is item), None)
        if item_index is not None:
            self.tile_pixmap_cache = {
                cache_key: pixmap for cache_key, pixmap in self.tile_pixmap_cache.items() if cache_key[0] != item_index
            }
        tag_scores, tag_model = extract_ai_tag_scores(item.raw_image)
        item.tag_scores = tag_scores
        if tag_model:
            item.tag_model = tag_model
        item.tags = extract_tags(item.path, item.raw_image) | set(tag_scores) | group_tag_set(item.raw_image)

    def add_group_tags_to_indexes(self, indexes: list[int], tags: set[str]):
        valid_indexes = [index for index in indexes if 0 <= index < len(self.items)]
        if not valid_indexes:
            return
        converted_originals: list[Path] = []
        errors: list[str] = []
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            for index in valid_indexes:
                item = self.items[index]
                old_path = item.path
                try:
                    png_path = save_group_tags_to_png(item, tags)
                    self.refresh_item_after_metadata_save(item, png_path)
                    if png_path != old_path:
                        converted_originals.append(old_path)
                except Exception as exc:
                    item.tags.update(tags)
                    errors.append(f"{item.name}: {exc}")
        finally:
            QApplication.restoreOverrideCursor()

        if converted_originals:
            answer = QMessageBox.question(
                self,
                "元画像の削除確認",
                f"グループタグ保存のためPNGに変換した元画像が {len(converted_originals)} 件あります。\n元画像を削除しますか？",
            )
            if answer == QMessageBox.Yes:
                for path in converted_originals:
                    try:
                        if Path(path).exists():
                            Path(path).unlink()
                    except Exception as exc:
                        errors.append(f"{path.name}: {exc}")

        self.populate_tags()
        self.render_tiles()
        if self.detail_window is not None and self.detail_window.item is not None:
            if any(self.detail_window.item is self.items[index] for index in valid_indexes):
                self.detail_window.set_item(self.detail_window.item)
            else:
                self.detail_window.update_info()
        if self.tsne_group_window is not None and self.tsne_group_window.isVisible():
            self.tsne_group_window.set_indexes(self.tsne_group_window.indexes)

        message = f"グループタグを {len(valid_indexes)} 件に追加しました: {', '.join(sorted(tags))}"
        self.statusBar().showMessage(message)
        if errors:
            QMessageBox.warning(self, "グループタグ", "一部の保存に失敗しました:\n" + "\n".join(errors[:10]))

    def parse_tag_input(self, text: str) -> set[str]:
        return parse_tag_text(text)

    def apply_tag_filter(self):
        and_tags = self.parse_tag_input(self.and_input.text())
        or_tags = self.parse_tag_input(self.or_input.text())
        not_tags = self.parse_tag_input(self.not_input.text())
        min_score = self.min_score.value() / 100.0
        hits = []
        for index, item in enumerate(self.items):
            tags = item.tags
            scored_tags = {tag for tag, score in item.tag_scores.items() if score >= min_score}
            eligible_tags = tags if min_score <= 0 else scored_tags
            if and_tags and not and_tags.issubset(eligible_tags):
                continue
            if or_tags and not (or_tags & eligible_tags):
                continue
            if not_tags and (not_tags & tags):
                continue
            hits.append(index)
        self.set_visible_indexes(hits)
        self.statusBar().showMessage(f"タグ検索結果: {len(hits)}件")

    def clear_tag_filter(self):
        self.and_input.clear()
        self.or_input.clear()
        self.not_input.clear()
        self.set_visible_indexes(list(range(len(self.items))))
        self.statusBar().showMessage("タグ検索を解除しました。")

    def add_tag_from_list(self, item: QListWidgetItem):
        tag = item.text().rsplit(" (", 1)[0]
        current = self.and_input.text().strip()
        self.and_input.setText(f"{current}, {tag}" if current else tag)

    def visible_position(self):
        indexes = self.active_navigation_indexes()
        if self.selected_index in indexes:
            return indexes.index(self.selected_index)
        return 0

    def active_navigation_indexes(self):
        if self.slideshow_window is not None and self.slideshow_window.isVisible() and self.slideshow_indexes:
            return self.slideshow_indexes
        return self.visible_indexes

    def prev_image(self):
        indexes = self.active_navigation_indexes()
        if indexes:
            pos = (self.visible_position() - 1) % len(indexes)
            in_slideshow = self.slideshow_window is not None and self.slideshow_window.isVisible()
            update_detail = self.detail_window is not None and not self.detail_frozen and not in_slideshow
            self.select_image(indexes[pos], open_detail=update_detail)

    def next_image(self):
        indexes = self.active_navigation_indexes()
        if indexes:
            pos = (self.visible_position() + 1) % len(indexes)
            in_slideshow = self.slideshow_window is not None and self.slideshow_window.isVisible()
            update_detail = self.detail_window is not None and not self.detail_frozen and not in_slideshow
            self.select_image(indexes[pos], open_detail=update_detail)

    def start_slideshow(self):
        if self.visible_indexes:
            self.slideshow_indexes = None
            if self.selected_index not in self.visible_indexes:
                self.selected_index = self.visible_indexes[0]
            if self.slideshow_window is None:
                self.slideshow_window = SlideshowWindow(self)
            self.slideshow_window.set_item(self.items[self.selected_index])
            self.slideshow_window.show()
            self.slideshow_window.raise_()
            self.slideshow_window.activateWindow()
            self.slideshow_window.start()

    def start_slideshow_for_indexes(self, indexes: list[int]):
        indexes = [index for index in indexes if 0 <= index < len(self.items)]
        if not indexes:
            return
        self.slideshow_indexes = indexes
        self.selected_index = indexes[0]
        if self.slideshow_window is None:
            self.slideshow_window = SlideshowWindow(self)
        self.slideshow_window.set_item(self.items[self.selected_index])
        self.slideshow_window.show()
        self.slideshow_window.raise_()
        self.slideshow_window.activateWindow()
        self.slideshow_window.start()

    def stop_slideshow(self):
        if self.slideshow_window is not None:
            self.slideshow_window.stop()

    def run_duplicate_check(self):
        target_indexes = list(self.visible_indexes)
        target_items = [self.items[index] for index in target_indexes]
        if len(target_items) < 2:
            QMessageBox.information(self, "重複確認", "重複確認には2枚以上の画像が必要です。")
            return
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            groups = find_duplicate_groups(target_items, self.duplicate_threshold.value())
        finally:
            QApplication.restoreOverrideCursor()
        if not groups:
            QMessageBox.information(self, "重複確認", "重複候補は見つかりませんでした。")
            return
        duplicate_groups = [[target_items[i] for i in group] for group in groups]
        self.duplicate_window = DuplicateReviewWindow(
            duplicate_groups,
            self.duplicate_threshold.value(),
            on_deleted=self.remove_deleted_paths,
        )
        self.duplicate_window.show()
        self.duplicate_window.raise_()
        self.duplicate_window.activateWindow()

    def remove_deleted_paths(self, deleted_paths: set[Path]):
        if not deleted_paths:
            return
        self.items = [item for item in self.items if item.path not in deleted_paths]
        self.tile_pixmap_cache.clear()
        self.last_tile_columns = 0
        self.populate_tags()
        self.set_visible_indexes(list(range(len(self.items))))

    def prepare_selected_model(self):
        model_key = TAGGER_MODELS.get(self.tagger_model.currentText(), "wd14")
        model_root = Path(self.model_dir_input.text().strip() or default_model_dir())
        model_root.mkdir(parents=True, exist_ok=True)
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            paths = [hf_download_file(repo_id, filename, model_root) for repo_id, filename in MODEL_FILE_GROUPS[model_key]]
        except Exception as exc:
            QMessageBox.critical(self, "モデル準備失敗", str(exc))
            return
        finally:
            QApplication.restoreOverrideCursor()
        QMessageBox.information(self, "モデル準備完了", "\n".join(paths))

    def run_wd14_tagging(self):
        if self.tagging_thread is not None and self.tagging_thread.isRunning():
            QMessageBox.information(self, "AIタグ付け", "AIタグ付けはすでに実行中です。")
            return
        target_items = [self.items[index] for index in self.visible_indexes]
        if not target_items:
            return
        threshold = self.wd_threshold.value() / 100.0
        model_key = TAGGER_MODELS.get(self.tagger_model.currentText(), "wd14")
        model_root = Path(self.model_dir_input.text().strip() or default_model_dir())
        model_root.mkdir(parents=True, exist_ok=True)
        self.tagging_thread = QThread(self)
        self.tagging_worker = TaggingWorker(target_items, model_key, threshold, model_root)
        self.tagging_worker.moveToThread(self.tagging_thread)
        self.tagging_thread.started.connect(self.tagging_worker.run)
        self.tagging_worker.progress.connect(self.on_tagging_progress)
        self.tagging_worker.finished.connect(self.on_tagging_finished)
        self.tagging_worker.error.connect(self.on_tagging_error)
        self.tagging_worker.finished.connect(self.tagging_thread.quit)
        self.tagging_worker.error.connect(self.tagging_thread.quit)
        self.tagging_thread.finished.connect(self.tagging_worker.deleteLater)
        self.tagging_thread.finished.connect(self.tagging_thread.deleteLater)
        self.tagging_thread.finished.connect(self.clear_tagging_thread)
        self.statusBar().showMessage(f"AIタグ付け開始: 0/{len(target_items)}")
        self.tagging_thread.start()

    def on_tagging_progress(self, pos: int, total: int):
        if pos % 5 == 0 or pos == total:
            self.refresh_extensions()
        self.statusBar().showMessage(f"AIタグ付け中: {pos}/{total}")

    def on_tagging_error(self, message: str):
        QMessageBox.critical(self, "AIタグ付け失敗", message)
        self.statusBar().showMessage("AIタグ付けに失敗しました。")

    def on_tagging_finished(self, rows: list, converted_originals: list):
        if converted_originals:
            answer = QMessageBox.question(
                self,
                "元画像の削除確認",
                f"PNGに保存し直した元画像が {len(converted_originals)} 件あります。\n元画像を削除しますか？",
            )
            if answer == QMessageBox.Yes:
                for path in converted_originals:
                    try:
                        if Path(path).exists():
                            Path(path).unlink()
                    except Exception:
                        pass
        self.populate_tags()
        self.fill_analysis_table(rows)
        self.load_folder()
        self.statusBar().showMessage("AIタグ付けが完了しました。")

    def clear_tagging_thread(self):
        self.tagging_thread = None
        self.tagging_worker = None

    def run_tsne_analysis(self):
        target_indexes = list(self.visible_indexes)
        target_items = [self.items[index] for index in target_indexes]
        if len(target_items) < 3:
            QMessageBox.information(self, "t-SNE解析", "t-SNE解析には3枚以上の画像が必要です。")
            return
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            clusters, coords = compute_tsne(target_items)
            rows = [
                (item.name, f"cluster {int(clusters[i])}", f"{coords[i, 0]:.3f}", f"{coords[i, 1]:.3f}")
                for i, item in enumerate(target_items)
            ]
        except Exception as exc:
            QMessageBox.critical(self, "t-SNE解析失敗", str(exc))
            return
        finally:
            QApplication.restoreOverrideCursor()
        self.fill_analysis_table(rows)
        self.statusBar().showMessage("t-SNE解析が完了しました。")

        if self.tsne_window is None:
            self.tsne_window = TsnePlotWindow(self)
        self.tsne_window.set_results(target_items, target_indexes, clusters, coords)
        self.tsne_window.show()
        self.tsne_window.raise_()
        self.tsne_window.activateWindow()

    def fill_analysis_table(self, rows):
        self.analysis_table.setRowCount(len(rows))
        for row, values in enumerate(rows):
            for col, value in enumerate(values):
                self.analysis_table.setItem(row, col, QTableWidgetItem(str(value)))


def main():
    try:
        app = QApplication(sys.argv)
        app.setStyle("Fusion")
        window = ImageFolderViewer()
        window.show()
        sys.exit(app.exec())
    except Exception:
        log_path = Path(__file__).with_name("desktop_app_error.log")
        log_path.write_text(traceback.format_exc(), encoding="utf-8")
        raise


if __name__ == "__main__":
    main()
