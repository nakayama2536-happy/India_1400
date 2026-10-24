# India UI 5.53 — iPhone 17 判断画面の文字階層統一

Date: 2026-10-25 JST
Public baseline main: `05a2a36c20947d7f97690e5c2e80cd130952d299` (UI 5.52)
Status (2026-10-25 JST): **UI 5.53 PR #99 MERGED / final CI 9/9 PASS / Pages deploy SUCCESS / live public HTTP bytes 4/4 MATCH. iPhone17 DEVICE_PASS is pending.**

## 目的と実機証拠

ユーザーが提出した判断タブの10枚のスクリーンショットを比較した。UI 5.52でファンドNAV周辺の7カードと5タブは読みやすくなった一方、同じ判断画面にある「参照データ時刻」「GPT追加分析の必要性」「為替の影響（参考）」「14:00市場補足」「判断理由」の文字階層に不一致が残る。長い詳細説明は必要時に展開するが、展開したときも13px未満の本文が多く、読みにくい。

画像は端末側だけの確認証拠であり、Public GitHubへ画像をアップロードしない。

## なぜ3

1. **必要性:** 重要な品質警告・取得時刻・未取得・買い/売り条件の状態を、52歳の利用者がiPhone 17で判別できること。
2. **現状不足:** `ref-compact-label` 8px / `ref-compact-time` 11px / `ref-compact-status` 10px / `ref-compact-detail` 10px、GPTの4タイルも8〜11px。正式条件の `dr-state` 11px、`dr-value` 12px、`dr-method-body` 12px。省略表示（nowrap/ellipsis）で時刻や詳細が切れる余地がある。
3. **最小安全性:** 5.52で採用した14px補助テキスト/17〜20px主要数値を共通トークンに整理し、`#page-decision`内部のCSSと理由コンポーネントCSSのみに反映。既存データ・意味・色・警告文言・条件/時刻の判定コードは変更しない。長い説明と根拠は削らず、開閉操作と折り返しで読めるようにする。

## 統一表示契約

| 領域 | 主な項目 | 表示基準 |
| --- | --- | --- |
| 判断/予測の補足 | 予測は参考値、基準日、詳細本文 | 14px、行間1.65〜1.75 |
| 参照データ時刻 | 12程度の参照/品質タイルのラベル・時刻・状態・説明 | 14 / 16〜19 / 14 / 14px。2列モバイル、全文折り返し、色を維持 |
| GPT追加分析 | 4トリガーのラベル・ON/OFF・状態・補足、深掘り注意 | 14 / 18 / 14 / 13px、4項目はモバイル2列 |
| 為替の影響（参考） | 円換算/為替4タイル、保存時刻、未算出、注意 | 14 / 18 / 14 / 13px。参考色と数値の上昇・下落色は別のまま |
| 14:00市場補足 | 主要指標の見出し・値・説明/未取得 | 14 / 18 / 14px。値と欠損の区別は維持 |
| 判断理由（Formal参考） | 基準・件数・警告・条件名・状態・条件値・補足 | 14 / 23〜26 / 14 / 16 / 14 / 14px。SHADOWを正式判断へ変更しない |
| 開閉説明 | 自動支持線・為替・市場補足・その他見方 | 開閉行16px、本文14px/1.75、実行可能領域最低46px |
| ファンド/グラフ | UI 5.52で既に大きくした7カード、拡大/日付/支持線 | 既存値・幅・計算を維持（凡例のみ13px） |
| 下部5タブ | 判断・購入状況・指標・予測・管理 | UI 5.51採用値13〜15pxと最低50pxタップ高を維持 |

共通トークン: `--ui53-section:21px`, `--ui53-label:14px`, `--ui53-value:18px`, `--ui53-status:14px`, `--ui53-body:14px`, `--ui53-line:1.7`。画面幅599px以下は参照データ・GPTトリガー・為替を2列に固定し、各行は内容に応じて自然に高さを増やす。狭い画面で省略表示しない。

## 守る契約 / 変更していないもの

- 市場状態・品質・取得成功/欠損のコード、予測計算、インド・コアの公式NAV/出所/基準日、NIFTY取引日/取得時刻、3分割条件、formal_actionは変更しない。
- 休場・時間外・SHADOW/形式不適格なら、保存値の参考表示・売買判定保留を維持する。「未取得」をゼロに変換しない。FII/DII等の情報を正式判断因子へ昇格しない。
- Private/CoreのAPI、GitHub schedule/guard/watchdog、14:00履歴、生成JSON、商用設定を変更しない。
- 端末内購入/レビュー記録、localStorage、IndexedDB、他アプリCacheは削除もresetもしない。Service Workerは既存のIndia専用prefixとcache分離を維持。
- 色だけで判断の意味を伝えない。状態ラベル/実測日時/データ鮮度を残す。表示専用CSSでも「データ最新」「売買判断可」を勝手に生成しない。

## 回帰・配信・端末受入ゲート

