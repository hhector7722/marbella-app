import sharp from 'sharp';
import { createClient } from '@/utils/supabase/server';
import { readChatPdf } from '@/lib/copilot/pdf-attachment';
import { describeChatImage, FreeVisionError } from '@/lib/copilot/free-vision';

export const runtime='nodejs';
export const maxDuration=60;
const MAX_PDF=20*1024*1024;
const MAX_IMAGE=10*1024*1024;

export async function POST(request:Request){
  const db=await createClient();
  const {data:{user},error:authError}=await db.auth.getUser();
  if(authError||!user)return Response.json({error:'Debes iniciar sesión.'},{status:401});
  try{
    const form=await request.formData();
    const file=form.get('file');
    if(!(file instanceof File)||file.size<10) return Response.json({error:'Selecciona una imagen o un PDF válido.'},{status:400});
    const name=file.name.slice(0,120).replace(/[\r\n<>\[\]]/g,' ');
    const bytes=Buffer.from(await file.arrayBuffer());
    const magic=bytes.subarray(0,5).toString('ascii');
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
      if(bytes.length>MAX_PDF)return Response.json({error:'PDF demasiado grande (máximo 20 MB).'},{status:413});
      if(magic!=='%PDF-')return Response.json({error:'El archivo seleccionado no contiene un PDF completo.'},{status:400});
      const pdf=await readChatPdf(bytes);
      if(pdf.scanned)return Response.json({error:'PDF escaneado sin texto seleccionable. Para leerlo, súbelo a Albaranes o utiliza un PDF con texto.'},{status:422});
      return Response.json({name,kind:'pdf',pages:pdf.pages,content:pdf.text,
        truncated:pdf.text.length===14000,
        notice:'PDF temporal: se extrajo el texto para esta conversación, sin guardar el archivo original.'});
    }
    if(!file.type.startsWith('image/')||bytes.length>MAX_IMAGE)return Response.json({error:'Formato no admitido. Usa JPG, PNG o WebP (hasta 10 MB), o PDF (hasta 20 MB).'},{status:415});
    const image=await sharp(bytes,{limitInputPixels:36_000_000}).rotate().resize({width:1100,height:1100,fit:'inside',withoutEnlargement:true})
      .jpeg({quality:78}).toBuffer();
    const result=await describeChatImage(image.toString('base64'),{
      groq:process.env.GROQ_API_KEY,
      xkiro:process.env.XKIRO_API_KEY,
    });
    return Response.json({name,kind:'image',content:result.content,
      notice:'Imagen analizada temporalmente; no se ha guardado el archivo original.'});
  }catch(cause){
    if(cause instanceof FreeVisionError){
      return Response.json({error:cause.message},{status:503});
    }
    console.warn('[copilot:attachments]',cause instanceof Error?cause.name:'Error');
    return Response.json({error:cause instanceof Error && /PDF/.test(cause.message)?cause.message:'No se pudo procesar el adjunto.'},{status:500});
  }
}
