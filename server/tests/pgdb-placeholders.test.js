const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, convertPlaceholders } = require('../src/pgDb');

test('convertPlaceholders replaces ? outside quotes', () => {
  assert.equal(convertPlaceholders('select ? as x'), 'select $1 as x');
  assert.equal(convertPlaceholders('where a = ? and b = ?'), 'where a = $1 and b = $2');
  const mixed = "select '?' as q, col from t where id = ?";
  assert.equal(convertPlaceholders(mixed), "select '?' as q, col from t where id = $1");
});

test('prepare forwards params and results for get/all/run', async () => {
  let lastQuery = null;
  const fakePool = {
    async connect() {
      return {
        async query(text, params) {
          lastQuery = { text, params };
          return { rows: [{ id: 'abc', x: params[0] }], rowCount: 1 };
        },
        release() {}
      };
    }
  };

  const db = createDb('postgres://test', fakePool);
  const row = await db.prepare('select ? as x').get(42);
  assert.equal(row.x, 42);
  assert.equal(lastQuery.text, 'select $1 as x');
  assert.deepEqual(lastQuery.params, [42]);

  const rows = await db.prepare('select ? as x union all select ?').all(1, 2);
  assert.equal(rows.length, 1);

  const runRes = await db.prepare('insert into t(col) values (?)').run('val');
  assert.equal(runRes.changes, 1);
  assert.equal(runRes.lastInsertRowid, 'abc');
});
