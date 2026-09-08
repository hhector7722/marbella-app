'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Download, ImagePlus, Printer, Save, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { jsPDF } from 'jspdf';

type Recipe = {
  id: string;
  name: string;
  category: string | null;
  preparation_time: number | null;
  servings: number | null;
  photo_url: string | null;
  elaboration: string | null;
};

type Step = { text: string; image: string | null };

type Sheet = {
  keyPoints: string[];
  avoidPoints: string[];
  stepImages: string[];
};

const supabase = createClient();

function splitSteps(value: string | null) {
  return (value ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(text => ({ text, image: null }));
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function urlToDataUrl(url: string) {
  const response = await fetch(url, { mode: 'cors' });
  const blob = await response.blob();
  return await fileToDataUrl(new File([blob], 'image', { type: blob.type }));
}

function slug(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function FichasCocinaPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeId, setRecipeId] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [keyPoints, setKeyPoints] = useState<string[]>(['']);
  const [avoidPoints, setAvoidPoints] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const recipe = useMemo(() => recipes.find(r => r.id === recipeId) ?? null, [recipes, recipeId]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('recipes').select('id,name,category,preparation_time,servings,photo_url,elaboration').order('name');
      if (data) setRecipes(data as Recipe[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!recipe) return;
    void (async () => {
      setSteps(splitSteps(recipe.elaboration));
      const { data } = await supabase.from('recipe_kitchen_sheets').select('key_points,avoid_points,step_images').eq('recipe_id', recipe.id).maybeSingle();
      if (data) {
        const images = Array.isArray(data.step_images) ? data.step_images as string[] : [];
        setSteps(splitSteps(recipe.elaboration).map((step, i) => ({ ...step, image: images[i] ?? null })));
        setKeyPoints((data.key_points as string[] | null)?.length ? data.key_points as string[] : ['']);
        setAvoidPoints((data.avoid_points as string[] | null) ?? []);
      } else {
        setKeyPoints(['']);
        setAvoidPoints([]);
      }
      setMessage('');
    })();
  }, [recipe]);

  async function uploadStepImage(index: number, file: File) {
    if (!recipe) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `kitchen-sheets/${recipe.id}/step-${index + 1}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('recipes').upload(path, file, { contentType: file.type, upsert: false });
    if (error) { setMessage(`Error subiendo imagen: ${error.message}`); return; }
    const { data } = supabase.storage.from('recipes').getPublicUrl(path);
    setSteps(current => current.map((step, i) => i === index ? { ...step, image: data.publicUrl } : step));
  }

  async function saveSheet() {
    if (!recipe) return;
    setSaving(true); setMessage('');
    const payload = {
      recipe_id: recipe.id,
      key_points: keyPoints.map(x => x.trim()).filter(Boolean),
      avoid_points: avoidPoints.map(x => x.trim()).filter(Boolean),
      step_images: steps.map(s => s.image),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('recipe_kitchen_sheets').upsert(payload, { onConflict: 'recipe_id' });
    setSaving(false);
    setMessage(error ? `Error: ${error.message}` : 'Ficha guardada');
  }

  async function generatePdf() {
    if (!recipe) return;
    setMessage('Generando PDF…');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a3', compress: true });
    const W = 297, H = 420, margin = 14;
    pdf.setFillColor(250, 247, 241); pdf.rect(0, 0, W, H, 'F');
    pdf.setTextColor(22, 22, 22);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('MARBELLA · BAR · COCINA · BUEN AMBIENTE', margin, 18);
    pdf.setFontSize(29); pdf.text(recipe.name.toUpperCase(), margin, 34);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    const meta = [`${recipe.servings ?? 1} ración${recipe.servings === 1 ? '' : 'es'}`, recipe.preparation_time ? `${recipe.preparation_time} min` : 'FICHA DE ELABORACIÓN'];
    pdf.text(meta.join('  ·  '), margin, 43);
    pdf.setDrawColor(225, 95, 25); pdf.setLineWidth(1.2); pdf.line(margin, 49, W - margin, 49);

    if (recipe.photo_url) {
      try { const img = await urlToDataUrl(recipe.photo_url); pdf.addImage(img, 'JPEG', margin, 56, 72, 58, undefined, 'FAST'); } catch {}
    }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text('ELABORACIÓN PASO A PASO', 93, 64);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    const intro = pdf.splitTextToSize('Sigue siempre el orden indicado. Respeta cantidades, tiempos y puntos críticos de la receta.', 184);
    pdf.text(intro, 93, 72);

    const startY = 126, gapX = 8, gapY = 8, cardW = (W - margin * 2 - gapX) / 2, cardH = 67;
    pdf.setFontSize(9);
    for (let i = 0; i < Math.min(8, steps.length); i++) {
      const col = i % 2, row = Math.floor(i / 2), x = margin + col * (cardW + gapX), y = startY + row * (cardH + gapY);
      pdf.setFillColor(255, 255, 255); pdf.roundedRect(x, y, cardW, cardH, 3, 3, 'F');
      pdf.setFillColor(230, 92, 25); pdf.circle(x + 10, y + 10, 6, 'F');
      pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text(String(i + 1), x + 8.3, y + 13.3);
      if (steps[i].image) { try { const img = await urlToDataUrl(steps[i].image!); pdf.addImage(img, 'JPEG', x + 20, y + 5, 45, 28, undefined, 'FAST'); } catch {} }
      pdf.setTextColor(25, 25, 25); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text(`PASO ${i + 1}`, x + 20, y + 40);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
      const text = pdf.splitTextToSize(steps[i].text, cardW - 30); pdf.text(text.slice(0, 3), x + 20, y + 47);
    }

    const bottomY = startY + Math.ceil(Math.min(8, steps.length) / 2) * (cardH + gapY) + 2;
    pdf.setFillColor(20, 20, 20); pdf.roundedRect(margin, bottomY, W - margin * 2, 58, 4, 4, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text('PUNTOS CLAVE', margin + 8, bottomY + 12);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    let yy = bottomY + 21; for (const point of keyPoints.filter(Boolean)) { pdf.text(`• ${point}`, margin + 8, yy); yy += 8; }
    if (avoidPoints.filter(Boolean).length) { pdf.setTextColor(255, 170, 120); pdf.setFont('helvetica', 'bold'); pdf.text('NO HACER', 170, bottomY + 12); pdf.setFont('helvetica', 'normal'); yy = bottomY + 21; for (const point of avoidPoints.filter(Boolean)) { pdf.text(`• ${point}`, 170, yy); yy += 8; } }
    pdf.setTextColor(110, 110, 110); pdf.setFontSize(7); pdf.text('FICHA OPERATIVA · MARBELLA · USO INTERNO COCINA', margin, H - 8);
    pdf.save(`${slug(recipe.name)}-ficha-cocina.pdf`);
    setMessage('PDF generado');
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 p-8 text-zinc-300">Cargando recetas…</div>;

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 p-4 md:p-8 print:bg-white">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div><div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#36606F]">Marbella · Cocina</div><h1 className="text-2xl font-black tracking-tight">Fichas de elaboración</h1><p className="text-sm text-zinc-500">Una plantilla fija. La receta cambia; el diseño no.</p></div>
          <div className="flex gap-2"><button onClick={saveSheet} disabled={!recipe || saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-bold text-white disabled:opacity-40"><Save size={16}/> {saving ? 'Guardando…' : 'Guardar'}</button><button onClick={generatePdf} disabled={!recipe} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#e85d19] px-4 text-sm font-bold text-white disabled:opacity-40"><Download size={16}/> PDF A3</button><button onClick={() => window.print()} disabled={!recipe} className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold"><Printer size={16}/> Imprimir</button></div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[330px_1fr] print:hidden">
          <aside className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-500">Receta existente</label>
            <select value={recipeId} onChange={e => setRecipeId(e.target.value)} className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold"><option value="">Selecciona una receta…</option>{recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            {recipe && <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600"><b>{recipe.category || 'Sin categoría'}</b><br/>{recipe.servings ?? 1} raciones{recipe.preparation_time ? ` · ${recipe.preparation_time} min` : ''}</div>}
          </aside>

          <section className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-black">Pasos</h2><span className="text-xs font-bold text-zinc-400">{steps.length} pasos</span></div>
              <div className="space-y-2">{steps.map((step, i) => <div key={i} className="grid grid-cols-[34px_1fr_90px] items-center gap-3 rounded-xl border border-zinc-200 p-2"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#e85d19] text-xs font-black text-white">{i + 1}</div><div className="text-sm">{step.text}</div><label className="relative flex h-16 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-zinc-100 text-zinc-400">{step.image ? <img src={step.image} alt="" className="h-full w-full object-cover"/> : <ImagePlus size={20}/>}<input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadStepImage(i, f); }}/></label></div>)}</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ListEditor title="Puntos clave" values={keyPoints} setValues={setKeyPoints}/>
              <ListEditor title="No hacer" values={avoidPoints} setValues={setAvoidPoints}/>
            </div>
          </section>
        </div>

        {recipe && <div className="mx-auto mt-6 w-full max-w-[1100px] bg-[#faf7f1] p-[14mm] shadow-2xl print:mt-0 print:max-w-none print:p-[14mm] print:shadow-none" id="kitchen-sheet">
          <div className="border-b-4 border-[#e85d19] pb-4"><div className="text-xs font-black tracking-[0.18em]">MARBELLA · BAR · COCINA · BUEN AMBIENTE</div><h2 className="mt-2 text-4xl font-black uppercase leading-none">{recipe.name}</h2><div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">{recipe.servings ?? 1} raciones {recipe.preparation_time ? ` · ${recipe.preparation_time} min` : ''} · FICHA DE ELABORACIÓN</div></div>
          <div className="mt-5 grid grid-cols-[220px_1fr] gap-6">{recipe.photo_url ? <img src={recipe.photo_url} alt={recipe.name} className="h-[175px] w-full rounded-xl object-cover"/> : <div className="h-[175px] rounded-xl bg-zinc-200"/>}<div><h3 className="text-lg font-black">ELABORACIÓN PASO A PASO</h3><p className="mt-3 text-sm leading-6 text-zinc-600">Sigue siempre el orden indicado. Respeta cantidades, tiempos y puntos críticos de la receta.</p></div></div>
          <div className="mt-6 grid grid-cols-2 gap-3">{steps.slice(0, 8).map((step, i) => <div key={i} className="min-h-[180px] rounded-xl bg-white p-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e85d19] text-xs font-black text-white">{i + 1}</span><span className="text-xs font-black tracking-widest">PASO {i + 1}</span></div>{step.image ? <img src={step.image} alt="" className="mt-3 h-[88px] w-full rounded-lg object-cover"/> : <div className="mt-3 h-[88px] rounded-lg bg-zinc-100"/>}<p className="mt-2 text-xs font-medium leading-5">{step.text}</p></div>)}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-zinc-900 p-5 text-white"><div><h3 className="text-sm font-black tracking-widest">PUNTOS CLAVE</h3><ul className="mt-3 space-y-2 text-xs">{keyPoints.filter(Boolean).map((x,i)=><li key={i}>• {x}</li>)}</ul></div>{avoidPoints.filter(Boolean).length > 0 && <div><h3 className="text-sm font-black tracking-widest text-orange-300">NO HACER</h3><ul className="mt-3 space-y-2 text-xs text-orange-100">{avoidPoints.filter(Boolean).map((x,i)=><li key={i}>• {x}</li>)}</ul></div>}</div>
          <div className="mt-4 text-[9px] font-bold tracking-widest text-zinc-400">FICHA OPERATIVA · MARBELLA · USO INTERNO COCINA</div>
        </div>}
        {message && <div className="fixed bottom-4 right-4 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-xl print:hidden">{message}</div>}
      </div>
    </div>
  );
}

function ListEditor({ title, values, setValues }: { title: string; values: string[]; setValues: (v: string[]) => void }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="font-black">{title}</h2><button type="button" onClick={() => setValues([...values, ''])} className="text-xs font-bold text-[#36606F]">+ Añadir</button></div><div className="space-y-2">{values.map((value,i)=><div key={i} className="flex gap-2"><input value={value} onChange={e=>setValues(values.map((x,j)=>j===i?e.target.value:x))} className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 text-sm" placeholder={title === 'Puntos clave' ? 'Ej. Freír exactamente 2 min' : 'Ej. No servir con exceso de aceite'}/><button type="button" onClick={()=>setValues(values.filter((_,j)=>j!==i))} className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-200 text-zinc-400"><Trash2 size={15}/></button></div>)}</div></div>
}
