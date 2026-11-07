import { describe, expect, it } from "vitest";
import { keepaBookInfo, missesVolume, pickKeepaMatch, pickOtherEdition, romanOrdinal, worthEditionCheck } from "../prices/providers/keepa";
import { contradictsTitle, isBoxSet } from "../books";

const book = { title: "Dictionnaire des mots, des phrases, des images", authors: ["Aimé Gabillon"] };

describe("pickKeepaMatch (livres sans ISBN)", () => {
  it("prend la fiche dont le titre et l'auteur correspondent", () => {
    const p = pickKeepaMatch(book, [
      { asin: "X1", title: "Dictionnaire des synonymes", author: "Gabillon" },
      { asin: "X2", title: "Dictionnaire des mots, des phrases, des images", author: "Aimé Gabillon" },
    ]);
    expect(p?.asin).toBe("X2");
  });
  it("accepte l'auteur écrit dans le titre Amazon", () => {
    expect(pickKeepaMatch(book, [{ asin: "X3", title: "Dictionnaire des mots des phrases des images - Gabillon" }])?.asin).toBe("X3");
  });
  it("refuse un autre auteur ou un titre trop différent", () => {
    expect(pickKeepaMatch(book, [{ asin: "X4", title: "Dictionnaire des mots, des phrases, des images", author: "Dupont" }])).toBeNull();
    expect(pickKeepaMatch(book, [{ asin: "X5", title: "Dictionnaire des images", author: "Gabillon" }])).toBeNull();
  });
});

describe("pickKeepaMatch (autre édition)", () => {
  it("relie XXIe à 21e et prend l'édition la plus vendue", () => {
    const kit = { title: "Le Kit du XXIe siècle", authors: ["François Reynaert", "Vincent Brocvielle"] };
    const p = pickKeepaMatch(kit, [
      { asin: "A", title: "Le kit du 21e siècle", author: "Reynaert", stats: { current: [0, 0, 0, 900000] } },
      { asin: "B", title: "Le kit du 21e siècle (poche)", author: "François Reynaert", stats: { current: [0, 0, 0, 120000] } },
      { asin: "C", title: "Le kit du 21e siècle", author: "Reynaert" },
    ]);
    expect(p?.asin).toBe("B");
  });
});

describe("romanOrdinal", () => {
  it("convertit les siècles en chiffres romains", () => {
    expect(romanOrdinal("xxie")).toBe("21e");
    expect(romanOrdinal("xixe")).toBe("19e");
    expect(romanOrdinal("siecle")).toBe("siecle");
  });
});

describe("keepaBookInfo (identification par Amazon)", () => {
  it("lit le titre sans la mention de format, les auteurs et l'ISBN", () => {
    const info = keepaBookInfo({
      title: "Survivre sans écrans (quand on est ado) - Broché",
      author: "Jean Dupont, Marie Durand",
      eanList: ["3000000000001", "9782000000001"],
    });
    expect(info?.title).toBe("Survivre sans écrans (quand on est ado)");
    expect(info?.authors).toEqual(["Jean Dupont", "Marie Durand"]);
    expect(info?.isbn13).toBe("9782000000001");
  });
});

describe("vérification de l'édition des livres chers", () => {
  const rank = (r: number) => ({ current: [0, 0, 0, r] });
  const faure = { title: "Histoire de l'art : l'art antique", authors: ["Élie Faure"] };
  const own = { asin: "OWN", title: "Histoire de l'art : l'art antique (relié)", author: "Élie Faure", stats: rank(900000) };

  it("prend le Folio bien plus vendu du même tome", () => {
    const p = pickOtherEdition(faure, own, [
      own,
      { asin: "MOD", title: "Histoire de l'art : l'art moderne", author: "Élie Faure", stats: rank(20000) },
      { asin: "FOLIO", title: "Histoire de l'art : L'art antique", author: "Élie Faure", stats: rank(60000) },
    ]);
    expect(p?.asin).toBe("FOLIO");
  });
  it("ne prend pas un autre tome, ni une édition à peine mieux classée", () => {
    expect(pickOtherEdition(faure, own, [{ asin: "MOD", title: "Histoire de l'art : l'art moderne", author: "Élie Faure", stats: rank(20000) }])).toBeNull();
    expect(pickOtherEdition(faure, own, [{ asin: "F", title: "Histoire de l'art : l'art antique", author: "Élie Faure", stats: rank(600000) }])).toBeNull();
  });
  it("reconnaît le même livre sous un titre Amazon plus long", () => {
    const k = { title: "Du spirituel dans l'art (1911) : Suivi de Du matériel dans l'art", authors: ["Vassily Kandinsky"] };
    const mine = { asin: "M", title: k.title, author: "Kandinsky", stats: rank(800000) };
    const folio = { asin: "F", title: "Du Spirituel dans l'art et dans la peinture en particulier", author: "Wassily Kandinsky", stats: rank(27000) };
    expect(pickOtherEdition(k, mine, [folio])?.asin).toBe("F");
  });
  it("ne vérifie que les livres à 15 € et plus", () => {
    const obs = (offerType: "SOLD" | "USED", priceCents: number) => ({ platform: "amazon", offerType, priceCents, currency: "EUR" });
    expect(worthEditionCheck({ observations: [obs("SOLD", 1200), obs("SOLD", 1300), obs("USED", 4000)] })).toBe(false);
    expect(worthEditionCheck({ observations: [obs("USED", 5900)] })).toBe(true);
  });
});

