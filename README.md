# 和太鼓リズムゲーム

Streamlit で動く、ローカル向けの和太鼓リズムゲームプロトタイプです。
画像整理、画像解析、AI タグ付け機能は外し、楽曲管理とリズムゲーム化に必要な機能だけを残しています。

## 主な機能

- MP3 / WAV / OGG / M4A 音源のローカル登録
- 曲名、アーティスト、BPM、曲長の保存
- BPM と曲長から難易度別の簡易譜面 JSON を生成
- 難易度は `かんたん`、`ふつう`、`むずかしい`、`おに` に対応
- 音源再生と譜面レーンのプレビュー
- デモプレイ結果の保存
- ベストスコア、プレイ履歴、経験値、レベル進捗の表示

## セットアップ

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Windows PowerShell の場合は以下です。

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## 起動

```bash
streamlit run app.py
```

ブラウザで以下を開きます。

```text
http://localhost:8501
```

## 使い方

1. `楽曲インストール` タブで音源、曲名、アーティスト、BPM、曲長を登録します。
2. `リズムゲーム化` タブで楽曲と難易度を選び、譜面を生成します。
3. `プレイ` タブで音源を再生し、譜面レーンを確認します。
4. `デモプレイ結果を保存` を押すと、スコア、履歴、経験値が記録されます。
5. `記録` タブでベストスコアとプレイ履歴を確認します。

## 保存データ

登録した音源、楽曲情報、譜面、プレイ履歴は以下に保存されます。

```text
rhythm_game_library/
```

このフォルダはローカル作業データのため Git 管理対象外です。
別の PC にデータを移す場合は、このフォルダも一緒に移してください。

## 現在の実装範囲

現時点では、リズムゲームの管理画面、譜面生成、音源再生、譜面プレビュー、記録保存までを実装しています。
リアルタイム入力判定、演奏中の自動スクロール、ゲームパッド対応、詳細なリザルト演出は次の実装候補です。

## 関連ドキュメント

- [和太鼓リズムゲーム仕様書](docs/rhythm_game_spec.md)
- [和太鼓リズムゲーム 並列作業分解・検証計画](docs/rhythm_game_work_breakdown.md)
- [ローカルインストール手順](docs/local_install.md)
