# 判断理由 UI v5.46 / decision-reasons 1.0

Issue: #87
Status: IMPLEMENTED CANDIDATE / main・Pages・iPhone受入は未実施

## 参照と適用範囲

変更元はPublic main `e97b5b4d7d7144b4fc41a909a7aee200d2510053`（UI 5.45）、index blob `71b7c7fcb50e82ea46a5f97cabcefeba899cf0b4`。既存の5.45変更を保持する。
共通正本の今回参照mainはPrivate `2f219ef7963f3f6838e3f4b6f457d5e0b7d739ea`。README / COMMON_SPEC / REQUIREMENTS / DECISIONS / ADOPTION_MATRIX / PENDING / HANDOVERを確認した。この参照mainを新しい計算契約の採用版とみなさず、既存採用・時刻・正式判断ゲートは変更しない。COM-EXPL-001、COM-UI-002/003、COM-DEC-001の説明・警告・SHADOW境界を維持。

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

## 検証

新規Nodeテスト：`tests/decision-reasons.test.cjs` 16件、`tests/decision-reasons-integration.test.cjs` 6件。
ローカルでは新規表示部品の16件とChromiumで320/375/393/430/768pxを確認。5条件の初期表示・売り非該当の折りたたみ・注意の常時表示・開閉状態保持・横はみ出しなしを確認。これは表示部品の検証であり、iPhone Safari実機合格ではない。
GitHubでは既存を含む全Nodeテスト、構文、PR Validation、Security、Cache/Publication契約を確認する。実行結果と最終headはPR/Issueへ記録する。

## 配信・復旧・残件

新規JS/CSSを自アプリのService Worker shellに追加。UI 5.46、manifest、index、SW cache識別を同期。既存の自アプリcache移行規則は維持し、全origin削除・購入記録resetはしない。
main反映・Pages公開は別承認。公開後に配信版、実ページ、Safari/PWAを確認する。PENDING-019〜022の実機受入、Burn-in、正式売買、14:00自然取得を本UIから完了扱いしない。
不具合時は市場データ・個人記録を巻き戻さず、この表示差分のみ通常PRで復旧する。
