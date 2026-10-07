# Fund persistence contract (2026-10-07)

## なぜ3

- 必要：取得成功した公式投信値が、保存競合だけで公開されない問題を解消する。
- 現状不足：市場更新pushでNAVとmanifestが同時起動し、manifest先行commitが単純pushを拒否させた。37630577343などで実測。
- 最小安全：取得・計算・売買ルールを変えず、投信2ファイルの保存処理だけを保護する。

## 保存方法

取得時のHEADをbaseとして固定。投信出力以外の作業差分は拒否する。
1試行につきfetchは1回。そのFETCH_HEADを固定し、baseからの先行更新を確認する。
投信2ファイル、取得/計算/起動ゲート/保存スクリプト、投信workflowが変わっていたら停止する。
それ以外の更新（市場JSON・manifest等）だけなら、そのSHAへrebaseして通常pushする。
push直前にさらにmainが進んだ場合は、同じ検証を最大3試行まで繰り返す。
認証・保護・ネットワークエラーは自動再試行しない。force pushや無条件pullは禁止。

公開manifestは既存Pages artifact作成時に全公開ファイルから再生成される。
保存成功とPages成功と公開ファイル一致は別々に確認する。
本処理は公開待機やGitHub schedule遅延を解消・保証するものではない。
同一投信/計算コードの競合は新しいmainから取得し直す。古い候補を上書き採用しない。

## 検証

`python -m unittest tests.test_fund_persistence -v`

ローカルbare Git remoteで通常保存・no-op・独立更新・依存変更・push直前競合・
3回上限・権限失敗・余計な差分・不正出力を再現する。テスト値は本番観測ではない。

## 復旧・ロールバック

保存失敗時はログのSAVED/SAVE_FAILEDとActions summaryを確認する。
保護条件の失敗を単純な通信失敗と扱わない。復旧は対象runと最新mainを確認して行う。
修正に問題がある場合は、この変更をPRでrevertする。保存済み投信履歴を巻き戻さない。
初回の手動更新成功を自然運用・14:00実証・Burn-in成功に加算しない。
