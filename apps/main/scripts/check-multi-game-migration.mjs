import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../drizzle-pg/0018_sweet_firelord.sql', import.meta.url), 'utf8');
const statements = migration.split('--> statement-breakpoint').map(statement => statement.trim());
const knownViews = ['chart_percentile_bands', 'chart_percentile_bands_all_regions'];

test('retires both deployed percentile view names before every column type conversion', () => {
  const conversions = statements.flatMap((statement, index) =>
    /ALTER TABLE .*ALTER COLUMN .* TYPE /s.test(statement) ? [index] : []);
  assert.ok(conversions.length > 0, 'migration must retain its data-preserving type conversions');
  for (const view of knownViews) {
    const dropIndex = statements.findIndex(statement =>
      statement === `DROP MATERIALIZED VIEW IF EXISTS "public"."${view}";`);
    assert.notEqual(dropIndex, -1, `missing qualified drop for deployed view ${view}`);
    for (const conversionIndex of conversions) {
      assert.ok(dropIndex < conversionIndex, `${view} still exists at ${statements[conversionIndex]}`);
    }
  }
});

test('view cleanup is restricted to the two known public materialized views', () => {
  const drops = migration.match(/DROP MATERIALIZED VIEW[^;]*;/g) ?? [];
  assert.deepEqual(drops, knownViews.map(view => `DROP MATERIALIZED VIEW IF EXISTS "public"."${view}";`));
  assert.doesNotMatch(migration, /DROP\s+[^;]*\bCASCADE\b/i);
});

test('the existing data-preserving difficulty conversion remains after cleanup', () => {
  assert.ok(statements.includes('ALTER TABLE "parent_song" ALTER COLUMN "difficulty" TYPE smallint USING (array_position(enum_range(NULL::"difficulty"), "difficulty") - 1)::smallint;'));
});

test('requires chart constants while preserving unknown introduction versions', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../drizzle-pg/meta/0018_snapshot.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.tables['public.songs'].columns.levelPrecise.notNull, true);
  assert.ok(!statements.includes('ALTER TABLE "songs" ALTER COLUMN "levelPrecise" DROP NOT NULL;'));
  for (const column of ['addedVersion']) {
    assert.ok(statements.includes(`ALTER TABLE "songs" ALTER COLUMN "${column}" DROP NOT NULL;`));
    assert.equal(snapshot.tables['public.songs'].columns[column].notNull, false);
  }
});