describe("coffrets et autres tomes (recherche par titre)", () => {
  it("reconnaît un coffret ou une intégrale", () => {
    expect(isBoxSet("Histoire de l'art, tomes 1 à 4")).toBe(true);
    expect(isBoxSet("Histoire de l'art - Coffret 4 volumes")).toBe(true);
    expect(isBoxSet("Les Misérables I-II")).toBe(true);
    expect(isBoxSet("Les Misérables, tome II")).toBe(false);
    expect(isBoxSet("Lettres 1914-1918")).toBe(false);
    expect(isBoxSet("Le Siècle de Louis XIV")).toBe(false);
  });
  it("un seul tome ne prend ni le coffret ni un autre tome", () => {
    const faure = { title: "Histoire de l'art : l'art renaissant", authors: ["Élie Faure"] };
    const p = pickKeepaMatch(faure, [
      { asin: "BOX", title: "Histoire de l'art, tomes 1 à 4", author: "Elie Faure", stats: { current: [0, 0, 0, 1000] } },
      { asin: "MOD", title: "Histoire de l'art : L'art moderne", author: "Elie Faure", stats: { current: [0, 0, 0, 2000] } },
      { asin: "REN", title: "Histoire de l'art : L'art renaissant (Folio essais)", author: "Elie Faure", stats: { current: [0, 0, 0, 50000] } },
    ]);
    expect(p?.asin).toBe("REN");
  });
  it("garde le coffret quand c'est bien un coffret qu'on cherche", () => {
    const box = { title: "Histoire de l'art tomes 1 à 4", authors: ["Élie Faure"] };
    expect(pickKeepaMatch(box, [{ asin: "BOX", title: "Histoire de l'art, tomes 1 à 4", author: "Elie Faure" }])?.asin).toBe("BOX");
  });
});

describe("tome seul contre titre général ou intégrale", () => {
  const renaissant = { title: "Histoire de l'art : l'art renaissant", authors: ["Élie Faure"] };
  it("préfère la fiche qui nomme le tome à l'œuvre complète mieux classée", () => {
    const p = pickKeepaMatch(renaissant, [
      { asin: "BART", title: "HISTOIRE DE L'ART", author: "Elie Faure", stats: { current: [0, 0, 0, 1000] } },
      { asin: "FOLIO", title: "Histoire de l'art : l'art renaissant", author: "Elie Faure", stats: { current: [0, 0, 0, 97000] } },
    ]);
    expect(p?.asin).toBe("FOLIO");
    expect(missesVolume(renaissant.title, "HISTOIRE DE L'ART")).toBe(true);
    expect(missesVolume(renaissant.title, "Histoire de l'art, tome 3 : L'art renaissant (Folio)")).toBe(false);
    expect(missesVolume("L'Amant", "L'Amant (Minuit)")).toBe(false);
  });
  it("à l'identification, un tome lu n'est pas l'intégrale", () => {
    expect(contradictsTitle("Guide des films LZ", "Guide des films - Intégrale")).toBe(true);
    expect(contradictsTitle("Histoire de l'art : L'art moderne II", "Histoire de l'art: L'art moderne I-II")).toBe(true);
    expect(contradictsTitle("Histoire de l'art : L'art moderne II", "Histoire de l'art : l'art moderne II")).toBe(false);
  });
});
