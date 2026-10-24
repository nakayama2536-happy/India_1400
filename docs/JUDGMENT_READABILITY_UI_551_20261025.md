# India UI 5.51 — 判断画面の文字と情報量をiPhone 17向けに調整

Date: 2026-10-25 JST. Public main baseline: `74d0876ae3148e068f04e6acda25015b9814c901` (UI 5.50).
Status (2026-10-25 JST): UI 5.51 code MERGED / PR & main CI PASS / GitHub Pages deploy SUCCESS / public HTTP bytes MATCH. iPhone 17 DEVICE_PASSは未確認。

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

## 採用・公開実証 — 2026-10-25 JST

| Gate | 確認証拠 | 結果 |
|---|---|---|
| 表示仕様と利用者承認 | 2026-10-24〜25会話。デザイン画像で「見やすくなりました」、その後「実装を進めてください」 | 表示専用の採用範囲として実装 |
| UIコード / PR | Public [PR #95](https://github.com/nakayama2536-happy/India_1400/pull/95) / head `dfa7b68e8aa5fe45fba5a1edd865e54441a98c98` | MERGED。code merge `94fd79085ea1a1434cb532f5ca894ee4a286e940` |
| PR CI | 9/9 PASS。全Node [run 40106297303](https://github.com/nakayama2536-happy/India_1400/actions/runs/40106297303) 214/214 PASS | PASS |
| 実ブラウザー幅 | 独立・読取専用 [run 40106607614](https://github.com/nakayama2536-happy/India_1400/actions/runs/40106607614)。code `dfa7b68e...` と verifier workflowのみ差分 | Chromium 320/375/402/430pxでPASS |
| 長い休場文言 | 各幅で実DOMへ「本日は休場のため売買判定の対象外です」を一時的な表示fixtureとして設定 | すべて2行以上に折り返し、文字/ページの横方向はみ出しなし。元の市況・判断入力は変更なし |
| 下部ナビ | Chromium各幅で5項目、13/13.69/14.67/15px、タップ高50pxを測定 | 文字・予測レンジ・4状態pillとも欠けなし |
| main CI | merge `94fd79085ea1...` のPR Validation / Security / Purchase / Cache / Technical Chart / Deep Dive / Review History / Decision ReasonsはすべてSUCCESS | PASS |
| Pages | [deploy run 40106768046](https://github.com/nakayama2536-happy/India_1400/actions/runs/40106768046)、main mergeをheadとして独立安全gate→artifact→deploy | SUCCESS |
| manifest | 後続 `ddc439c30c0623b4b9781648d925dbfa27538d79` | publication_manifest.jsonだけを更新。UI・売買計算/利用者記録不変 |
| 本番HTTP実体 | [独立・読取専用 run 40106904139](https://github.com/nakayama2536-happy/India_1400/actions/runs/40106904139) | **PASS**：Pages `index.html`、`VERSION`、`sw.js`、`manifest.webmanifest` が正本のSHA-256とbyte一致 |
| iPhone Safari/PWA | 公開版を利用者のiPhone17で実測し、旧cacheからの更新・購入記録・他アプリ隔離を確認 | **DEVICE_PENDING**。ブラウザーCIやHTTP一致だけでPASSにしない |

本番HTTPの照合済みbytes/hash：
- `index.html` 163,548 bytes / `2050eece26707a9f2fc3f95e3a9d8329cf4857e4a4c81c767097f7dd64f417ad`
- `VERSION` 119 bytes / `cb232d2dd25b6d2645668252b0395bc3baa73a97b998a8a79db1869b0dba10b2`
- `sw.js` 3,612 bytes / `25f5e3ecdc406f8e07718d8e58289149c4eb4614da323d87fdff81487c4a358b`
- `manifest.webmanifest` 753 bytes / `f036078385b7d74f537de759932f67884deaf438253c2e2f4a2f0083e8a12ed8`

## 次の検証（端末と運用は別ゲート）

iPhone 17ホーム画面PWAを通常の方法で開き、v5.51、判断文・5タブ・予測カードの視認性を確認する。購入状況の既存記録、レビュー履歴の再読込・別アプリのcache保持を必要時に実機で確認する。**SafariのWebサイトデータ削除、PWAアンインストール、記録resetは禁止。**

Private PENDING-014（14:00自然実行遅延、GitHub-only成功と外部起動由来の区別）、PENDING-026（予測forward実証）、PENDING-019〜022（実機受入）はOPENのまま。実測証拠がない状態を完了扱いしない。
