import { createClient } from "@libsql/client";
import { config as dotenvConfig } from "dotenv";
import { writeFileSync } from "fs";
import { join } from "path";

dotenvConfig({ path: ".env.local" });

const dbCredentials = {
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
};

if (!dbCredentials.url || !dbCredentials.authToken) {
  console.error("Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env.local");
  process.exit(1);
}

async function downloadDatabase() {
  console.log("~..................¯\\_(ツ)_/¯..................~");
  console.log("Database Export Script (JSON)");
  console.log("~...............................................~");
  console.log("Connecting to Turso database...");
  
  const client = createClient(dbCredentials);
  
  try {
    // Get all table names
    const tablesResult = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name;
    `);
    
    const tableNames = tablesResult.rows.map(row => row.name);
    console.log(`Found ${tableNames.length} tables:`, tableNames);
    
    const exportData = {
      metadata: {
        exported: new Date().toISOString(),
        source: dbCredentials.url,
        database_type: "turso/sqlite",
        table_count: tableNames.length,
      },
      tables: {},
      indexes: [],
    };
    
    let totalRows = 0;
    
    // Export schema and data for each table
    for (const tableName of tableNames) {
      console.log(`Exporting table: ${tableName}`);
      
      // Get table schema
      const schemaResult = await client.execute(`
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name='${tableName}';
      `);
      
      // Get column info
      const columnsResult = await client.execute(`PRAGMA table_info(${tableName});`);
      const columns = columnsResult.rows.map(col => ({
        name: col.name,
        type: col.type,
        notNull: col.notnull === 1,
        defaultValue: col.dflt_value,
        primaryKey: col.pk === 1,
      }));
      
      // Get table data
      const dataResult = await client.execute(`SELECT * FROM ${tableName};`);
      const rows = dataResult.rows.map(row => {
        // Convert row to plain object with proper types
        const obj = {};
        for (const [key, value] of Object.entries(row)) {
          obj[key] = value;
        }
        return obj;
      });
      
      totalRows += rows.length;
      
      exportData.tables[tableName] = {
        schema: {
          sql: schemaResult.rows[0]?.sql || null,
          columns: columns,
        },
        row_count: rows.length,
        data: rows,
      };
      
      console.log(`  ✓ ${rows.length} rows exported`);
    }
    
    // Export indexes
    console.log("Exporting indexes...");
    const indexesResult = await client.execute(`
      SELECT name, tbl_name, sql FROM sqlite_master 
      WHERE type='index' 
      AND sql IS NOT NULL
      ORDER BY name;
    `);
    
    exportData.indexes = indexesResult.rows.map(row => ({
      name: row.name,
      table: row.tbl_name,
      sql: row.sql,
    }));
    
    console.log(`  ✓ ${exportData.indexes.length} indexes exported`);
    
    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `database-export-${timestamp}.json`;
    const filepath = join(process.cwd(), filename);
    
    const jsonString = JSON.stringify(exportData, null, 2);
    writeFileSync(filepath, jsonString, 'utf8');
    
    console.log("~...............................................~");
    console.log(`✓ Database exported successfully!`);
    console.log(`  File: ${filename}`);
    console.log(`  Size: ${(jsonString.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Tables: ${tableNames.length}`);
    console.log(`  Total Rows: ${totalRows.toLocaleString()}`);
    console.log(`  Indexes: ${exportData.indexes.length}`);
    console.log("~...............................................~");
    
  } catch (error) {
    console.error("Error exporting database:", error);
    process.exit(1);
  } finally {
    client.close();
  }
}

downloadDatabase().catch(console.error);

