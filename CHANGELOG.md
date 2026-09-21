# CHANGELOG

India 14:00 Check の主要な変更履歴を記録します。

## [Unreleased]

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

### Baseline
- APP_VERSION: 5.1
- ANALYTICS_VERSION: 5.1
- DECISION_GATE_VERSION: 5.1-gate-1
- 安定版ブランチ: `release/v5.1`

## 運用ルール

- 手動改修は Issue → feature branch → Pull Request → 自動検証 → main の順で行う
- `Update India 14:00 market data` による市場データ更新は自動運用のためmain直接更新を許容する
- APIキー、トークン、秘密鍵をRepositoryへ保存しない
- Version確定時はVERSIONとCHANGELOGを更新する
