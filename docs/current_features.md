# 現在の機能まとめ

## 画面

- ロビー: キャラクター表示、セリフ、ミッション、ストーリー、メモリアル、設定、ヘルプへの導線。
- ライブ選択: アップロード済み楽曲の選択、難易度選択、演奏開始、叩く演出設定。
- 楽曲アップロード: 複数音源のアップロード、Web Audio 解析による譜面生成。
- 譜面解析: 生成済み音符の確認と編集。音符種別、キー指定、連打、長押しを音符ごとに変更できる。
- 演奏画面: タップ、クリック、キーボード、キー指定音符、連打音符、長押し音符に対応。
- リザルト: スコア、判定数、MISS、最大コンボ、理論値、到達率、特殊補正、コンボ倍率、アイテム倍率、EXPを表示。
- ミッション: 当日プレイ履歴から達成状況を計算し、達成時にアイテム報酬を付与。
- アイテム: 所持アイテムの確認。演奏開始前に使用アイテムを選択できる。
- メモリアル: キャラクター画像の確認と、ロビー/プレイ/リザルト/叩くマーカーへの割り当て。
- ストーリー: `.txt` 台本の再生、背景変更、立ち絵表情、読了後ライブ遷移、設定モードでの立ち位置編集。
- 設定: UIテーマ、演奏設定、キャラクター叩く演出、楽曲叩く演出、背景やアニメーションの調整。
- ヘルプ: アセット命名ルールと管理者向けフォルダ構造ルール。

## 楽曲と譜面

楽曲はブラウザ内の state で管理される。

- `Song`
  - `id`
  - `title`
  - `artist`
  - `bpm`
  - `duration`
  - `audioUrl`
  - `charts`
  - 楽曲叩く演出設定

譜面は `charts[difficulty].notes` に保存される。

- `Note`
  - `time`
  - `type`: `don`, `ka`, `big_don`, `big_ka`
  - `strength`
  - `source`
  - `section`
  - `inputKind`: `tap`, `key`, `rapid`, `hold`
  - `inputKey`
  - `requiredHits`
  - `holdMs`

## 演奏入力

- 通常音符: タップ、クリック、キーボードで判定。
- キー指定音符: 指定されたキーでのみ判定。
- 連打音符: 判定範囲内で指定回数叩くと成功。
- 長押し音符: 指定キーを指定時間押し続けると成功。
- MISS以外で音符が処理された場合、判定円上で音符が光って消える。

## 採点

スコアは以下を組み合わせて計算する。

- 判定: `PERFECT`, `GOOD`, `OK`
- タイミング精度: 判定円中心に近いほど高得点。
- コンボ倍率: コンボ数が高いほど上昇。
- 音符種別: 大音符は高め。
- 特殊音符補正: キー指定、連打、長押しで補正。
- アイテム補正: `score_boost` 使用時に倍率を追加。

理論値は現在の譜面内容をもとに、全音符を最大コンボ、最高タイミング、PERFECTで処理した場合として計算する。特殊音符やスコアアイテムを含めて変動する。

## アイテム

アイテム定義は CSV で管理する。

- `frontend/public/assets/items/items.csv`
- `frontend/public/assets/items/icons/`

CSV列:

```csv
id,name,description,effect,value,maxUses,owned,icon
```

対応効果:

- `combo_guard`: MISS時のコンボ切れを防ぐ。
- `miss_guard`: MISS音符をOK扱いで救済する。
- `score_boost`: ライブ中のスコア倍率を上げる。

現在、所持数は初期0で開始し、ミッション達成時に増える。`owned` は定義上の予備列として残している。

## ミッションと報酬

当日のプレイ履歴から以下を計算する。

- 今日のライブ
- スコアチャレンジ
- コンボチャレンジ
- 鬼の腕試し
- リズム練習

達成済みかつ未受取のミッションを検出し、アイテム所持数へ自動加算する。重複付与防止のため、受取済みミッションIDを state で管理する。

## 経験値とレベル

リザルトごとに `PlayRecord` を作成し、`playerProgress` を更新する。

- 基本プレイEXP
- スコアEXP
- コンボEXP
- PERFECT/OK補正
- 到達率補正

計算係数は `progressionPolicy` にまとまっている。

## アセット構造

基本パス:

```text
frontend/public/assets/
```

キャラクター:

```text
frontend/public/assets/characters/{id}/
```

背景:

```text
frontend/public/assets/backgrounds/story/
frontend/public/assets/backgrounds/play/
```

演出:

```text
frontend/public/assets/effects/characters/
frontend/public/assets/effects/songs/
```

アイテム:

```text
frontend/public/assets/items/items.csv
frontend/public/assets/items/icons/
```

## キャラクター命名

```text
{id}_lobby.png
{id}_play.png
{id}_result.png
{id}_story.png
{id}_note.png
{id}_story_joy.png
{id}_story_fun.png
{id}_story_anger.png
{id}_story_sadness.png
{id}_home.txt
```

キャラクターフォルダが追加されると、画像が検出され、メモリアルのキャラクタータイルが自動生成される。

## ストーリー台本

`.txt` で管理する。背景、キャラクター、表情、位置、読了後ライブ遷移に対応している。

読了後ライブ遷移:

```text
@after live
@live on
# ライブへ: on
```

## 現状の保存範囲

多くのデータは React state 管理で、リロードすると消える。

- アップロード楽曲
- 楽曲演出設定
- 音符編集
- アイテム所持数
- ミッション受取状態
- プレイ履歴
- レベル/EXP

次の拡張では `localStorage` またはファイル/DB保存へ移すのが自然。
