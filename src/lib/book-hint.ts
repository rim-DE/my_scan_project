// Gemini, en texte seul (sans photo, donc presque gratuit), reconnaît un livre d'après ce qui a été lu sur sa tranche.
import { z } from "zod";
import { callGemini } from "./vision-gemini";

const HintSchema = z.object({
  title: z.string(),
  author: z.string().nullable(),
  isbn: z.string().nullable(),
  confident: z.boolean(),
});

export type BookHint = z.infer<typeof HintSchema>;

const LANGUAGES: Record<string, string> = { fr: "français", en: "anglais", de: "allemand", es: "espagnol", it: "italien" };

const PROMPT = (q: { title: string; author?: string | null; publisher?: string | null; language?: string | null }) =>
  `Sur la tranche d'un livre d'occasion, une lecture automatique a donné :
- texte lu : « ${q.title} »
- auteur lu : ${q.author ? `« ${q.author} »` : "aucun"}
- éditeur lu : ${q.publisher ? `« ${q.publisher} »` : "aucun"}
Le livre est probablement en ${LANGUAGES[q.language ?? ""] ?? q.language ?? "français"}.
La lecture peut contenir des fautes (lettres mal lues, mots coupés) et parfois le texte de deux tranches voisines collées :
dans ce cas, prends le premier livre.
Quel est ce livre publié ? Réponds avec :
- "title" : son titre exact tel qu'il est publié (sans le sous-titre) ;
- "author" : son auteur principal, ou null ;
- "isbn" : l'ISBN-13 d'une édition française, seulement si tu le connais avec certitude, sinon null (n'invente jamais) ;
- "confident" : true seulement si tu reconnais un livre précis qui existe, false si tu devines.`;

/** Proposition de Gemini, ou null s'il ne reconnaît pas de livre précis. */
export async function suggestBook(q: { title: string; author?: string | null; publisher?: string | null; language?: string | null }): Promise<BookHint | null> {
  const hint = await callGemini(null, PROMPT(q), HintSchema);
  return hint.confident && hint.title.trim() ? hint : null;
}
