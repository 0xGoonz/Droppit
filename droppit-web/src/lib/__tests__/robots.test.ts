import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("robots metadata route", () => {
    it("allows public crawling while blocking creator workflow and draft share pages", () => {
        expect(robots()).toEqual({
            rules: {
                userAgent: "*",
                allow: "/",
                disallow: ["/create", "/s/draft/"],
            },
        });
    });
});