export type Quote = { id: string; text: string; location: string };
export type Action = {
  id: string;
  text: string;
  status: "未実施" | "試した" | "振り返り済み";
  reflection: string;
};
export type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  description: string;
  cover: string;
  genre: string;
  subgenre: string;
  school: string;
  tags: string[];
  status: "読みたい" | "読書中" | "読了";
  format: "紙の本" | "電子書籍" | "両方";
  store: string;
  url: string;
  finished: string;
  notes: string;
  quotes: Quote[];
  actions: Action[];
  shelves: string[];
  related: string[];
  bookmark: string;
  favorite: boolean;
  created: string;
  updated: string;
  color: string;
  manualGenre: boolean;
};
export type State = {
  books: Book[];
  shelves: string[];
  lastSync: string;
  dirty: boolean;
};
export const education = [
  "教育学・教育思想",
  "発達・教育心理",
  "授業づくり・学習評価",
  "教科教育",
  "学級経営・生徒指導",
  "特別支援・インクルーシブ教育",
  "教育相談・子どもの理解",
  "幼児教育・保育",
  "学校経営・教師の成長",
  "教育制度・政策・社会",
  "家庭教育・保護者連携",
  "ICT・情報教育",
];
export const genres = [
  "教育",
  "小説・文学",
  "歴史",
  "ビジネス",
  "科学",
  "暮らし",
  "芸術",
  "その他",
  "未分類",
];
export const colors = [
  "#29463c",
  "#704637",
  "#a07d4d",
  "#3c4854",
  "#665145",
  "#7c784f",
  "#66404b",
];
export function classify(text: string): { genre: string; subgenre: string } {
  const rules: [RegExp, string][] = [
    [
      /特別支援|発達障害|インクルーシブ|合理的配慮/,
      "特別支援・インクルーシブ教育",
    ],
    [/学級|生徒指導|いじめ|不登校/, "学級経営・生徒指導"],
    [/授業|教材|学習評価|探究/, "授業づくり・学習評価"],
    [/教育心理|発達|学習心理/, "発達・教育心理"],
    [/保育|幼児/, "幼児教育・保育"],
    [/保護者|家庭教育|子育て/, "家庭教育・保護者連携"],
    [/ICT|情報教育|デジタル教材/, "ICT・情報教育"],
    [/学校経営|教師|教員/, "学校経営・教師の成長"],
    [/教育相談|カウンセリング/, "教育相談・子どもの理解"],
    [/教育制度|教育政策|教育格差/, "教育制度・政策・社会"],
    [/教育思想|教育哲学|教育史/, "教育学・教育思想"],
    [/国語|算数|教科教育/, "教科教育"],
  ];
  for (const [pattern, subgenre] of rules)
    if (pattern.test(text)) return { genre: "教育", subgenre };
  if (/教育|学校|児童|学習指導|education|teaching/i.test(text))
    return { genre: "教育", subgenre: "詳細未分類" };
  for (const [pattern, genre] of [
    [/小説|文学|フィクション|fiction|literature/i, "小説・文学"],
    [/歴史|日本史|世界史|history/i, "歴史"],
    [/ビジネス|経営|マーケティング|business|economics/i, "ビジネス"],
    [/科学|物理|化学|生物|science/i, "科学"],
    [/暮らし|料理|家事|cooking|house & home/i, "暮らし"],
  ] as [RegExp, string][])
    if (pattern.test(text)) return { genre, subgenre: "" };
  return { genre: "未分類", subgenre: "" };
}
export function makeBook(data: Partial<Book> = {}): Book {
  return {
    id: crypto.randomUUID(),
    title: "",
    author: "",
    isbn: "",
    description: "",
    cover: "",
    genre: "未分類",
    subgenre: "",
    school: "小学校",
    tags: [],
    status: "読みたい",
    format: "紙の本",
    store: "",
    url: "",
    finished: "",
    notes: "",
    quotes: [],
    actions: [],
    shelves: [],
    related: [],
    bookmark: "",
    favorite: false,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    color: colors[Math.floor(Math.random() * colors.length)],
    manualGenre: false,
    ...data,
  };
}
const KEY = "dokushoroku-v1";
export function load(): State {
  const raw = localStorage.getItem(KEY);
  if (!raw)
    return {
      books: [],
      shelves: ["授業づくり", "学級経営", "これから読みたい"],
      lastSync: "",
      dirty: false,
    };
  try {
    return parseState(JSON.parse(raw));
  } catch {
    throw new Error(
      "保存データを読み込めません。データを消さずに、ブラウザの保存内容を確認してください。",
    );
  }
}
export function persist(state: State) {
  localStorage.setItem(KEY, JSON.stringify(state));
}
export function isISBN(input: string) {
  const s = input.replace(/[-\s]/g, "");
  if (/^\d{13}$/.test(s)) {
    return (
      /^(978|979)/.test(s) &&
      s.split("").reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) %
        10 ===
        0
    );
  }
  if (/^\d{9}[\dX]$/i.test(s))
    return (
      s
        .split("")
        .reduce(
          (n, c, i) =>
            n + (c.toUpperCase() === "X" ? 10 : Number(c)) * (10 - i),
          0,
        ) %
        11 ===
      0
    );
  return false;
}
export function deduplicate(books: Book[], candidate: Book) {
  return books.find(
    (b) =>
      (candidate.isbn && b.isbn === candidate.isbn) ||
      (b.title.normalize("NFKC").replace(/\s/g, "") ===
        candidate.title.normalize("NFKC").replace(/\s/g, "") &&
        b.author === candidate.author),
  );
}
export function rowsForSheets(books: Book[]) {
  return {
    books: [
      [
        "ID",
        "書名",
        "著者",
        "ISBN",
        "紹介文",
        "ジャンル",
        "教育小分類",
        "校種",
        "タグ",
        "状況",
        "形式",
        "購入先",
        "リンク",
        "読了日",
        "感想",
        "しおり",
        "本棚",
        "関連本ID",
        "お気に入り",
        "登録日",
      ],
      ...books.map((b) => [
        b.id,
        b.title,
        b.author,
        b.isbn,
        b.description,
        b.genre,
        b.subgenre,
        b.school,
        b.tags.join("、"),
        b.status,
        b.format,
        b.store,
        b.url,
        b.finished,
        b.notes,
        b.bookmark,
        b.shelves.join("、"),
        b.related.join("、"),
        b.favorite ? "はい" : "",
        b.created,
      ]),
    ],
    quotes: [
      ["本ID", "書名", "一節ID", "一節", "ページ・位置・章"],
      ...books.flatMap((b) =>
        b.quotes.map((q) => [b.id, b.title, q.id, q.text, q.location]),
      ),
    ],
    actions: [
      ["本ID", "書名", "実践ID", "試したいこと", "状況", "振り返り"],
      ...books.flatMap((b) =>
        b.actions.map((a) => [
          b.id,
          b.title,
          a.id,
          a.text,
          a.status,
          a.reflection,
        ]),
      ),
    ],
  };
}

