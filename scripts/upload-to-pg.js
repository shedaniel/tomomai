/**
 * Database Migration Script: SQLite (Turso) → PostgreSQL
 * 
 * This script migrates data from a SQLite/Turso database export (JSON format)
 * to a PostgreSQL database with the following transformations:
 * 
 * 1. Type Conversions:
 *    - INTEGER (0/1) → BOOLEAN (for boolean fields)
 *    - INTEGER (timestamps in seconds) → TIMESTAMP (converted to milliseconds then ISO strings)
 *    - TEXT (enums) → PostgreSQL ENUM types
 *    - TEXT (plaintext tokens) → TEXT (AES-256-GCM encrypted tokens)
 * 
 * 2. ID Optimizations & Remapping:
 *    Dual ID System (bigint auto-increment + varchar(21) publicId nanoid):
 *    - user_snapshots: TEXT → BIGINT + publicId
 *    - songs: TEXT → BIGINT + publicId
 *    - fetch_sessions: TEXT → BIGINT + publicId
 *    
 *    Internal-only bigint (auto-increment):
 *    - user_scores: TEXT → BIGINT
 *    - user_events: TEXT → BIGINT
 *    
 *    UUID auto-generation:
 *    - user_tokens: TEXT (uuid string) → UUID
 *    - invites: TEXT → UUID
 * 
 * 3. Foreign Key Updates:
 *    - user_scores.snapshotId: references new bigint snapshot IDs
 *    - user_scores.songId: references new bigint song IDs
 *    - user_events.snapshotId: references new bigint snapshot IDs
 * 
 * Usage: npm run db:upload-pg <json-export-file>
 */

import { config as dotenvConfig } from "dotenv";
import { readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";
import { nanoid } from "nanoid";
import crypto from "crypto";

dotenvConfig({ path: ".env.local" });

// Error log file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const errorLogFile = join(process.cwd(), `import-errors-${timestamp}.log`);

function logError(message, details = {}) {
  const logEntry = `[${new Date().toISOString()}] ${message}\n${JSON.stringify(details, null, 2)}\n\n`;
  try {
    appendFileSync(errorLogFile, logEntry, 'utf8');
  } catch (err) {
    console.error('Failed to write to error log:', err.message);
  }
}

// Initialize log file
writeFileSync(errorLogFile, `Import Error Log - Started: ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`, 'utf8');

// Token encryption functions (matching src/lib/token-crypto.ts)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey() {
  const secret = process.env.TOKEN_SECRET;
  
  if (!secret) {
    throw new Error('TOKEN_SECRET environment variable is not set');
  }
  
  if (secret.length !== 64) {
    throw new Error('TOKEN_SECRET must be 64 hexadecimal characters (32 bytes)');
  }
  
  return Buffer.from(secret, 'hex');
}

function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encryptedData (all hex encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("Error: POSTGRES_URL must be set in .env.local");
  process.exit(1);
}

// Get filename from command line args
const filename = process.argv[2];
if (!filename) {
  console.error("Usage: node scripts/upload-to-pg.js <json-export-file>");
  console.error("Example: npm run db:upload-pg database-export-2025-11-02T12-31-19.json");
  process.exit(1);
}

// Map old SQLite IDs (text) to new PostgreSQL IDs (bigint)
const snapshotIdMap = new Map();
const songIdMap = new Map();
const fetchSessionIdMap = new Map();

// Track successfully imported user IDs
const importedUserIds = new Set();

// Track successfully imported song IDs
const importedSongIds = new Set();

// Track skip reasons
const skipReasons = {
  missingUser: 0,
  missingSong: 0,
  missingSnapshot: 0,
  other: 0,
};

