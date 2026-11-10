import { expect, it, vi } from 'vitest';
import { geoDbSomenteLeitura, sqlGeoSomenteLeitura } from './geoDbLeitura';

it('reconhece apenas consultas', () => {
  expect(sqlGeoSomenteLeitura('SELECT id FROM place')).toBe(true);
  expect(sqlGeoSomenteLeitura('with nomes as (select 1) select * from nomes')).toBe(true);
  expect(sqlGeoSomenteLeitura('INSERT INTO place VALUES (1)')).toBe(false);
  expect(sqlGeoSomenteLeitura('UPDATE place SET name = name')).toBe(false);
  expect(sqlGeoSomenteLeitura('DELETE FROM place')).toBe(false);
  expect(sqlGeoSomenteLeitura('SELECT 1; DELETE FROM place')).toBe(false);
  expect(sqlGeoSomenteLeitura('PRAGMA writable_schema = ON')).toBe(false);
});

it('bloqueia escrita e deixa a leitura passar', async () => {
  const prepare = vi.fn((sql: string) => ({ sql }));
  const exec = vi.fn(async (sql: string) => ({ sql }));
  const db = geoDbSomenteLeitura({ prepare, exec, batch: vi.fn() } as unknown as D1Database);
  expect(db.prepare('SELECT 1')).toEqual({ sql: 'SELECT 1' });
  await expect(db.exec('SELECT 1')).resolves.toEqual({ sql: 'SELECT 1' });
  expect(() => db.prepare('INSERT INTO place VALUES (1)')).toThrow('somente leitura');
  expect(() => db.exec('DELETE FROM place')).toThrow('somente leitura');
  expect(geoDbSomenteLeitura(db)).toBe(db);
});