1. `tests/unified-readability.test.cjs`：必要領域のセレクタと動的ID、折り返し・フォント・品質・正式判断保留・出所表示を検証。
2. 既存Node全suite（購入/評価/理由/チャート/キャッシュ/ファンド）、Public PR Validation、Public Safety、Review History、Deep Dive、Publication Manifest、SecurityをFinal HEADで合格。
3. ChromiumのiPhone相当幅320/375/393/402/430pxで実DOMを評価。参照/為替/GPT/市場補足・判断理由の主要ラベル/値/説明が見え、画面全体の横はみ出し・省略がないこと。これは実機iPhone Safariとは異なる。
4. 明示承認済み表示変更の範囲でmain反映し、Pages build/deploy、実公開HTTP4ファイルのbytes/版一致を検証。表示確認・正式採用は別の記録にする。
5. iPhone17の実機受入では画面スクロール、折りたたみ、文字の読める大きさ、下部タブ、既存の購入記録とレビュー履歴の残存を確認。受入前に完了扱いしない。

## 未完了・ロールバック

PENDING-014 GitHub-only自然14:00取得/DECISION Burn-in、各期間のforward予測評価、正式NAVの源泉/更新日/品質照合、正式売買採用と定期レポート停止ゲートは本UI改修と独立。

表示に問題がある場合、前版UI 5.52のCSS/版へ安全な前進修正PRで戻す。既存市場JSON、利用者記録、端末cacheを全削除しない。

## 配信と実証（2026-10-25 JST）

| ゲート | 実証 | 結果 |
|---|---|---|
| 変更申請/承認範囲 | 利用者が実機10画面で表示統一を依頼。表示専用の変更として[PR #99](https://github.com/nakayama2536-happy/India_1400/pull/99)を作成 | ユーザー指示の範囲で実装。売買ロジック等は対象外 |
| PR最終head | `8f669f79637b619baa6e265d276b9c6f9ba8fce6` | 9/9必須CI成功。全Node 227/227 PASS、Security/Purchase/Cache/Review History/Technical Chart/Deep Dive/Publication Manifest/PR Validationを確認 |
| 実ブラウザ表示 | 別の未マージ隔離workflow [run 40142780546](https://github.com/nakayama2536-happy/India_1400/actions/runs/40142780546)が上記候補コードを読取検証 | Chromium 320/375/393/402/430px、参照11タイル、GPT4、為替4、市場補足5、判断理由9状態の文字と折り返しを確認。横はみ出し0、5タブ50px |
| main反映 | Public PR #99 squash merge `1a4155f15718b17040a37ab99a08b9083dcdf83e` | MERGED。main後続CI 9系統すべて成功 |
| Publication Manifest | main後続 `5fa27a823e338012b4ad4bfee825188d4d6cf165` | `publication_manifest.json`のみ更新。UI計算/公開データ・ユーザー記録は不変 |
| GitHub Pages | [run 40142861800](https://github.com/nakayama2536-happy/India_1400/actions/runs/40142861800) | Public safety gate→artifact build→Pages deploy、すべてSUCCESS |
| 実配信ファイル | [独立読取HTTP run 40142941549](https://github.com/nakayama2536-happy/India_1400/actions/runs/40142941549) | `index.html`、`VERSION`、`sw.js`、`manifest.webmanifest` がGit正本とSHA-256で完全一致（4/4 PASS） |
| iPhone 17 Safari/PWA | ユーザー本人の実機利用・再読込/起動時の状態と記録を照合 | **DEVICE_PENDING**。実DOM検証とPages配信から受入済みと推定しない |
| 通常市場での自然実行/正式判断 | Private PENDING-014、予測forward評価、Common採用ゲート | このCSS改修により完了扱いしない |

独立HTTP検証で確認した公開ファイル：

- `index.html` 173,328 bytes / SHA-256 `dedad0b3f64181e39c6555e71aefbbcc08ee166f112f503478a98e7e953376af`
- `VERSION` 119 bytes / SHA-256 `bcd29e583e656274db17fe1648433adbf09d037fff6bdcab0d1fe493a36add37`
- `sw.js` 3,611 bytes / SHA-256 `7a61a15471db9269424062f6a00de3212b5585a5c673bb698f40ef801fb9455f`
- `manifest.webmanifest` 753 bytes / SHA-256 `02de66747a4a1981af2e1e1da22d9f39ac16a737b60af47ac1615fe8c64964af`

### 完了後の端末受入

iPhone 17ホーム画面PWA（通常利用環境）でv5.53表示を確認し、参照時刻・GPTトリガー・為替・14:00市場補足・判断理由の各ラベル/値/注記と色が欠けず、展開・閉じる・スクロールが正常かを確認する。購入状況/レビュー履歴の既存ローカル記録が保持されているかを非破壊で再読取する。**アプリ削除、Safariサイトデータ全削除、localStorage/IndexedDBクリア、購入記録リセットは行わない。**

隔離Chromium検証中の最初のrunは、PWA制御者変更に伴うページ再ロードと検証workflowのYAMLインデント問題で失敗した。隔離workflowのみ修正して[run 40142780546](https://github.com/nakayama2536-happy/India_1400/actions/runs/40142780546)を成功させた。実アプリコード・市場データの追加修正はしていない。
