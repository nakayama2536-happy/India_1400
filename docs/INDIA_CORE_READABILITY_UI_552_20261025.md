# India UI 5.52 — インド・コア最新情報のiPhone視認性改善

Date: 2026-10-25 JST.
Public baseline main: `59cc0a26653f51023fb66c1b9afd09b65b571c53` (UI 5.51).
Status: branch実装候補（PR・CI・配信・実機受入は別に記録）。

## 利用者の課題と根拠

iPhone17のスクリーンショットで、インド・コア最新情報の「基準日」「純資産総額」「MA25」「MA75」「RSI14」「MACD」「25/75日線」の見出し、データ確認済み、基準日・指標定義の補足、取得日時と取得元が読みにくいことを確認。画像自体はPublicへ保存しない。

旧UI 5.51のCSSを実読すると、共通 `status-tile-label` 8px、`status-tile-value` 11px、`status-tile-status` 8px、`status-tile-detail` 8px、ファンド名11px、取得情報10pxだった。この文字サイズと `nowrap/overflow:hidden/ellipsis` は、幅の限られた実機で補足情報を省略してしまう。

## なぜ3と最小安全性

1. 必要性: 公式ファンドNAV・基準日・確定テクニカル・QC状態・出所が、拡大操作なしで判読できること。
2. 現状不足: 小さい文字だけでなく、長いテクニカル説明が省略表示され、重要なNIFTY基準日とNAV基準日を照合しにくい。
3. 最小安全: `#page-decision .india-core-latest-card` と隣接するサポートライン補足へのCSSのみを変更。データJSON、`renderIndiaCore`と`statusTileHtml`の文字列・式・条件は一切変更しない。カードは2列のまま、最小幅で折り返しを許し、縦に自然に伸ばす。既存の警告色・公式出所リンクを維持する。

## 表示契約（目安）

| 要素 | UI 5.51 | UI 5.52 |
|---|---|---|
| ファンド名 | 11px | 15px |
| 最新NAV | 28px | 29～34px |
| 前日比 | 14px | 17px |
| 7指標の見出し | 8px | 14px |
| 7指標の値 | 11px | 17～20px |
| 「データ確認済み」/「要確認」 | 8px | 14px |
| 技術・基準日補足 | 8px | 14px |
| 取得時刻/状態/取得元 | 10px | 14px（行ごとに折り返し） |
| 詳細を見る開閉行 | 13px | 16px |
| サポートライン補足と本文 | 12px前後 | 要約14px、開閉16px、本文14px |

カードの状態は従来どおり`good/warn/bad`。異常があれば「要確認」を維持する。RSI14はファンドの単純平均14差分でNIFTY側のWilder RSIと混同せず、公式NAV基準日・指標基準日・NIFTY基準日を削除しない。

## 保護条件

- `renderIndiaCore()` / `statusTileHtml()`、`fundBasisHealth()`、計算式、閾値、quote保存、予測method_version、判断・3分割・購入状態を変更しない。
- official_statusがok・未公表・古い・取得不能の場合も、取得元/時刻/値の分類を維持する。元データの欠損をゼロで埋めず、QC保留を正常表示に昇格させない。
- `market.json`、`india_core.json`、`india_core_history.json`、その他全Public JSONとPrivate Coreは書き換えない。
- Service Workerは同一アプリprefixの新UIキャッシュだけ更新。localStorage、IndexedDB、購入/評価/履歴、他アプリcacheを削除しない。
- README、PWA VERSION / manifest / SW、回帰テストのみ追加更新。

## 受入検証

- 既存Node全suite+追加 `tests/fund-readability.test.cjs` により7指標、QC/基準日、出典、符号、見出しと値の完全表示、欠損・基準不一致を確認。
- 320/375/393/402/430pxのChromium実DOMで測定し、7カードが消えず数値・説明・状態文言・出所が切れず、横スクロールや下部タブの問題がないことを確認する。
- Test/Security/Publication/Cache/Purchase/Review History/Chart/Deep Dive、main、Pagesの安全配信、公開HTTPの版一致を独立ゲートで確認する。
- 実機iPhone17縦画面の最終確認は別ゲート。画像やCIは実機の旧キャッシュ更新・操作性・購入記録保持を証明しない。

Cloudflare、外部トリガー、14:00自然取得/Burn-in、正式売買・レポート廃止の採否は今回の範囲外。復旧が必要なら新PRで表示変更のみを戻し、端末の保存領域を初期化しない。

## Chromium実ブラウザ検証結果（PR候補、2026-10-25 JST）

- 検証対象コード：Public PR #97 候補 `9c1357a3a6aa7720c8b27da0a199fcb17e37eb84`。
- 読取り専用隔離 [run 40113701870](https://github.com/nakayama2536-happy/India_1400/actions/runs/40113701870) **SUCCESS**。検証ブランチは対象コードと専用workflowだけ差分があり、mainへ採用せずPagesへ配信しない。
- Chromeの実DOMを320 / 375 / 393 / 402 / 430 CSS pxで検査。7カードの見出し・数値・品質状態・補足説明がすべて表示され、14px・17〜19px設定が反映済み。カード数と順序、2列レイアウト、取得元リンク、詳細開閉16px、NAV/前日比、5タブを確認。
- いずれの幅でも文字の横切れとページ全体の横はみ出しなし。公式ファンド `14,992円`、`-237円 (-1.56%)`、`139.00億円`、MA25/75、RSI14、MACD、DCの保存済み公開値を、値を書き換えずに表示。データ品質状態も元の「データ確認済み」のまま。実市場の現在値を検証したわけではない。
- 同ブランチの初回読取り検証 [run 40113524086](https://github.com/nakayama2536-happy/India_1400/actions/runs/40113524086) はChromiumデバッガの起動待ち不足で失敗。検証専用workflowの待機・診断を修正後、アプリ候補コード変更なしで再検証PASS。
- 既存CIの `Decision Reasons Contract` による全Nodeは221/221 PASS、Security / Purchase / Cache / Chart / Deep Dive / Review History / Publication Manifest成功。**PR Validationは最終PR headの実行完了を別に確認**し、合格するまでmain反映しない。
- ChromiumとCIはiPhone実機の文字設定・PWAキャッシュ・端末内記録保持の受入ではない。旧履歴や個人保存値を操作しない。
