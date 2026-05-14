# ローカルインストール手順

このアプリは Streamlit で動く和太鼓リズムゲームプロトタイプです。Python 仮想環境を作成し、依存パッケージをインストールしてから起動します。

## 1. 前提条件

- Python 3.10 から 3.11 推奨
- Git
- 初回セットアップ用のインターネット接続

画像解析モデルや AI タグ付けモデルは使いません。依存関係は軽量な Streamlit 実行環境だけです。

## 2. リポジトリを取得する

```bash
git clone https://github.com/arginine00/game-sound.git
cd game-sound
```

## 3. 仮想環境を作成する

### macOS / Linux

```bash
python -m venv .venv
source .venv/bin/activate
```

### Windows PowerShell

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

PowerShell の実行ポリシーで止まる場合は、以下を一度だけ実行してから再度有効化します。

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.venv\Scripts\Activate.ps1
```

### Windows コマンドプロンプト

```cmd
python -m venv .venv
.venv\Scripts\activate.bat
```

## 4. 依存パッケージをインストールする

仮想環境を有効化した状態で実行します。

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## 5. アプリを起動する

```bash
streamlit run app.py
```

ブラウザが自動で開かない場合は、ターミナルに表示される URL を開きます。通常は以下です。

```text
http://localhost:8501
```

## 6. 基本操作

1. `楽曲インストール` で音源、曲名、アーティスト、BPM、曲長を登録します。
2. `リズムゲーム化` で難易度別の簡易譜面を生成します。
3. `プレイ` で音源と譜面プレビューを確認します。
4. `記録` でベストスコア、プレイ履歴、経験値を確認します。

## 7. 保存先

楽曲、譜面、プレイ履歴などのローカル作業データは以下に保存されます。

```text
rhythm_game_library/
```

このフォルダは Git 管理対象外です。別の PC にデータを移す場合は、アプリ本体とは別にこのフォルダもコピーしてください。

## 8. よくあるトラブル

### `streamlit` コマンドが見つからない

仮想環境が有効化されていないか、依存パッケージのインストールが完了していない可能性があります。

```bash
pip install -r requirements.txt
streamlit run app.py
```

### 音源が表示されない

対応拡張子は MP3 / WAV / OGG / M4A です。登録後は `rhythm_game_library/songs/` に保存されます。

### 譜面が表示されない

`リズムゲーム化` タブで対象楽曲と難易度を選び、先に譜面を生成してください。
