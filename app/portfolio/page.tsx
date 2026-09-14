'use client';

/* Public portfolio surface: live published content is read from Supabase in the browser. */
import { useEffect, useMemo, useState } from "react";
import { getPrivatePortfolioMediaUrl, getSupabaseBrowserClient, type PortfolioElement, type PortfolioPage } from "@/lib/supabase-browser";

type Frame = { x: number; y: number; width: number; height: number };
function frameFor(element: PortfolioElement) { const responsive = element.styles.responsive as Record<string, Frame> | undefined; return responsive?.desktop ?? { x: element.x, y: element.y, width: element.width, height: element.height }; }

export default function PublicPortfolioPage() {
  const [page, setPage] = useState<PortfolioPage | null>(null);
  const [elements, setElements] = useState<PortfolioElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let cancelled = false;
    async function loadPublishedPortfolio() {
      if (!supabase) { setLoading(false); setError("تعذر الاتصال بمصدر المحفظة"); return; }
      const { data: pageRow, error: pageError } = await supabase.from("portfolio_pages").select("id,slug,title,description,published,updated_at").eq("slug", "home").eq("published", true).limit(1).maybeSingle();
      if (cancelled) return;
      if (pageError) { setError(pageError.message); setLoading(false); return; }
      if (!pageRow) { setPage(null); setElements([]); setLoading(false); return; }
      const { data: rows, error: elementError } = await supabase.from("portfolio_elements").select("id,page_id,element_type,x,y,width,height,z_index,content,styles").eq("page_id", pageRow.id).order("z_index");
      if (cancelled) return;
      if (elementError) setError(elementError.message);
      const loadedElements = (rows ?? []) as PortfolioElement[];
      const signedElements = await Promise.all(loadedElements.map(async (element) => { const path = element.content.storagePath; if (element.element_type !== "image" || typeof path !== "string" || !path) return element; const signed = await getPrivatePortfolioMediaUrl(path); return signed.url ? { ...element, content: { ...element.content, src: signed.url } } : element; }));
      if (cancelled) return;
      setPage(pageRow as PortfolioPage);
      setElements(signedElements);
      setLoading(false);
    }
    void loadPublishedPortfolio();
    return () => { cancelled = true; };
  }, [supabase]);

  return <main dir="rtl" className="min-h-screen bg-[#f5f0e7] px-5 py-8 text-[#17211f] md:px-10 md:py-12"><header className="mx-auto mb-8 flex max-w-[1180px] items-end justify-between gap-5 border-b border-[#d9d0c3] pb-5"><div><span className="font-mono text-[10px] tracking-[.16em] text-[#68776f]">PHOTOMEDIA / PUBLIC PORTFOLIO</span><h1 className="font-naskh mt-2 text-4xl font-bold md:text-6xl">{page?.title ?? "PhotoMedia Portfolio"}</h1><p className="mt-2 max-w-xl text-sm leading-7 text-[#68776f]">{page?.description ?? "محفظة الاستوديو المنشورة."}</p></div><a href="/portfolio-editor" className="rounded-lg border border-[#d9d0c3] bg-[#fffdf8] px-3 py-2 text-xs font-bold">تحرير المحفظة</a></header>{loading ? <section className="mx-auto grid min-h-[420px] max-w-[1180px] place-items-center rounded-[28px] bg-[#17211f] text-[#cfe1d7]"><p>جار تحميل النسخة المنشورة من Supabase…</p></section> : !page ? <section className="mx-auto grid min-h-[420px] max-w-[1180px] place-items-center rounded-[28px] border border-[#d9d0c3] bg-[#fffdf8] text-center"><div><p className="font-mono text-[10px] tracking-[.16em] text-[#b36a36]">PORTFOLIO / PRIVATE</p><h2 className="font-naskh mt-3 text-3xl font-bold">المحفظة غير منشورة</h2><p className="mt-2 text-sm text-[#68776f]">سيظهر المحتوى هنا عندما ينشره محرر مخوّل من الفريق.</p></div></section> : <section className="archive-sheet relative mx-auto min-h-[640px] max-w-[1180px] overflow-hidden rounded-[28px] bg-[#17211f]" style={{ backgroundColor: "#17211f" }} aria-label="المحفظة المنشورة">{elements.map((element) => { const frame = frameFor(element); return <div key={element.id} className="absolute" style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, zIndex: element.z_index }}>{element.element_type === "image" ? <img src={element.content.src} alt={element.content.alt ?? ""} className="h-full w-full object-cover" /> : element.element_type === "button" ? <div className="inline-flex h-full items-center rounded-xl bg-[#f5f0e7] px-5 text-[#17211f]" style={{ fontSize: Number(element.styles.fontSize ?? 15), fontWeight: Number(element.styles.fontWeight ?? 700) }}>{element.content.text}</div> : element.element_type === "divider" ? <div className="mt-1 h-px w-full bg-[#dca171]" /> : <div className="h-full w-full whitespace-pre-wrap" style={{ fontSize: Number(element.styles.fontSize ?? 28), color: String(element.styles.color ?? "#f5f0e7"), fontWeight: Number(element.styles.fontWeight ?? 400) }}>{element.content.eyebrow && <span className="mb-2 block font-mono text-[10px] tracking-[.15em] opacity-65">{element.content.eyebrow}</span>}{element.content.text}</div>}</div>; })}</section>}{error && <p className="mx-auto mt-4 max-w-[1180px] text-xs text-[#a25624]">{error}</p>}</main>;
}
