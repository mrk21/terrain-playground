---
name: update-readme
description: README.md を実際のプロジェクト状態に追従させる。npm スクリプト（package.json の scripts）の追加・変更・削除、src/ のディレクトリ構成変更、依存（技術スタック）の追加など、コードや設定の変更に README.md の該当セクションが追いついていないときに使う。「README を更新して」「コマンドを追加したので README に反映して」「ディレクトリ構成が変わった」などの依頼で起動する。
---

# update-readme

README.md の該当セクションを、実際のプロジェクト状態（`package.json` の scripts・依存、`src/` のディレクトリ構成）に追従させる。

## やること

読み比べの使い捨て context をメインの会話に残さないよう、本体は**サブエージェントに委譲する**。

1. `Agent` ツールで `subagent_type: readme-maintainer` を **1 体**起動する（README 1 ファイルのみ・並列不要、worktree 分離も不要）。タスクは次のように渡す:

   > README.md を実際のプロジェクト状態に追従させて。**今回のきっかけ**は〈分かっていれば具体的な変更を書く。例: 「scripts に `test:run` を追加」「`src/visualization/` を新設」〉。working tree を編集するだけで commit / push はしない。既に同期済みなら編集せず、その旨を返して。最後に「何をどのセクションでどう変えたか（無ければ "変更なし"）」を 1〜数行で返して。

   起動元が変更内容を把握しているなら、`git log` / `git diff` から再発見させるより**具体的なきっかけを渡したほうが速く・取りこぼしにくい**（実体を正とする方針は変わらない）。手順・スタイル・取捨選択の基準はサブエージェント定義（[.claude/agents/readme-maintainer.md](../../agents/readme-maintainer.md)）側に持たせてあるので、ここで細かく指示する必要はない。

2. サブエージェントが戻ってきたら、返ってきた**変更サマリ**と `git diff -- README.md` の要点をユーザーに提示し、レビューしてもらう（こちらでは commit しない）。
