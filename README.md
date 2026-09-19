# India 14:00 Check PWA v2

## 目的
iPhoneで14:00頃に開き、NIFTY 50、USD/INR、Brent、移動平均、RSI、MACDを確認し、
ユーザー設定の4条件で「第1弾購入ルール」を機械的に表示するPWAです。

## 自動更新
GitHub Actionsが平日の13:50 / 13:55 / 14:00 / 14:05 / 14:10 JST頃に実行され、
`update_market.py` が `market.json` を更新します。
GitHubのスケジュール実行は混雑等により遅れることがあります。

## データ
- NIFTY 50: ^NSEI
- USD/INR: INR=X
- Brent: BZ=F
- 取得元: Yahoo Finance chart endpoint（参考データ、APIキー不要）
- 5/25/75日線、RSI(14)、MACD/Signalは「前営業日までの確定日足」で計算
- 当日のNIFTY価格等は5分足の最新取得値を使用

## ファイル構成
- index.html
- manifest.webmanifest
- sw.js
- market.json
- update_market.py
- .github/workflows/update-market.yml
- icons/icon-192.png
- icons/icon-512.png
- .nojekyll

## GitHub Pages
1. リポジトリ直下へ上記ファイルを配置
2. Settings > Pages
3. Build and deployment: Deploy from a branch
4. Branch: main / root
5. Save
6. Actions > Update India 14:00 market data > Run workflow を1回実行
7. 数十秒後、`market.json` が更新されたことを確認
8. PagesのURLをiPhone Safariで開く
9. 共有 > ホーム画面に追加

## 重要
このアプリの判定は、設定された条件を表示する補助機能です。
自動取得元の仕様変更、価格遅延、休場日、GitHub Actionsの遅延等により、
値が更新されない場合があります。画面の更新時刻とデータ状態を必ず確認してください。
