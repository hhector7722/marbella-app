'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChefHat,
  Download,
  Eye,
  ImagePlus,
  Monitor,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { createClient } from '@/utils/supabase/client';

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

type Step = {
  text: string;
  image: string | null;
};

type SheetOrientation = 'landscape' | 'portrait';
type MobileMode = 'edit' | 'preview';

const supabase = createClient();

function splitSteps(value: string | null): Step[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(text => ({ text, image: null }));
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function sheetDimensions(orientation: SheetOrientation) {
  return orientation === 'landscape'
    ? { pdfWidth: 420, pdfHeight: 297, exportWidth: 1587, exportHeight: 1123 }
    : { pdfWidth: 297, pdfHeight: 420, exportWidth: 1123, exportHeight: 1587 };
}

export default function FichasCocinaPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeId, setRecipeId] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [category, setCategory] = useState('');
  const [servings, setServings] = useState(1);
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<SheetOrientation>('landscape');
  const [mobileMode, setMobileMode] = useState<MobileMode>('edit');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const exportRef = useRef<HTMLDivElement>(null);

  const recipe = useMemo(
    () => recipes.find(item => item.id === recipeId) ?? null,
    [recipes, recipeId],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id,name,category,preparation_time,servings,photo_url,elaboration,is_sellable')
        .order('name');

      if (!active) return;

      if (error) {
        setMessage('No se pudieron cargar las recetas: ' + error.message);
      } else if (data) {
        setRecipes(data as Recipe[]);
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!recipe) {
      setSteps([]);
      setCategory('');
      setServings(1);
      setMainImageUrl(null);
      setOrientation('landscape');
      return;
    }

    let active = true;

    void (async () => {
      const baseSteps = splitSteps(recipe.elaboration);

      setSteps(baseSteps);
      setCategory(recipe.category ?? '');
      setServings(recipe.servings ?? 1);
      setMainImageUrl(recipe.photo_url);
      setOrientation('landscape');
      setMessage('');

      const { data, error } = await supabase
        .from('recipe_kitchen_sheets')
        .select('step_images,orientation,main_image_url')
        .eq('recipe_id', recipe.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setMessage('No se pudo cargar la ficha guardada: ' + error.message);
        return;
      }

      if (!data) return;

      const images = Array.isArray(data.step_images) ? (data.step_images as Array<string | null>) : [];
      setSteps(
        baseSteps.map((step, index) => ({
          ...step,
          image: typeof images[index] === 'string' ? images[index] : null,
        })),
      );
      setOrientation(data.orientation === 'portrait' ? 'portrait' : 'landscape');
      setMainImageUrl(
        typeof data.main_image_url === 'string' && data.main_image_url
          ? data.main_image_url
          : recipe.photo_url,
      );
    })();

    return () => {
      active = false;
    };
  }, [recipe]);

  async function uploadImage(file: File, kind: 'main' | 'step', stepIndex?: number) {
    if (!recipe) return;

    setMessage('Subiendo imagen…');

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const suffix = kind === 'main' ? 'main' : 'step-' + String((stepIndex ?? 0) + 1);
    const path =
      'kitchen-sheets/' +
      recipe.id +
      '/' +
      suffix +
      '-' +
      String(Date.now()) +
      '.' +
      ext;

    const { error } = await supabase.storage
      .from('recipes')
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });

    if (error) {
      setMessage('Error subiendo imagen: ' + error.message);
      return;
    }

    const { data } = supabase.storage.from('recipes').getPublicUrl(path);

    if (kind === 'main') {
      setMainImageUrl(data.publicUrl);
    } else if (typeof stepIndex === 'number') {
      setSteps(current =>
        current.map((step, index) =>
          index === stepIndex ? { ...step, image: data.publicUrl } : step,
        ),
      );
    }

    setMessage('Imagen preparada. Guarda la ficha para conservar el cambio.');
  }

  async function saveSheet() {
    if (!recipe) return;

    const normalizedSteps = steps
      .map(step => ({ ...step, text: step.text.trim() }))
      .filter(step => Boolean(step.text));

    if (!normalizedSteps.length) {
      setMessage('La ficha necesita al menos un paso de elaboración.');
      return;
    }

    const normalizedServings = Math.max(1, Math.round(Number(servings) || 1));
    const normalizedCategory = category.trim() || null;
    const now = new Date().toISOString();

    setSaving(true);
    setMessage('');

    const { error: recipeError } = await supabase
      .from('recipes')
      .update({
        category: normalizedCategory,
        servings: normalizedServings,
        elaboration: normalizedSteps.map(step => step.text).join('\n'),
        updated_at: now,
      })
      .eq('id', recipe.id);

    if (recipeError) {
      setSaving(false);
      setMessage('Error guardando la receta: ' + recipeError.message);
      return;
    }

    const sheetPayload = {
      recipe_id: recipe.id,
      step_images: normalizedSteps.map(step => step.image),
      orientation,
      main_image_url:
        mainImageUrl && mainImageUrl !== recipe.photo_url ? mainImageUrl : null,
      updated_at: now,
    };

    const { error: sheetError } = await supabase
      .from('recipe_kitchen_sheets')
      .upsert(sheetPayload, { onConflict: 'recipe_id' });

    setSaving(false);

    if (sheetError) {
      setMessage('Error guardando la ficha: ' + sheetError.message);
      return;
    }

    setSteps(normalizedSteps);
    setServings(normalizedServings);
    setCategory(normalizedCategory ?? '');
    setRecipes(current =>
      current.map(item =>
        item.id === recipe.id
          ? {
              ...item,
              category: normalizedCategory,
              servings: normalizedServings,
              elaboration: normalizedSteps.map(step => step.text).join('\n'),
            }
          : item,
      ),
    );
    setMessage('Ficha guardada correctamente');
  }

  async function generatePdf() {
    if (!recipe || !exportRef.current) return;

    setExporting(true);
    setMessage('Generando PDF…');

    try {
      const { toPng } = await import('html-to-image');
      await document.fonts.ready;

      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        backgroundColor: '#FFFFFF',
        pixelRatio: 1.35,
      });

      const dimensions = sheetDimensions(orientation);
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: 'a3',
        compress: true,
      });

      pdf.addImage(
        dataUrl,
        'PNG',
        0,
        0,
        dimensions.pdfWidth,
        dimensions.pdfHeight,
        undefined,
        'FAST',
      );
      pdf.save(slug(recipe.name) + '-ficha-cocina-a3.pdf');
      setMessage('PDF generado correctamente');
    } catch (error) {
      setMessage(
        'No se pudo generar el PDF: ' +
          (error instanceof Error ? error.message : 'error desconocido'),
      );
    } finally {
      setExporting(false);
    }
  }

  function addStep() {
    setSteps(current => [...current, { text: '', image: null }]);
  }

  function removeStep(index: number) {
    setSteps(current => current.filter((_, itemIndex) => itemIndex !== index));
  }

  const photosReady = steps.filter(step => Boolean(step.image)).length;
  const dimensions = sheetDimensions(orientation);
  const printCss =
    '@media print {' +
    '@page { size: A3 ' +
    orientation +
    '; margin: 0; }' +
    'html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; overflow: hidden !important; }' +
    '#kitchen-sheet-print { position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; display: block !important; width: ' +
    String(dimensions.pdfWidth) +
    'mm !important; height: ' +
    String(dimensions.pdfHeight) +
    'mm !important; background: #fff !important; }' +
    '}';

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center text-white/80">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <span className="text-sm font-semibold">Cargando recetas…</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{printCss}</style>

      <div className="flex min-h-full flex-col text-zinc-900 print:hidden xl:h-full xl:min-h-0">
        <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3 xl:min-h-0">
          <header className="sticky top-0 z-30 flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/95 px-3 py-2 shadow-sm backdrop-blur xl:static">
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-zinc-900">Fichas de cocina</h1>
              <p className="truncate text-xs text-zinc-500">
                {recipe ? recipe.name : 'Plantilla operativa A3'}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={generatePdf}
                disabled={!recipe || exporting}
                className="hidden h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 sm:inline-flex"
              >
                <Download size={15} />
                {exporting ? 'Generando…' : 'PDF'}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!recipe}
                className="hidden h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 sm:inline-flex"
              >
                <Printer size={15} />
                Imprimir
              </button>
              <button
                type="button"
                onClick={saveSheet}
                disabled={!recipe || saving}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#36606F] px-3 text-xs font-bold text-white transition hover:bg-[#2F5D6A] disabled:opacity-40"
              >
                <Save size={15} />
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/50 bg-white/10 p-1 xl:hidden">
            <button
              type="button"
              onClick={() => setMobileMode('edit')}
              className={
                'flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ' +
                (mobileMode === 'edit'
                  ? 'bg-white text-[#36606F] shadow-sm'
                  : 'text-white/80')
              }
            >
              <Smartphone size={17} />
              Editar
            </button>
            <button
              type="button"
              onClick={() => setMobileMode('preview')}
              className={
                'flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ' +
                (mobileMode === 'preview'
                  ? 'bg-white text-[#36606F] shadow-sm'
                  : 'text-white/80')
              }
            >
              <Eye size={17} />
              Vista previa
            </button>
          </div>

          <main className="grid flex-1 gap-3 xl:min-h-0 xl:grid-cols-[minmax(0,1.04fr)_minmax(500px,0.96fr)]">
            <section
              className={
                (mobileMode === 'preview' ? 'hidden xl:flex ' : 'flex ') +
                'min-h-0 flex-col'
              }
            >
              {!recipe ? (
                <div className="self-start rounded-2xl border border-white/60 bg-white p-4 shadow-sm">
                  <div className="flex max-w-full items-center gap-3">
                    <ChefHat className="shrink-0 text-zinc-300" size={30} strokeWidth={1.25} />
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-zinc-800">Selecciona una receta</h2>
                      <select
                        value={recipeId}
                        onChange={event => setRecipeId(event.target.value)}
                        className="mt-2 h-9 w-auto min-w-56 max-w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-medium outline-none focus:border-[#36606F]"
                      >
                        <option value="">Selecciona receta…</option>
                        {recipes.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.is_sellable === false ? item.name + ' · Elaboración' : item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 xl:min-h-0 xl:flex-1 xl:pr-1">
                  <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-bold text-zinc-900">Información general</h2>
                      <span className="rounded-full bg-[#36606F]/10 px-2 py-0.5 text-[10px] font-bold text-[#36606F]">
                        Plantilla fija
                      </span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(150px,1.15fr)_minmax(95px,0.72fr)_72px_minmax(185px,1.1fr)_minmax(175px,0.95fr)] xl:items-end">
                      <label className="min-w-0">
                        <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Receta</span>
                        <select
                          value={recipeId}
                          onChange={event => setRecipeId(event.target.value)}
                          className="h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-medium outline-none focus:border-[#36606F]"
                        >
                          {recipes.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.is_sellable === false ? item.name + ' · Elaboración' : item.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="min-w-0">
                        <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Categoría</span>
                        <input
                          value={category}
                          onChange={event => setCategory(event.target.value)}
                          className="h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-medium outline-none focus:border-[#36606F]"
                          placeholder="Ej. Tapas"
                        />
                      </label>

                      <label className="min-w-0">
                        <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Raciones</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={servings}
                          onChange={event => setServings(Number(event.target.value) || 1)}
                          className="h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-medium outline-none focus:border-[#36606F]"
                        />
                      </label>

                      <div className="min-w-0">
                        <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Orientación</span>
                        <div className="grid h-9 grid-cols-2 gap-0.5 rounded-lg bg-zinc-100 p-0.5">
                          <button
                            type="button"
                            onClick={() => setOrientation('landscape')}
                            className={
                              'flex min-w-0 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-semibold transition ' +
                              (orientation === 'landscape'
                                ? 'bg-white text-[#36606F] shadow-sm'
                                : 'text-zinc-500')
                            }
                          >
                            <Monitor size={13} />
                            Horizontal
                          </button>
                          <button
                            type="button"
                            onClick={() => setOrientation('portrait')}
                            className={
                              'flex min-w-0 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-semibold transition ' +
                              (orientation === 'portrait'
                                ? 'bg-white text-[#36606F] shadow-sm'
                                : 'text-zinc-500')
                            }
                          >
                            <Smartphone size={13} />
                            Vertical
                          </button>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Imagen principal</span>
                        <div className="flex h-9 min-w-0 items-center gap-1.5">
                          <div className="h-9 w-12 shrink-0 overflow-hidden rounded-lg bg-transparent">
                            {mainImageUrl ? (
                              <img
                                src={mainImageUrl}
                                alt={recipe.name}
                                className="h-full w-full rounded-lg object-contain"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-zinc-300">
                                <ChefHat size={16} strokeWidth={1.25} />
                              </div>
                            )}
                          </div>

                          <label className="inline-flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50">
                            <ImagePlus size={13} className="shrink-0" />
                            <span className="truncate">Cambiar</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={event => {
                                const file = event.target.files?.[0];
                                if (file) void uploadImage(file, 'main');
                                event.currentTarget.value = '';
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => setMainImageUrl(recipe.photo_url)}
                            disabled={mainImageUrl === recipe.photo_url}
                            aria-label="Restaurar foto de receta"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-30"
                          >
                            <RotateCcw size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-bold text-zinc-900">Pasos de elaboración</h2>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {steps.length} pasos · {photosReady} imágenes
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addStep}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-[#36606F] transition hover:bg-zinc-50"
                      >
                        <Plus size={14} />
                        Añadir paso
                      </button>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {steps.map((step, index) => (
                        <article
                          key={index}
                          className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-2"
                        >
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#36606F] text-[11px] font-bold text-white">
                                {index + 1}
                              </span>
                              <span className="text-xs font-bold text-zinc-700">Paso {index + 1}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeStep(index)}
                              disabled={steps.length <= 1}
                              aria-label={'Eliminar paso ' + String(index + 1)}
                              className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 transition hover:bg-white hover:text-rose-600 disabled:opacity-30"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                          <label className="relative block h-20 cursor-pointer overflow-hidden rounded-lg border border-zinc-200 bg-white xl:h-16">
                            {step.image ? (
                              <img
                                src={step.image}
                                alt=""
                                className="h-full w-full rounded-[1.35cqw] object-contain"
                              />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-zinc-400">
                                <Camera size={18} />
                                <span className="text-[11px] font-semibold">Añadir foto</span>
                              </div>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="absolute inset-0 cursor-pointer opacity-0"
                              onChange={event => {
                                const file = event.target.files?.[0];
                                if (file) void uploadImage(file, 'step', index);
                                event.currentTarget.value = '';
                              }}
                            />
                          </label>

                          {step.image ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSteps(current =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, image: null } : item,
                                  ),
                                )
                              }
                              className="mt-1 text-[11px] font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
                            >
                              Quitar foto
                            </button>
                          ) : null}

                          <textarea
                            value={step.text}
                            onChange={event =>
                              setSteps(current =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, text: event.target.value } : item,
                                ),
                              )
                            }
                            rows={2}
                            className="mt-1.5 min-h-14 w-full resize-y rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-base leading-snug text-zinc-800 outline-none focus:border-[#36606F] md:text-xs"
                            placeholder="Describe el paso de elaboración"
                          />
                        </article>
                      ))}
                    </div>
                  </section>

                  <div className="grid grid-cols-2 gap-2 pb-2 xl:hidden">
                    <button
                      type="button"
                      onClick={() => setMobileMode('preview')}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-[#36606F] shadow-sm"
                    >
                      <Eye size={17} />
                      Vista previa
                    </button>
                    <button
                      type="button"
                      onClick={saveSheet}
                      disabled={saving}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#36606F] text-sm font-bold text-white shadow-sm disabled:opacity-40"
                    >
                      <Save size={17} />
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <aside
              className={
                (mobileMode === 'edit' ? 'hidden xl:flex ' : 'flex ') +
                'h-fit min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm xl:self-start'
              }
            >
              <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900">Vista previa de la ficha</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    A3 {orientation === 'landscape' ? 'horizontal' : 'vertical'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={generatePdf}
                    disabled={!recipe || exporting}
                    aria-label="Generar PDF"
                    className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
                  >
                    <Download size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    disabled={!recipe}
                    aria-label="Imprimir"
                    className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
                  >
                    <Printer size={17} />
                  </button>
                </div>
              </div>

              {!recipe ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-400">
                  Sin receta seleccionada
                </div>
              ) : (
                <div className="flex min-h-0 w-full items-start justify-center overflow-hidden rounded-xl bg-transparent p-0">
                  <div
                    className={
                      'overflow-hidden rounded-lg bg-white shadow-[0_12px_40px_rgba(15,23,42,0.16)] ' +
                      (orientation === 'landscape'
                        ? 'w-full'
                        : 'w-auto max-w-full')
                    }
                    style={{
                      aspectRatio: orientation === 'landscape' ? '420 / 297' : '297 / 420',
                      maxHeight: 'calc(100dvh - 190px)',
                    }}
                  >
                    <KitchenSheetPreview
                      recipeName={recipe.name}
                            servings={servings}
                      preparationTime={recipe.preparation_time}
                      mainImageUrl={mainImageUrl}
                      steps={steps}
                      orientation={orientation}
                    />
                  </div>
                </div>
              )}
            </aside>
          </main>
        </div>

        {message ? (
          <div className="fixed bottom-4 left-1/2 z-[80] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-xl bg-zinc-950 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-xl xl:left-auto xl:right-4 xl:translate-x-0">
            {message}
          </div>
        ) : null}
      </div>

      {recipe ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed left-[-10000px] top-0 overflow-hidden"
            style={{ width: dimensions.exportWidth, height: dimensions.exportHeight }}
          >
            <div ref={exportRef} className="h-full w-full">
              <KitchenSheetPreview
                recipeName={recipe.name}
                servings={servings}
                preparationTime={recipe.preparation_time}
                mainImageUrl={mainImageUrl}
                steps={steps}
                orientation={orientation}
              />
            </div>
          </div>

          <div
            id="kitchen-sheet-print"
            className="hidden overflow-hidden bg-white print:block"
            style={{
              width: String(dimensions.pdfWidth) + 'mm',
              height: String(dimensions.pdfHeight) + 'mm',
            }}
          >
            <KitchenSheetPreview
              recipeName={recipe.name}
              servings={servings}
              preparationTime={recipe.preparation_time}
              mainImageUrl={mainImageUrl}
              steps={steps}
              orientation={orientation}
            />
          </div>
        </>
      ) : null}
    </>
  );
}

