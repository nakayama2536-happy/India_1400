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
