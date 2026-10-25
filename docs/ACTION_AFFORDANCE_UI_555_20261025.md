# India UI 5.55：操作ボタンと情報表示の区別（2026-10-25）

## 目的
iPhone 17でボタンと状態カードが似て見える問題を解消する。見やすさを確定したUI 5.54を崩さず、操作可能性を配色だけに依存せず明示する。

## 表示ルール
- **一般操作**：青い塗り・明るい枠・わずかな立体感・末尾の「›」を使用。押下・キーボードフォーカス・無効状態を区別する。押下しても購入注文は出さない。
- **情報表示**：売買条件、参照時刻、予測、品質・為替の状態などは平坦なカードとする。青い操作方向マークやクリック影を付けない。状態色（緑・黄・赤）の意味はそのまま保持する。
- **折りたたみ**：タップ領域を保ち、閉じた状態「＋」、開いた状態「−」を右端に配置。内容・展開状態は変更しない。
- **グラフ**：「拡大」に⤢マーク、関連グラフは従来どおり読み取り専用。SVG/チャート操作・期間切替は変更しない。
- **購入状況**：各段階の3枚は実施記録を変更するボタンのため「記録する／変更する」を表示。端末保存、実施日、確認ダイアログ、カスケード操作は保持。
- **管理**：品質3枚のカードは詳細へ移動できるため「詳細を見る」を表示。深掘り評価の3選択肢には○／✓を表示。選択・保存・共有の意味は変更しない。
- **ナビゲーション**：5タブは操作面を示し、選択中タブを明示。iPhone safe-areaおよび固定バーを維持。
- **参照リンク**：ファンドの取得元は下線でリンクだと分かるようにする。

## 不変・確認ゲート
Private Core、公開市場JSON、売買ルール、14:00取得・判定、品質ゲート、予測式、キャッシュ境界、購入進捗・評価履歴のlocalStorage、Deep Diveプライバシーは変更しない。CSS+PWA殻・バージョン・回帰テスト以外の機能コードには手を触れない。

静的回帰・GitHub CI・Security・Publication Manifest・Pages配信と、iPhone17 Safariの実機受入は別段階。実機では判断タブの状態チップ、3分割記録、管理の品質カード、折りたたみ、無効操作、グラフ拡大、5タブを確認する。

## 追加実証（2026-10-25 09:09 JST）

| ゲート | 検証証拠 | 結果 |
|---|---|---|
| 実装採用 | [Public PR #104](https://github.com/nakayama2536-happy/India_1400/pull/104)、main merge `7cbc4d42539d0b4118cce9eb2c6fe002890720a6` | MERGED。UI 5.55 |
| 回帰/品質 | main [Decision Reasons CI #40145261736](https://github.com/nakayama2536-happy/India_1400/actions/runs/40145261736)、全Node **239/239 PASS**。PR Validation / Security / Cache / Publication / Technical Chart / Review History / Deep Diveも合格 | PASS |
| Pages配信 | main [Deploy Pages #40145261626](https://github.com/nakayama2536-happy/India_1400/actions/runs/40145261626) | SUCCESS |
| 表示の実DOM | 独立・読取り専用 [run #40145567728](https://github.com/nakayama2536-happy/India_1400/actions/runs/40145567728)。隔離検証ブランチは上記mainとの差分が検証workflowのみ | Chromium 320/375/393/402/430 CSS pxで5/5合格。操作ボタンに影と›、表示専用pill・forecast・reference・next-actionは平面、開閉＋/−、拡大⤢、購入3・品質3ボタン、無効ボタン、5タブを確認。横はみ出し0 |
| 公開HTTP byte一致 | 同 [run #40145567728](https://github.com/nakayama2536-happy/India_1400/actions/runs/40145567728) | **5/5ファイルSHA-256一致**。index/version/sw/manifest/action-affordance.cssを実際のPagesからGETし、GitHub正本と照合 |
| iPhone17 Safari/PWA | 利用者の実機操作・キャッシュ更新・端末内購入/レビュー記録再読込 | **DEVICE_PENDING**。ChromiumやPages配信成功から完了とみなさない |
| 通常市場日の14:00自然取得・DECISION実証 | Private PENDING-014、予測forward評価、正式売買判断採用 | **今回の表示変更対象外。未検証状態を維持** |

公開されたファイルとsource mainが一致したSHA-256：
- `index.html`：173,442 bytes / `0a49df2895830068ae483ab01ddd927db4b491fdfc177b35b9097180434c5edc`
- `VERSION`：119 bytes / `c66efcbde94ba5a1bbcc3f5fd450c339352729c1745942b4b4e2b79fe77708c9`
- `sw.js`：3,670 bytes / `60e5b787449c6656f4775bd15f25f7844ea141b7d56ed71a6ee2cbe49a5b0d95`
- `manifest.webmanifest`：754 bytes / `b13f7237bc9064ba694eabd0360e21b0586318719280388f6ae62583862008b9`
- `action-affordance.css`：6,379 bytes / `df5aae3c9f03c57b6e09e47f856294a4f7e67a6cc45eb51cf7351ea6c1e17d66`

並行して作成されていた同等の候補[PR #105](https://github.com/nakayama2536-happy/India_1400/pull/105)は、重複CSSとバージョン競合を避けるため**未マージで閉じた**。本番の採用実装はPR #104の一本とする。

実機での次の確認：通常のiPhone17ホーム画面PWAで`v5.55`、青い更新・共有・拡大ボタン、平坦な売買保留/休場ラベル、開閉＋/−、購入記録・管理品質の操作ヒントを確認。購入記録を変更する操作やアプリ削除・Safariデータクリアは行わない。何も操作せず既存の記録を再表示する確認だけにする。
