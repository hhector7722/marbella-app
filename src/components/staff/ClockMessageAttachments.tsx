'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Square, Paperclip, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { ClockRecordingWaveform, ClockVoicePlayer } from '@/components/staff/ClockVoiceWaveform';
import {
  STAFF_CLOCK_MEDIA_LIMIT, staffClockMediaKind, validateClockMediaFile,
  type StaffClockAttachment,
} from '@/lib/staff/clock-media';

type MediaItem = Pick<StaffClockAttachment, 'kind' | 'name'> & { url: string };

export function ClockMediaGallery({
  items, onRemove,
}: {
  items: MediaItem[];
  onRemove?: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState<MediaItem | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setExpanded(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown, true);
      previousFocus?.focus();
    };
  }, [expanded]);

  if (!items.length) return null;

  return (
    <>
      <div data-element="clock-message-media-gallery"
        className="flex w-full min-w-0 flex-wrap items-start gap-2.5">
        {items.map((item, index) => (
          <div key={item.url + index} className={
            item.kind === 'audio' ? 'flex w-full max-w-[340px] min-w-0 items-center gap-1.5' :
              'relative h-[82px] w-[82px] shrink-0 sm:h-[92px] sm:w-[92px]'
          }>
            {item.kind === 'image' ? (
              <button type="button" onClick={() => setExpanded(item)}
                aria-label={'Ampliar imagen ' + (index + 1)}
                className="block h-full w-full overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={'Imagen adjunta ' + (index + 1)}
                  className="h-full w-full rounded-xl object-cover"/>
              </button>
            ) : item.kind === 'video' ? (
              <button type="button" onClick={() => setExpanded(item)}
                aria-label={'Ampliar vídeo ' + (index + 1)}
                className="relative block h-full w-full overflow-hidden rounded-xl bg-black/75">
                <video src={item.url} muted playsInline preload="metadata"
                  className="pointer-events-none h-full w-full rounded-xl object-cover"
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    if (video.duration > 0.4) video.currentTime = Math.min(0.3, video.duration / 2);
                  }}/>
                <span aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center bg-black/10">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
                    <Play size={18} fill="currentColor"/>
                  </span>
                </span>
              </button>
            ) : (
              <div className="min-w-0 flex-1">
                <ClockVoicePlayer src={item.url} name={item.name}/>
              </div>
            )}
            {onRemove && (
              <button type="button" onClick={() => onRemove(index)}
                aria-label={'Quitar adjunto ' + (index + 1)}
                className={item.kind === 'audio'
                  ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-400/15'
                  : 'absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white shadow-sm'}
              >
                <X size={16}/>
              </button>
            )}
          </div>
        ))}
      </div>
      {expanded && typeof document !== 'undefined' && createPortal(
        <div
          data-element="clock-message-media-viewer"
          role="dialog" aria-modal="true" aria-label="Contenido ampliado"
          className="fixed inset-0 z-[2147483647] flex items-center justify-center overflow-auto bg-black/95 px-3"
          style={{
            paddingTop: 'max(14px, env(safe-area-inset-top))',
            paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          }}
          onClick={() => setExpanded(null)}
        >
          <div className="flex max-h-[94dvh] w-fit max-w-[96vw] flex-col items-center gap-3"
            onClick={(event) => event.stopPropagation()}>
            <div className="relative inline-flex max-h-[78dvh] max-w-full items-center justify-center">
              {expanded.kind === 'image' ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={expanded.url} alt="Imagen ampliada"
                  className="max-h-[78dvh] max-w-[94vw] rounded-xl object-contain"/>
              ) : (
                <video key={expanded.url} src={expanded.url} controls autoPlay playsInline
                  className="max-h-[78dvh] max-w-[94vw] rounded-xl object-contain"/>
              )}
              <button ref={closeRef} type="button" onClick={() => setExpanded(null)}
                aria-label="Cerrar contenido ampliado"
                className="absolute right-2 top-2 z-20 flex min-h-11 items-center gap-1.5 rounded-full bg-black/85 px-3.5 py-2 font-medium text-white shadow-lg ring-1 ring-white/30">
                <X size={19}/> Cerrar
              </button>
            </div>
            <button type="button" onClick={() => setExpanded(null)}
              className="flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-6 py-2.5 text-sm font-semibold text-white active:bg-white/25">
              <X size={17}/> Cerrar
            </button>
          </div>
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
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [previews, setPreviews] = useState<MediaItem[]>([]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    const urls = files.map((file) => ({
      url: URL.createObjectURL(file),
      name: file.name,
      kind: staffClockMediaKind(file.type) ?? 'audio',
    }));
    const frame = requestAnimationFrame(() => setPreviews(urls));
    return () => {
      cancelAnimationFrame(frame);
      urls.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [files]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    onRecordingChange?.(false);
    // Se limpia al desmontar; la callback no debe reiniciar el micrófono.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        streamRef.current = null;
        toast.error('No se admite el formato de grabación de este navegador.');
        return;
      }
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecordingStream(null);
        setRecording(false);
        onRecordingChange?.(false);
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        const ext = recordedMime === 'audio/mp4' ? 'm4a' : recordedMime === 'audio/ogg' ? 'ogg' : 'webm';
        addFiles([new File([blob], 'Mensaje de voz.' + ext, { type: recordedMime })]);
      };
      recorder.start(1000);
      setRecordingStream(stream);
      setRecording(true);
      onRecordingChange?.(true);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecordingStream(null);
      toast.error('No se ha podido activar el micrófono.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" multiple
          accept="image/*,audio/*,video/mp4,video/quicktime,video/webm"
          className="hidden" disabled={disabled}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}/>
        <button type="button" disabled={disabled || recording}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 disabled:opacity-50">
          <Paperclip size={17}/> Adjuntar fotos, audios o vídeos
        </button>
        <button type="button" disabled={disabled}
          onClick={() => recording ? stopRecording() : void startRecording()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 disabled:opacity-50">
          {recording ? <Square size={16} className="text-red-600"/> : <Mic size={17}/>}
          {recording ? 'Detener' : 'Grabar voz'}
        </button>
        {recording && recordingStream && <ClockRecordingWaveform stream={recordingStream}/>}
      </div>
      {!!previews.length && (
        <ClockMediaGallery items={previews}
          onRemove={(index) => {
            if (disabled || recording) return;
            onChange(files.filter((_, i) => i !== index));
          }}/>
      )}
      <p className="text-xs text-zinc-500">{files.length}/8 adjuntos · Imágenes hasta 12 MB, audios 20 MB y vídeos 50 MB.</p>
    </div>
  );
}
