export interface Note {
  path: string;
  created: string;
  updated: string;
  body: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
}

type FolderNode = TreeNode & { children: TreeNode[] };

export const NOTES: Note[] = [
  {
    path: "inbox.md",
    created: "2024-05-28",
    updated: "2024-06-02",
    body: `# inbox

雑多に放り込む場所。整理は後で。

- [ ] 歯医者の予約を取り直す
- [x] 牛乳と卵を買う
- [ ] \`note-app\` のサイドバー、ツリーの見せ方を決める
- [ ] 父の日、何か考える

---

> 速く書けることより、後から見つけられること。
> ——フォルダ構造を凝りすぎないこと。

ふと思ったメモ:
プレーンテキストの良さは「いつでも \`grep\` できる」こと。
でも検索はこのアプリには入れない。エディタの仕事。`,
  },
  {
    path: "todo.md",
    created: "2024-04-10",
    updated: "2024-06-01",
    body: `# todo

## 今週

- [ ] 確定申告の領収書をまとめる
- [x] 自転車のタイヤ交換
- [ ] \`note-app\` のプロトタイプを触ってもらう
- [ ] ブログの下書きを1本

## いつか

- [ ] ポートフォリオを作り直す
- [ ] 京都の長期滞在を調べる
- [ ] キーボードを自作してみる

## 待ち

- [ ] 図書館の予約（『計measuring』）— 6/10 頃
- [ ] 友人の引っ越し手伝いの日程`,
  },
  {
    path: "reading/サピエンス全史.md",
    created: "2024-03-02",
    updated: "2024-05-20",
    body: `# サピエンス全史

ユヴァル・ノア・ハラリ

## 認知革命

虚構（フィクション）を共有できることが、ホモ・サピエンスを特別にした。
お金・国家・会社——どれも「みんなが信じているから存在する」。

> 大勢の見知らぬ人間どうしも、共通の神話を信じることで
> 協力できるようになった。

## 農業革命

著者いわく「史上最大の詐欺」。
小麦が人間を家畜化した、という視点が面白い。

- 定住で人口は増えた
- でも個人の暮らしはむしろ過酷になった
- 余剰が生まれ、それが少数に集中した

## メモ

\`贅沢は必需品になり、新たな義務を生む\` という一節が刺さる。
スマホもまさにこれ。

---

次は『ホモ・デウス』へ。`,
  },
  {
    path: "reading/Deep Work.md",
    created: "2024-02-14",
    updated: "2024-04-30",
    body: `# Deep Work

カル・ニューポート

集中して取り組む時間（deep work）の価値は上がり続けるのに、
できる人は減っている——だから希少で、価値がある。

## 4つの規律

1. 深く働く（時間をブロックする）
2. 退屈を受け入れる（暇つぶしに逃げない）
3. SNSを切り捨てる
4. 浅い仕事を締め出す

## 実践メモ

- 午前中の2時間を \`deep\` ブロックにする
- 終業の儀式：明日のtodoを書いて閉じる
- 通知は基本オフ

> 何に注意を向けるかが、人生の質を決める。`,
  },
  {
    path: "ideas/ノートアプリの構想.md",
    created: "2024-05-15",
    updated: "2024-06-02",
    body: `# ノートアプリの構想

DBもクラウドも要らない。\`~/notes/\` をただ開くだけ。

## 思想

- ファイルはファイルのまま。透明であること。
- 同期はしない。バックアップはユーザーの仕事（Git なり Dropbox なり）。
- アプリが消えてもノートは残る。

## 捨てるもの

- タグ
- 全文検索
- チーム機能
- モバイル

> 機能を足すより、足さない理由を持つこと。

## 画面

- 閲覧がデフォルト。\`E\` で編集。
- サイドバーは現在のノートのパスだけ開く。
- メタ情報は下にそっと。`,
  },
  {
    path: "ideas/週末のアイデア.md",
    created: "2024-05-31",
    updated: "2024-05-31",
    body: `# 週末のアイデア

- ベランダのハーブを植え替える
- 近所の喫茶店を3軒まわる
- フィルムカメラを持って散歩

\`\`\`
土: 朝散歩 → 喫茶 → 読書
日: 植え替え → 昼寝 → 映画
\`\`\`

観たい映画:
- *Perfect Days*（再見）
- *Paterson*`,
  },
  {
    path: "daily/2024-06-01.md",
    created: "2024-06-01",
    updated: "2024-06-01",
    body: `# 2024-06-01

曇り。少し肌寒い。

午前はずっと \`note-app\` の設計をしていた。
ファイルツリーの見せ方で悩む——線を引くか、引かないか。
引かないほうが静かだけど、深い階層だと迷子になりそう。

- やったこと: データ構造を決めた
- 詰まり: Markdownレンダラーの仕様
- 明日: 閲覧モードの体裁

夜、『サピエンス』の続き。農業革命の章。`,
  },
  {
    path: "daily/2024-06-02.md",
    created: "2024-06-02",
    updated: "2024-06-02",
    body: `# 2024-06-02

晴れ。良い風。

プロトタイプを人に触ってもらう日。
雰囲気とサイドバーの見せ方、いくつか比べてもらう。

## 今日の3つ

1. プロトタイプを共有
2. フィードバックをinboxに集める
3. 散歩（30分）

## メモ

> 完璧な1案より、混ぜて選べる部品。

\`E\` を押すと編集に入れる、というのが地味に気持ちいい。
保存したら閲覧に戻る。モードがはっきりしているのが好き。`,
  },
];

export function ancestorsOf(path: string): string[] {
  const parts = path.split("/");
  const out: string[] = [];
  let acc = "";
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? acc + "/" + parts[i] : parts[i];
    out.push(acc);
  }
  return out;
}

export function noteTitle(note: Note): string {
  const m = note.body.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  const base = note.path.split("/").pop()!.replace(/\.md$/, "");
  return base;
}

export function buildTree(notes: Note[]): TreeNode {
  const root: FolderNode = { name: "~/notes", path: "", type: "folder", children: [] };
  for (const note of notes) {
    const parts = note.path.split("/");
    let cur: FolderNode = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? acc + "/" + part : part;
      const isFile = i === parts.length - 1;
      let child = cur.children.find((c) => c.name === part);
      if (!child) {
        child = isFile
          ? { name: part, path: acc, type: "file" }
          : { name: part, path: acc, type: "folder", children: [] };
        cur.children.push(child);
      }
      if (!isFile) cur = child as FolderNode;
    });
  }
  const sortRec = (node: TreeNode) => {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortRec);
  };
  sortRec(root);
  return root;
}
