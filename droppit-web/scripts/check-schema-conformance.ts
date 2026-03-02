/**
 * Schema Conformance Check
 *
 * Lightweight script that verifies every column referenced in API routes
 * exists in the canonical schema definition (supabase/schema.sql).
 *
 * Usage:
 *   npx tsx scripts/check-schema-conformance.ts
 *
 * Exit code 0 = all columns accounted for.
 * Exit code 1 = drift detected (missing columns).
 *
 * How it works:
 * 1. Parses supabase/schema.sql to extract CREATE TABLE definitions
 *    and their columns.
 * 2. Scans all .ts/.tsx files under src/app/api/ for Supabase client
 *    patterns (.from('table').select/insert/update/eq etc.) to extract
 *    column name references.
 * 3. Reports any column used in code but missing from schema.sql.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Config ──────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'supabase', 'schema.sql');
const API_DIR = path.join(ROOT, 'src', 'app', 'api');

// Known dynamic/computed keys that are NOT real column names
const IGNORED_KEYS = new Set([
    '*',           // SELECT *
    'id',          // implicit UUID PK handled by gen_random_uuid()
    'count',       // Supabase aggregate
    'exact',       // Supabase { count: 'exact' }
    'head',        // Supabase { head: true }
]);

// ── 1. Parse Schema ─────────────────────────────────────────

interface TableSchema {
    columns: Set<string>;
}

function parseSchema(schemaContent: string): Map<string, TableSchema> {
    const tables = new Map<string, TableSchema>();

    // Match CREATE TABLE blocks
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\);/gi;
    let match: RegExpExecArray | null;

    while ((match = createTableRegex.exec(schemaContent)) !== null) {
        const tableName = match[1];
        const body = match[2];
        const columns = new Set<string>();

        // Extract column names: lines starting with a column name definition
        // Skip lines that are constraints, comments, or indexes
        const lines = body.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty, comments, constraints
            if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('CONSTRAINT')) continue;

            // Match: column_name TYPE ...
            const colMatch = trimmed.match(/^(\w+)\s+(?:UUID|TEXT|INTEGER|BIGINT|BOOLEAN|NUMERIC|TIMESTAMP|JSONB|VARCHAR)/i);
            if (colMatch) {
                columns.add(colMatch[1].toLowerCase());
            }
        }

        tables.set(tableName, { columns });
    }

    return tables;
}

// ── 2. Scan API Routes ──────────────────────────────────────

interface ColumnRef {
    table: string;
    column: string;
    file: string;
    line: number;
}

function getAllTsFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getAllTsFiles(fullPath));
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            results.push(fullPath);
        }
    }
    return results;
}

function extractColumnRefs(files: string[]): ColumnRef[] {
    const refs: ColumnRef[] = [];

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        let currentTable: string | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Track .from('tableName') to know which table we're operating on
            const fromMatch = line.match(/\.from\(\s*['"](\w+)['"]\s*\)/);
            if (fromMatch) {
                currentTable = fromMatch[1];
            }

            if (!currentTable) continue;

            // Pattern 1: .select('col1, col2, col3')
            const selectMatch = line.match(/\.select\(\s*['"]([^'"]+)['"]/);
            if (selectMatch) {
                const cols = selectMatch[1].split(',').map(c => c.trim());
                for (const col of cols) {
                    // Handle 'col1 col2' aliasing or aggregate oddities — just take the first word
                    const colName = col.split(/\s+/)[0].toLowerCase();
                    if (colName && !IGNORED_KEYS.has(colName)) {
                        refs.push({ table: currentTable, column: colName, file, line: i + 1 });
                    }
                }
            }

            // Pattern 2: .eq('column', value) / .neq / .not('column', ...)
            const eqMatch = line.match(/\.(?:eq|neq|not|lt|gt|lte|gte|is)\(\s*['"](\w+)['"]/);
            if (eqMatch) {
                const colName = eqMatch[1].toLowerCase();
                if (!IGNORED_KEYS.has(colName)) {
                    refs.push({ table: currentTable, column: colName, file, line: i + 1 });
                }
            }

            // Pattern 3: .insert({ col1: val, col2: val }) and .update({ col1: val })
            const insertUpdateMatch = line.match(/\.(insert|update)\(\s*\{/);
            if (insertUpdateMatch) {
                // Scan forward to find all keys in the object literal
                let braceDepth = 0;
                let started = false;
                for (let j = i; j < Math.min(i + 30, lines.length); j++) {
                    const scanLine = lines[j];
                    for (let k = 0; k < scanLine.length; k++) {
                        if (scanLine[k] === '{') { braceDepth++; started = true; }
                        if (scanLine[k] === '}') braceDepth--;
                    }

                    // Extract key: value patterns
                    const keyMatches = scanLine.matchAll(/(\w+)\s*:/g);
                    for (const km of keyMatches) {
                        const key = km[1].toLowerCase();
                        // Skip JS keywords and non-column patterns
                        if (['const', 'let', 'var', 'return', 'if', 'else', 'async', 'await', 'method', 'headers', 'body', 'status_code', 'action'].includes(key)) continue;
                        if (!IGNORED_KEYS.has(key)) {
                            refs.push({ table: currentTable, column: key, file, line: j + 1 });
                        }
                    }

                    if (started && braceDepth <= 0) break;
                }
            }

            // Reset table context at function boundaries
            if (line.match(/^(export\s+)?(async\s+)?function\s/)) {
                currentTable = null;
            }
        }
    }

    return refs;
}

// ── 3. Check Conformance ────────────────────────────────────

function main() {
    console.log('Schema Conformance Check');
    console.log('========================\n');

    // Parse schema
    if (!fs.existsSync(SCHEMA_PATH)) {
        console.error(`❌ Schema file not found: ${SCHEMA_PATH}`);
        process.exit(1);
    }

    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    const tables = parseSchema(schemaContent);

    console.log('📋 Schema tables found:');
    for (const [name, schema] of tables) {
        console.log(`   ${name}: [${[...schema.columns].join(', ')}]`);
    }
    console.log();

    // Scan API routes
    const apiFiles = getAllTsFiles(API_DIR);
    console.log(`🔍 Scanning ${apiFiles.length} API route files...\n`);

    const refs = extractColumnRefs(apiFiles);

    // Deduplicate
    const uniqueRefs = new Map<string, ColumnRef>();
    for (const ref of refs) {
        const key = `${ref.table}.${ref.column}`;
        if (!uniqueRefs.has(key)) {
            uniqueRefs.set(key, ref);
        }
    }

    // Check each reference against schema
    const missing: { key: string; ref: ColumnRef }[] = [];
    const verified: string[] = [];

    for (const [key, ref] of uniqueRefs) {
        const tableSchema = tables.get(ref.table);
        if (!tableSchema) {
            // Table not in schema — might be a non-drops table handled differently
            // Only warn, don't fail
            console.log(`   ⚠️  Table '${ref.table}' not in schema.sql (used at ${path.relative(ROOT, ref.file)}:${ref.line})`);
            continue;
        }

        if (!tableSchema.columns.has(ref.column)) {
            missing.push({ key, ref });
        } else {
            verified.push(key);
        }
    }

    // Report
    console.log(`✅ Verified: ${verified.length} column references match schema`);

    if (missing.length > 0) {
        console.log(`\n❌ DRIFT DETECTED: ${missing.length} column(s) used in code but missing from schema.sql:\n`);
        for (const { key, ref } of missing) {
            const relPath = path.relative(ROOT, ref.file);
            console.log(`   ✗ ${key}`);
            console.log(`     Used at: ${relPath}:${ref.line}`);
        }
        console.log('\nFix: Add the missing columns to supabase/schema.sql and create a forward migration.');
        process.exit(1);
    }

    console.log('\n🎉 All column references conform to schema.sql\n');
    process.exit(0);
}

main();
