# India 14:00 Check PWA v5.18

## 目的

iPhoneで14:00頃に開き、NIFTY 50、インド・コア、USD/INR、USD/JPY、INR/JPY、Brent、India VIX、移動平均、RSI、MACDなどを確認する個人用PWAです。設定済みの条件に基づく3分割売買目安と、1・3・14営業日の統計的参考表示を提供します。

## 現在の構成

このRepositoryはGitHub Pages公開専用です。データ取得・計算ロジックはPrivate Repository `india-stock-check` で実行し、公開可能性を検査したJSONだけをこのRepositoryへ転送します。

`Private core → public-safe validation → India_1400 → GitHub Pages / PWA`

Public側にはAPIキー、個人の保有数量・取得単価・口座情報、Private側の計算コードを置きません。

## 自動更新

平日の自動更新はPrivate coreのGitHub Actionsで実行します。主な実行時刻は以下です。

- 13:57 JST
- 14:03 JST
- 14:08 JST
- 19:47 JST（NSE引け後の確定日足保存）

GitHubのスケジュール実行は混雑等により遅れる場合があります。設定時刻は目標時刻であり、実際の14:00判定は取得・計算時刻と14:00履歴の実証跡で判定します。15:00以降の遅延実行を当日の14:00判定として遡及扱いしません。

PWAの「GitHubで市場データ更新」はPrivate coreの手動Workflow画面を開く安全な復旧導線です。PWA内にPAT/APIキーは保持しません。

## 公開データ

- `market.json`：最新の市場・分析データ
- `history.json`：14:00定点履歴
- `nifty_daily_history.json`：NIFTY日足履歴
- `nifty_ohlc_history.json`：詳細チャート用OHLC
- `indicator_history.json`：外部指標履歴
- `forecast_evaluation.json`：予測検証データ

画面の「参照データ時刻」「データ品質」を必ず確認してください。

## ChatGPT深掘り

管理タブの「ChatGPT 深掘り分析」は、必要なときだけ公開済みの分析JSON全体と端末内の3分割実施状況を読み込み、1つのMarkdownスナップショットを生成します。OpenAI APIやAPIキーは使用せず、iOS共有・ファイル保存・全文コピーでChatGPTへ渡します。通常表示時は長期履歴を追加読込しません。

## 公開PWA

- `index.html`：PWA本体
- `deep-dive.js`：必要時のみ全分析データを集約してChatGPT用Markdownを生成
- `manifest.webmanifest`：PWA設定
- `sw.js`：Service Worker
- アイコン類：ホーム画面・favicon用
- `.github/workflows/security-check.yml`：公開Repositoryの安全性検査
- `.github/workflows/pr-validation.yml`：公開PWA/JSONの整合性検査

## GitHub運用

手動改修は `Issue → feature branch → 実装 → Pull Request → PR Validation / Security Check → main` を標準とします。

市場データの生成・計算・定時更新はPrivate coreで管理し、このPublic Repositoryは表示と公開可能なスナップショットの配信に限定します。

## Security

このRepositoryはインターネットから閲覧できます。

- APIキー、PAT、パスワード、秘密鍵、`.env` を保存しない
- 個人の保有数量、取得単価、口座種別、取引履歴などを保存しない
- Private coreからの公開前にpublic-safe検査を行う
- Security CheckとDependabotを維持する
- GitHub Actionsは検証済みcommit SHAへ固定する

## GitHub Pages

Pagesは `main / root` を公開対象とします。iPhone SafariでPagesを開き、「共有 → ホーム画面に追加」でPWAとして利用できます。

## 注意

このアプリは投資判断を補助する定点確認ツールです。自動取得元の仕様変更、価格遅延、休場日、GitHub Actionsの遅延等により値が更新されない場合があります。更新時刻・取得元・データ品質を確認してください。
