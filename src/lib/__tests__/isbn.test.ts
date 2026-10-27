import { describe, expect, it } from "vitest";
import { cleanIsbn, isbn10To13, isbn13To10, isValidIsbn10, isValidIsbn13, normalizeIsbn, isbnFromCode } from "../isbn";

describe("ISBN", () => {
  it("nettoie les tirets et espaces", () => {
    expect(cleanIsbn("978-1-4521-5175-5")).toBe("9781452151755");
    expect(cleanIsbn("145215175x")).toBe("145215175X");
  });

  it("valide les ISBN-13 et ISBN-10", () => {
    expect(isValidIsbn13("9781452151755")).toBe(true);
    expect(isValidIsbn13("9781452151754")).toBe(false);
    expect(isValidIsbn10("145215175X")).toBe(true);
    expect(isValidIsbn10("1452151751")).toBe(false);
  });

  it("convertit dans les deux sens", () => {
    expect(isbn10To13("145215175X")).toBe("9781452151755");
    expect(isbn13To10("9781452151755")).toBe("145215175X");
    expect(isbn13To10("9791032912345")).toBeNull(); // les 979 n'ont pas d'ISBN-10
  });

  it("normalise n'importe quelle saisie", () => {
    expect(normalizeIsbn("ISBN 978-2-07-036822-8")).toEqual({ isbn13: "9782070368228", isbn10: "207036822X" });
    expect(normalizeIsbn("207036822X")).toEqual({ isbn13: "9782070368228", isbn10: "207036822X" });
    expect(normalizeIsbn("123")).toBeNull();
  });
});

describe("code lu par la caméra", () => {
  it("garde l'ISBN d'un code-barres ou d'un QR code et ignore les autres codes", () => {
    expect(isbnFromCode("9782848992549")).toBe("9782848992549");
    expect(isbnFromCode("https://exemple.fr/livre?isbn=978-2-84899-254-9")).toBe("9782848992549");
    expect(isbnFromCode("ISBN 2848992549")).toBe("9782848992549");
    expect(isbnFromCode("3017620422003")).toBeNull(); // EAN d'un produit, pas d'un livre
    expect(isbnFromCode("bonjour")).toBeNull();
  });
});