export function mergeStates(local: State, remote: State): State {
  const books = new Map(remote.books.map((b) => [b.id, b]));
  for (const b of local.books) {
    const other = books.get(b.id);
    if (!other || (b.updated || b.created) >= (other.updated || other.created))
      books.set(b.id, b);
  }
  return {
    books: [...books.values()].sort((a, b) =>
      b.created.localeCompare(a.created),
    ),
    shelves: [...new Set([...local.shelves, ...remote.shelves])],
    lastSync: local.lastSync,
    dirty: true,
  };
}

/** Validate remote/backup data before it can replace any locally saved record. */
export function parseState(input: unknown): State {
  const invalid = () => {
    throw Error(
      "読書記録の形式を確認できません。端末の記録を残して、読み込みを中断しました。",
    );
  };
  if (!input || typeof input !== "object") return invalid();
  const data = input as Record<string, unknown>;
  if (
    !Array.isArray(data.books) ||
    !Array.isArray(data.shelves) ||
    !data.shelves.every((s) => typeof s === "string")
  )
    return invalid();
  const ids = new Set<string>();
  const books = data.books.map((input: unknown) => {
    if (!input || typeof input !== "object") return invalid();
    const b = input as Record<string, unknown>;
    if (
      typeof b.id !== "string" ||
      !b.id ||
      ids.has(b.id) ||
      typeof b.title !== "string"
    )
      return invalid();
    ids.add(b.id);
    for (const k of [
      "author",
      "isbn",
      "description",
      "cover",
      "genre",
      "subgenre",
      "school",
      "store",
      "url",
      "finished",
      "notes",
      "bookmark",
      "created",
      "updated",
      "color",
    ])
      if (b[k] !== undefined && typeof b[k] !== "string") return invalid();
    for (const k of ["tags", "shelves", "related"])
      if (
        b[k] !== undefined &&
        (!Array.isArray(b[k]) ||
          !(b[k] as unknown[]).every((v) => typeof v === "string"))
      )
        return invalid();
    if (
      b.status !== undefined &&
      !["読みたい", "読書中", "読了"].includes(String(b.status))
    )
      return invalid();
    if (
      b.format !== undefined &&
      !["紙の本", "電子書籍", "両方"].includes(String(b.format))
    )
      return invalid();
    if (
      b.quotes !== undefined &&
      (!Array.isArray(b.quotes) ||
        !b.quotes.every(
          (q) =>
            q &&
            typeof q.id === "string" &&
            typeof q.text === "string" &&
            typeof q.location === "string",
        ))
    )
      return invalid();
    if (
      b.actions !== undefined &&
      (!Array.isArray(b.actions) ||
        !b.actions.every(
          (a) =>
            a &&
            typeof a.id === "string" &&
            typeof a.text === "string" &&
            typeof a.reflection === "string" &&
            ["未実施", "試した", "振り返り済み"].includes(a.status),
        ))
    )
      return invalid();
    if (b.created && !Number.isFinite(Date.parse(String(b.created))))
      return invalid();
    if (b.updated && !Number.isFinite(Date.parse(String(b.updated))))
      return invalid();
    const created =
      typeof b.created === "string" && b.created
        ? b.created
        : new Date(0).toISOString();
    return makeBook({
      ...b,
      created,
      updated: typeof b.updated === "string" && b.updated ? b.updated : created,
    } as Partial<Book>);
  });
  return {
    books,
    shelves: data.shelves,
    lastSync: typeof data.lastSync === "string" ? data.lastSync : "",
    dirty: Boolean(data.dirty),
  };
}
