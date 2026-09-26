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
