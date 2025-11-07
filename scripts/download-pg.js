import { config as dotenvConfig } from "dotenv";
import { writeFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

dotenvConfig({ path: ".env.local" });

const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("Error: POSTGRES_URL must be set in .env.local");
  process.exit(1);
}

async function downloadDatabase() {
  console.log("~..................¯\\_(ツ)_/¯..................~");
  console.log("Database Export Script (PostgreSQL -> JSON)");
  console.log("~...............................................~");
  console.log("Connecting to PostgreSQL database...");
  
  const sql = postgres(connectionString, {
    prepare: false,
  });
  
  try {
    // Get all table names (excluding system tables)
    const tablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const tableNames = tablesResult.map(row => row.table_name);
    console.log(`Found ${tableNames.length} tables:`, tableNames);
    
    const exportData = {
      metadata: {
        exported: new Date().toISOString(),
        source: connectionString.replace(/:[^:@]+@/, ':***@'), // Hide password
        database_type: "postgresql",
        table_count: tableNames.length,
      },
      tables: {},
      indexes: [],
    };
    
    let totalRows = 0;
    
    // Export schema and data for each table
    for (const tableName of tableNames) {
      console.log(`Exporting table: ${tableName}`);
      
      // Get column info
      const columnsResult = await sql`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length,
          numeric_precision,
          numeric_scale
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
        ORDER BY ordinal_position;
      `;
      
      const columns = columnsResult.map(col => ({
        name: col.column_name,
        type: col.data_type,
        notNull: col.is_nullable === 'NO',
        defaultValue: col.column_default,
        maxLength: col.character_maximum_length,
        precision: col.numeric_precision,
        scale: col.numeric_scale,
      }));
      
      // Get primary key info
      const pkResult = await sql`
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = ${tableName}::regclass AND i.indisprimary;
      `;
      
      const primaryKeys = pkResult.map(row => row.attname);
      
      // Get table data
      const dataResult = await sql.unsafe(`SELECT * FROM "${tableName}";`);
      const rows = dataResult.map(row => {
        // Convert row to plain object, handling special PostgreSQL types
        const obj = {};
        for (const [key, value] of Object.entries(row)) {
          // Convert BigInt to string for JSON serialization
          if (typeof value === 'bigint') {
            obj[key] = value.toString();
          } else if (value instanceof Date) {
            obj[key] = value.toISOString();
          } else {
            obj[key] = value;
          }
        }
        return obj;
      });
      
      totalRows += rows.length;
      
      exportData.tables[tableName] = {
        schema: {
          columns: columns,
          primaryKeys: primaryKeys,
        },
        row_count: rows.length,
        data: rows,
      };
      
      console.log(`  ✓ ${rows.length} rows exported`);
    }
    
    // Export indexes
    console.log("Exporting indexes...");
    const indexesResult = await sql`
      SELECT
        i.relname as index_name,
        t.relname as table_name,
        pg_get_indexdef(i.oid) as index_definition
      FROM pg_class i
      JOIN pg_index ix ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
      AND t.relkind = 'r'
      AND i.relkind = 'i'
      ORDER BY t.relname, i.relname;
    `;
    
    exportData.indexes = indexesResult.map(row => ({
      name: row.index_name,
      table: row.table_name,
      definition: row.index_definition,
    }));
    
    console.log(`  ✓ ${exportData.indexes.length} indexes exported`);
    
    // Export enum types
    console.log("Exporting enum types...");
    const enumsResult = await sql`
      SELECT
        t.typname as enum_name,
        array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname;
    `;
    
    exportData.enums = enumsResult.map(row => ({
      name: row.enum_name,
      values: row.enum_values,
    }));
    
    console.log(`  ✓ ${exportData.enums.length} enum types exported`);
    
    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `database-pg-export-${timestamp}.json`;
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
    console.log(`  Enums: ${exportData.enums.length}`);
    console.log("~...............................................~");
    
  } catch (error) {
    console.error("Error exporting database:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

downloadDatabase().catch(console.error);

