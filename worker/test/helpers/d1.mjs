// D1 API'sinin kullanılan alt kümesi, node:sqlite üzerinde (yalnız testler için).
import { readFileSync } from 'node:fs';

// node:sqlite ExperimentalWarning'i yalnız bu import sırasında bastırılır.
const emitOrijinal = process.emitWarning;
process.emitWarning = (w, ...a) => {
  const tip = typeof a[0] === 'string' ? a[0] : a[0]?.type;
  if (tip === 'ExperimentalWarning' && /SQLite/i.test(String(w))) return;
  return emitOrijinal.call(process, w, ...a);
};
const { DatabaseSync } = await import('node:sqlite');
process.emitWarning = emitOrijinal;

const SEMA = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8');

function duzSatir(r) {
  return r ? { ...r } : r;
}

export function testD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SEMA);

  const hazirla = (sql, args) => {
    args.forEach((a, i) => {
      if (a === undefined) throw new TypeError(`D1 bind: undefined değer (parametre ${i + 1})`);
    });
    return { stmt: sqlite.prepare(sql), args };
  };

  const ifade = (sql, args = []) => ({
    bind: (...yeni) => ifade(sql, yeni),
    async run() {
      const { stmt } = hazirla(sql, args);
      const r = stmt.run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    async all() {
      const { stmt } = hazirla(sql, args);
      return { results: stmt.all(...args).map(duzSatir), success: true, meta: {} };
    },
    async first() {
      const { stmt } = hazirla(sql, args);
      return duzSatir(stmt.get(...args)) ?? null;
    },
  });

  return {
    prepare: (sql) => ifade(sql),
    async batch(stmts) {
      sqlite.exec('BEGIN');
      try {
        const sonuc = [];
        for (const s of stmts) sonuc.push(await s.run());
        sqlite.exec('COMMIT');
        return sonuc;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
  };
}
