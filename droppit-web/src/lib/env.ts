/**
 * Required environment variables check at boot-time.
 * If any of these are missing, the application will not function securely or correctly.
 * We throw errors early so deployments fail fast instead of failing silently at runtime.
 */

const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'PINATA_JWT',
    'NEXT_PUBLIC_GATEWAY_URL',
    'NEYNAR_API_KEY',
    'LOCKED_CONTENT_ENCRYPTION_KEY',
    'NEXT_PUBLIC_ENVIRONMENT'
] as const;

export function validateEnvironment() {
    const missing: string[] = [];

    for (const v of requiredVars) {
        if (!process.env[v]) {
            missing.push(v);
        }
    }

    if (missing.length > 0) {
        const errorMsg = `\x1b[31m[Critical] Missing required environment variables:\n${missing.map(m => ` - ${m}`).join('\n')}\x1b[0m`;
        console.error(errorMsg);

        // Throwing an error ensures Next.js build or boot fails immediately.
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate encryption key length specifically (AES-256-GCM requires 32 bytes / 64 hex chars)
    if (process.env.LOCKED_CONTENT_ENCRYPTION_KEY && process.env.LOCKED_CONTENT_ENCRYPTION_KEY.length !== 64) {
        throw new Error(`LOCKED_CONTENT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters long.`);
    }

    console.log(`\x1b[32m[Startup] Environment variables validated successfully.\x1b[0m`);
}