function KitchenSheetPreview({
  recipeName,
  servings,
  preparationTime,
  mainImageUrl,
  steps,
  orientation,
}: {
  recipeName: string;
  servings: number;
  preparationTime: number | null;
  mainImageUrl: string | null;
  steps: Step[];
  orientation: SheetOrientation;
}) {
  const visibleSteps = steps.slice(0, 8);
  const columns =
    orientation === 'portrait'
      ? 2
      : visibleSteps.length <= 4
        ? 2
        : visibleSteps.length <= 6
          ? 3
          : 4;

  const servingsLabel =
    String(Math.max(1, Math.round(Number(servings) || 1))) +
    ' ración' +
    (Number(servings) === 1 ? '' : 'es');

  return (
    <div className="h-full w-full overflow-hidden bg-white font-sans text-zinc-900 [container-type:inline-size]">
      <div className="flex h-full flex-col p-[2.35cqw]">
        <header className="flex h-[6%] shrink-0 items-center justify-end">
          <img
            src="/icons/logo-white.png"
            alt="Bar La Marbella"
            className="h-[5.4cqw] w-[5.4cqw] object-contain"
          />
        </header>

        <section
          className={
            orientation === 'landscape'
              ? 'mt-[1.4cqw] grid min-h-0 shrink-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-[1.5cqw]'
              : 'mt-[1.4cqw] flex min-h-0 shrink-0 flex-col gap-[1.2cqw]'
          }
          style={{ height: orientation === 'landscape' ? '24%' : '28%' }}
        >
          <div className="flex min-h-0 flex-col justify-center">
            <h2
              className="max-w-full font-black uppercase leading-[0.92] tracking-[-0.045em] text-[#18181B]"
              style={{ fontSize: orientation === 'landscape' ? '4.7cqw' : '6.8cqw' }}
            >
              {recipeName}
            </h2>

            <div
              className="mt-[1.1cqw] flex items-center gap-[0.8cqw] font-bold text-[#52525B]"
              style={{ fontSize: orientation === 'landscape' ? '1.05cqw' : '1.42cqw' }}
            >
              <span>{servingsLabel}</span>
              {preparationTime ? (
                <>
                  <span className="font-normal text-zinc-300">·</span>
                  <span>{preparationTime} min</span>
                </>
              ) : null}
            </div>

          </div>

          <div className="min-h-0 overflow-hidden rounded-[1.2cqw] bg-transparent">
            {mainImageUrl ? (
              <img
                src={mainImageUrl}
                alt={recipeName}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-300">
                <ChefHat size="12%" strokeWidth={1.1} />
              </div>
            )}
          </div>
        </section>

        <div
          className="mt-[0.8cqw] grid min-h-0 flex-1 gap-[0.7cqw]"
          style={{ gridTemplateColumns: 'repeat(' + String(columns) + ', minmax(0, 1fr))' }}
        >
          {visibleSteps.map((step, index) => (
            <article
              key={index}
              className="flex min-h-0 flex-col overflow-visible bg-transparent p-0"
            >
              <div
                className="relative mx-auto max-w-full shrink-0 overflow-hidden rounded-[1.15cqw] bg-transparent"
                style={{
                  height: orientation === 'landscape' ? '56%' : '52%',
                  aspectRatio: '16 / 9',
                }}
              >
                {step.image ? (
                  <img
                    src={step.image}
                    alt=""
                    className="h-full w-full rounded-[1.15cqw] object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-[1.15cqw] text-zinc-300">
                    <ChefHat size="16%" strokeWidth={1.1} />
                  </div>
                )}

                <span
                  className="absolute left-[0.55cqw] top-[0.55cqw] z-10 grid aspect-square w-[2.25cqw] place-items-center rounded-full bg-[#C0263A] font-black text-white shadow-md ring-[0.22cqw] ring-white"
                  style={{ fontSize: orientation === 'landscape' ? '0.95cqw' : '1.2cqw' }}
                >
                  {index + 1}
                </span>
              </div>

              <p
                className="min-h-0 flex-1 px-[0.55cqw] pt-[0.65cqw] text-center font-semibold leading-[1.28] text-[#27272A]"
                style={{ fontSize: stepFontSize(step.text, orientation) }}
              >
                {step.text || 'Paso pendiente de completar.'}
              </p>
            </article>
          ))}
        </div>

      </div>
    </div>
  );
}

function stepFontSize(text: string, orientation: SheetOrientation) {
  if (orientation === 'portrait') {
    if (text.length > 150) return '1cqw';
    if (text.length > 95) return '1.12cqw';
    return '1.28cqw';
  }

  if (text.length > 150) return '0.78cqw';
  if (text.length > 95) return '0.9cqw';
  return '1.05cqw';
}
