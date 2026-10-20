# 判断理由 UI v5.46 / decision-reasons 1.0

Issue: #87 / PR: #88
Status: RELEASED / LIVE STATIC BYTES VERIFIED / iPhone Safari・PWA実機受入は未確認

## 公開チェックポイント（2026-10-21 JST）

利用者からPR #88のmain反映・GitHub Pages公開について明示承認を受領し、承認対象head `136cbf3bf495cd78c4b4f0316e2f0bb5f5f67397` を固定して統合した。

- main統合：PR #88、merge `5de28616a982935ea99d9ad13c39186794602007`。直前main/base `e97b5b4d7d7144b4fc41a909a7aee200d2510053`、12ファイルの表示・テスト・文書差分。市場/履歴JSON、Private core、売買閾値、正式判断ゲート、購入記録は不変。
- 統合前検証：最終headのPR起動9ワークフローが全てsuccess。既存143件＋新規22件＝Node 165件、失敗・skip 0件の検証を維持。
- 配信：Pages run `39507490818` の `validate-public-delivery`、`build-pages-artifact`、`deploy-pages` が全てsuccess。job `118920092993` のログで対象mergeと既存Pages URLを照合し、2026-10-21 07:21:54 JSTに公開成功を確認した。
- 公開URL実測：隔離された読取専用検証branch `verify/v546-pages-20261021`、run `39507728090` / job `118920769123` がsuccess。承認済みmergeをcheckoutし、全Node回帰を再実行後、公開先をHTTP GETして静的10ファイルと入口2URLの全バイト一致を検証した。新規 `decision-reasons.js` / `decision-reasons.css`、`index.html`、`VERSION`、`sw.js`、`manifest.webmanifest`、既存4JSが対象。通常入口と `?v=5.46` の両方を確認した。
- 検証用workflowは上記branchだけのpushで起動し、contents:read・persist-credentials:false・公開URLへのGETのみ。mainに取り込まず、配信・市場取得・個人記録の変更はしない。定期監視を設定したという意味ではない。
- Cloudflare：操作なし。今回のUI公開を14:00自然取得、Burn-in、正式売買採用の証拠にしない。

証拠：[PR #88](https://github.com/nakayama2536-happy/India_1400/pull/88)、[Pages配信](https://github.com/nakayama2536-happy/India_1400/actions/runs/39507490818)、[公開ファイル照合](https://github.com/nakayama2536-happy/India_1400/actions/runs/39507728090)。

公開ファイルのHTTP取得・内容一致と、端末内Service Workerの切替・Safari実描画・操作確認は別ゲート。次工程はiPhoneでv5.46表示、買い5条件、売り非該当の開閉、警告表示を確認すること。サイトデータ削除や購入記録resetは不要。

## 参照と適用範囲

変更元はPublic main `e97b5b4d7d7144b4fc41a909a7aee200d2510053`（UI 5.45）、index blob `71b7c7fcb50e82ea46a5f97cabcefeba899cf0b4`。既存の5.45変更を保持する。
共通正本の今回参照mainはPrivate `2f219ef7963f3f6838e3f4b6f457d5e0b7d739ea`。README / COMMON_SPEC / REQUIREMENTS / DECISIONS / ADOPTION_MATRIX / PENDING / HANDOVERを確認した。この参照mainを新しい計算契約の採用版とみなさず、既存採用・時刻・正式判断ゲートは変更しない。COM-EXPL-001、COM-UI-002/003、COM-DEC-001の説明・警告・SHADOW境界を維持。公開時の再取得でも参照mainは同一だった。

## なぜ3

必要性：理由文と条件一覧が重複し、○×では買いと売りの意味が直感的でなく、非該当項目で長いスクロールになる。
現状不足：警告と説明の階層がなく、9項目が同じ重さで表示される。
最小安全性：保存された条件booleanの表示だけを整理する。計算式・閾値・市場日・時刻・正式売買・購入状態・予測・取得・JSONは変更しない。

## 表示契約

- 買い5条件は常時表示。成立／未成立／未判定を文字と色で示す。
- 売り注意は該当および未判定を常時表示。既知の非該当のみ折りたたむ。全件の状態を確認できなければ「該当なし」にしない。
- 条件欠損、非boolean、重複key、利用不可は未判定。集計数や分母が違う場合は保存値も示して注意表示。
- 確認済み成立項目のlabel/detailに完全一致する○/✓付き理由だけ省略。補足のある理由、QC・鮮度・必須欠損・保留・外部注意・共通blockerは常時表示。
- 丸めた価格から大小や条件を再判定しない。桁区切りのみ整形。
- 14営業日予測は説明内に保持するが、条件数に加えない。欠損とゼロを区別。
- SHADOWと保存条件は現在の正式判断・購入可否ではないことを表示。既存の実行時鮮度判定を参照し、判断ロジックへ書き戻さない。
- 再描画で利用者の折りたたみ開閉状態とフォーカスを保持。保存領域・購入記録へアクセスしない。

## 公開前の検証結果（2026-10-21 JST）

検証済みコードhead: `08847eb9b0b9648a2fd3ecf5eedf194d7702ae41`。後続head `136cbf3bf495cd78c4b4f0316e2f0bb5f5f67397` は文書だけの更新で、コード差分はない。
新規Nodeテストは `tests/decision-reasons.test.cjs` 16件、`tests/decision-reasons-integration.test.cjs` 6件。既存143件と合わせた全165件が成功し、失敗・skipは0件。
PR #88のDecision Reasons Contract run `39503714014` / job `118907275345` で、JavaScript構文および `node --test tests/*.test.cjs` の165件成功をログ確認した。テスト対象merge-refは `48179f0680ef3abf7b48162573eef6c53b9f1eec`（上記headとbaseの検証用統合）であり、mainへの実マージではない。
同headのPR起動9ワークフロー（PR Validation、Security、Decision Reasons、Technical Chart、Purchase UI、Publication Manifest、Cache、Review History、Deep Dive Manifest）がすべて成功。
候補組込run `39503503435` は元index blob・保護対象の判定/購入関数・全市場JSON不変・インラインJS構文・全Node回帰を検証した。一時組込用スクリプトと書込みworkflowは最終差分から除去済み。恒久CIはcontents:readのみ。

ローカルChromiumでは表示部品を320/375/393/430/768pxで確認。5条件の初期表示・売り非該当の折りたたみ・注意の常時表示・開閉状態保持・横はみ出しなしを確認した。ローカルの新規JSはGitHub blob `52936df494ce29860cd2c3cb483b1d23be939fbc` と一致する。
これは表示部品とアプリ統合テストの検証であり、公開ページ全体のブラウザ検証やiPhone Safari/PWA実機合格ではない。実データの現在時点での有効性を認定するものでもない。

## 配信・復旧・残件

新規JS/CSSを自アプリのService Worker shellに追加。UI 5.46、manifest、index、SW cache識別を同期。既存の自アプリcache移行規則は維持し、全origin削除・購入記録resetはしない。
main反映・Pages公開は利用者承認後に完了し、公開静的ファイルの内容一致まで確認済み。Safari/PWA実機は引き続き未確認。PENDING-019〜022の実機受入、Burn-in、正式売買、14:00自然取得を本UIから完了扱いしない。
不具合時は市場データ・個人記録を巻き戻さず、この表示差分のみ通常PRで復旧する。
