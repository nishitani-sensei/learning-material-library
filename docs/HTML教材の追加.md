# HTML教材の追加

先生は「このHTMLを算数の2年生に追加したい」のようにCodexへ伝えられます。以下は制作を引き継ぐ方向けの手順です。

## 1. ひな形を作る

```sh
pnpm new:tool multiplication-cards student
```

先生用は最後を `teacher` にします。`modules/教材ID/` に紹介情報の `module.json` と `files` フォルダーを作成します。既存の同じIDは上書きしません。

## 2. HTMLを入れる

`files` にHTMLと関連する画像・CSS・JavaScriptを入れます。元ファイルは残し、組込み用のコピーを使います。入口を `index.html` にするか、紹介情報の `entry` を実際のファイル名に合わせます。

```text
modules/multiplication-cards/
  module.json
  files/
    index.html
    preview.svg
    assets/
      style.css
      app.js
      picture.png
```

画像やCSSの場所は `./assets/picture.png` のような相対パスにします。`/assets/picture.png` のようにサイト全体の先頭を指すパスは、GitHub Pagesの保存場所名を含むURLでは壊れる場合があります。

新しいHTMLには `<script src="../../shared/return.js"></script>` をbody内に置くと、ライブラリへ戻る入口が付きます。公開先では `tools/教材ID/` にフォルダー一式が出力されます。深い階層を入口にする場合は、共有部品までの相対パスも合わせてください。

## 3. 紹介情報を整える

| 項目 | 内容 |
|---|---|
| id | フォルダー名と同じ、重複しない半角英数字・ハイフン。公開後は固定 |
| title / description | 名前と短い説明 |
| audience | student または teacher |
| category | 下記の分類ID |
| grades | 例 `[1,2]`。学年共通は `[]`。先生用も `[]` |
| kind | 学習アプリ、仕事の道具、プリントなど、画面に出す種類 |
| tags | 例 `["かけ算","計算"]` |
| entry / thumbnail | files内のHTMLと見本画像の相対パス |
| updated | YYYY-MM-DD |
| instructions | 使い方の文の配列 |
| sample | 組込み見本なら true、実用教材なら false |

児童用の分類ID：`japanese` 国語／`math` 算数／`science` 理科／`social` 社会／`life` 生活／`english` 外国語／`music` 音楽／`pe` 体育／`art` 図画工作／`home` 家庭／`moral` 道徳／`integrated` 総合／`activities` 特別活動。

先生用の分類ID：`lesson` 授業準備／`classroom` 学級づくり／`school` 行事・校務／`documents` 文書・印刷。

## 4. 保存と公開の決まり

- 保存名は `kyozai:tool:教材ID:項目名:v1` のように教材ごとに分けます。ほかの教材や本だなの保存を消しません。
- Service Workerを使う教材は、その教材のフォルダー内だけに範囲を限定します。初期サイト本体にはService Workerを入れていません。
- 元サイト、接続情報、個人情報、PCバックアップ、未公開のメモを含めません。
- GAS専用のHTMLは、そのままでは静的サイトで動きません。サーバーとの通信が必要な場合は別途対応を設計します。
- 他の素材を使う場合は利用条件と出典を教材内に添えます。個別の利用条件を明記した教材には、その条件を適用します。

## 5. 検査して公開

`pnpm test` と `pnpm build` を実行します。生成後は使い方、教材起動、画像、保存名、戻る操作を確認してからGitHubへ反映します。教材フォルダーを削除して再生成すると、以前の生成物も公開用の出力から取り除きます。元ファイルや取得済みコピーを回収する操作ではありません。
