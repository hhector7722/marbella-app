'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Mic, Square, Paperclip, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  STAFF_CLOCK_MEDIA_LIMIT, staffClockMediaKind, validateClockMediaFile,
  type StaffClockAttachment,
} from '@/lib/staff/clock-media';

type MediaItem = Pick<StaffClockAttachment, 'kind' | 'name'> & { url: string };

export function ClockMediaGallery({ items }: { items: MediaItem[] }) {
  const [expanded, setExpanded] = useState<MediaItem | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(null); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [expanded]);

  if (!items.length) return null;
  return (
    <>
      <div data-element="clock-message-media-gallery" className="grid w-full min-w-0 grid-cols-2 gap-3 text-left sm:grid-cols-3">
        {items.map((item, index) => (
          <div key={item.url + index} className="min-w-0 overflow-hidden rounded-xl border border-white/20 bg-black/15 p-2">
            {item.kind === 'image' ? (
              <button type="button" className="block w-full" onClick={() => setExpanded(item)} aria-label={'Ampliar ' + item.name}>
                {/* Las imágenes proceden del almacenamiento privado, con URLs firmadas. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.name} className="h-28 w-full rounded-lg object-contain sm:h-36" />
                <span className="mt-1 flex items-center justify-center gap-1 text-xs"><ImageIcon size={13}/> Ampliar</span>
              </button>
            ) : item.kind === 'audio' ? (
              <audio className="w-full" controls preload="metadata" src={item.url} aria-label={item.name} />
            ) : (
              <video className="max-h-44 w-full rounded-lg object-contain" controls playsInline preload="metadata" src={item.url} aria-label={item.name} />
            )}
            <p className="mt-1 truncate text-[11px] opacity-75" title={item.name}>{item.name}</p>
          </div>
        ))}
      </div>
      {expanded && typeof document !== 'undefined' && createPortal(
        <div role="dialog" aria-modal="true" aria-label={'Imagen ampliada: ' + expanded.name}
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setExpanded(null)}>
          <button type="button" onClick={() => setExpanded(null)}
            className="absolute right-4 top-5 rounded-full bg-white/20 p-3 text-white" aria-label="Cerrar imagen"><X/></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={expanded.url} alt={expanded.name} className="max-h-[90dvh] max-w-[95vw] object-contain"
            onClick={(event) => event.stopPropagation()} />
        </div>,
        document.body,
      )}
    </>
  );
}

export function ClockMediaPicker({
  files, onChange, onRecordingChange, disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const filesRef = useRef(files);
  const [recording, setRecording] = useState(false);
  const [previews, setPreviews] = useState<MediaItem[]>([]);
  filesRef.current = files;

  useEffect(() => {
    const urls = files.map((file) => ({
      url: URL.createObjectURL(file),
      name: file.name,
      kind: staffClockMediaKind(file.type) ?? 'audio',
    }));
    setPreviews(urls);
    return () => urls.forEach((item) => URL.revokeObjectURL(item.url));
  }, [files]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const addFiles = (incoming: File[]) => {
    if (filesRef.current.length + incoming.length > STAFF_CLOCK_MEDIA_LIMIT) {
      toast.error('Máximo de 8 adjuntos por mensaje.');
      return;
    }
    for (const file of incoming) {
      const error = validateClockMediaFile(file);
      if (error) { toast.error(file.name + ': ' + error); return; }
    }
    onChange([...filesRef.current, ...incoming]);
  };

  const startRecording = async () => {
    if (disabled || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Este navegador no admite grabación. Puedes adjuntar un audio ya grabado.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ['audio/mp4', 'audio/webm', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const recordedMime = recorder.mimeType.split(';')[0];
      if (!staffClockMediaKind(recordedMime) || !recordedMime.startsWith('audio/')) {
        stream.getTracks().forEach((track) => track.stop());
        toast.error('No se admite el formato de grabación de este navegador.');
        return;
      }
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        onRecordingChange?.(false);
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        const ext = recordedMime === 'audio/mp4' ? 'm4a' : recordedMime === 'audio/ogg' ? 'ogg' : 'webm';
        addFiles([new File([blob], 'Mensaje de voz.' + ext, { type: recordedMime })]);
      };
      recorder.start(1000);
      setRecording(true);
      onRecordingChange?.(true);
    } catch {
      toast.error('No se ha podido activar el micrófono.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input ref={inputRef} type="file" multiple
          accept="image/*,audio/*,video/mp4,video/quicktime,video/webm"
          className="hidden" disabled={disabled}
          onChange={(event) => {
            const next = Array.from(event.target.files ?? []);
            addFiles(next);
            event.target.value = '';
          }}/>
        <button type="button" disabled={disabled || recording}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 disabled:opacity-50">
          <Paperclip size={17}/> Añadir fotos, audios o vídeos
        </button>
        <button type="button" disabled={disabled} onClick={() => recording ? stopRecording() : void startRecording()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 disabled:opacity-50">
          {recording ? <Square size={16} className="text-red-600"/> : <Mic size={17}/>}
          {recording ? 'Detener grabación' : 'Grabar audio'}
        </button>
      </div>
      {recording && <p role="status" className="text-sm text-red-600">Grabando mensaje de voz…</p>}
      {!!previews.length && (
        <div className="space-y-2">
          <ClockMediaGallery items={previews}/>
          <div className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <button type="button" key={index} disabled={disabled || recording}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-300 px-2 py-1 text-xs text-zinc-800">
                <Trash2 size={13}/> <span className="max-w-36 truncate">{file.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-zinc-500">{files.length}/8 adjuntos · Imágenes hasta 12 MB, audios 20 MB y vídeos 50 MB.</p>
    </div>
  );
}
