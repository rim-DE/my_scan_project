/** Exécute fn sur chaque élément avec au plus `limit` appels en parallèle. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Limite partagée : au plus `limit` tâches lancées par la fonction renvoyée tournent en même temps,
 * d'où qu'elles viennent (plusieurs photos, plusieurs bandes…).
 */
export function createLimiter(limit: number): <R>(fn: () => Promise<R>) => Promise<R> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (fn) => {
    // Une place libérée passe directement à la tâche suivante en attente, sans repasser par le compteur.
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
