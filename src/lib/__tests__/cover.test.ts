import { describe, expect, it } from "vitest";
import { coverCandidates } from "@/components/BookCover";

describe("coverCandidates", () => {
  it("essaie la couverture connue, puis Amazon et Open Library par ISBN", () => {
    expect(coverCandidates(null, "9782746510791")).toEqual([
      "https://images-na.ssl-images-amazon.com/images/P/2746510790.08.MZZZZZZZ.jpg",
      "https://covers.openlibrary.org/b/isbn/9782746510791-M.jpg?default=false",
    ]);
    expect(coverCandidates("https://x/c.jpg", null)).toEqual(["https://x/c.jpg"]);
  });
});
