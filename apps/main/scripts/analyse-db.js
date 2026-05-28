import { config as dotenvConfig } from "dotenv";
import postgres from "postgres";

dotenvConfig({ path: ".env.local" });

const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("Error: POSTGRES_URL must be set in .env.local");
  process.exit(1);
}

/**
 * Estimate the byte size of a JavaScript value
 */
function estimateSize(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  
  const type = typeof value;
  
  if (type === 'boolean') {
    return 1;
  }
  
  if (type === 'number') {
    return 8; // Double precision
  }
  
  if (type === 'bigint') {
    return 8;
  }
  
  if (type === 'string') {
    // UTF-8 encoding: most chars are 1 byte, some are 2-4
    // Rough estimate: average 1.5 bytes per character for mixed content
    return value.length * 1.5;
  }
  
  if (value instanceof Date) {
    return 8; // Timestamp
  }
  
  if (type === 'object') {
    // JSON object/array
    return JSON.stringify(value).length;
  }
  
  return 0;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Analyze a table
 */
async function analyzeTable(sql, tableName) {
  // Get total row count
  const countResult = await sql.unsafe(`SELECT COUNT(*) as count FROM "${tableName}";`);
  const totalRows = parseInt(countResult[0].count);
  
  if (totalRows === 0) {
    return {
      tableName,
      totalRows: 0,
      sampledRows: 0,
      estimatedTotalSize: 0,
      avgRowSize: 0,
      columns: {},
    };
  }
  
  // Get sample data (first 2500 rows)
  const sampleSize = Math.min(2500, totalRows);
  const sampleResult = await sql.unsafe(`SELECT * FROM "${tableName}" LIMIT ${sampleSize};`);
  const sampleRows = sampleResult;
  
  // Get column info
  const columnsResult = await sql`
    SELECT 
      column_name,
      data_type,
      character_maximum_length
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = ${tableName}
    ORDER BY ordinal_position;
  `;
  
  // Initialize column stats
  const columnStats = {};
  for (const col of columnsResult) {
    columnStats[col.column_name] = {
      dataType: col.data_type,
      maxLength: col.character_maximum_length,
      totalSize: 0,
      avgSize: 0,
      nullCount: 0,
    };
  }
  
  // Analyze sample rows
  let totalRowSize = 0;
  
  for (const row of sampleRows) {
    let rowSize = 0;
    
    for (const [colName, value] of Object.entries(row)) {
      const size = estimateSize(value);
      columnStats[colName].totalSize += size;
      rowSize += size;
      
      if (value === null) {
        columnStats[colName].nullCount++;
      }
    }
    
    totalRowSize += rowSize;
  }
  
  // Calculate averages and percentages
  const avgRowSize = totalRowSize / sampleRows.length;
  const estimatedTotalSize = avgRowSize * totalRows;
  
  for (const colName in columnStats) {
    const stats = columnStats[colName];
    stats.avgSize = stats.totalSize / sampleRows.length;
    stats.percentage = totalRowSize > 0 ? (stats.totalSize / totalRowSize * 100) : 0;
    stats.nullPercentage = (stats.nullCount / sampleRows.length * 100);
  }
  
  return {
    tableName,
    totalRows,
    sampledRows: sampleRows.length,
    estimatedTotalSize,
    avgRowSize,
    columns: columnStats,
  };
}

async function analyzeDatabase() {
  console.log("~..................¯\\_(ツ)_/¯..................~");
  console.log("Database Size Analysis Tool");
  console.log("~...............................................~");
  console.log("Connecting to PostgreSQL database...");
  
  const sql = postgres(connectionString, {
    prepare: false,
  });
  
  try {
    // Get all table names
    const tablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const tableNames = tablesResult.map(row => row.table_name);
    console.log(`Found ${tableNames.length} tables\n`);
    
    const allResults = [];
    let grandTotalSize = 0;
    
    // Analyze each table
    for (const tableName of tableNames) {
      console.log(`Analyzing table: ${tableName}...`);
      const result = await analyzeTable(sql, tableName);
      allResults.push(result);
      grandTotalSize += result.estimatedTotalSize;
      
      if (result.totalRows > 0) {
        console.log(`  Rows: ${result.totalRows.toLocaleString()} | Avg row: ${formatBytes(result.avgRowSize)} | Est. total: ${formatBytes(result.estimatedTotalSize)}`);
      } else {
        console.log(`  (empty table)`);
      }
    }
    
    console.log("\n~...............................................~");
    console.log("SUMMARY BY TABLE");
    console.log("~...............................................~\n");
    
    // Sort by estimated size
    allResults.sort((a, b) => b.estimatedTotalSize - a.estimatedTotalSize);
    
    for (const result of allResults) {
      if (result.totalRows === 0) continue;
      
      const percentage = (result.estimatedTotalSize / grandTotalSize * 100).toFixed(1);
      console.log(`📊 ${result.tableName}`);
      console.log(`   Rows: ${result.totalRows.toLocaleString()}`);
      console.log(`   Size: ${formatBytes(result.estimatedTotalSize)} (${percentage}% of total)`);
      console.log(`   Avg row: ${formatBytes(result.avgRowSize)}`);
      console.log(``);
    }
    
    console.log("~...............................................~");
    console.log("COLUMN ANALYSIS (Top Space Consumers)");
    console.log("~...............................................~\n");
    
    for (const result of allResults) {
      if (result.totalRows === 0) continue;
      
      console.log(`\n📋 Table: ${result.tableName}`);
      
      // Sort columns by size
      const sortedColumns = Object.entries(result.columns)
        .sort((a, b) => b[1].avgSize - a[1].avgSize)
        .slice(0, 10); // Top 10 columns
      
      console.log(`${'Column'.padEnd(30)} ${'Type'.padEnd(20)} ${'Avg Size'.padEnd(12)} ${'% of Row'.padEnd(10)} ${'Null %'.padEnd(10)}`);
      console.log('─'.repeat(92));
      
      for (const [colName, stats] of sortedColumns) {
        const colDisplay = colName.length > 28 ? colName.slice(0, 25) + '...' : colName;
        const typeDisplay = stats.dataType.length > 18 ? stats.dataType.slice(0, 15) + '...' : stats.dataType;
        const sizeDisplay = formatBytes(stats.avgSize);
        const percentDisplay = `${stats.percentage.toFixed(1)}%`;
        const nullDisplay = `${stats.nullPercentage.toFixed(0)}%`;
        
        console.log(
          `${colDisplay.padEnd(30)} ${typeDisplay.padEnd(20)} ${sizeDisplay.padEnd(12)} ${percentDisplay.padEnd(10)} ${nullDisplay.padEnd(10)}`
        );
      }
    }
    
    console.log("\n~...............................................~");
    console.log("GRAND TOTAL");
    console.log("~...............................................~");
    console.log(`Estimated database size: ${formatBytes(grandTotalSize)}`);
    console.log(`Total rows across all tables: ${allResults.reduce((sum, r) => sum + r.totalRows, 0).toLocaleString()}`);
    console.log("~...............................................~");
    
    console.log("\n💡 Note: Sizes are estimated based on sampling up to 2500 rows per table.");
    console.log("   Actual PostgreSQL storage includes indexes, TOAST tables, and internal overhead.");
    
  } catch (error) {
    console.error("Error analyzing database:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

analyzeDatabase().catch(console.error);

