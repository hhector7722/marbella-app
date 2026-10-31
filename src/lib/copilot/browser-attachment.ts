/** Preparar adjuntos en iPhone/navegador sin superar el límite de body Vercel (4,5 MB). */
export async function prepareChatImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Selecciona una imagen.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('No se ha podido abrir la foto. Convierte HEIC a JPG desde Fotos.'); }
  try {
    const maxEdge=1440;
    const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas no disponible');
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.77));
    if(!blob || blob.size>3_800_000)throw new Error('La imagen no se ha podido preparar para el envío.');
    return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
  } finally { bitmap.close(); }
}

export async function readLargeChatPdfInBrowser(file:File):Promise<{pages:number;content:string;truncated:boolean}>{
  if(file.size>20*1024*1024)throw new Error('PDF demasiado grande (máximo 20 MB).');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('No es un PDF completo.');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.mjs';
  const task=pdfjs.getDocument({data:bytes,useSystemFonts:true});
  const pdf=await task.promise;
  try {
    if(!pdf.numPages || pdf.numPages>150)throw new Error('Se admiten PDF de hasta 150 páginas.');
    let text='';
    for(let pageNum=1;pageNum<=pdf.numPages;pageNum++){
      const page=await pdf.getPage(pageNum);
      const content=await page.getTextContent();
      const strings=content.items.flatMap(item=>('str' in item && typeof item.str==='string')?[item.str]:[]);
      if(strings.length)text+=`Página ${pageNum}: ${strings.join(' ')}\n\n`;
      page.cleanup();
      // Queda margen para el texto de la pregunta y los mensajes históricos.
      if(text.length>=14000)break;
    }
    if(!text.trim())throw new Error('PDF escaneado sin texto. Utiliza un PDF con texto seleccionable.');
    return {pages:pdf.numPages,content:text.slice(0,14000),truncated:text.length>14000};
  } finally { await pdf.destroy(); }
}
