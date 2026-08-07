// Base de datos 100% local (navegador). Reemplaza al cliente remoto.
// Guarda todo en localStorage con una API compatible con la que usa la app.

type Row = Record<string, any>;
type DB = Record<string, Row[]>;

const DB_KEY = "orion_local_db_v1";
const FILES_KEY = "orion_local_files_v1";

const DEFAULT_DB: DB = {
  conversations: [],
  messages: [],
  notes: [],
  note_folders: [],
  user_memory: [],
  orion_knowledge: [],
  orion_reference_images: [],
  orion_builda_scripts: [],
  orion_config: [{ id: 1, personality: "", behavior: "", context: "", updated_at: new Date().toISOString() }],
};

const memFiles: Record<string, string> = {};
let cache: DB | null = null;

function readDB(): DB {
  if (cache) return cache;
  if (typeof window === "undefined") return (cache = structuredClone(DEFAULT_DB));
  try {
    const raw = localStorage.getItem(DB_KEY);
    cache = raw ? { ...structuredClone(DEFAULT_DB), ...JSON.parse(raw) } : structuredClone(DEFAULT_DB);
  } catch {
    cache = structuredClone(DEFAULT_DB);
  }
  if (!cache!.orion_config?.length) cache!.orion_config = structuredClone(DEFAULT_DB.orion_config);
  return cache!;
}

function writeDB() {
  if (typeof window === "undefined" || !cache) return;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("almacenamiento local lleno", e);
  }
}

function table(name: string): Row[] {
  const db = readDB();
  if (!db[name]) db[name] = [];
  return db[name];
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---- realtime local ----
type Listener = (payload: { eventType: string; new: Row; old: Row | null; table: string }) => void;
const listeners = new Set<{ table?: string; fn: Listener }>();

function emit(tableName: string, eventType: string, row: Row, old: Row | null = null) {
  listeners.forEach((l) => {
    if (l.table && l.table !== tableName) return;
    try {
      l.fn({ eventType, new: row, old, table: tableName });
    } catch {
      /* noop */
    }
  });
}

type Filter = (r: Row) => boolean;

class Query implements PromiseLike<{ data: any; error: any }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: any = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private wantSingle = false;
  private returnRows = false;

  constructor(private name: string) {}

  select(_cols?: string) {
    if (this.op === "select") this.op = "select";
    this.returnRows = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: any[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: any) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  maybeSingle() {
    this.wantSingle = true;
    return this;
  }

  private match(rows: Row[]) {
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private run() {
    const rows = table(this.name);
    const now = new Date().toISOString();
    let result: Row[] = [];

    if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      result = items.map((it) => ({
        id: it.id ?? uid(),
        created_at: it.created_at ?? now,
        updated_at: it.updated_at ?? now,
        ...it,
      }));
      rows.push(...result);
      writeDB();
      result.forEach((r) => emit(this.name, "INSERT", r));
    } else if (this.op === "update") {
      result = this.match(rows);
      result.forEach((r) => Object.assign(r, this.payload));
      writeDB();
      result.forEach((r) => emit(this.name, "UPDATE", r));
    } else if (this.op === "delete") {
      result = this.match(rows);
      const ids = new Set(result);
      const keep = rows.filter((r) => !ids.has(r));
      table(this.name).length = 0;
      table(this.name).push(...keep);
      writeDB();
      result.forEach((r) => emit(this.name, "DELETE", r, r));
    } else {
      result = this.match(rows).slice();
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        result.sort((a, b) => {
          const x = a[col], y = b[col];
          if (x === y) return 0;
          return (x > y ? 1 : -1) * (asc ? 1 : -1);
        });
      }
      if (this.limitN != null) result = result.slice(0, this.limitN);
    }

    const data = this.wantSingle ? result[0] ?? null : result;
    return { data, error: null };
  }

  then<T1 = { data: any; error: any }, T2 = never>(
    onfulfilled?: ((v: { data: any; error: any }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: any) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    } catch (e) {
      return Promise.resolve({ data: null, error: e }).then(onfulfilled as any, onrejected);
    }
  }
}

function readFiles(): Record<string, string> {
  if (typeof window === "undefined") return memFiles;
  try {
    return { ...memFiles, ...JSON.parse(localStorage.getItem(FILES_KEY) || "{}") };
  } catch {
    return memFiles;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(fr.error || new Error("No se pudo leer el archivo"));
    fr.readAsDataURL(file);
  });
}

export const localDb = {
  from(name: string) {
    return new Query(name);
  },
  storage: {
    from(_bucket: string) {
      return {
        async upload(path: string, file: File, _opts?: any) {
          const url = await fileToDataUrl(file);
          memFiles[path] = url;
          try {
            const all = readFiles();
            all[path] = url;
            localStorage.setItem(FILES_KEY, JSON.stringify(all));
          } catch {
            /* si no cabe, queda en memoria */
          }
          return { data: { path }, error: null };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: readFiles()[path] || "" } };
        },
      };
    },
  },
  channel(_name: string) {
    const entry: { table?: string; fn: Listener } = { fn: () => {} };
    const api = {
      on(_event: string, opts: { table?: string; [k: string]: any }, fn: Listener) {
        entry.table = opts?.table;
        entry.fn = fn;
        return api;
      },
      subscribe() {
        listeners.add(entry);
        return api;
      },
      _entry: entry,
    };
    return api;
  },
  removeChannel(ch: any) {
    if (ch?._entry) listeners.delete(ch._entry);
  },
};

export const supabase = localDb;
export default localDb;
