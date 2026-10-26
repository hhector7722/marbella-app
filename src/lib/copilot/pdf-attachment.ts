import PDFParser from 'pdf2json';

/** Extrae páginas textuales sin OCR ni modificar el PDF original. */
export async function readChatPdf(bytes:Buffer):Promise<{text:string;pages:number;scanned:boolean}> {
  if(bytes.length<50 || bytes.subarray(0,5).toString('ascii')!=='%PDF-')throw new Error('El archivo no es un PDF válido.');
  const parsed = await new Promise<unknown>((resolve,reject)=>{
    const parser=new PDFParser(null,false);
    parser.on('pdfParser_dataReady',data=>resolve(data));
    parser.on('pdfParser_dataError',()=>reject(new Error('No se pudo leer el PDF.')));
    parser.parseBuffer(bytes);
  });
  const document=parsed as {Pages?:Array<{Texts?:Array<{R?:Array<{T?:string}>}>}>};
  const pages=document.Pages??[];
  if(!pages.length || pages.length>150)throw new Error('El PDF debe tener entre 1 y 150 páginas.');
  const lines=pages.map((page,i)=>{
    const text=(page.Texts??[]).flatMap(x=>x.R??[]).map(run=>{
      try{return decodeURIComponent(run.T??'');}catch{return run.T??'';}
    }).join(' ').trim();
    return text?`Página ${i+1}: ${text}`:'';
  }).filter(Boolean);
  return {text:lines.join('\n\n').slice(0,14000),pages:pages.length,scanned:lines.length===0};
}
