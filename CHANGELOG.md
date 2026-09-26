# Changelog

## 2026-09-25 — UI v5.10 operational hardening

- 14:00状態を生成時刻推定から実際の14:00履歴証跡へ変更
- 15:00以降の後追い更新を「14:00判定済み」と表示しない
- Private Workflow更新後の監視を約4分へ延長
- iPhone復帰時に更新検知を取りこぼす処理順を修正
- Public→Private WorkflowリンクをPR Validationで契約化
- dynamic JSONのService Workerキャッシュキーを正規化
- OHLCが確定日足より古い場合に「参考」と明示
- India Core NAV取得fallback/errorをActions上で可視化
- 投資判断条件・閾値は変更なし

# CHANGELOG

India 14:00 Check の主要な変更履歴を記録します。

## [Unreleased]

## [5.14] - 2026-09-26

### App-only migration
- 14:00市場補足を追加し、NSE NIFTY50 breadthとFII/FPI・DII日次フローをアプリ内で確認可能にした
- ChatGPT定時レポート廃止に向けたアプリ完結化の第1段階
- 既存の売買条件・3分割判定ロジックは変更なし
- 休場日・取得不能時は未取得/対象外を明示し、値を推測補完しない

## [5.13] - 2026-09-26

### UI / Usability
- 外部環境グラフを直近28暦日の固定時間軸に変更し、日曜始まりの週区切り縦補助線を常時表示
- 履歴不足時は28日枠内に取得済みデータを表示し、蓄積状況を明示
- 補足説明を三角展開へ整理し、日常判断に必要な情報を常時表示
- インド・コア説明、ダイジェスト時刻・仕様、参照データ説明、外部環境の見方、予測条件、購入記録説明を展開式へ変更
- 前回14:00比較と監査情報を管理タブ内の展開式へ変更
- 外部環境の警戒・データ一部参考など、判断に影響する警告は常時表示を維持
- 売買条件・判定ロジックは変更なし


## [5.7] - 2026-09-23

### Security / Architecture
- データ取得・計算・定時更新をPrivate `india-stock-check`へ移行
- Private側でpublic-safe検査後、公開可能なJSONのみ`India_1400`へ転送
- Public Repositoryからデータ取得・計算Pythonコードを撤去
- Public Repositoryから旧市場更新workflowを撤去
- Public PR ValidationでPrivate計算コードの再混入を検知する検査を追加

## [5.1] - 2026-09-21

### Added
- 判断ゲート v5.1-gate-1
- 1・3・14営業日の短期テクニカル予測
- 指標ミニグラフとデータ時刻表示
- データ品質・参照元の確認表示
- GitHub Actionsによる市場データ自動更新
- DependabotによるGitHub Actions依存関係の保守
- Secret Guardによる公開Repositoryの認証情報検査

### Security
- GitHub Actionsを検証済みcommit SHAへ固定
- .env / 秘密鍵ファイルを.gitignore対象化
- APIキーはGitHub Secretsのみで管理

## 運用ルール

- 手動改修は Issue → feature branch → Pull Request → 自動検証 → main の順で行う
- 市場データ更新はPrivate coreで実行し、Public Repositoryにはpublic-safe JSONのみ配信する
- APIキー、トークン、秘密鍵をPublic Repositoryへ保存しない
- Version確定時はVERSIONとCHANGELOGを更新する