// Define which fields are timestamps in PostgreSQL (these were INTEGERs in SQLite)
const TIMESTAMP_FIELDS = {
  'user': ['createdAt', 'updatedAt', 'banExpires'],
  'session': ['expiresAt', 'createdAt', 'updatedAt'],
  'account': ['accessTokenExpiresAt', 'refreshTokenExpiresAt', 'createdAt', 'updatedAt'],
  'verification': ['expiresAt', 'createdAt', 'updatedAt'],
  'invites': ['createdAt', 'claimedAt', 'expiresAt'],
  'user_tokens': ['createdAt', 'updatedAt'],
  'fetch_sessions': ['startedAt', 'completedAt'],
  'user_snapshots': ['fetchedAt'],
  'user_events': ['eventPeriodStart', 'eventPeriodEnd'],
  'detailed_scores': ['played'],
};

function transformValue(value, column, tableName) {
  if (value === null || value === undefined) {
    return null;
  }
  
  // Convert SQLite booleans (0/1) to PostgreSQL booleans
  if (column.type === 'INTEGER' && 
      (column.name.toLowerCase().includes('verified') || 
       column.name.toLowerCase().includes('banned') || 
       column.name.toLowerCase().includes('revoked') ||
       column.name.toLowerCase().includes('show') || 
       column.name.toLowerCase().includes('publish'))) {
    return value === 1;
  }
  
  // Convert SQLite timestamps (SECONDS since epoch) to ISO strings for PostgreSQL
  // SQLite stores timestamps as seconds, JavaScript Date expects milliseconds, so multiply by 1000
  const timestampFields = TIMESTAMP_FIELDS[tableName] || [];
  if (timestampFields.includes(column.name)) {
    if (typeof value === 'number') {
      return new Date(value * 1000).toISOString(); // Convert seconds to milliseconds
    }
  }
  
  return value;
}

function transformRow(row, tableData, tableName) {
  const transformed = {};
  let skipRow = false;
  
  for (const [key, value] of Object.entries(row)) {
    const column = tableData.schema.columns.find(c => c.name === key);
    
    // Skip old text IDs for tables that now use auto-increment bigint or auto-generated UUID
    if (key === 'id') {
      if (tableName === 'user_snapshots' || 
          tableName === 'songs' || 
          tableName === 'fetch_sessions' ||
          tableName === 'user_scores' ||
          tableName === 'user_events' ||
          tableName === 'invites' ||          // Skip old nanoid, generate new UUID
          tableName === 'user_tokens') {      // Skip old UUID string, generate new UUID
        // Skip the old ID - PostgreSQL will auto-generate
        continue;
      }
    }
    
    // Check foreign key references to users
    if (key === 'userId' && tableName !== 'user') {
      if (!importedUserIds.has(value)) {
        skipReasons.missingUser++;
        skipRow = true;
        transformed._skipReason = `Missing user: ${value}`;
        break;
      }
    }
    
    // Handle foreign key references to songs (now bigint)
    if (key === 'songId') {
      const newSongId = songIdMap.get(value);
      if (newSongId) {
        transformed[key] = newSongId;
      } else {
        skipReasons.missingSong++;
        skipRow = true;
        transformed._skipReason = `Missing song: ${value}`;
        break;
      }
      continue;
    }
    
    // Handle foreign keys to user_snapshots (bigint)
    if (key === 'snapshotId' && (tableName === 'user_scores' || tableName === 'user_events')) {
      const newId = snapshotIdMap.get(value);
      if (newId) {
        transformed[key] = newId;
      } else {
        skipReasons.missingSnapshot++;
        skipRow = true;
        transformed._skipReason = `Missing snapshot: ${value}`;
        break;
      }
      continue;
    }
    
    transformed[key] = transformValue(value, column || { name: key, type: 'TEXT' }, tableName);
  }
  
  // Return the skip reason if we should skip this row
  if (skipRow) {
    return { _skip: true, _reason: transformed._skipReason || 'Unknown' };
  }
  
  return transformed;
}

