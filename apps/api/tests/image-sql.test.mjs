import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { imageSql } from '../scripts/image-sql.mjs';

test('image import SQL round trips binary chunks and stays below D1 statement limits', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(readFileSync(new URL('../migrations/0006_d1_images.sql', import.meta.url), 'utf8'));
    const bytes = Buffer.from(Array.from({ length: 100000 }, (_, i) => i % 251));
    const sql = imageSql("private/test'photo", bytes);
    assert(sql.split(';').every(statement => Buffer.byteLength(statement) < 100000));
    db.exec(sql);
    const restored = Buffer.concat(db.prepare('SELECT data FROM image_chunks ORDER BY chunk_index').all().map(row => row.data));
    assert.deepEqual(restored, bytes);
    db.exec(imageSql("private/test'photo", Buffer.from([1, 2])));
    assert.equal(db.prepare('SELECT count(*) AS n FROM image_chunks').get().n, 1);
    assert.throws(() => imageSql('too-big', Buffer.alloc(1800001)));
  } finally { db.close(); }
});
