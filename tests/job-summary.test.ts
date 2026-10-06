import { describe, expect, it } from "vitest";
import { summaryText } from "@/lib/job-summary";

describe("summaryText", () => {
  it("names all three counts in plain sentences", () => {
    expect(summaryText({ editsTotal: 14, editsFlagged: 2, editsSkipped: 3 })).toBe(
      "14 changes made. 2 are marked for you to check. 3 parts were left untouched to keep the document safe.",
    );
  });

  it("uses the singular for one", () => {
    expect(summaryText({ editsTotal: 1, editsFlagged: 1, editsSkipped: 1 })).toBe(
      "1 change made. 1 is marked for you to check. 1 part was left untouched to keep the document safe.",
    );
  });

  it("hides the parts that are zero", () => {
    expect(summaryText({ editsTotal: 5, editsFlagged: 0, editsSkipped: 0 })).toBe(
      "5 changes made.",
    );
    expect(summaryText({ editsTotal: 5, editsFlagged: 0, editsSkipped: 2 })).toBe(
      "5 changes made. 2 parts were left untouched to keep the document safe.",
    );
  });

  it("says no changes were needed when there are none", () => {
    expect(summaryText({ editsTotal: 0, editsFlagged: 0, editsSkipped: 0 })).toBe(
      "No changes were needed.",
    );
    expect(summaryText({ editsTotal: 0, editsFlagged: 0, editsSkipped: 1 })).toBe(
      "No changes were needed. 1 part was left untouched to keep the document safe.",
    );
  });

  it("never uses colons or dashes", () => {
    for (const editsTotal of [0, 1, 2]) {
      for (const editsFlagged of [0, 1, 2]) {
        for (const editsSkipped of [0, 1, 2]) {
          const text = summaryText({ editsTotal, editsFlagged, editsSkipped });
          expect(text).not.toMatch(/[:\-–—]/);
        }
      }
    }
  });
});
