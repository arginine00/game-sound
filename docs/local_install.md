# ローカルインストール手順

このアプリは Python 仮想環境を作成し、依存パッケージをインストールしてから Streamlit で起動します。

## 1. 前提条件

- Python 3.10 から 3.11 推奨
- Git
- インターネット接続

初回セットアップ時は Python パッケージをダウンロードします。また、WD14 などの画像タグ付けモデルは初回実行時にモデルファイルをダウンロードする場合があります。

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

`torch` など大きなパッケージが含まれるため、環境によっては時間がかかります。

## 5. Streamlit アプリを起動する

```bash
streamlit run app.py
```

ブラウザが自動で開かない場合は、ターミナルに表示される URL を開きます。通常は以下です。

```text
http://localhost:8501
```

## 6. リズムゲーム機能の保存先

楽曲、譜面、プレイ履歴などのローカル作業データは以下に保存されます。

```text
rhythm_game_library/
```

このフォルダは Git 管理対象外です。別の PC にデータを移す場合は、アプリ本体とは別にこのフォルダもコピーしてください。

## 7. Windows 用 EXE を作る場合

デスクトップ版は PowerShell で以下を実行してビルドできます。

```powershell
.\build_exe.ps1
```

成功すると、以下に EXE が作成されます。

```text
dist\ImageFolderViewer\ImageFolderViewer.exe
```

注意: このビルドスクリプトは `desktop_app.py` を対象にしています。Streamlit 版の `app.py` をそのまま EXE 化するものではありません。

## 8. よくあるトラブル

### `streamlit` コマンドが見つからない

仮想環境が有効化されていないか、依存パッケージのインストールが完了していない可能性があります。

```bash
pip install -r requirements.txt
streamlit run app.py
```

### 初回起動が遅い

画像タグ付けモデルや関連ライブラリの初期化が走る場合があります。初回だけ時間がかかることがあります。

### 画像をアップロードしないと止まるように見える

リズムゲームホームは画像アップロード前でも利用できます。画像機能側は、画像が未アップロードの場合に案内を表示して処理を終了します。
