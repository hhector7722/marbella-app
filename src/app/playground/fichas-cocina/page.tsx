'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ChefHat, Download, ImagePlus, Printer, Save, Trash2, Camera } from 'lucide-react';
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

/**
 * Parsea el texto del paso para extraer el título de acción y la indicación.
 * Formato esperado: "ACCIÓN: Indicación detallada" o "ACCIÓN Indicación" o por defecto.
 */
function parseStepText(text: string) {
  const trimmed = text.trim();
  const colonIdx = trimmed.indexOf(':');
  
  if (colonIdx > 0 && colonIdx < 22) {
    const action = trimmed.substring(0, colonIdx).toUpperCase().trim();
    const description = trimmed.substring(colonIdx + 1).trim();
    return { action, description };
  }
  
  const words = trimmed.split(/\s+/);
  if (words.length > 0 && words[0] === words[0].toUpperCase() && words[0].length > 1) {
    const action = words[0];
    const description = words.slice(1).join(' ');
    return { action, description };
  }
  
  if (words.length >= 2) {
    const action = words.slice(0, 2).join(' ').toUpperCase();
    const description = words.slice(2).join(' ');
    return { action, description };
  }
  
  return { action: 'ELABORAR', description: trimmed };
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
        .select('id,name,category,preparation_time,servings,photo_url,elaboration')
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

    // Header
    pdf.setTextColor(54, 96, 111); // Color marca --color-marca
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('MARBELLA · BAR · COCINA · BUEN AMBIENTE', margin, 18);

    pdf.setTextColor(24, 24, 27); // Color texto fuerte
    pdf.setFontSize(26);
    pdf.text(recipe.name.toUpperCase(), margin, 30);

    pdf.setTextColor(115, 115, 115);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const metaStr = `${recipe.servings ?? 1} ración${recipe.servings === 1 ? '' : 'es'}  ·  ${recipe.preparation_time ? `${recipe.preparation_time} min` : 'FICHA OPERATIVA'}`;
    pdf.text(metaStr, margin, 37);

    // Línea de cabecera en petróleo
    pdf.setDrawColor(54, 96, 111);
    pdf.setLineWidth(1.2);
    pdf.line(margin, 42, W - margin, 42);

    // Dimensiones de la composición
    const startY = 49;
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

    pdf.setTextColor(54, 96, 111);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('RESULTADO ESPERADO / PLATO FINAL', margin + 6, startY + 10);

    if (recipe.photo_url) {
      try {
        const img = await urlToDataUrl(recipe.photo_url);
        pdf.addImage(img, 'JPEG', margin + 6, startY + 16, leftColW - 12, finalPhotoH - 24, undefined, 'FAST');
      } catch (e) {
        pdf.setFillColor(244, 244, 245);
        pdf.rect(margin + 6, startY + 16, leftColW - 12, finalPhotoH - 24, 'F');
      }
    } else {
      pdf.setFillColor(244, 244, 245);
      pdf.rect(margin + 6, startY + 16, leftColW - 12, finalPhotoH - 24, 'F');
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

    // Footer interno
    pdf.setTextColor(115, 115, 115);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.text('FICHA OPERATIVA · MARBELLA · USO INTERNO COCINA', margin + 8, cardY + cardH - 6);

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
      const parsed = parseStepText(stepItem.text);

      // Número paso en petróleo
      pdf.setTextColor(54, 96, 111);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.text(numStr, cardX + 6, cardYPos + 12);

      // Título de acción corto
      pdf.setFontSize(9);
      pdf.text(parsed.action.toUpperCase(), cardX + 18, cardYPos + 9);

      // Fotografía grande
      const imageOffsetTop = 16;
      const textSpaceH = 18;
      const imgW = cardW - 12;
      const imgH = stepCardH - imageOffsetTop - textSpaceH;
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

      // Indicación breve al pie de la foto
      pdf.setTextColor(39, 39, 42);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      const textY = imageY + imgH + 4;
      const lines = pdf.splitTextToSize(parsed.description, cardW - 12);
      pdf.text(lines.slice(0, 2), cardX + 6, textY);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-300 gap-3">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <span className="text-sm font-semibold tracking-wide">Cargando catálogo de recetas…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 p-4 md:p-8 print:p-0 print:bg-white">
      {/* Estilo local para impresión física perfecta en A3 Horizontal */}
      <style>{`
        @media print {
          @page {
            size: A3 landscape;
            margin: 0;
          }
          body {
            background-color: white !important;
            color: black !important;
          }
          .print-hidden {
            display: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Cabecera / Controles Superiores */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5 print:hidden">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#36606F]">
              Procedimientos Operativos Cocina
            </div>
            <h1 className="text-2xl font-black tracking-tight mt-1 text-zinc-900">
              Diseño de Fichas de Elaboración
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Visualización estricta en A3 Horizontal. Diseñado para lectura rápida y operatividad real.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveSheet}
              disabled={!recipe || saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors px-4 text-xs font-bold text-white disabled:opacity-40"
            >
              <Save size={14} />
              {saving ? 'Guardando…' : 'Guardar Datos'}
            </button>
            <button
              onClick={generatePdf}
              disabled={!recipe}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#36606f] hover:bg-[#2f5d6a] transition-colors px-4 text-xs font-bold text-white disabled:opacity-40"
            >
              <Download size={14} />
              Exportar PDF A3
            </button>
            <button
              onClick={() => window.print()}
              disabled={!recipe}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 transition-colors px-4 text-xs font-bold text-zinc-700"
            >
              <Printer size={14} />
              Imprimir Ficha
            </button>
          </div>
        </div>

        {/* Zona del Editor y Selección */}
        <div className="grid gap-6 lg:grid-cols-[340px_1fr] print:hidden">
          {/* Panel Lateral: Selección de Receta */}
          <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-5 h-fit">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Receta de cocina
              </label>
              <select
                value={recipeId}
                onChange={e => setRecipeId(e.target.value)}
                className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#36606f] focus:border-[#36606f] transition-all"
              >
                <option value="">Selecciona una receta…</option>
                {recipes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {recipe && (
              <div className="rounded-xl bg-zinc-50 p-4 border border-zinc-150 space-y-2">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Detalles del Plato
                </div>
                <div className="text-sm font-extrabold text-zinc-800">{recipe.name}</div>
                <div className="text-xs text-zinc-500 font-semibold flex flex-wrap gap-x-3 gap-y-1">
                  <span>{recipe.category || 'Sin categoría'}</span>
                  <span>•</span>
                  <span>{recipe.servings ?? 1} raciones</span>
                  {recipe.preparation_time && (
                    <>
                      <span>•</span>
                      <span>{recipe.preparation_time} min</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </aside>

          {/* Formulario de Contenido de la Ficha */}
          {recipe && (
            <section className="space-y-6">
              {/* Carga de Imágenes para cada Paso */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <h2 className="font-bold text-zinc-800">Fotografías de los Pasos</h2>
                  <span className="text-xs font-black bg-[#36606f]/10 text-[#36606f] px-2.5 py-1 rounded-full">
                    {steps.length} Pasos Detectados
                  </span>
                </div>

                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {steps.map((step, i) => {
                    const parsed = parseStepText(step.text);
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 p-3 hover:border-zinc-300 bg-zinc-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#36606f] text-xs font-black text-white">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <span className="text-[10px] font-black text-[#36606f] tracking-wider block uppercase leading-none mb-1">
                              {parsed.action}
                            </span>
                            <span className="text-xs font-medium text-zinc-600 truncate block">
                              {parsed.description}
                            </span>
                          </div>
                        </div>

                        <label className="relative flex h-14 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-zinc-350 bg-white hover:bg-zinc-50 transition-colors shadow-sm">
                          {step.image ? (
                            <img src={step.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center gap-0.5 text-zinc-400">
                              <Camera size={14} />
                              <span className="text-[8px] font-extrabold tracking-tight">FOTO</span>
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
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Editores de Listas */}
              <div className="grid gap-4 md:grid-cols-2">
                <ListEditor title="Puntos Clave" values={keyPoints} setValues={setKeyPoints} />
                <ListEditor title="No Hacer" values={avoidPoints} setValues={setAvoidPoints} />
              </div>
            </section>
          )}
        </div>

        {/* --- VISTA PREVIA EXCLUSIVA DEL CARTEL (A3 HORIZONTAL - ESCALADO) --- */}
        {recipe && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] print:hidden">
              Vista previa del póster (A3 Horizontal)
            </h3>

            {/* Contenedor que simula proporciones de A3 horizontal (Aspect Ratio 1.414:1) */}
            <div className="w-full overflow-x-auto pb-6 flex justify-center print:p-0">
              <div className="min-w-[1024px] max-w-[1400px] w-full">
                <div
                  id="kitchen-sheet"
                  className="w-full aspect-[1.414/1] bg-[#fcfbfa] p-[4%] border border-zinc-200/80 shadow-2xl rounded-2xl relative flex flex-col justify-between print:fixed print:inset-0 print:w-[420mm] print:h-[297mm] print:p-[14mm] print:bg-white print:shadow-none print:border-none print:rounded-none print:m-0 print:z-50"
                >
                  {/* Header de la Ficha */}
                  <div className="border-b-[3px] border-[#36606f] pb-3 flex justify-between items-end w-full">
                    <div>
                      <div className="text-[9px] md:text-[10px] font-black tracking-[0.25em] text-[#36606f] uppercase">
                        MARBELLA · BAR · COCINA · BUEN AMBIENTE
                      </div>
                      <h2 className="mt-1.5 text-2xl md:text-3xl font-black uppercase leading-none tracking-tight text-zinc-900">
                        {recipe.name}
                      </h2>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] md:text-[10px] font-black tracking-widest text-[#36606f] uppercase">
                        FICHA DE ELABORACIÓN
                      </div>
                      <div className="mt-1.5 text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        {recipe.servings ?? 1} raciones {recipe.preparation_time ? ` · ${recipe.preparation_time} min` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Bloque de Contenido */}
                  <div className="flex-1 min-h-0 w-full mt-4 flex gap-5">
                    {/* Columna Izquierda: Resultado Esperado & Puntos Clave (30% de ancho) */}
                    <div className="w-[30%] flex flex-col gap-4 h-full shrink-0 justify-between">
                      {/* Foto del resultado final */}
                      <div className="flex-1 rounded-xl overflow-hidden border border-zinc-200 bg-white flex flex-col p-3 shadow-sm min-h-0">
                        <span className="text-[9px] font-black tracking-widest text-[#36606f] mb-2 block uppercase">
                          RESULTADO ESPERADO / PLATO FINAL
                        </span>
                        <div className="flex-1 w-full rounded-lg overflow-hidden relative bg-zinc-50 border border-zinc-100">
                          {recipe.photo_url ? (
                            <img
                              src={recipe.photo_url}
                              alt={recipe.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex flex-col items-center justify-center text-zinc-300 gap-1">
                              <ChefHat size={32} strokeWidth={1.2} />
                              <span className="text-[9px] font-bold">Sin foto final</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tarjeta de advertencias y consejos */}
                      <div className="h-[40%] rounded-xl bg-[#0b1c36] text-white p-4 flex flex-col justify-between shadow-md relative overflow-hidden shrink-0">
                        <div className="space-y-3 overflow-y-auto max-h-full pr-1">
                          <div>
                            <h3 className="text-[9px] font-black tracking-widest text-emerald-400 uppercase">
                              PUNTOS CLAVE
                            </h3>
                            <ul className="mt-1.5 space-y-1 text-[9px] text-zinc-200">
                              {keyPoints.filter(Boolean).map((x, i) => (
                                <li key={i} className="flex items-start gap-1">
                                  <span className="text-emerald-400 font-bold">•</span>
                                  <span>{x}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {avoidPoints.filter(Boolean).length > 0 && (
                            <div>
                              <h3 className="text-[9px] font-black tracking-widest text-rose-450 uppercase">
                                NO HACER
                              </h3>
                              <ul className="mt-1.5 space-y-1 text-[9px] text-zinc-200">
                                {avoidPoints.filter(Boolean).map((x, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <span className="text-rose-400 font-bold">•</span>
                                    <span>{x}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        <div className="text-[7px] font-bold tracking-widest text-zinc-500 uppercase mt-2">
                          FICHA OPERATIVA · MARBELLA · USO INTERNO
                        </div>
                      </div>
                    </div>

                    {/* Columna Derecha: Cuadrícula de Pasos Adaptativa (70% de ancho) */}
                    <div className="flex-1 flex flex-col gap-4 h-full min-w-0">
                      {/* Fila 1 */}
                      <div
                        className={`grid gap-4 ${
                          fila1.length === 4 ? 'grid-cols-4' : fila1.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                        } ${fila2.length > 0 ? 'h-[calc(50%-8px)]' : 'h-full'}`}
                      >
                        {fila1.map((step, idx) => {
                          const numStr = String(idx + 1).padStart(2, '0');
                          const parsed = parseStepText(step.text);
                          return (
                            <div
                              key={idx}
                              className="bg-white rounded-xl border border-zinc-200 p-3 shadow-sm flex flex-col justify-between min-h-0 relative overflow-hidden"
                            >
                              <div className="flex items-baseline gap-1.5 border-b border-zinc-100 pb-1.5">
                                <span className="text-xl md:text-2xl font-black text-[#36606f] leading-none tracking-tight">
                                  {numStr}
                                </span>
                                <span className="text-[9px] font-black tracking-widest text-[#36606f] uppercase truncate">
                                  {parsed.action}
                                </span>
                              </div>

                              <div className="flex-1 w-full rounded-lg overflow-hidden relative bg-zinc-50 border border-zinc-100 min-h-0 my-2">
                                {step.image ? (
                                  <img src={step.image} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-zinc-200">
                                    <ChefHat size={28} strokeWidth={1} />
                                  </div>
                                )}
                              </div>

                              <p className="text-[9px] font-medium text-zinc-600 leading-snug line-clamp-2 min-h-[2.4em] flex items-center">
                                {parsed.description}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Fila 2 */}
                      {fila2.length > 0 && (
                        <div
                          className={`grid gap-4 ${
                            fila2.length === 4 ? 'grid-cols-4' : fila2.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                          } h-[calc(50%-8px)]`}
                        >
                          {fila2.map((step, idx) => {
                            const numStr = String(fila1.length + idx + 1).padStart(2, '0');
                            const parsed = parseStepText(step.text);
                            return (
                              <div
                                key={idx}
                                className="bg-white rounded-xl border border-zinc-200 p-3 shadow-sm flex flex-col justify-between min-h-0 relative overflow-hidden"
                              >
                                <div className="flex items-baseline gap-1.5 border-b border-zinc-100 pb-1.5">
                                  <span className="text-xl md:text-2xl font-black text-[#36606f] leading-none tracking-tight">
                                    {numStr}
                                  </span>
                                  <span className="text-[9px] font-black tracking-widest text-[#36606f] uppercase truncate">
                                    {parsed.action}
                                  </span>
                                </div>

                                <div className="flex-1 w-full rounded-lg overflow-hidden relative bg-zinc-50 border border-zinc-100 min-h-0 my-2">
                                  {step.image ? (
                                    <img src={step.image} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-zinc-200">
                                      <ChefHat size={28} strokeWidth={1} />
                                    </div>
                                  )}
                                </div>

                                <p className="text-[9px] font-medium text-zinc-600 leading-snug line-clamp-2 min-h-[2.4em] flex items-center">
                                  {parsed.description}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div className="fixed bottom-4 right-4 rounded-xl bg-zinc-900 px-4 py-3 text-xs font-bold text-white shadow-xl print:hidden animate-in slide-in-from-bottom duration-350">
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
        <h2 className="font-extrabold text-sm text-zinc-800 uppercase tracking-wider">{title}</h2>
        <button
          type="button"
          onClick={() => setValues([...values, ''])}
          className="text-xs font-black text-[#36606F] hover:text-[#2f5d6a] transition-colors"
        >
          + Añadir Punto
        </button>
      </div>

      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
        {values.map((value, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={value}
              onChange={e =>
                setValues(
                  values.map((x, j) => (j === i ? e.target.value : x))
                )
              }
              className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-300 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#36606f] focus:border-[#36606f] transition-all"
              placeholder={
                title === 'Puntos Clave'
                  ? 'Ej. Freír exactamente 2 min'
                  : 'Ej. No servir con exceso de aceite'
              }
            />
            <button
              type="button"
              onClick={() => setValues(values.filter((_, j) => j !== i))}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors text-zinc-400 hover:text-zinc-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
