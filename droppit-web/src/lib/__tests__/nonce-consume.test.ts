import { describe, expect, it } from "vitest";
import { consumeNonceOnce } from "@/lib/nonce-consume";

type NonceRow = {
    id: string;
    nonce: string;
    wallet: string;
    action: string;
    chain_id: string;
    drop_id: string | null;
    drop_contract: string | null;
    used: boolean;
    expires_at: string;
};

type Predicate = (row: NonceRow) => boolean;

class FakeNonceQuery {
    private predicates: Predicate[] = [];

    constructor(
        private readonly rows: NonceRow[],
        private readonly updateValues: { used: boolean }
    ) { }

    eq(column: string, value: string | boolean): FakeNonceQuery {
        this.predicates.push((row) => String((row as Record<string, unknown>)[column]) === String(value));
        return this;
    }

    gt(column: string, value: string): FakeNonceQuery {
        this.predicates.push((row) => {
            const rowValue = (row as Record<string, unknown>)[column];
            return typeof rowValue === "string" && rowValue > value;
        });
        return this;
    }

    select(columns: string): { maybeSingle: () => Promise<{ data: { id: string } | null; error: null }> } {
        void columns;
        return {
            maybeSingle: async () => {
                const matchedRow = this.rows.find((row) => this.predicates.every((predicate) => predicate(row)));
                if (!matchedRow) return { data: null, error: null };
                Object.assign(matchedRow, this.updateValues);
                return { data: { id: matchedRow.id }, error: null };
            },
        };
    }
}

function createFakeClient(rows: NonceRow[]) {
    return {
        from: (table: "nonces") => {
            if (table !== "nonces") {
                throw new Error("Unsupported table");
            }
            return {
                update: (values: { used: boolean }) => new FakeNonceQuery(rows, values),
            };
        },
    };
}

describe("consumeNonceOnce", () => {
    it("consumes a nonce once when all contextual fields match", async () => {
        const row: NonceRow = {
            id: "nonce-1",
            nonce: "signed-message-1",
            wallet: "0xabc",
            action: "unlock",
            chain_id: "84532",
            drop_id: null,
            drop_contract: "0xdrop",
            used: false,
            expires_at: "2099-01-01T00:00:00.000Z",
        };
        const fakeClient = createFakeClient([row]);

        const consumed = await consumeNonceOnce(fakeClient, {
            id: row.id,
            nonce: row.nonce,
            wallet: row.wallet,
            action: row.action,
            chainId: row.chain_id,
            dropContract: row.drop_contract,
            nowIso: "2026-01-01T00:00:00.000Z",
        });

        expect(consumed).toEqual({ id: row.id });
        expect(row.used).toBe(true);
    });

    it("allows only one successful consume under concurrent attempts", async () => {
        const row: NonceRow = {
            id: "nonce-2",
            nonce: "signed-message-2",
            wallet: "0xdef",
            action: "identity_link",
            chain_id: "84532",
            drop_id: null,
            drop_contract: null,
            used: false,
            expires_at: "2099-01-01T00:00:00.000Z",
        };
        const fakeClient = createFakeClient([row]);

        const input = {
            id: row.id,
            nonce: row.nonce,
            wallet: row.wallet,
            action: row.action,
            chainId: row.chain_id,
            nowIso: "2026-01-01T00:00:00.000Z",
        };

        const [first, second] = await Promise.all([
            consumeNonceOnce(fakeClient, input),
            consumeNonceOnce(fakeClient, input),
        ]);

        const successCount = [first, second].filter((result) => result !== null).length;
        expect(successCount).toBe(1);
        expect(row.used).toBe(true);
    });

    it("rejects consume when contextual fields do not match", async () => {
        const row: NonceRow = {
            id: "nonce-3",
            nonce: "signed-message-3",
            wallet: "0x123",
            action: "unlock",
            chain_id: "84532",
            drop_id: null,
            drop_contract: "0xexpected",
            used: false,
            expires_at: "2099-01-01T00:00:00.000Z",
        };
        const fakeClient = createFakeClient([row]);

        const consumed = await consumeNonceOnce(fakeClient, {
            id: row.id,
            nonce: row.nonce,
            wallet: row.wallet,
            action: row.action,
            chainId: row.chain_id,
            dropContract: "0xdifferent",
            nowIso: "2026-01-01T00:00:00.000Z",
        });

        expect(consumed).toBeNull();
        expect(row.used).toBe(false);
    });
});
