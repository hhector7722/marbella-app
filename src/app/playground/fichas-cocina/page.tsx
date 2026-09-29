'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ChefHat, Download, Printer, Save, Trash2, Camera } from 'lucide-react';
import { jsPDF } from 'jspdf';

type Recipe = {
  id: string;
  name: string;
  category: string | null;
  preparation_time: number | null;
  servings: number | null;
  photo_url: string | null;
  elaboration: string | null;
  is_sellable: boolean;
};

type Step = { text: string; image: string | null };

const supabase = createClient();

function splitSteps(value: string | null) {
  return (value ?? '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(text => ({ text, image: null }));
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
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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
      const { data } = await supabase
        .from('recipes')
        .select('id,name,category,preparation_time,servings,photo_url,elaboration,is_sellable')
        .order('name');
      if (data) setRecipes(data as Recipe[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!recipe) return;
    void (async () => {
      setSteps(splitSteps(recipe.elaboration));
      const { data } = await supabase
        .from('recipe_kitchen_sheets')
        .select('key_points,avoid_points,step_images')
        .eq('recipe_id', recipe.id)
        .maybeSingle();
      if (data) {
        const images = Array.isArray(data.step_images) ? (data.step_images as string[]) : [];
        setSteps(splitSteps(recipe.elaboration).map((step, i) => ({ ...step, image: images[i] ?? null })));
        setKeyPoints((data.key_points as string[] | null)?.length ? (data.key_points as string[]) : ['']);
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
    if (error) {
      setMessage(`Error subiendo imagen: ${error.message}`);
      return;
    }
    const { data } = supabase.storage.from('recipes').getPublicUrl(path);
    setSteps(current => current.map((step, i) => (i === index ? { ...step, image: data.publicUrl } : step)));
  }

  async function saveSheet() {
    if (!recipe) return;
    setSaving(true);
    setMessage('');
    const payload = {
      recipe_id: recipe.id,
      key_points: keyPoints.map(x => x.trim()).filter(Boolean),
      avoid_points: avoidPoints.map(x => x.trim()).filter(Boolean),
      step_images: steps.map(s => s.image),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('recipe_kitchen_sheets').upsert(payload, { onConflict: 'recipe_id' });
    setSaving(false);
    setMessage(error ? `Error: ${error.message}` : 'Ficha guardada correctamente');
  }

  // Segmenta los pasos en Fila 1 y Fila 2 adaptativamente según el número de pasos totales (3 a 8)
  const { fila1, fila2 } = useMemo(() => {
    const n = Math.min(8, steps.length);
    let limitFila1 = 3;
    if (n === 3) limitFila1 = 3;
    else if (n === 4) limitFila1 = 2;
    else if (n === 5) limitFila1 = 3;
    else if (n === 6) limitFila1 = 3;
    else if (n === 7) limitFila1 = 4;
    else if (n === 8) limitFila1 = 4;

    return {
      fila1: steps.slice(0, limitFila1),
      fila2: steps.slice(limitFila1, n),
    };
  }, [steps]);

  async function generatePdf() {
    if (!recipe) return;
    setMessage('Generando PDF…');
    
    // Configuración A3 Horizontal (Landscape: 420 x 297 mm)
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
    const W = 420;
    const H = 297;
    const margin = 14;

    // Fondo blanco mate premium
    pdf.setFillColor(252, 251, 249);
    pdf.rect(0, 0, W, H, 'F');

    // Header: solo información propia de la receta, sin rótulos genéricos.
    pdf.setTextColor(24, 24, 27);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(26);
    pdf.text(recipe.name.toUpperCase(), margin, 22);

    pdf.setTextColor(115, 115, 115);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const metaParts = [
      `${recipe.servings ?? 1} ración${recipe.servings === 1 ? '' : 'es'}`,
      recipe.preparation_time ? `${recipe.preparation_time} min` : null,
    ].filter(Boolean);
    pdf.text(metaParts.join('  ·  '), margin, 29);

    pdf.setDrawColor(54, 96, 111);
    pdf.setLineWidth(1.2);
    pdf.line(margin, 34, W - margin, 34);

    // Dimensiones de la composición
    const startY = 41;
    const totalContentH = 234; // 297 - 49 - 14 (margin)
    const colGap = 8;
    const leftColW = 110;
    const rightColW = W - margin * 2 - leftColW - colGap; // 274 mm
    const startRightX = margin + leftColW + colGap; // 132 mm

    // --- Columna Izquierda: Foto Final + Puntos Clave ---
    // Foto final (60% del alto disponible)
    const finalPhotoH = 120;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(228, 228, 231);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(margin, startY, leftColW, finalPhotoH, 3, 3, 'FD');

    if (recipe.photo_url) {
      try {
        const img = await urlToDataUrl(recipe.photo_url);
        pdf.addImage(img, 'JPEG', margin + 6, startY + 6, leftColW - 12, finalPhotoH - 12, undefined, 'FAST');
      } catch (e) {
        pdf.setFillColor(244, 244, 245);
        pdf.rect(margin + 6, startY + 6, leftColW - 12, finalPhotoH - 12, 'F');
      }
    } else {
      pdf.setFillColor(244, 244, 245);
      pdf.rect(margin + 6, startY + 6, leftColW - 12, finalPhotoH - 12, 'F');
    }

    // Puntos clave & No Hacer card (40% del alto disponible)
    const cardY = startY + finalPhotoH + 6;
    const cardH = totalContentH - finalPhotoH - 6; // ~108 mm
    pdf.setFillColor(11, 28, 54); // Color envolvente bajo
    pdf.roundedRect(margin, cardY, leftColW, cardH, 3, 3, 'F');

    // Título Puntos Clave
    pdf.setTextColor(110, 231, 183); // Verde esmeralda
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('PUNTOS CLAVE', margin + 8, cardY + 12);

    pdf.setTextColor(244, 244, 245);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    let bulletY = cardY + 20;
    for (const p of keyPoints.filter(Boolean)) {
      const splitP = pdf.splitTextToSize(`• ${p}`, leftColW - 16);
      pdf.text(splitP, margin + 8, bulletY);
      bulletY += (splitP.length * 4);
    }

    // Título No Hacer (si existen)
    const avoidArr = avoidPoints.filter(Boolean);
    if (avoidArr.length > 0) {
      pdf.setTextColor(253, 164, 175); // Rosa claro/rojo
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      bulletY = cardY + 54;
      pdf.text('NO HACER', margin + 8, bulletY);

      pdf.setTextColor(244, 244, 245);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      bulletY += 8;
      for (const p of avoidArr) {
        const splitP = pdf.splitTextToSize(`• ${p}`, leftColW - 16);
        pdf.text(splitP, margin + 8, bulletY);
        bulletY += (splitP.length * 4);
      }
    }

    // --- Columna Derecha: Grilla de Pasos adaptativa ---
    const rowGap = 6;
    const stepCardH = fila2.length > 0 ? (totalContentH - rowGap) / 2 : totalContentH;

    // Helper para dibujar la tarjeta de un paso
    const drawPdfStepCard = async (stepItem: Step, numIndex: number, cardX: number, cardYPos: number, cardW: number) => {
      // Fondo blanco y borde gris sutil
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(228, 228, 231);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(cardX, cardYPos, cardW, stepCardH, 3, 3, 'FD');

      const numStr = String(numIndex).padStart(2, '0');
      const stepLines = pdf.splitTextToSize(stepItem.text, cardW - 12);

      // Número de paso
      pdf.setTextColor(54, 96, 111);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.text(numStr, cardX + 6, cardYPos + 12);

      // Fotografía grande; el espacio inferior se adapta al texto real del paso.
      const imageOffsetTop = 16;
      const textSpaceH = Math.max(18, stepLines.length * 3.6 + 7);
      const imgW = cardW - 12;
      const imgH = Math.max(28, stepCardH - imageOffsetTop - textSpaceH);
      const imageY = cardYPos + imageOffsetTop;

      if (stepItem.image) {
        try {
          const img = await urlToDataUrl(stepItem.image);
          pdf.addImage(img, 'JPEG', cardX + 6, imageY, imgW, imgH, undefined, 'FAST');
        } catch (e) {
          pdf.setFillColor(244, 244, 245);
          pdf.rect(cardX + 6, imageY, imgW, imgH, 'F');
        }
      } else {
        pdf.setFillColor(244, 244, 245);
        pdf.rect(cardX + 6, imageY, imgW, imgH, 'F');
      }

      // Texto exacto de la ficha técnica, sin reinterpretar ni recortar.
      pdf.setTextColor(39, 39, 42);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      const textY = imageY + imgH + 4;
      pdf.text(stepLines, cardX + 6, textY);
    };

    // Renderizar Fila 1 en PDF
    const cardW1 = (rightColW - (fila1.length - 1) * colGap) / fila1.length;
    for (let i = 0; i < fila1.length; i++) {
      const stepX = startRightX + i * (cardW1 + colGap);
      await drawPdfStepCard(fila1[i], i + 1, stepX, startY, cardW1);
    }

    // Renderizar Fila 2 en PDF
    if (fila2.length > 0) {
      const cardW2 = (rightColW - (fila2.length - 1) * colGap) / fila2.length;
      for (let i = 0; i < fila2.length; i++) {
        const stepX = startRightX + i * (cardW2 + colGap);
        const stepY = startY + stepCardH + rowGap;
        await drawPdfStepCard(fila2[i], fila1.length + i + 1, stepX, stepY, cardW2);
      }
    }

    pdf.save(`${slug(recipe.name)}-poster-cocina.pdf`);
    setMessage('PDF generado correctamente');
  }

  const photosReady = steps.filter(step => Boolean(step.image)).length;
  const keyPointsReady = keyPoints.filter(Boolean).length;
  const avoidPointsReady = avoidPoints.filter(Boolean).length;
  const sheetChecks = recipe
    ? [
        { label: 'Receta', detail: recipe.name, done: true },
        { label: 'Fotos', detail: photosReady + '/' + steps.length, done: steps.length > 0 && photosReady === steps.length },
        { label: 'Claves', detail: String(keyPointsReady), done: keyPointsReady > 0 },
        { label: 'Vista', detail: 'Lista', done: true },
      ]
    : [];
  const completedChecks = sheetChecks.filter(item => item.done).length;

  if (loading) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-[#f6f7f8] text-zinc-500">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-[#36606f]" />
          <span className="text-xs font-bold">Cargando recetas…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-[#f6f7f8] text-zinc-900 print:bg-white">
      <style>{'@media print { @page { size: A3 landscape; margin: 0; } body { background: white !important; } }'}</style>

      <div className="mx-auto flex h-full min-h-0 max-w-[1800px] flex-col gap-3">
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 shadow-sm print:hidden">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="truncate text-sm font-black text-zinc-900">Fichas de cocina</h1>
              {recipe && <span className="truncate text-[11px] font-semibold text-zinc-400">/ {recipe.name}</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={generatePdf}
              disabled={!recipe}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-bold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40"
            >
              <Download size={13} />
              PDF
            </button>
            <button
              onClick={() => window.print()}
              disabled={!recipe}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-bold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40"
            >
              <Printer size={13} />
              Imprimir
            </button>
            <button
              onClick={saveSheet}
              disabled={!recipe || saving}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#36606f] px-3 text-[11px] font-black text-white transition-colors hover:bg-[#2f5663] disabled:opacity-40"
            >
              <Save size={13} />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[250px_minmax(520px,1fr)_360px] print:block">
          <aside className="flex min-h-0 flex-col gap-3 print:hidden">
            <section className="shrink-0 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Receta</span>
                {recipe && (
                  <span className="rounded-full bg-[#36606f]/10 px-2 py-0.5 text-[9px] font-black uppercase text-[#36606f]">
                    {recipe.category || 'Sin categoría'}
                  </span>
                )}
              </div>

              <select
                value={recipeId}
                onChange={e => setRecipeId(e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-bold outline-none transition focus:border-[#36606f] focus:ring-1 focus:ring-[#36606f]"
              >
                <option value="">Selecciona receta…</option>
                {recipes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.is_sellable === false ? r.name + ' · Elaboración' : r.name}
                  </option>
                ))}
              </select>

              {recipe && (
                <div className="mt-3">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100">
                    {recipe.photo_url ? (
                      <img src={recipe.photo_url} alt={recipe.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-300">
                        <ChefHat size={30} strokeWidth={1.2} />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-zinc-900">{recipe.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] font-bold text-zinc-500">
                        <span>{recipe.servings ?? 1} ración{recipe.servings === 1 ? '' : 'es'}</span>
                        {recipe.preparation_time ? <span>· {recipe.preparation_time} min</span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="min-h-0 flex-1 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black text-zinc-900">Estado</h2>
                <span className="text-[10px] font-bold text-zinc-400">
                  {recipe ? completedChecks + '/' + sheetChecks.length : '—'}
                </span>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: recipe && sheetChecks.length ? (completedChecks / sheetChecks.length) * 100 + '%' : '0%' }}
                />
              </div>

              <div className="mt-3 grid gap-2">
                {sheetChecks.map(item => (
                  <div key={item.label} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2 py-2">
                    <span
                      className={
                        'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black ' +
                        (item.done ? 'bg-emerald-500 text-white' : 'bg-zinc-200 text-zinc-500')
                      }
                    >
                      {item.done ? '✓' : '·'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-black text-zinc-700">{item.label}</div>
                      <div className="truncate text-[9px] font-semibold text-zinc-400">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="flex min-h-0 flex-col gap-3 print:hidden">
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex shrink-0 items-center justify-between border-b border-zinc-100 pb-2">
                <div>
                  <h2 className="text-sm font-black text-zinc-900">Pasos</h2>
                  <p className="text-[9px] font-semibold text-zinc-400">
                    Texto de la ficha técnica + foto de referencia
                  </p>
                </div>
                <span className="rounded-full bg-[#36606f]/10 px-2 py-1 text-[9px] font-black uppercase text-[#36606f]">
                  {steps.length} pasos · {photosReady} fotos
                </span>
              </div>

              {!recipe ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-400">
                  Selecciona una receta
                </div>
              ) : steps.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-400">
                  Esta receta no tiene pasos de elaboración
                </div>
              ) : (
                <div
                  className="grid min-h-0 flex-1 gap-2"
                  style={{ gridTemplateRows: 'repeat(' + steps.length + ', minmax(0, 1fr))' }}
                >
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      className="grid min-h-0 grid-cols-[28px_88px_minmax(0,1fr)] items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/60 px-2 py-1.5"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-[#36606f] text-[10px] font-black text-white">
                        {i + 1}
                      </span>

                      <label className="relative h-[clamp(38px,7vh,72px)] cursor-pointer overflow-hidden rounded-md border border-zinc-200 bg-white">
                        {step.image ? (
                          <img src={step.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-0.5 text-zinc-400">
                            <Camera size={13} />
                            <span className="text-[7px] font-black">AÑADIR FOTO</span>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 cursor-pointer opacity-0"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) void uploadStepImage(i, f);
                          }}
                        />
                      </label>

                      <p className="line-clamp-3 min-w-0 text-[11px] font-semibold leading-snug text-zinc-700">
                        {step.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-3">
              <ListEditor title="Puntos clave" values={keyPoints} setValues={setKeyPoints} />
              <ListEditor title="No hacer" values={avoidPoints} setValues={setAvoidPoints} />
            </div>
          </section>

          <aside className="flex min-h-0 flex-col rounded-xl border border-zinc-200 bg-white p-3 shadow-sm print:fixed print:inset-0 print:z-50 print:h-[297mm] print:w-[420mm] print:border-0 print:bg-white print:p-0 print:shadow-none">
            <div className="mb-2 flex shrink-0 items-center justify-between print:hidden">
              <div>
                <h2 className="text-sm font-black text-zinc-900">Vista previa</h2>
                <p className="text-[9px] font-semibold text-zinc-400">A3 horizontal</p>
              </div>
              {recipe && (
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-bold text-zinc-500">
                  {recipe.name}
                </span>
              )}
            </div>

            {!recipe ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-400 print:hidden">
                Sin receta seleccionada
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden print:block print:h-full print:w-full">
                <div
                  id="kitchen-sheet"
                  className="aspect-[1.414/1] w-full overflow-hidden rounded-lg border border-zinc-200 bg-[#fcfbfa] p-[4%] shadow-inner print:h-full print:w-full print:aspect-auto print:rounded-none print:border-0 print:p-[14mm] print:shadow-none"
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex shrink-0 items-end justify-between border-b-2 border-[#36606f] pb-2">
                      <h2 className="truncate text-[clamp(13px,1.4vw,22px)] font-black uppercase tracking-tight text-zinc-900">
                        {recipe.name}
                      </h2>
                      <div className="shrink-0 pl-2 text-[7px] font-bold uppercase tracking-wider text-zinc-400">
                        {recipe.servings ?? 1} ración{recipe.servings === 1 ? '' : 'es'}
                        {recipe.preparation_time ? ' · ' + recipe.preparation_time + ' min' : ''}
                      </div>
                    </div>

                    <div className="mt-2 flex min-h-0 flex-1 gap-2">
                      <div className="flex w-[29%] shrink-0 flex-col gap-2">
                        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-zinc-200 bg-white p-1.5">
                          {recipe.photo_url ? (
                            <img src={recipe.photo_url} alt={recipe.name} className="h-full w-full rounded object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-zinc-200">
                              <ChefHat size={22} strokeWidth={1} />
                            </div>
                          )}
                        </div>

                        <div className="h-[37%] overflow-hidden rounded-md bg-[#0b1c36] p-2 text-white">
                          <div className="text-[6px] font-black uppercase tracking-widest text-emerald-400">Puntos clave</div>
                          <ul className="mt-1 space-y-0.5 text-[6px] leading-tight text-zinc-200">
                            {keyPoints.filter(Boolean).slice(0, 4).map((x, i) => (
                              <li key={i}>• {x}</li>
                            ))}
                          </ul>
                          {avoidPoints.filter(Boolean).length > 0 && (
                            <>
                              <div className="mt-1.5 text-[6px] font-black uppercase tracking-widest text-rose-300">No hacer</div>
                              <ul className="mt-1 space-y-0.5 text-[6px] leading-tight text-zinc-200">
                                {avoidPoints.filter(Boolean).slice(0, 3).map((x, i) => (
                                  <li key={i}>• {x}</li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
                        {steps.slice(0, 8).map((step, i) => (
                          <div key={i} className="flex min-h-0 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white p-1.5">
                            <div className="mb-1 flex shrink-0 items-center gap-1">
                              <span className="text-[9px] font-black text-[#36606f]">{String(i + 1).padStart(2, '0')}</span>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden rounded bg-zinc-50">
                              {step.image ? (
                                <img src={step.image} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-zinc-200">
                                  <ChefHat size={15} strokeWidth={1} />
                                </div>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 shrink-0 text-[6px] font-semibold leading-tight text-zinc-600">
                              {step.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </main>

        {message && (
          <div className="fixed bottom-4 right-4 z-[60] rounded-lg bg-zinc-950 px-3 py-2 text-[11px] font-bold text-white shadow-xl print:hidden">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

function ListEditor({
  title,
  values,
  setValues,
}: {
  title: string;
  values: string[];
  setValues: (v: string[]) => void;
}) {
  return (
    <div className="flex min-h-[118px] flex-col rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <h2 className="text-xs font-black text-zinc-900">{title}</h2>
        <button
          type="button"
          onClick={() => setValues([...values, ''])}
          className="rounded-md px-1.5 py-1 text-[9px] font-black text-[#36606f] transition hover:bg-[#36606f]/10"
        >
          + Añadir
        </button>
      </div>

      <div className="grid gap-1.5">
        {values.length === 0 && (
          <button
            type="button"
            onClick={() => setValues([''])}
            className="h-8 rounded-lg border border-dashed border-zinc-200 text-[10px] font-bold text-zinc-400 hover:bg-zinc-50"
          >
            + Añadir punto
          </button>
        )}

        {values.map((value, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={value}
              onChange={e => setValues(values.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-[10px] font-semibold text-zinc-700 outline-none transition focus:border-[#36606f] focus:bg-white focus:ring-1 focus:ring-[#36606f]"
              placeholder={title === 'Puntos clave' ? 'Ej. Freír exactamente 2 min' : 'Ej. No sobrecargar la freidora'}
            />
            <button
              type="button"
              aria-label={'Eliminar ' + title.toLowerCase()}
              onClick={() => setValues(values.filter((_, j) => j !== i))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-zinc-200 text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-700"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
