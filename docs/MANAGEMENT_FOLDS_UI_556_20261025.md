# India UI 5.56 — NIFTY拡大と管理の開閉統一（2026-10-25）

## 実機フィードバック
iPhone 17のUI 5.55実機画像2枚に基づく画面改修。指標タブのNIFTY 50拡大ボタンだけ右側に置かれており、RSI/MACDなどの左側操作と不統一。管理タブは品質のみ開閉可能で、分析・更新・評価がそれぞれ全展開されたまま長い。深掘りで何を調べるかと、ChatGPTがいつ分析を行うかが分かりにくい。

## UI 5.56変更
- NIFTY 50トレンドの「拡大」をチャート見出しの直下、左端に配置。グラフ・数値・モーダル・ズーム計算はそのまま。
- 「NIFTYテクニカル」は既存の枠なしセクションを維持。内側の各グラフカードには既存の輪郭を残す。
- 管理の3つの大枠をネイティブ `details` とし、カード全幅の見出しが開閉操作になる。「データ品質・取得状況」「ChatGPT 深掘り分析」「データ更新の調査・対策」。
- 深掘り分析は「NIFTY/RSI/MACD」「1/3/14営業日の予測と検証」「3分割の判断根拠」「為替と品質」などを使ってChatGPTで深掘りするための資料を作ると明示。アプリは解析・送信を自動実行しない。
- 「分析結果を評価する（任意）」を深掘りの内部開閉項目に移動。IDと既存の端末内評価履歴・復元操作を保持。
- 判断タブから深掘りへ移動するときは自動でパネルだけを開く。データ品質のジャンプ動作もそのまま。

## 意図的に変更しない
Private Core、公開市場JSON、14:00判定、3分割購入条件、予測計算、品質判定、チャート描画、ローカル購入・評価記録の形式、Deep Diveの個人情報保護・送信先、Cloudflare/Secrets/他アプリ。

## 検証ゲート
- `node --test tests/*.test.cjs` の全体回帰と新規 `management-accordion-ui.test.cjs`。
- GitHub PR Validation、Security、Cache/Public Delivery、Technical Chart、Deep Dive Manifest、Review History、Publication Manifest。
- VERSIONとPWA cacheとstart_urlを5.56で整合。publication_manifestはVERSIONのSHA-256およびpublication_idの旧値照合後に差し替え。データJSONは変更しない。
- main反映とPages配信後のHTTPハッシュ、iPhone 17 Safari/PWAでの操作確認は独立して判定。特に管理の開閉、画面下部タブ、判断→深掘りのジャンプ、評価記録が残ること、旧キャッシュからの更新を確認する。

## 実機判定
GitHub CI合格と実機合格は別。実機は `DEVICE_PENDING` のまま扱う。
