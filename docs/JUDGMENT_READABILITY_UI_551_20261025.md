# India UI 5.51 — 判断画面の文字と情報量をiPhone 17向けに調整

Date: 2026-10-25 JST. Public main baseline: `74d0876ae3148e068f04e6acda25015b9814c901` (UI 5.50).
Status: code/test PR candidate. Merged/Pages/iPhone DEVICE_PASSは別ゲート。

## 目的と利用者証拠

2026-10-24のiPhone画面では、判断文の強すぎる太字、下部タブの文字の小ささ、予測周辺の冗長な注記が読みにくさの原因と指摘された。ユーザーは説明文を減らし文字の視認性を上げたデザイン案を評価し、実装を依頼した。元のユーザースクリーンショットやデザイン画像はPublic repositoryへ配置しない。

**なぜ必要:** 5タブのiPhone縦画面で、重要な状態・数値・次の確認を無理なく読めること。

**なぜ現状不足:** 既存`.decision`はweight=850の大見出し、430px以下の`.tab`は11px。統計説明と生成時刻も常時表示され、状態確認までの視線移動が増える。

**なぜ最小・安全:** 判断カード内のCSSと表示用文字構成に限定。動的IDと4つの重要な状態pillを維持し、モデル・市場取得・予測値・時刻ゲート・購入記録のロジックはそのまま。見せない長文は既存の「詳細を見る」へ移動し、原証拠や警告は消さない。

## 具体的な表示差分

- メイン判断文: `font-weight:850`からカード内限定で`600`へ、font-sizeは26–30pxのiPhone向け可変表示、行高1.4。警告種別のカード縁色は維持。
- 5タブ: 固定ナビのラベルを13–15pxの可変表示に、最小タップ高50px。セーフエリア、5列、選択状態、画面切替処理は維持。アイコンは追加しない（タブが狭い端末で文字幅を優先）。
- 予測カード: 中央値ラベルと保存済み騰落率を別行へ分離し、日数・方向・実数値を読みやすくする。上下レンジと参考度は残し、1/3/14の元データと計算に一切変更しない。
- 予測補足: 「予測は参考値・売買条件ではありません」「予測基準日：保存値」を常時表示。類似局面の詳細、生成時刻は「詳細を見る」内へ移す。保存予測未取得時には「未確認」と表示し、日時を捏造しない。
- 取得窓、休場、データ品質、予測の混在状態は、既存の4つの`checkWindowState`・`marketState`・`qualityGate`・`forecastConsensus`を常時表示。QC不合格・時刻不適格・SHADOWを「判断可」に変換しない。
- 次アクション: 見出しだけ「次のアクション：」→「次の確認：」へ短縮。本文は既存`checkWindowStatus().action`をそのまま表示。日時・更新/保留理由は隠さない。
- 詳細開閉: 見出しを「詳細を見る」と短縮。本文には既存の売買判断根拠と保存予測の出典/生成時刻を保持。

## データ・プライバシー境界

変更対象はPublic `index.html`、UI版/PWA自己キャッシュ、説明書、回帰テストだけ。`market.json`、`history.json`、`forecast_evaluation.json`、`india_core*`、`common_snapshot.json`、Private Core、formal_action/SHADOW、購入記録・review-history保存、他アプリキャッシュには変更しない。

PWA自身の前版cacheのみを既存prefixルールで管理する。storage reset、過去14:00再生成、予測バックフィルを行わない。

## 受入と停止条件

1. Node全suite + 新`tests/decision-readability.test.cjs`、PR Validation、Security、Cache、Purchase、Review History、Technical Chart、Deep Dive、Publication ManifestがPASS。
2. 正常/休場/データ不適格の各画面でも、予測の方向と数値、基準日、4状態pill、次の確認、詳細根拠を失わない。
3. iPhone 17（縦画面）実機で5タブの「購入状況」が折り返さず判別でき、タップしやすい。文字拡大で3予測カードの価格レンジ・方向が欠落せず、メイン文言が不必要に強調されない。
4. 更新前からの端末内購入記録・review-historyを再読込しても変わらない。削除/リセット操作はしない。
5. GitHub PR CI、main merge、Pages deploy、実際の公開HTTP、iPhone PWAは独立した証拠として記録。画像モックやCIだけで実機PASSにしない。
6. 14:00自然保存、DECISION Burn-in、予測評価10/30/100件、公式NAV取得、Brent正式sourceは今回の完了範囲外。

復旧が必要なら、検証済み前版との差分PRでCSS/静的表示だけを戻す。Service Worker/cacheの全消去や個人保存値の初期化は禁止。
