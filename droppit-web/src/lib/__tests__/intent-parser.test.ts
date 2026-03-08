import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the agent module to avoid actual LLM calls ────────────
// We control what the structuredLlm.invoke returns per test.
let mockLlmResponse: Record<string, unknown> = {};

vi.mock('@/lib/farcaster-parser', () => ({
    initializeFarcasterParser: vi.fn().mockResolvedValue({
        structuredLlm: {
            invoke: vi.fn().mockImplementation(() => Promise.resolve(mockLlmResponse)),
        },
    }),
}));

import { parseDeployIntent } from '@/lib/intent-parser';

function setLlmResponse(response: Record<string, unknown>) {
    mockLlmResponse = response;
}

describe('parseDeployIntent', () => {
    beforeEach(() => {
        mockLlmResponse = {};
    });

    // ── Missing / Not Ready ──────────────────────────────────

    it('fails when isReady is false', async () => {
        setLlmResponse({ isReady: false, title: 'Test' });
        const result = await parseDeployIntent('@droppit make a drop');
        expect(result.success).toBe(false);
        expect(result.error).toContain('enough context');
    });

    it('fails when title is missing', async () => {
        setLlmResponse({ isReady: true, title: '', editionSize: 100, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit make a drop');
        expect(result.success).toBe(false);
        // Either "enough context" (empty title triggers !dropIntent.title) or validation error
        expect(result.error).toBeDefined();
    });

    it('fails when title is null', async () => {
        setLlmResponse({ isReady: true, title: null, editionSize: 100, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit make a drop');
        expect(result.success).toBe(false);
    });

    // ── Edition Size ─────────────────────────────────────────

    it('fails when editionSize is missing (undefined)', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', mintPrice: 0 });
        const result = await parseDeployIntent('@droppit Cool Drop 0 ETH');
        expect(result.success).toBe(false);
        expect(result.error).toContain('editionSize');
        expect(result.error).toContain('required');
    });

    it('fails when editionSize is null', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: null, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit Cool Drop 0 ETH');
        expect(result.success).toBe(false);
        expect(result.error).toContain('editionSize');
    });

    it('fails when editionSize is 0 (below minimum)', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 0, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit Cool Drop 0x 0 ETH');
        expect(result.success).toBe(false);
        expect(result.error).toContain('editionSize');
    });

    it('fails when editionSize is negative', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: -5, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit Cool Drop -5x 0 ETH');
        expect(result.success).toBe(false);
        expect(result.error).toContain('editionSize');
    });

    it('fails when editionSize exceeds 10,000', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 10001, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit 10001 editions');
        expect(result.success).toBe(false);
        expect(result.error).toContain('editionSize');
        expect(result.error).toContain('10001');
    });

    it('fails when editionSize is a float', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 50.5, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit 50.5 editions');
        expect(result.success).toBe(false);
        expect(result.error).toContain('editionSize');
    });

    it('does NOT silently fall back to 100 on invalid editionSize', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: -1, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit test');
        expect(result.success).toBe(false);
        // Critically: must NOT return success with editionSize: 100
        expect(result.editionSize).toBeUndefined();
    });

    // ── Mint Price ───────────────────────────────────────────

    it('fails when mintPrice is missing (undefined)', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 100 });
        const result = await parseDeployIntent('@droppit Cool Drop 100x');
        expect(result.success).toBe(false);
        expect(result.error).toContain('mintPrice');
        expect(result.error).toContain('required');
    });

    it('fails when mintPrice is null', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 100, mintPrice: null });
        const result = await parseDeployIntent('@droppit Cool Drop 100x');
        expect(result.success).toBe(false);
        expect(result.error).toContain('mintPrice');
    });

    it('fails when mintPrice is negative', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 100, mintPrice: -1 });
        const result = await parseDeployIntent('@droppit Cool Drop 100x -1 ETH');
        expect(result.success).toBe(false);
        expect(result.error).toContain('mintPrice');
    });

    it('does NOT silently fall back to "0" on invalid mintPrice', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 100, mintPrice: -5 });
        const result = await parseDeployIntent('@droppit test');
        expect(result.success).toBe(false);
        // Critically: must NOT return success with mintPrice: "0"
        expect(result.mintPrice).toBeUndefined();
    });

    // ── Malformed Price Strings ──────────────────────────────

    it('succeeds when mintPrice is a decimal (parsed into valid wei string)', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 100, mintPrice: 0.05 });
        const result = await parseDeployIntent('@droppit 0.05 ETH');
        expect(result.success).toBe(true);
        expect(result.mintPrice).toBe('50000000000000000');
    });

    // ── Valid Intents ────────────────────────────────────────

    it('succeeds with all valid fields', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 100, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit Cool Drop 100x free');
        expect(result.success).toBe(true);
        expect(result.title).toBe('Cool Drop');
        expect(result.editionSize).toBe(100);
        expect(result.mintPrice).toBe('0');
    });

    it('succeeds with valid fields and assetUri', async () => {
        setLlmResponse({
            isReady: true,
            title: 'Art Piece',
            editionSize: 50,
            mintPrice: 1000000000000000,
            assetUri: 'ipfs://QmTest123'
        });
        const result = await parseDeployIntent('@droppit Art Piece 50x 0.001 ETH ipfs://QmTest123');
        expect(result.success).toBe(true);
        expect(result.title).toBe('Art Piece');
        expect(result.editionSize).toBe(50);
        expect(result.mintPrice).toBe('1000000000000000');
        expect(result.assetUri).toBe('ipfs://QmTest123');
    });

    it('succeeds with editionSize at boundary (1)', async () => {
        setLlmResponse({ isReady: true, title: 'Rare', editionSize: 1, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit 1/1 free');
        expect(result.success).toBe(true);
        expect(result.editionSize).toBe(1);
    });

    it('succeeds with editionSize at boundary (10000)', async () => {
        setLlmResponse({ isReady: true, title: 'Mass', editionSize: 10000, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit 10000 editions free');
        expect(result.success).toBe(true);
        expect(result.editionSize).toBe(10000);
    });

    // ── Error message quality ────────────────────────────────

    it('includes the invalid value in the error message for editionSize', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 99999, mintPrice: 0 });
        const result = await parseDeployIntent('@droppit test');
        expect(result.success).toBe(false);
        expect(result.error).toContain('99999');
    });

    it('includes the invalid value in the error message for mintPrice', async () => {
        setLlmResponse({ isReady: true, title: 'Cool Drop', editionSize: 100, mintPrice: -42 });
        const result = await parseDeployIntent('@droppit test');
        expect(result.success).toBe(false);
        expect(result.error).toContain('-42');
    });
});

