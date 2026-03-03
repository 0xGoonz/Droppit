import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(__dirname, '../src');

let pass = true;

function check(name: string, condition: boolean, errorMsg: string) {
    if (condition) {
        console.log(`✅ [PASS] ${name}`);
    } else {
        console.error(`❌ [FAIL] ${name}: ${errorMsg}`);
        pass = false;
    }
}

function checkFileContents(filePath: string, searchPattern: string | RegExp, name: string, errorMsg: string) {
    const fullPath = path.join(SRC_DIR, filePath);
    if (!fs.existsSync(fullPath)) {
        check(name, false, `File not found: ${filePath}`);
        return;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    const match = typeof searchPattern === 'string' ? content.includes(searchPattern) : searchPattern.test(content);
    check(name, match, errorMsg);
}

function checkFileExists(filePath: string, name: string) {
    const fullPath = path.join(SRC_DIR, filePath);
    check(name, fs.existsSync(fullPath), `Endpoint missing: ${filePath}`);
}

function checkFileNotExists(filePath: string, name: string) {
    const fullPath = path.join(SRC_DIR, filePath);
    check(name, !fs.existsSync(fullPath), `Policy violation: ${filePath} exists`);
}

console.log('Running Spec Conformance Checks...\n');

// 1. Edition bounds constants
checkFileContents(
    'lib/validation/drops.ts',
    /n < 1 \|\| n > 10_?000/,
    'Edition bounds (1 to 10,000)',
    'Edition bounds not found or altered in src/lib/validation/drops.ts'
);

// 2. Protocol fee default constant
checkFileContents(
    'lib/contracts.ts',
    /PROTOCOL_FEE_PER_MINT_WEI\s*=\s*BigInt\(['"]100000000000000['"]\);/,
    'Protocol Fee Constant (0.0001 ETH)',
    'Protocol fee is not exactly BigInt("100000000000000") in src/lib/contracts.ts'
);

// 3. Frame chain ID
checkFileContents(
    'app/api/frame/drop/[contractAddress]/mint/route.ts',
    /FRAME_MVP_CHAIN_ID\s*=\s*["']eip155:8453["']/,
    'Frame MVP Chain ID (eip155:8453)',
    'Frame chain ID not set to eip155:8453 in frame route'
);

// 4. Required endpoints present
checkFileExists('app/api/drop/locked/route.ts', 'Endpoint: Locked Content Unlock');
checkFileExists('app/api/drop/locked/nonce/route.ts', 'Endpoint: Locked Content Nonce Challenge');
checkFileExists('app/api/stats/[contractAddress]/route.ts', 'Endpoint: Drop Stats View');
checkFileExists('app/api/stats/auth/nonce/route.ts', 'Endpoint: Drop Stats Auth Nonce Challenge');

// 5. No public gallery route marker
checkFileNotExists('app/gallery', 'No Public Gallery Route (Anti-goal)');

if (!pass) {
    console.error('\nConformance checks failed. Please fix the above issues.');
    process.exit(1);
} else {
    console.log('\nAll spec conformance checks passed! 🎉');
}