async function uploadToPostgres() {
  console.log("~..................¯\\_(ツ)_/¯..................~");
  console.log("Database Import Script (JSON -> PostgreSQL)");
  console.log("~...............................................~");
  console.log(`Reading file: ${filename}`);
  
  const filepath = join(process.cwd(), filename);
  const exportData = JSON.parse(readFileSync(filepath, 'utf8'));
  
  console.log(`Source: ${exportData.metadata.source}`);
  console.log(`Exported: ${exportData.metadata.exported}`);
  console.log(`Tables: ${exportData.metadata.table_count}`);
  
  console.log("~...............................................~");
  console.log("Connecting to PostgreSQL...");
  
  const sql = postgres(connectionString, {
    prepare: false,
  });
  
  try {
    let totalInserted = 0;
    let totalSkipped = 0;
    
    // Import tables in order (respecting foreign key dependencies)
    const importOrder = [
      'user',
      'session',
      'account',
      'verification',
      'invites',
      'user_tokens',
      'user_snapshots',
      'songs',
      'fetch_sessions',
      'user_scores',
      'user_events',
    ];
    
    // Truncate tables in reverse order (to respect FK constraints)
    console.log("Truncating existing tables...");
    const truncateOrder = [...importOrder].reverse();
    for (const tableName of truncateOrder) {
      try {
        await sql.unsafe(`TRUNCATE TABLE "${tableName}" CASCADE`);
        console.log(`  ✓ Truncated ${tableName}`);
      } catch (err) {
        console.log(`  ⚠ Could not truncate ${tableName}: ${err.message}`);
      }
    }
    console.log("~...............................................~");
    
    for (const tableName of importOrder) {
      const tableData = exportData.tables[tableName];
      if (!tableData) {
        console.log(`⚠ Table ${tableName} not found in export, skipping...`);
        continue;
      }
      
      const rows = tableData.data;
      if (rows.length === 0) {
        console.log(`  ${tableName}: 0 rows (empty)`);
        continue;
      }
      
      console.log(`Importing ${tableName}: ${rows.length} rows...`);
      
      // Special handling for user table - track imported user IDs (batched)
      if (tableName === 'user') {
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const batchData = [];
          const batchOriginalIds = [];
          
          for (const row of batch) {
            const transformedRow = transformRow(row, tableData, tableName);
            
            if (!transformedRow || transformedRow._skip) {
              if (transformedRow?._skip) {
                logError(`User ${row.id} skipped during transform`, {
                  userId: row.id,
                  reason: transformedRow._reason,
                  table: 'user'
                });
              }
              totalSkipped++;
              continue;
            }
            
            batchData.push(transformedRow);
            batchOriginalIds.push(row.id);
          }
          
          if (batchData.length > 0) {
            const columns = Object.keys(batchData[0]).filter(k => !k.startsWith('_'));
            const columnNames = columns.map(col => `"${col}"`).join(', ');
            
            // Build multi-row VALUES
            const valueSets = [];
            const allValues = [];
            let paramIndex = 1;
            
            for (const row of batchData) {
              const rowPlaceholders = columns.map(() => `$${paramIndex++}`).join(', ');
              valueSets.push(`(${rowPlaceholders})`);
              allValues.push(...columns.map(col => row[col]));
            }
            
            const query = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${valueSets.join(', ')}`;
            
            try {
              await sql.unsafe(query, allValues);
              batchOriginalIds.forEach(id => importedUserIds.add(id));
              totalInserted += batchData.length;
            } catch (err) {
              logError(`Error inserting user batch (batch size: ${batchData.length})`, {
                error: err.message,
                sqlState: err.code,
                detail: err.detail,
                constraint: err.constraint,
                batchSize: batchData.length
              });
              totalSkipped += batchData.length;
              skipReasons.other += batchData.length;
            }
          }
          
          process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
        }
        
        console.log(`\r  ✓ ${tableName}: ${totalInserted} rows imported, ${totalSkipped} skipped`);
        continue;
      }
      
      // Special handling for songs table - dual ID system (bigint + publicId) - batched
      if (tableName === 'songs') {
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const batchData = [];
          const batchOldIds = [];
          
          for (const row of batch) {
            const oldId = row.id;
            const transformedRow = transformRow(row, tableData, tableName);
            
            if (!transformedRow || transformedRow._skip) {
              logError(`Song ${oldId} skipped during transform`, {
                songId: oldId,
                songName: row.songName,
                difficulty: row.difficulty,
                reason: transformedRow?._reason || 'Unknown reason'
              });
              totalSkipped++;
              continue;
            }
            
            transformedRow.publicId = nanoid();
            batchData.push(transformedRow);
            batchOldIds.push(oldId);
          }
          
          if (batchData.length > 0) {
            const columns = Object.keys(batchData[0]).filter(k => !k.startsWith('_'));
            const columnNames = columns.map(col => `"${col}"`).join(', ');
            
            const valueSets = [];
            const allValues = [];
            let paramIndex = 1;
            
            for (const row of batchData) {
              const rowPlaceholders = columns.map(() => `$${paramIndex++}`).join(', ');
              valueSets.push(`(${rowPlaceholders})`);
              allValues.push(...columns.map(col => row[col]));
            }
            
            const query = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${valueSets.join(', ')} RETURNING id`;
            
            try {
              const result = await sql.unsafe(query, allValues);
              result.forEach((row, idx) => {
                songIdMap.set(batchOldIds[idx], row.id);
                importedSongIds.add(batchOldIds[idx]);
              });
              totalInserted += batchData.length;
            } catch (err) {
              logError(`Error inserting song batch (batch size: ${batchData.length})`, {
                error: err.message,
                sqlState: err.code,
                detail: err.detail,
                constraint: err.constraint,
                batchSize: batchData.length
              });
              totalSkipped += batchData.length;
              skipReasons.other += batchData.length;
            }
          }
          
          process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
        }
        
        console.log(`\r  ✓ ${tableName}: ${totalInserted} rows imported (ID mapping created), ${totalSkipped} skipped`);
        continue;
      }
      
      // Special handling for user_snapshots - need to map old IDs to new IDs (batched)
      if (tableName === 'user_snapshots') {
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const batchData = [];
          const batchOldIds = [];
          
          for (const row of batch) {
            const oldId = row.id;
            const transformedRow = transformRow(row, tableData, tableName);
            
            if (!transformedRow || transformedRow._skip) {
              logError(`Snapshot ${oldId} skipped during transform`, {
                snapshotId: oldId,
                userId: row.userId,
                region: row.region,
                reason: transformedRow?._reason || 'Unknown reason'
              });
              totalSkipped++;
              continue;
            }
            
            transformedRow.publicId = nanoid();
            batchData.push(transformedRow);
            batchOldIds.push(oldId);
          }
          
          if (batchData.length > 0) {
            const columns = Object.keys(batchData[0]).filter(k => !k.startsWith('_'));
            const columnNames = columns.map(col => `"${col}"`).join(', ');
            
            const valueSets = [];
            const allValues = [];
            let paramIndex = 1;
            
            for (const row of batchData) {
              const rowPlaceholders = columns.map(() => `$${paramIndex++}`).join(', ');
              valueSets.push(`(${rowPlaceholders})`);
              allValues.push(...columns.map(col => row[col]));
            }
            
            const query = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${valueSets.join(', ')} RETURNING id`;
            
            try {
              const result = await sql.unsafe(query, allValues);
              result.forEach((row, idx) => {
                snapshotIdMap.set(batchOldIds[idx], row.id);
              });
              totalInserted += batchData.length;
            } catch (err) {
              logError(`Error inserting snapshot batch (batch size: ${batchData.length})`, {
                error: err.message,
                sqlState: err.code,
                detail: err.detail,
                constraint: err.constraint,
                batchSize: batchData.length
              });
              totalSkipped += batchData.length;
              skipReasons.other += batchData.length;
            }
          }
          
          process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
        }
        
        console.log(`\r  ✓ ${tableName}: ${totalInserted} rows imported (ID mapping created), ${totalSkipped} skipped`);
        continue;
      }
      
      // Special handling for fetch_sessions - dual ID system (bigint + publicId) - batched
      if (tableName === 'fetch_sessions') {
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const batchData = [];
          const batchOldIds = [];
          
          for (const row of batch) {
            const oldId = row.id;
            const transformedRow = transformRow(row, tableData, tableName);
            
            if (!transformedRow || transformedRow._skip) {
              logError(`Fetch session ${oldId} skipped during transform`, {
                sessionId: oldId,
                userId: row.userId,
                region: row.region,
                reason: transformedRow?._reason || 'Unknown reason'
              });
              totalSkipped++;
              continue;
            }
            
            transformedRow.publicId = nanoid();
            batchData.push(transformedRow);
            batchOldIds.push(oldId);
          }
          
          if (batchData.length > 0) {
            const columns = Object.keys(batchData[0]).filter(k => !k.startsWith('_'));
            const columnNames = columns.map(col => `"${col}"`).join(', ');
            
            const valueSets = [];
            const allValues = [];
            let paramIndex = 1;
            
            for (const row of batchData) {
              const rowPlaceholders = columns.map(() => `$${paramIndex++}`).join(', ');
              valueSets.push(`(${rowPlaceholders})`);
              allValues.push(...columns.map(col => row[col]));
            }
            
            const query = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${valueSets.join(', ')} RETURNING id`;
            
            try {
              const result = await sql.unsafe(query, allValues);
              result.forEach((row, idx) => {
                fetchSessionIdMap.set(batchOldIds[idx], row.id);
              });
              totalInserted += batchData.length;
            } catch (err) {
              logError(`Error inserting fetch session batch (batch size: ${batchData.length})`, {
                error: err.message,
                sqlState: err.code,
                detail: err.detail,
                constraint: err.constraint,
                batchSize: batchData.length
              });
              totalSkipped += batchData.length;
              skipReasons.other += batchData.length;
            }
          }
          
          process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
        }
        
        console.log(`\r  ✓ ${tableName}: ${totalInserted} rows imported (ID mapping created), ${totalSkipped} skipped`);
        continue;
      }
      
      // Special handling for user_tokens - encrypt tokens before insertion (batched)
      if (tableName === 'user_tokens') {
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const batchData = [];
          
          for (const row of batch) {
            const transformedRow = transformRow(row, tableData, tableName);
            
            if (!transformedRow || transformedRow._skip) {
              logError(`User token skipped during transform`, {
                userId: row.userId,
                region: row.region,
                reason: transformedRow?._reason || 'Unknown reason'
              });
              totalSkipped++;
              continue;
            }
            
            // Encrypt the token before inserting
            if (transformedRow.token) {
              try {
                transformedRow.token = encryptToken(transformedRow.token);
              } catch (err) {
                logError(`Failed to encrypt token`, {
                  userId: row.userId,
                  region: row.region,
                  error: err.message
                });
                totalSkipped++;
                skipReasons.other++;
                continue;
              }
            }
            
            batchData.push(transformedRow);
          }
          
          if (batchData.length > 0) {
            const columns = Object.keys(batchData[0]).filter(k => !k.startsWith('_'));
            const columnNames = columns.map(col => `"${col}"`).join(', ');
            
            const valueSets = [];
            const allValues = [];
            let paramIndex = 1;
            
            for (const row of batchData) {
              const rowPlaceholders = columns.map(() => `$${paramIndex++}`).join(', ');
              valueSets.push(`(${rowPlaceholders})`);
              allValues.push(...columns.map(col => row[col]));
            }
            
            const query = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${valueSets.join(', ')}`;
            
            try {
              await sql.unsafe(query, allValues);
              totalInserted += batchData.length;
            } catch (err) {
              logError(`Error inserting user token batch (batch size: ${batchData.length})`, {
                error: err.message,
                sqlState: err.code,
                detail: err.detail,
                constraint: err.constraint,
                batchSize: batchData.length
              });
              totalSkipped += batchData.length;
              skipReasons.other += batchData.length;
            }
          }
          
          process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
        }
        
        console.log(`\r  ✓ ${tableName}: ${totalInserted} rows imported (tokens encrypted), ${totalSkipped} skipped`);
        continue;
      }
      
      // Regular handling for other tables (batched)
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const batchData = [];
        
        for (const row of batch) {
          const transformedRow = transformRow(row, tableData, tableName);
          
          if (!transformedRow || transformedRow._skip) {
            if (transformedRow?._skip) {
              const reason = transformedRow._reason || 'Unknown';
              logError(`Row skipped in ${tableName}`, {
                table: tableName,
                rowId: row.id || 'N/A',
                reason: reason,
                rowSample: Object.keys(row).slice(0, 3).reduce((obj, key) => {
                  obj[key] = row[key];
                  return obj;
                }, {})
              });
              if (reason.includes('Missing user')) skipReasons.missingUser++;
              else if (reason.includes('Missing song')) skipReasons.missingSong++;
              else if (reason.includes('Missing snapshot')) skipReasons.missingSnapshot++;
              else skipReasons.other++;
            }
            totalSkipped++;
            continue;
          }
          
          batchData.push(transformedRow);
        }
        
        if (batchData.length > 0) {
          const columns = Object.keys(batchData[0]).filter(k => !k.startsWith('_'));
          const columnNames = columns.map(col => `"${col}"`).join(', ');
          
          const valueSets = [];
          const allValues = [];
          let paramIndex = 1;
          
          for (const row of batchData) {
            const rowPlaceholders = columns.map(() => `$${paramIndex++}`).join(', ');
            valueSets.push(`(${rowPlaceholders})`);
            allValues.push(...columns.map(col => row[col]));
          }
          
          const query = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${valueSets.join(', ')}`;
          
          try {
            await sql.unsafe(query, allValues);
            totalInserted += batchData.length;
          } catch (err) {
            logError(`Error inserting batch into ${tableName} (batch size: ${batchData.length})`, {
              table: tableName,
              error: err.message,
              sqlState: err.code,
              detail: err.detail,
              constraint: err.constraint,
              batchSize: batchData.length
            });
            totalSkipped += batchData.length;
            skipReasons.other += batchData.length;
          }
        }
        
        process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
      }
      
      console.log(`\r  ✓ ${tableName}: ${totalInserted} rows imported${totalSkipped > 0 ? `, ${totalSkipped} skipped` : ''}`);
    }
    
    console.log("~...............................................~");
    console.log(`✓ Database import completed!`);
    console.log(`  Total rows inserted: ${totalInserted.toLocaleString()}`);
    console.log(`  Total rows skipped: ${totalSkipped.toLocaleString()}`);
    console.log(`  Users imported: ${importedUserIds.size.toLocaleString()}`);
    console.log(`  Songs imported: ${importedSongIds.size.toLocaleString()}`);
    console.log(`  Snapshot IDs mapped: ${snapshotIdMap.size.toLocaleString()}`);
    console.log(`  Song IDs mapped: ${songIdMap.size.toLocaleString()}`);
    console.log(`  Fetch Session IDs mapped: ${fetchSessionIdMap.size.toLocaleString()}`);
    console.log("~...............................................~");
    
    if (totalSkipped > 0) {
      console.log(`\n⚠️  Warning: ${totalSkipped} rows were skipped.`);
      console.log(`\nSkip reasons breakdown:`);
      console.log(`  Missing user references: ${skipReasons.missingUser.toLocaleString()}`);
      console.log(`  Missing song references: ${skipReasons.missingSong.toLocaleString()}`);
      console.log(`  Missing snapshot references: ${skipReasons.missingSnapshot.toLocaleString()}`);
      console.log(`  Other errors: ${skipReasons.other.toLocaleString()}`);
      
      console.log(`\n📄 Detailed error log saved to: ${errorLogFile}`);
      
      if (skipReasons.missingUser > 0) {
        console.log(`\n💡 Missing users likely failed to import due to constraint violations.`);
        console.log(`   Check the error log for details on which users failed and why.`);
      }
      if (skipReasons.missingSong > 0) {
        console.log(`💡 Missing songs likely failed to import due to constraint violations.`);
        console.log(`   Check the error log for details on which songs failed and why.`);
      }
      if (skipReasons.missingSnapshot > 0) {
        console.log(`💡 Missing snapshots likely failed to import due to constraint violations.`);
        console.log(`   Check the error log for details on which snapshots failed and why.`);
      }
    } else {
      console.log(`\n✅ No errors! All rows imported successfully.`);
    }
    
  } catch (error) {
    console.error("Error importing database:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

uploadToPostgres().catch(console.error);

