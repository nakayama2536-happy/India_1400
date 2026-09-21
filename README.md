# India 14:00 Check PWA v5.1

## 目的

iPhoneで14:00頃に開き、NIFTY 50、USD/INR、Brent、India VIX、移動平均、RSI、MACDを確認し、設定済みの条件に基づく3分割売買目安と1・3・14営業日の短期テクニカル予測を表示するPWAです。

## 現在のVersion

- APP_VERSION: 5.1
- ANALYTICS_VERSION: 5.1
- DECISION_GATE_VERSION: 5.1-gate-1
- 安定版ブランチ: `release/v5.1`

## 自動更新

GitHub Actionsの `Update India 14:00 market data` が平日の14:00前後とNSE引け後に実行され、`market.json` と履歴データを更新します。

現在の主な実行時刻は以下です。

- 13:57 JST
- 14:03 JST
- 14:08 JST
- 19:47 JST（NSE引け後の確定日足保存）

GitHubのスケジュール実行は混雑等により遅れる場合があります。

## データ

- NIFTY 50
- USD/INR
- Brent
- India VIX
- 前営業日までの確定日足と当日参考値を分離
- 5/25/75日線、RSI(14)、MACD/Signal
- 1・3・14営業日の類似局面ベースの統計的参考表示

画面の「参照データ時刻」「データ品質」を必ず確認してください。

## GitHub運用

手動改修は以下を標準とします。

`Issue → feature branch → 実装 → Pull Request → PR Validation / Security Check → main`

- `main`：公開中の現行版
- `feature/...`：手動改修用
- `release/v5.1`：v5.1安定版・復旧基準
- Issues：改善・不具合・新機能を管理
- `CHANGELOG.md`：主要変更履歴
- `VERSION`：Version基準
- PR Validation：Python構文、JSON、PWA Version整合性を自動確認
- Security Check：秘密情報の混入を自動確認

### 自動市場更新の例外

`Update India 14:00 market data` は運用データを定時更新するため、GitHub Actionsから `main` へ直接commit/pushします。手動のアプリ改修とは分離します。

## Security

このRepositoryはGitHub Pages公開用のためPublicです。

- APIキーをHTML、Python、JSONへ直接記載しない
- `.env` や秘密鍵をcommitしない
- Twelve Data等の認証情報はGitHub Secretsで管理
- Security Checkで代表的なトークン・秘密鍵パターンを検査
- GitHub Actionsは検証済みcommit SHAへ固定
- DependabotでActions依存関係を保守

## 主なファイル

- `index.html`：PWA本体
- `manifest.webmanifest`：PWA設定
- `sw.js`：Service Worker
- `market.json`：最新の市場・分析データ
- `history.json`：定点履歴
- `nifty_daily_history.json`：NIFTY日足履歴
- `indicator_history.json`：外部指標履歴
- `update_market.py`：データ取得・基本計算
- `v48_enhance.py` ～ `v51_enhance.py`：分析拡張
- `.github/workflows/update-market.yml`：定時更新
- `.github/workflows/security-check.yml`：Secret Guard
- `.github/workflows/pr-validation.yml`：PR検証

## GitHub Pages

Pagesは `main / root` を公開対象とします。iPhone SafariでPages URLを開き、「共有 → ホーム画面に追加」でPWAとして利用できます。

## 重要

このアプリは投資判断を補助する定点確認ツールです。自動取得元の仕様変更、価格遅延、休場日、GitHub Actionsの遅延等により値が更新されない場合があります。画面の更新時刻・取得元・データ品質を確認してください。
