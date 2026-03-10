import { validateLockedContent } from "@/lib/validation/drops";
import { describe, it, expect } from "vitest";

describe("validateLockedContent", () => {
    const EXPECTED_URL_ERROR = "URLs and links are strictly prohibited in locked content for security reasons.";
    const EXPECTED_LENGTH_ERROR = "Locked content exceeds 1000 characters maximum.";

    it("accepts valid, safe locked content", () => {
        expect(validateLockedContent("the secret code is 1234").valid).toBe(true);
        expect(validateLockedContent("some text here").valid).toBe(true);
    });

    it("handles null/undefined/empty gracefully", () => {
        expect(validateLockedContent("").valid).toBe(true);
        expect((validateLockedContent("") as any).value).toBe(null);
        expect((validateLockedContent(null) as any).value).toBe(null);
        expect((validateLockedContent(undefined) as any).value).toBe(null);
    });

    it("rejects content exceeding 1000 characters", () => {
        const longText = "a".repeat(1001);
        const res = validateLockedContent(longText);
        expect(res.valid).toBe(false);
        if (!res.valid) {
            expect(res.error).toBe(EXPECTED_LENGTH_ERROR);
        }
    });

    it("rejects scheme URLs", () => {
        const schemes = [
            "visit http://example.com please",
            "https://test.com",
            "ftp://files.example.com/download",
            "custom://link",
            "check out HtTp://mixedcase.com"
        ];

        schemes.forEach(text => {
            const res = validateLockedContent(text);
            expect(res.valid).toBe(false);
            if (!res.valid) {
                expect(res.error).toBe(EXPECTED_URL_ERROR);
            }
        });
    });

    it("rejects bare domains", () => {
        const domains = [
            "go to example.com",
            "sub.domain.org is cool",
            "this-is-a.test.net right?",
            "www.website.co.uk",
        ];

        domains.forEach(text => {
            const res = validateLockedContent(text);
            expect(res.valid).toBe(false);
            if (!res.valid) {
                expect(res.error).toBe(EXPECTED_URL_ERROR);
            }
        });
    });

    it("rejects IPv4 addresses", () => {
        const ips = [
            "join my server at 192.168.1.1",
            "10.0.0.1",
            "ping 8.8.8.8 for test"
        ];

        ips.forEach(text => {
            const res = validateLockedContent(text);
            expect(res.valid).toBe(false);
            if (!res.valid) {
                expect(res.error).toBe(EXPECTED_URL_ERROR);
            }
        });
    });

    it("rejects markdown links", () => {
        const md = [
            "Here is a [link](some url)",
            "[click me](invalid)",
        ];

        md.forEach(text => {
            const res = validateLockedContent(text);
            expect(res.valid).toBe(false);
            if (!res.valid) {
                expect(res.error).toBe(EXPECTED_URL_ERROR);
            }
        });
    });

    it("rejects zero-width character obfuscated URLs", () => {
        // "h" + zero width space + "ttps://example.com"
        const obfuscated = "h\u200Bttps://example.com";
        const res = validateLockedContent(obfuscated);
        expect(res.valid).toBe(false);
        if (!res.valid) {
            expect(res.error).toBe(EXPECTED_URL_ERROR);
        }

        const joiner = "http:\u200D//example.com";
        const res2 = validateLockedContent(joiner);
        expect(res2.valid).toBe(false);
        if (!res2.valid) {
            expect(res2.error).toBe(EXPECTED_URL_ERROR);
        }

        const bom = "hello w\uFEFFww.example.com";
        const res3 = validateLockedContent(bom);
        expect(res3.valid).toBe(false);
        if (!res3.valid) {
            expect(res3.error).toBe(EXPECTED_URL_ERROR);
        }
    });

    it("rejects fullwidth/unicode NFKC equivalent URLs", () => {
        // fullwidth characters "ｈｔｔｐｓ：／／"
        const fullwidth = "ｈｔｔｐｓ：／／ｅｘａｍｐｌｅ．ｃｏｍ";
        const res = validateLockedContent(fullwidth);
        expect(res.valid).toBe(false);
        if (!res.valid) {
            expect(res.error).toBe(EXPECTED_URL_ERROR);
        }

        const fwDomain = "ｅｘａｍｐｌｅ．ｃｏｍ";
        const res2 = validateLockedContent(fwDomain);
        expect(res2.valid).toBe(false);
        if (!res2.valid) {
            expect(res2.error).toBe(EXPECTED_URL_ERROR);
        }
    });
});
