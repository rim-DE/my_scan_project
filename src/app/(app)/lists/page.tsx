import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createListAction, deleteListAction, removeFromListAction } from "@/app/actions";

export default async function ListsPage() {
  const user = await requireUser();
  const t = await getT();
  const lists = await prisma.shoppingList.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { book: true }, orderBy: { createdAt: "desc" } } },
  });

  return (
    <>
      <h1 className="text-xl font-semibold">{t.lists.title}</h1>
      <form action={createListAction} className="card flex gap-2">
        <input name="name" required className="input" placeholder={t.lists.newList} />
        <button className="btn-primary">{t.lists.create}</button>
      </form>
      {lists.map((l) => (
        <section key={l.id} id={l.id} className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{l.name}</h2>
            <form action={deleteListAction.bind(null, l.id)}>
              <button className="text-xs text-red-600">{t.lists.delete}</button>
            </form>
          </div>
          {l.items.length === 0 ? (
            <p className="text-sm text-slate-500">{t.lists.empty}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {l.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/price?book=${i.book.id}`} className="hover:underline">
                    {i.book.title} <span className="text-slate-400">{i.book.isbn13}</span>
                  </Link>
                  <form action={removeFromListAction.bind(null, i.id)}>
                    <button className="text-xs text-red-600">✕</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
