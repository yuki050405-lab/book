import { useState, useEffect, useRef, useId, cloneElement } from "react";
import {
  BookOpen,
  Library,
  Plus,
  ArrowUpRight,
  Search,
  ScanLine,
  X,
  Check,
  ChevronRight,
  Quote,
  Bookmark,
  Settings,
  BarChart3,
  LogOut,
  RefreshCw,
  ExternalLink,
  Download,
  PenLine,
  Star,
  BookMarked,
  Loader2,
  ImagePlus,
} from "lucide-react";
import {
  Book,
  State,
  load,
  persist,
  makeBook,
  genres,
  education,
  deduplicate,
  isISBN,
  mergeStates,
  classify,
} from "./model";
import {
  searchBooks,
  connectGoogle,
  disconnectGoogle,
  syncSheets,
  connected,
  clientId,
  allowedEmail,
  readCloud,
  writeCloud,
} from "./services";
type Page = "home" | "shelf" | "data";
function IconButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Cover({ book, large = false }: { book: Book; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [book.cover]);
  return (
    <div
      className={"cover " + (large ? "large" : "")}
      style={{ background: book.color }}
    >
      {book.cover && !failed ? (
        <img
          src={book.cover}
          alt={book.title + "の表紙"}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <span>読書録</span>
          <strong>{book.title}</strong>
          <small>{book.author}</small>
        </>
      )}
    </div>
  );
}
export default function App() {
  const [initial] = useState(() => {
    try {
      return { state: load(), error: "" };
    } catch (e) {
      return {
        state: { books: [], shelves: [], lastSync: "", dirty: false } as State,
        error: (e as Error).message,
      };
    }
  });
  const [state, setState] = useState<State>(initial.state);
  const [compact, setCompact] = useState(window.innerWidth <= 700);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const listener = () => setCompact(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  const perShelf = compact ? 5 : 10;
  const [storageError, setStorageError] = useState(initial.error);
  const [page, setPage] = useState<Page>("home");
  const [modal, setModal] = useState<"register" | "settings" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("すべて");
  const [genre, setGenre] = useState("すべて");
  const [shelf, setShelf] = useState("すべて");
  const [email, setEmail] = useState("");
  const [syncing, setSyncing] = useState(false);
  const syncLock = useRef(false);
  const version = useRef(0);
  function notify(s: string) {
    setToast(s);
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  function change(next: State) {
    if (storageError) {
      notify(storageError);
      return false;
    }
    try {
      persist(next);
      version.current++;
      setState(next);
      return true;
    } catch {
      setStorageError(
        "端末への保存に失敗しました。空き容量を確認し、データを書き出してください。",
      );
      notify("保存できませんでした。端末の空き容量を確認してください。");
      return false;
    }
  }
  function updateBook(book: Book) {
    return change({
      ...state,
      books: state.books.map((b) =>
        b.id === book.id ? { ...book, updated: new Date().toISOString() } : b,
      ),
      dirty: true,
    });
  }
  async function sync() {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    const snapshot = version.current;
    try {
      const remote = await readCloud();
      if (version.current !== snapshot)
        throw Error("記録の変更がありました。同期を再試行してください。");
      const merged = remote ? mergeStates(state, remote) : state;
      await syncSheets(merged.books);
      await writeCloud(merged);
      setState((s) => {
        const next = {
          ...(version.current === snapshot ? merged : mergeStates(s, merged)),
          lastSync: new Date().toISOString(),
          dirty: version.current !== snapshot,
        };
        try {
          persist(next);
        } catch {
          notify("同期しましたが、端末の同期状態を保存できませんでした。");
        }
        return next;
      });
      notify("スプレッドシートに同期しました");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }
  useEffect(() => {
    if (!state.dirty || !connected()) return;
    const t = setTimeout(sync, 1600);
    return () => clearTimeout(t);
  }, [state.books, state.dirty, email]);
  function addBook(book: Book) {
    const existing = deduplicate(state.books, book);
    if (existing) {
      notify("この本は登録済みです");
      setModal(null);
      setSelected(existing.id);
      return;
    }
    if (change({ ...state, books: [book, ...state.books], dirty: true })) {
      setFresh(book.id);
      setModal(null);
      notify(`『${book.title}』を登録しました`);
    }
  }
  useEffect(() => {
    if (page !== "shelf" || !fresh) return;
    const t = setTimeout(() => setFresh(null), 1800);
    return () => clearTimeout(t);
  }, [page, fresh]);
  const book = state.books.find((b) => b.id === selected);
  const filtered = state.books.filter(
    (b) =>
      (status === "すべて" || b.status === status) &&
      (genre === "すべて" || b.genre === genre) &&
      (shelf === "すべて" ||
        (shelf === "お気に入り" ? b.favorite : b.shelves.includes(shelf))) &&
      [b.title, b.author, b.notes, ...b.tags, ...b.quotes.map((q) => q.text)]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const completed = state.books.filter((b) => b.status === "読了");
  const reading = state.books.filter((b) => b.status === "読書中");
  const quotes = state.books.flatMap((b) =>
    b.quotes.map((q) => ({ ...q, book: b })),
  );
  const daily = quotes.length
    ? quotes[Math.floor(Date.now() / 86400000) % quotes.length]
    : null;
  function go(p: Page) {
    setPage(p);
    setSelected(null);
    setQuery("");
    setStatus("すべて");
    setShelf("すべて");
    setGenre("すべて");
  }
  return (
    <div className={"app page-" + page}>
      <header className="header">
        <button className="brand" onClick={() => go("home")}>
          <BookOpen size={25} />
          <span>
            読書録<small>MY PRIVATE LIBRARY</small>
          </span>
        </button>
        <nav aria-label="メインナビゲーション">
          {(
            [
              ["home", "書斎"],
              ["shelf", "本棚"],
              ["data", "これまでのデータ"],
            ] as const
          ).map(([p, label]) => (
            <button
              key={p}
              className={page === p ? "active" : ""}
              onClick={() => go(p)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="header-end">
          <span className="private-label">
            <span />
            私だけの書斎
          </span>
          <IconButton
            label="設定・Google 連携"
            onClick={() => setModal("settings")}
          >
            <Settings size={19} />
          </IconButton>
        </div>
      </header>
      {storageError && (
        <div className="storage-alert" role="alert">
          {storageError}
        </div>
      )}
      {page === "home" && (
        <>
          <section className="hero">
            <div className="hero-grain" />
            <div className="hero-content">
              <div className="eyebrow light">
                <span /> A ROOM OF YOUR OWN
              </div>
              <h1>
                本と、ことばと、
                <br />
                私のための時間。
              </h1>
              <p>
                一冊との出会いを、日々の学びに。
                <br />
                あなたの読書が、ここに積み重なっていく。
              </p>
              <button
                className="button gold"
                onClick={() => setModal("register")}
              >
                <Plus size={17} />
                新しい本を迎える
                <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="hero-caption">
              <span>THE READING ROOM</span>
              <span>日々に、静かな余白を。</span>
            </div>
            <div className="hero-number">
              01 <span>— MY STUDY</span>
            </div>
          </section>
          <main className="home-main">
            <div className="section-kicker">
              <span>WELCOME TO YOUR LIBRARY</span>
              <span className="date">
                {new Date().toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })}
              </span>
            </div>
            <section className="entry-grid">
              <button className="entry-card" onClick={() => go("shelf")}>
                <div className="entry-top">
                  <Library />
                  <span>01</span>
                </div>
                <h2>本棚</h2>
                <p>背表紙を眺め、記憶をたどる。</p>
                <div className="entry-bottom">
                  <span>{state.books.length} 冊の本</span>
                  <ArrowUpRight size={20} />
                </div>
              </button>
              <button
                className="entry-card"
                onClick={() => setModal("register")}
              >
                <div className="entry-top">
                  <ScanLine />
                  <span>02</span>
                </div>
                <h2>本の登録</h2>
                <p>新しい一冊を、あなたの書斎へ。</p>
                <div className="entry-bottom">
                  <span>読み取り・検索・手入力</span>
                  <ArrowUpRight size={20} />
                </div>
              </button>
              <button className="entry-card" onClick={() => go("data")}>
                <div className="entry-top">
                  <BarChart3 />
                  <span>03</span>
                </div>
                <h2>これまでのデータ</h2>
                <p>読んだ軌跡に、気づきを見つける。</p>
                <div className="entry-bottom">
                  <span>{completed.length} 冊の読了記録</span>
                  <ArrowUpRight size={20} />
                </div>
              </button>
            </section>
            <section className="home-lower">
              <div className="reading-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">CURRENTLY READING</span>
                    <h2>読みかけの一冊</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      go("shelf");
                      setStatus("読書中");
                    }}
                  >
                    本棚へ <ChevronRight size={15} />
                  </button>
                </div>
                {reading.length ? (
                  <div className="reading-list">
                    {reading.slice(0, 2).map((b) => (
                      <button
                        className="reading-book"
                        key={b.id}
                        onClick={() => setSelected(b.id)}
                      >
                        <Cover book={b} />
                        <div>
                          <span className="small-tag">読書中</span>
                          <h3>{b.title}</h3>
                          <p>{b.author}</p>
                          <small>
                            <Bookmark size={12} />
                            {b.bookmark || "しおりを残す"}
                          </small>
                        </div>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    className="reading-empty"
                    onClick={() => setModal("register")}
                  >
                    <BookMarked size={31} />
                    <div>
                      <h3>次の学びは、どの一冊から。</h3>
                      <p>本を登録して、あなただけの書斎を育てましょう。</p>
                    </div>
                    <Plus size={20} />
                  </button>
                )}
              </div>
              <aside className="daily-quote">
                <Quote size={25} />
                <span className="eyebrow">WORDS TO KEEP</span>
                <h3>心に留めておきたい、ことば。</h3>
                {daily ? (
                  <>
                    <blockquote>{daily.text}</blockquote>
                    <button
                      className="text-button"
                      onClick={() => setSelected(daily.book.id)}
                    >
                      『{daily.book.title}』より <ArrowUpRight size={13} />
                    </button>
                  </>
                ) : (
                  <p>
                    本の中で出会った好きな一節が、
                    <br />
                    ここに日替わりで届きます。
                  </p>
                )}
              </aside>
            </section>
            {state.books.length > 0 && (
              <section className="revisit">
                <span className="eyebrow">FROM YOUR LIBRARY</span>
                <h2>もう一度、開いてみる。</h2>
                <div className="revisit-grid">
                  {[...state.books]
                    .sort((a, b) => Number(b.favorite) - Number(a.favorite))
                    .slice(0, 4)
                    .map((b) => (
                      <button key={b.id} onClick={() => setSelected(b.id)}>
                        <Cover book={b} />
                        <div>
                          <h3>{b.title}</h3>
                          <p>{b.author}</p>
                        </div>
                      </button>
                    ))}
                </div>
              </section>
            )}
          </main>
        </>
      )}
      {page === "shelf" && (
        <main className="inner-main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR COLLECTION</span>
              <h1>
                私の本棚<span>{state.books.length} books</span>
              </h1>
              <p>一冊ずつ、あなたの世界が広がっていく。</p>
            </div>
            <button
              className="button dark"
              onClick={() => setModal("register")}
            >
              <Plus size={17} />
              本を登録する
            </button>
          </div>
          <div className="shelf-toolbar">
            <div className="tabs">
              {["すべて", "読みたい", "読書中", "読了"].map((s) => (
                <button
                  className={status === s ? "active" : ""}
                  key={s}
                  onClick={() => setStatus(s)}
                >
                  {s}
                  <small>
                    {s === "すべて"
                      ? state.books.length
                      : state.books.filter((b) => b.status === s).length}
                  </small>
                </button>
              ))}
            </div>
            <label className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="書名・著者・感想・一節を検索"
                aria-label="本を検索"
              />
            </label>
          </div>
          <div className="filters">
            <select
              aria-label="ジャンル"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            >
              <option value="すべて">すべてのジャンル</option>
              {genres.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
            <select
              aria-label="テーマ別本棚"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
            >
              <option value="すべて">すべての本棚</option>
              <option>お気に入り</option>
              {state.shelves.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button
              className="text-button"
              onClick={() => {
                const name = prompt("新しい本棚の名前");
                if (name?.trim() && !state.shelves.includes(name.trim()))
                  change({
                    ...state,
                    shelves: [...state.shelves, name.trim()],
                  });
              }}
            >
              <Plus size={14} />
              棚をつくる
            </button>
            <span>{filtered.length} 冊</span>
          </div>
          {shelf === "すべて" &&
            !query &&
            state.books.some((b) => b.favorite) && (
              <section className="featured-books">
                <div>
                  <span className="eyebrow">ON DISPLAY</span>
                  <h2>お気に入りの一冊</h2>
                </div>
                {state.books
                  .filter((b) => b.favorite)
                  .map((b) => (
                    <button key={b.id} onClick={() => setSelected(b.id)}>
                      <Cover book={b} large />
                      <span>{b.title}</span>
                    </button>
                  ))}
              </section>
            )}
          <section className="wooden-library" aria-label="背表紙の本棚">
            {filtered.length ? (
              Array.from(
                { length: Math.ceil(filtered.length / perShelf) },
                (_, row) => (
                  <div className="shelf-row" key={row}>
                    <div className="spines">
                      {filtered
                        .slice(row * perShelf, row * perShelf + perShelf)
                        .map((b, i) => (
                          <button
                            key={b.id}
                            className={
                              "spine " +
                              (fresh === b.id ? "new-book" : "") +
                              (b.favorite ? " favorite-book" : "")
                            }
                            style={
                              {
                                background: b.color,
                                "--delay": `${i * 0.04}s`,
                              } as React.CSSProperties
                            }
                            onClick={() => {
                              setSelected(b.id);
                              if (fresh === b.id) setFresh(null);
                            }}
                            aria-label={`${b.title}、${b.author}の詳細`}
                          >
                            <span className="spine-rule" />
                            <span className="spine-title">{b.title}</span>
                            <span className="spine-author">
                              {b.author || "著者未登録"}
                            </span>
                            <span className="spine-icon">
                              {b.favorite ? (
                                <Star size={14} />
                              ) : (
                                <BookOpen size={14} />
                              )}
                            </span>
                            {fresh === b.id && (
                              <span className="new-label">NEW</span>
                            )}
                          </button>
                        ))}
                      <button
                        className="add-spine"
                        onClick={() => setModal("register")}
                        aria-label="本を追加"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                    <div className="shelf-edge" />
                  </div>
                ),
              )
            ) : (
              <div className="empty-shelf">
                <Library size={42} />
                <h2>
                  {state.books.length
                    ? "該当する本がありません"
                    : "まだ、まっさらな本棚。"}
                </h2>
                <p>
                  {state.books.length
                    ? "検索や絞り込みを変更してください。"
                    : "最初の一冊を迎えて、あなたの書斎をつくりましょう。"}
                </p>
                {!state.books.length && (
                  <button
                    className="button gold"
                    onClick={() => setModal("register")}
                  >
                    <Plus size={16} />
                    最初の本を登録する
                  </button>
                )}
              </div>
            )}
          </section>
          <p className="shelf-hint">背表紙を選ぶと、読書の記録が開きます。</p>
        </main>
      )}
      {page === "data" && (
        <main className="inner-main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR READING JOURNEY</span>
              <h1>これまでのデータ</h1>
              <p>積み重ねた読書を、これからの学びに。</p>
            </div>
            <button
              className="button outline"
              onClick={() => exportBackup(state)}
            >
              <Download size={16} />
              データを書き出す
            </button>
          </div>
          <div className="stat-grid">
            {[
              ["登録した本", state.books.length, "冊"],
              ["読み終えた本", completed.length, "冊"],
              ["心に残った一節", quotes.length, "節"],
              [
                "授業で試したいこと",
                state.books.reduce((n, b) => n + b.actions.length, 0),
                "件",
              ],
            ].map(([label, n, unit]) => (
              <div className="stat" key={label}>
                <span>{label}</span>
                <strong>
                  {n}
                  <small>{unit}</small>
                </strong>
              </div>
            ))}
          </div>
          <div className="data-grid">
            <section className="paper-panel">
              <span className="eyebrow">READING RHYTHM</span>
              <h2>今年の読書</h2>
              <div className="chart">
                {Array.from({ length: 12 }, (_, i) => {
                  const n = completed.filter((b) =>
                    b.finished.startsWith(
                      `${new Date().getFullYear()}-${String(i + 1).padStart(2, "0")}`,
                    ),
                  ).length;
                  const max = Math.max(
                    1,
                    ...Array.from(
                      { length: 12 },
                      (_, j) =>
                        completed.filter((b) =>
                          b.finished.startsWith(
                            `${new Date().getFullYear()}-${String(j + 1).padStart(2, "0")}`,
                          ),
                        ).length,
                    ),
                  );
                  return (
                    <div className="chart-col" key={i}>
                      <span>{n || ""}</span>
                      <div
                        style={{ height: `${(n / max) * 130}px` }}
                        title={`${i + 1}月 ${n}冊`}
                      />
                      <small>{i + 1}月</small>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="paper-panel">
              <span className="eyebrow">INTERESTS</span>
              <h2>本棚の広がり</h2>
              {state.books.length ? (
                genres
                  .filter((g) => state.books.some((b) => b.genre === g))
                  .map((g) => (
                    <div className="genre-bar" key={g}>
                      <span>{g}</span>
                      <div>
                        <i
                          style={{
                            width: `${(state.books.filter((b) => b.genre === g).length / state.books.length) * 100}%`,
                          }}
                        />
                      </div>
                      <small>
                        {state.books.filter((b) => b.genre === g).length}冊
                      </small>
                    </div>
                  ))
              ) : (
                <p className="muted">登録した本のジャンルがここに並びます。</p>
              )}
            </section>
          </div>
          <section className="paper-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">READING HISTORY</span>
                <h2>読了した本</h2>
              </div>
            </div>
            {completed.length ? (
              completed.map((b) => (
                <button
                  className="history-row"
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                >
                  <span>{b.finished || "日付未設定"}</span>
                  <strong>{b.title}</strong>
                  <span>{b.author}</span>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <p className="muted">
                読み終えた本を「読了」にすると、ここに記録されます。
              </p>
            )}
          </section>
          <section className="paper-panel">
            <span className="eyebrow">A MOMENT TO REVISIT</span>
            <h2>昨年の今月、読んでいた本</h2>
            {completed.filter((b) =>
              b.finished.startsWith(
                `${new Date().getFullYear() - 1}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
              ),
            ).length ? (
              completed
                .filter((b) =>
                  b.finished.startsWith(
                    `${new Date().getFullYear() - 1}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
                  ),
                )
                .map((b) => (
                  <button
                    className="history-row"
                    key={b.id}
                    onClick={() => setSelected(b.id)}
                  >
                    <span>{b.finished}</span>
                    <strong>{b.title}</strong>
                    <ChevronRight size={16} />
                  </button>
                ))
            ) : (
              <p className="muted small">
                この時期の読了記録がたまると、過去の一冊に再会できます。
              </p>
            )}
          </section>
          <section className="sync-panel">
            <div>
              <span className="eyebrow">GOOGLE SPREADSHEETS</span>
              <h3>あなたの記録を、もうひとつの場所にも。</h3>
              <p>
                {state.lastSync
                  ? `最終同期：${new Date(state.lastSync).toLocaleString("ja-JP")}${state.dirty ? " ／ 未同期の変更があります" : ""}`
                  : "Google に接続すると、専用シートに自動転記します。"}
              </p>
            </div>
            <button
              className="button outline"
              onClick={() => setModal("settings")}
            >
              連携の設定 <ArrowUpRight size={16} />
            </button>
          </section>
        </main>
      )}
      <footer>
        <span className="footer-brand">
          <BookOpen size={16} /> 読書録
        </span>
        <span>本を読む。ことばを残す。自分を育てる。</span>
        <small>YOUR OWN LITTLE LIBRARY</small>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          {fresh && page !== "shelf" && (
            <button className="toast-action" onClick={() => go("shelf")}>
              本棚を見る
            </button>
          )}
          <button onClick={() => setToast("")} aria-label="通知を閉じる">
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "register" && (
        <Register
          onClose={() => setModal(null)}
          onAdd={addBook}
          notify={notify}
        />
      )}
      {book && (
        <Details
          key={book.id}
          book={book}
          books={state.books}
          shelves={state.shelves}
          onClose={() => setSelected(null)}
          onSave={updateBook}
          notify={notify}
          onOpen={setSelected}
        />
      )}
      {modal === "settings" && (
        <Modal
          title="書斎の設定"
          subtitle="SETTINGS & CONNECTION"
          onClose={() => setModal(null)}
        >
          <div className="setting-block">
            <h3>Google アカウント・スプレッドシート</h3>
            <p>
              この端末では、記録をブラウザ内に保存しています。Google
              に接続すると専用のスプレッドシートを作成し、記録・一節・実践メモを自動転記します。Google
              Drive の専用データで、iPhone とパソコンの記録も共有します。
            </p>
            {!clientId && (
              <div className="notice">
                Google 連携には管理者による初期設定が必要です。設定方法は README
                をご覧ください。現在は端末内保存モードです。
              </div>
            )}
            {clientId && !allowedEmail && (
              <div className="notice">
                利用アカウントが未指定です。個人利用に限定する場合は
                VITE_ALLOWED_EMAIL を設定してください。
              </div>
            )}
            {email && (
              <p className="connection">
                <Check size={15} />
                {email}
              </p>
            )}
            <div className="button-row">
              <button
                className="button dark"
                disabled={!clientId || syncing}
                onClick={async () => {
                  try {
                    const mail = await connectGoogle();
                    const remote = await readCloud();
                    if (remote && !change(mergeStates(state, remote))) return;
                    setEmail(mail);
                    notify("Google に接続しました");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                {email ? "Google に再接続" : "Google でログイン"}
              </button>
              {email && (
                <>
                  <button
                    className="button outline"
                    onClick={sync}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <Loader2 className="spin" size={15} />
                    ) : (
                      <RefreshCw size={15} />
                    )}
                    今すぐ同期
                  </button>
                  <IconButton
                    label="Google から切断"
                    onClick={() => {
                      disconnectGoogle();
                      setEmail("");
                    }}
                  >
                    <LogOut size={18} />
                  </IconButton>
                </>
              )}
            </div>
            {localStorage.getItem("dokushoroku-sheet") && (
              <a
                className="text-link"
                href={`https://docs.google.com/spreadsheets/d/${localStorage.getItem("dokushoroku-sheet")}`}
                target="_blank"
                rel="noreferrer"
              >
                専用スプレッドシートを開く <ExternalLink size={14} />
              </a>
            )}
            <p className="small muted">
              スプレッドシートでの編集は読み戻しません。端末間の共有には Google
              Drive に保存する専用データを使います。別の端末でも同じ Google
              アカウントで接続してください。ブラウザのデータを削除する前にバックアップしてください。
            </p>
          </div>
          <div className="setting-block">
            <h3>記録のバックアップ</h3>
            <p>
              画像は含まず、書籍情報とすべての読書記録を JSON 形式で保存します。
            </p>
            <button
              className="button outline"
              onClick={() => exportBackup(state)}
            >
              <Download size={16} />
              バックアップを保存
            </button>
            <label className="button outline import-button">
              バックアップを読み込む
              <input
                type="file"
                accept="application/json"
                onChange={async (e) => {
                  try {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const data = JSON.parse(await f.text());
                    if (
                      !Array.isArray(data.books) ||
                      !Array.isArray(data.shelves) ||
                      data.books.some(
                        (b: any) =>
                          typeof b.title !== "string" ||
                          typeof b.id !== "string" ||
                          !Array.isArray(b.quotes) ||
                          !Array.isArray(b.actions),
                      )
                    )
                      throw Error("形式が正しくありません。");
                    if (
                      !confirm(
                        "バックアップを現在の記録に追加します。同じIDの本は現在の記録を保持します。よろしいですか？",
                      )
                    )
                      return;
                    const ids = new Set(state.books.map((b) => b.id));
                    if (
                      change({
                        ...state,
                        books: [
                          ...state.books,
                          ...data.books
                            .filter((b: Book) => !ids.has(b.id))
                            .map((b: Book) => makeBook(b)),
                        ],
                        shelves: [
                          ...new Set([...state.shelves, ...data.shelves]),
                        ],
                        dirty: true,
                      })
                    )
                      notify("バックアップを読み込みました");
                  } catch (e) {
                    notify("読み込みに失敗しました：" + (e as Error).message);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
function exportBackup(state: State) {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `読書録-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">{subtitle}</span>
          <h2>{title}</h2>
        </div>
        <IconButton label="閉じる" onClick={onClose}>
          <X size={21} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
function Register({
  onClose,
  onAdd,
  notify,
}: {
  onClose: () => void;
  onAdd: (b: Book) => void;
  notify: (s: string) => void;
}) {
  const [mode, setMode] = useState<"choose" | "scan" | "search" | "edit">(
    "choose",
  );
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [draft, setDraft] = useState<Book>(makeBook());
  const [cameraError, setCameraError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const searchId = useRef(0);
  const lookup = async (q: string) => {
    if (!q.trim()) return;
    const request = ++searchId.current;
    setBusy(true);
    setSearched(true);
    try {
      const books = await searchBooks(q);
      if (request !== searchId.current) return;
      setResults(books);
      if (books.length === 1 && isISBN(q)) {
        setDraft(books[0]);
        setMode("edit");
      } else setMode("search");
    } catch (e) {
      if (request === searchId.current) notify((e as Error).message);
    } finally {
      if (request === searchId.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (mode !== "scan") return;
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    setCameraError("");
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error(
            "カメラには HTTPS 接続が必要です。検索または手入力をご利用ください。",
          );
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video.current!,
          (result) => {
            if (!result || stopped) return;
            const code = result.getText();
            if (!isISBN(code)) return;
            stopped = true;
            controls?.stop();
            setTerm(code);
            setMode("search");
            void lookup(code);
          },
        );
        if (stopped) controls.stop();
      } catch (e) {
        if (!stopped)
          setCameraError(
            "カメラを開始できません。使用許可・接続を確認するか、検索をご利用ください。",
          );
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);
  return (
    <Modal
      title={mode === "edit" ? "本を迎える" : "新しい一冊を、書斎へ。"}
      subtitle="ADD TO YOUR LIBRARY"
      onClose={onClose}
    >
      <div className="register-tabs">
        {[
          ["choose", "登録方法"],
          ["scan", "バーコード"],
          ["search", "書名で検索"],
          ["edit", "手入力"],
        ].map(([m, t]) => (
          <button
            key={m}
            className={mode === m ? "active" : ""}
            onClick={() => {
              setMode(m as typeof mode);
              if (m === "edit") setDraft(makeBook());
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {mode === "choose" && (
        <div className="register-choices">
          <button onClick={() => setMode("scan")}>
            <ScanLine size={28} />
            <div>
              <h3>バーコードを読み取る</h3>
              <p>紙の本を、カメラでかんたんに。</p>
            </div>
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => {
              setDraft(makeBook({ format: "電子書籍" }));
              setMode("search");
            }}
          >
            <Search size={28} />
            <div>
              <h3>書名・著者で探す</h3>
              <p>電子書籍や、手元にない本も。</p>
            </div>
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => {
              setDraft(makeBook());
              setMode("edit");
            }}
          >
            <PenLine size={27} />
            <div>
              <h3>自分で入力する</h3>
              <p>見つからない一冊も、大切に残す。</p>
            </div>
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {mode === "scan" && (
        <div className="scanner">
          <div className="video-frame">
            <video ref={video} playsInline muted />
            <div className="scan-target" />
          </div>
          <p>
            {cameraError ||
              "本の裏面にある「978」「979」で始まるバーコードを枠に合わせてください。"}
          </p>
          <button className="button outline" onClick={() => setMode("search")}>
            ISBN を入力・書名で検索
          </button>
        </div>
      )}
      {mode === "search" && (
        <>
          <form
            className="book-search"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(term);
            }}
          >
            <Search size={18} />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="書名、著者、または ISBN"
              aria-label="書籍情報を検索"
              required
            />
            <button className="button dark" disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : "検索"}
            </button>
          </form>
          <p className="muted small">
            電子書籍も書名で探せます。ISBN がなくても登録できます。
          </p>
          <div className="search-results">
            {busy ? (
              <div className="loading">
                <Loader2 className="spin" />
                書籍情報を取得しています…
              </div>
            ) : (
              results.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setDraft({ ...b, format: draft.format });
                    setMode("edit");
                  }}
                >
                  <Cover book={b} />
                  <div>
                    <h3>{b.title}</h3>
                    <p>{b.author}</p>
                  </div>
                  <ChevronRight size={17} />
                </button>
              ))
            )}
            {searched && !busy && !results.length && (
              <div className="empty-search">
                <p>
                  本が見つかりませんでした。言葉を変えるか、手入力で登録できます。
                </p>
                <button
                  className="button outline"
                  onClick={() => {
                    setDraft(makeBook({ title: term }));
                    setMode("edit");
                  }}
                >
                  手入力で登録する
                </button>
              </div>
            )}
          </div>
        </>
      )}
      {mode === "edit" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.title.trim()) {
              notify("タイトルを入力してください");
              return;
            }
            onAdd({
              ...draft,
              ...(!draft.manualGenre
                ? classify(draft.title + " " + draft.description)
                : {}),
              title: draft.title.trim(),
              finished:
                draft.status === "読了"
                  ? draft.finished || new Date().toLocaleDateString("sv-SE")
                  : "",
            });
          }}
        >
          <div className="form-grid">
            <Field label="タイトル" required>
              <input
                required
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="著者">
              <input
                value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
              />
            </Field>
            <Field label="形式">
              <select
                value={draft.format}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    format: e.target.value as Book["format"],
                  })
                }
              >
                {["紙の本", "電子書籍", "両方"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="読書状況">
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    status: e.target.value as Book["status"],
                  })
                }
              >
                {["読みたい", "読書中", "読了"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="ジャンル">
              <select
                value={draft.genre}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    genre: e.target.value,
                    subgenre: "",
                    manualGenre: true,
                  })
                }
              >
                {genres.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            {draft.genre === "教育" && (
              <Field label="教育の分類">
                <select
                  value={draft.subgenre || "詳細未分類"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      subgenre: e.target.value,
                      manualGenre: true,
                    })
                  }
                >
                  <option>詳細未分類</option>
                  {education.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="ISBN（任意）">
              <input
                value={draft.isbn}
                onChange={(e) => setDraft({ ...draft, isbn: e.target.value })}
              />
            </Field>
            <Field label="紹介文">
              <textarea
                rows={3}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
          </div>
          <p className="small muted">
            分類は取得情報からの推定です。後からいつでも変更できます。
          </p>
          <button className="button dark full" type="submit">
            <Plus size={17} />
            この本を登録する
          </button>
        </form>
      )}
    </Modal>
  );
}
function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactElement<{ id?: string }>;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <small>必須</small>}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}
function Details({
  book,
  books,
  shelves,
  onClose,
  onSave,
  notify,
  onOpen,
}: {
  book: Book;
  books: Book[];
  shelves: string[];
  onClose: () => void;
  onSave: (b: Book) => boolean;
  notify: (s: string) => void;
  onOpen: (id: string) => void;
}) {
  const [draft, setDraft] = useState(book);
  const [tab, setTab] = useState("読書ノート");
  const [ocr, setOcr] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [qtext, setQtext] = useState("");
  const [qloc, setQloc] = useState("");
  const [action, setAction] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty =
    JSON.stringify({ ...draft, updated: "" }) !==
    JSON.stringify({ ...book, updated: "" });
  function close() {
    if (!dirty || confirm("未保存の変更があります。保存せず閉じますか？"))
      onClose();
  }
  async function recognize(file: File) {
    setOcr(true);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("jpn+eng", 1, {
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
      });
      try {
        const result = await worker.recognize(file);
        setOcrText(result.data.text);
        notify("文字を読み取りました。内容を確認して一節に追加してください。");
      } finally {
        await worker.terminate();
      }
    } catch {
      notify("文字を読み取れませんでした。文章を入力・貼り付けしてください。");
    } finally {
      setOcr(false);
    }
  }
  return (
    <Modal
      title="本の記録"
      subtitle="A BOOK & YOUR THOUGHTS"
      onClose={close}
      wide
    >
      <div className="detail-summary">
        <Cover book={draft} large />
        <div>
          <div className="detail-badges">
            <span>{draft.format}</span>
            <span>{draft.genre}</span>
            {draft.subgenre && <span>{draft.subgenre}</span>}
          </div>
          <h2>{draft.title}</h2>
          <p>{draft.author}</p>
          <button
            className={"favorite-toggle " + (draft.favorite ? "on" : "")}
            onClick={() => setDraft({ ...draft, favorite: !draft.favorite })}
          >
            <Star size={15} fill={draft.favorite ? "currentColor" : "none"} />
            {draft.favorite ? "お気に入りの一冊" : "お気に入りに飾る"}
          </button>
        </div>
      </div>
      <div className="detail-tabs">
        {["読書ノート", "好きな一節", "授業で試す", "書籍情報"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "読書ノート" && (
        <>
          <div className="form-grid">
            <Field label="読書状況">
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    status: e.target.value as Book["status"],
                    finished:
                      e.target.value === "読了"
                        ? draft.finished ||
                          new Date().toLocaleDateString("sv-SE")
                        : draft.finished,
                  })
                }
              >
                {["読みたい", "読書中", "読了"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="読了日">
              <input
                type="date"
                value={draft.finished}
                onChange={(e) =>
                  setDraft({ ...draft, finished: e.target.value })
                }
              />
            </Field>
            <Field label="しおり（ページ・章・位置番号）">
              <input
                value={draft.bookmark}
                onChange={(e) =>
                  setDraft({ ...draft, bookmark: e.target.value })
                }
                placeholder="例：第3章、p.85、位置No.1240"
              />
            </Field>
          </div>
          <Field label="感想・読書ノート">
            <textarea
              rows={7}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="心に残ったこと、気づいたことを、あなたの言葉で。"
            />
          </Field>
          <div className="field">
            <span>テーマ別の本棚</span>
            <div className="check-chips">
              {shelves.map((s) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    checked={draft.shelves.includes(s)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        shelves: e.target.checked
                          ? [...draft.shelves, s]
                          : draft.shelves.filter((v) => v !== s),
                      })
                    }
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <Field label="関連する本">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value)
                  setDraft({
                    ...draft,
                    related: [...new Set([...draft.related, e.target.value])],
                  });
              }}
            >
              <option value="">読み比べたい本を追加…</option>
              {books
                .filter(
                  (b) => b.id !== draft.id && !draft.related.includes(b.id),
                )
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
            </select>
          </Field>
          <div className="related-books">
            {draft.related.map((id) => {
              const b = books.find((b) => b.id === id);
              return b ? (
                <div key={id}>
                  <button
                    onClick={() => {
                      if (!dirty) onOpen(id);
                      else notify("先に記録を保存してください");
                    }}
                  >
                    {b.title}
                    <ArrowUpRight size={13} />
                  </button>
                  <IconButton
                    label="関連付けを外す"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        related: draft.related.filter((v) => v !== id),
                      })
                    }
                  >
                    <X size={13} />
                  </IconButton>
                </div>
              ) : null;
            })}
          </div>
          <button className="button outline" onClick={() => printBook(draft)}>
            <Download size={15} />
            読書ノートを印刷・PDF 保存
          </button>
        </>
      )}
      {tab === "好きな一節" && (
        <>
          <p className="muted">
            本の中で出会った、残しておきたいことば。ページ・位置番号・章は任意です。
          </p>
          {draft.quotes.map((q) => (
            <div className="quote-edit" key={q.id}>
              <Quote size={19} />
              <div>
                <textarea
                  aria-label="一節の内容"
                  value={q.text}
                  rows={3}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      quotes: draft.quotes.map((v) =>
                        v.id === q.id ? { ...v, text: e.target.value } : v,
                      ),
                    })
                  }
                />
                <input
                  aria-label="一節の場所"
                  value={q.location}
                  placeholder="ページ・位置番号・章（任意）"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      quotes: draft.quotes.map((v) =>
                        v.id === q.id ? { ...v, location: e.target.value } : v,
                      ),
                    })
                  }
                />
              </div>
              <IconButton
                label="一節を削除"
                onClick={() =>
                  setDraft({
                    ...draft,
                    quotes: draft.quotes.filter((v) => v.id !== q.id),
                  })
                }
              >
                <X size={16} />
              </IconButton>
            </div>
          ))}
          <div className="quote-add">
            <Field label="新しい一節">
              <textarea
                value={qtext}
                onChange={(e) => setQtext(e.target.value)}
                rows={4}
                placeholder="入力または電子書籍から文章を貼り付け…"
              />
            </Field>
            <Field label="ページ・位置番号・章（任意）">
              <input
                value={qloc}
                onChange={(e) => setQloc(e.target.value)}
                placeholder="例：p.42 / 位置No.890 / 第2章"
              />
            </Field>
            <div className="button-row">
              <button
                className="button dark"
                disabled={!qtext.trim()}
                onClick={() => {
                  setDraft({
                    ...draft,
                    quotes: [
                      ...draft.quotes,
                      {
                        id: crypto.randomUUID(),
                        text: qtext.trim(),
                        location: qloc,
                      },
                    ],
                  });
                  setQtext("");
                  setQloc("");
                }}
              >
                <Plus size={15} />
                一節を追加
              </button>
              <label
                className={
                  "button outline import-button " + (ocr ? "disabled" : "")
                }
              >
                <ImagePlus size={16} />
                {ocr ? "文字を読み取り中…" : "写真から文字を読み取る"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={ocr}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void recognize(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {ocrText && (
              <div className="ocr-review">
                <Field label="読み取り結果（確認・修正してください）">
                  <textarea
                    rows={5}
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                  />
                </Field>
                <button
                  className="button outline"
                  onClick={() => {
                    setQtext(ocrText);
                    setOcrText("");
                  }}
                >
                  一節の入力欄に使う
                </button>
              </div>
            )}
            <p className="small muted">
              追加後、下の「記録を保存」で確定します。写真は保存・シート転記しません。
            </p>
          </div>
        </>
      )}
      {tab === "授業で試す" && (
        <>
          <p className="muted">読んで終わりにせず、小さな実践につなげる。</p>
          {draft.actions.map((a) => (
            <div className="action-card" key={a.id}>
              <div className="action-head">
                <select
                  aria-label="実践状況"
                  value={a.status}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actions: draft.actions.map((v) =>
                        v.id === a.id
                          ? { ...v, status: e.target.value as typeof a.status }
                          : v,
                      ),
                    })
                  }
                >
                  {["未実施", "試した", "振り返り済み"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <IconButton
                  label="実践メモを削除"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      actions: draft.actions.filter((v) => v.id !== a.id),
                    })
                  }
                >
                  <X size={16} />
                </IconButton>
              </div>
              <Field label="試したいこと">
                <textarea
                  value={a.text}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actions: draft.actions.map((v) =>
                        v.id === a.id ? { ...v, text: e.target.value } : v,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="実践してみて、どうでしたか？">
                <textarea
                  value={a.reflection}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actions: draft.actions.map((v) =>
                        v.id === a.id
                          ? { ...v, reflection: e.target.value }
                          : v,
                      ),
                    })
                  }
                />
              </Field>
            </div>
          ))}
          <Field label="次に試したいこと">
            <textarea
              rows={3}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="明日の授業で、ひとつ変えてみるなら…"
            />
          </Field>
          <button
            className="button outline"
            disabled={!action.trim()}
            onClick={() => {
              setDraft({
                ...draft,
                actions: [
                  ...draft.actions,
                  {
                    id: crypto.randomUUID(),
                    text: action.trim(),
                    status: "未実施",
                    reflection: "",
                  },
                ],
              });
              setAction("");
            }}
          >
            <Plus size={15} />
            実践メモを追加
          </button>
        </>
      )}
      {tab === "書籍情報" && (
        <>
          <div className="form-grid">
            <Field label="タイトル" required>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="著者">
              <input
                value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
              />
            </Field>
            <Field label="ジャンル">
              <select
                value={draft.genre}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    genre: e.target.value,
                    subgenre: "",
                    manualGenre: true,
                  })
                }
              >
                {genres.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            {draft.genre === "教育" && (
              <Field label="教育の小分類">
                <select
                  value={draft.subgenre || "詳細未分類"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      subgenre: e.target.value,
                      manualGenre: true,
                    })
                  }
                >
                  <option>詳細未分類</option>
                  {education.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="校種">
              <select
                value={draft.school}
                onChange={(e) => setDraft({ ...draft, school: e.target.value })}
              >
                {[
                  "小学校",
                  "中学校",
                  "高校",
                  "幼児教育",
                  "大学",
                  "共通",
                  "その他",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="タグ（読点・カンマで区切る）">
              <input
                value={draft.tags.join("、")}
                onChange={(e) =>
                  setDraft({ ...draft, tags: e.target.value.split(/[、,]/) })
                }
              />
            </Field>
            <Field label="形式">
              <select
                value={draft.format}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    format: e.target.value as Book["format"],
                  })
                }
              >
                {["紙の本", "電子書籍", "両方"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="ISBN">
              <input
                value={draft.isbn}
                onChange={(e) => setDraft({ ...draft, isbn: e.target.value })}
              />
            </Field>
            <Field label="購入先・サービス">
              <input
                value={draft.store}
                onChange={(e) => setDraft({ ...draft, store: e.target.value })}
                placeholder="Kindle、楽天Kobo など"
              />
            </Field>
            <Field label="書籍へのリンク">
              <input
                type="url"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              />
            </Field>
            <Field label="背表紙の色">
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </Field>
          </div>
          <Field label="紹介文">
            <textarea
              rows={5}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </Field>
          <p className="small muted">
            分類は自由に変更できます。手動で指定した分類は保持されます。
          </p>
        </>
      )}
      <div className="detail-save">
        <span className="small muted">
          {dirty
            ? "未保存の変更があります"
            : saved
              ? "保存済み"
              : "あなたの記録は、この端末に保存されます"}
        </span>
        <button
          className="button dark"
          onClick={() => {
            if (!draft.title.trim()) {
              notify("タイトルを入力してください");
              return;
            }
            if (onSave({ ...draft, title: draft.title.trim() })) {
              setSaved(true);
              notify("読書の記録を保存しました");
            }
          }}
        >
          <Check size={16} />
          記録を保存
        </button>
      </div>
    </Modal>
  );
}
function printBook(book: Book) {
  const popup = window.open("", "_blank");
  if (!popup) return;
  const doc = popup.document;
  const style = doc.createElement("style");
  style.textContent =
    "body{font-family:serif;max-width:760px;margin:60px auto;padding:20px;line-height:1.9;color:#26392f}h1{font-size:28px}h2{font-size:18px;margin-top:32px;border-bottom:1px solid #ccc}p{white-space:pre-wrap}blockquote{border-left:2px solid #ad8a52;padding-left:20px;white-space:pre-wrap}@media print{body{margin:0}}";
  doc.head.appendChild(style);
  doc.title = book.title + " — 読書録";
  const add = (tag: string, text: string) => {
    const el = doc.createElement(tag);
    el.textContent = text;
    doc.body.appendChild(el);
  };
  add("h1", book.title);
  add("p", book.author);
  add("p", `${book.status}　${book.finished}　${book.genre} ${book.subgenre}`);
  add("h2", "感想");
  add("p", book.notes || "記録なし");
  add("h2", "好きな一節");
  book.quotes.forEach((q) => {
    add("blockquote", q.text);
    add("p", q.location);
  });
  add("h2", "授業で試したいこと");
  book.actions.forEach((a) => {
    add("p", `【${a.status}】${a.text}`);
    add("p", a.reflection);
  });
  popup.focus();
  popup.print();
}
