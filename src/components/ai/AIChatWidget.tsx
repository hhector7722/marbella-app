'use client';

import { useChat } from 'ai/react';
import { useState, useRef, useEffect } from 'react';
import { Mic, Send, Image as ImageIcon, X, Phone, User, Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';

export function AIChatWidget({ onStartCall }: { onStartCall: () => void }) {
    const {
        messages,
        input,
        setInput,
        handleInputChange,
        handleSubmit,
        append,
        isLoading,
    } = useChat({ api: '/api/chat' });

    const [isRecording, setIsRecording] = useState(false);
    const [isProcessingVoice, setIsProcessingVoice] = useState(false);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const supabase = createClient();

    // Auto-scroll al final del chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleCustomSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() && !selectedImage) return;

        let mediaUrl = undefined;

        if (selectedImage) {
            // Logica para subir la imagen a Supabase Storage (bucket ai_assets)
            const { data: userData } = await supabase.auth.getUser();
            if (userData.user) {
                const fileName = `${userData.user.id}/${Date.now()}-${selectedImage.name}`;
                const { data, error } = await supabase.storage.from('ai_assets').upload(fileName, selectedImage);
                if (!error) {
                    const { data: urlData } = supabase.storage.from('ai_assets').getPublicUrl(fileName);
                    mediaUrl = urlData.publicUrl;
                }
            }
            setSelectedImage(null);
        }

        // La imagen se adjunta como dato extra en RequestOptions que acepta `data: Record<string, string>`
        const opts = mediaUrl ? { data: { imageUrl: mediaUrl } } : undefined;
        handleSubmit(e as React.FormEvent<HTMLFormElement>, opts);
    };

    // Escucha Realtime para las inyecciones asíncronas del Agente de Voz (Transcripciones, Resúmenes...)
    useEffect(() => {
        let channel: any;
        const initRealtime = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            channel = supabase.channel('ai_chat_realtime')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'ai_chat_messages',
                    filter: `user_id=eq.${user.id}`
                }, (payload) => {
                    const newMsg = payload.new;
                    // Omitimos mensajes de texto normales del user ya que Vercel AI SDK los gestiona optimísticamente localmente
                    if (newMsg.role === 'assistant' || newMsg.content_type === 'call_transcript') {
                        // Evitar duplicados si Vercel AI SDK ya lo renderizó (se podría perfeccionar comparando ids)
                        append({
                            role: newMsg.role as 'user' | 'assistant',
                            content: newMsg.text_content || 'Transcripción guardada.',
                        });
                    }
                })
                .subscribe();
        }
        initRealtime();
        return () => { if (channel) supabase.removeChannel(channel); }
    }, []);

    const toggleRecording = async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                mediaRecorderRef.current = mediaRecorder;
                audioChunksRef.current = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) audioChunksRef.current.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    setIsProcessingVoice(true);
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    const formData = new FormData();
                    formData.append('file', audioBlob, 'voice.webm');

                    try {
                        // Llamada al endpoint STT (Whisper)
                        const res = await fetch('/api/stt', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (data.text) {
                            setInput(data.text);
                        }
                    } catch (err) {
                        console.error('Error transcripting audio', err);
                    } finally {
                        setIsProcessingVoice(false);
                        stream.getTracks().forEach(track => track.stop());
                    }
                };

                mediaRecorder.start();
                setIsRecording(true);
            } catch (err) {
                console.error('Mic access denied or error', err);
                alert('Por favor, permite el acceso al micrófono.');
            }
        } else {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#fafafa]">
            {/* Cabecera Premium Marbella */}
            <div className="bg-white border-b border-zinc-100 p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
                <div>
                    <h3 className="font-black text-sm text-zinc-800 uppercase tracking-widest">Asistente AI</h3>
                    <p className="text-[10px] font-bold text-zinc-400">Modo Asíncrono</p>
                </div>
                <button
                    type="button"
                    onClick={onStartCall}
                    className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm min-h-[44px]"
                >
                    <Phone size={16} fill="currentColor" />
                    <span className="font-bold text-xs uppercase tracking-wider">Llamada</span>
                </button>
            </div>

            {/* Zona de Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-2">
                        <Bot size={32} className="opacity-50" />
                        <p className="text-xs font-medium text-center px-8">
                            Escribe, usa una nota de voz, sube una factura o inicia una llamada directa.
                        </p>
                    </div>
                )}

                {messages.map(m => {
                    // AI SDK v6: el contenido vive en `parts[0].text` o en `content` para backwards compat
                    const textContent = (m as any).content ?? (m as any).parts?.find((p: any) => p.type === 'text')?.text ?? '';
                    return (
                        <div key={m.id} className={cn("flex flex-col gap-1 w-full max-w-[85%]", m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                            <div className={cn(
                                "p-3 rounded-2xl text-sm shadow-sm relative overflow-hidden",
                                m.role === 'user' ? "bg-zinc-800 text-white rounded-tr-sm" : "bg-white border border-zinc-100 text-zinc-700 rounded-tl-sm"
                            )}>
                                {textContent}
                            </div>
                        </div>
                    );
                })}
                {isLoading && (
                    <div className="flex items-center gap-2 text-zinc-400 p-2">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-xs font-medium">IA pensando...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Zona de Input (Bento Grid Style + Touch targets > 44px) */}
            <div className="bg-white p-3 border-t border-zinc-100 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]">
                {selectedImage && (
                    <div className="mb-2 relative inline-block">
                        <div className="h-16 w-16 rounded-xl overflow-hidden border border-zinc-200">
                            <img src={URL.createObjectURL(selectedImage)} alt="Preview" className="h-full w-full object-cover" />
                        </div>
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-2 -right-2 bg-zinc-800 text-white rounded-full p-1 shadow-md"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}

                <form onSubmit={handleCustomSubmit} className="flex items-end gap-2">
                    <div className="flex-1 bg-zinc-100 rounded-2xl flex items-center pr-2 pl-4 py-1 min-h-[48px] focus-within:ring-2 focus-within:ring-[#5B8FB9] transition-all">
                        <textarea
                            value={input ?? ''}
                            onChange={handleInputChange}
                            placeholder="Escribe tu consulta..."
                            className="flex-1 bg-transparent border-none focus:outline-none text-sm font-medium text-zinc-800 resize-none max-h-32 min-h-[20px] py-3"
                            rows={1}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleCustomSubmit(e);
                                }
                            }}
                        />

                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) setSelectedImage(e.target.files[0]);
                            }}
                        />

                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors shrink-0"
                        >
                            <ImageIcon size={20} />
                        </button>

                        <button
                            type="button"
                            onClick={toggleRecording}
                            disabled={isProcessingVoice}
                            className={cn(
                                "p-2 rounded-xl transition-colors shrink-0 mx-1",
                                isRecording ? "bg-red-100 text-red-600 animate-pulse" : "text-zinc-400 hover:text-zinc-600",
                                isProcessingVoice ? "opacity-50 cursor-not-allowed" : ""
                            )}
                        >
                            {isProcessingVoice ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} />}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || (!input?.trim() && !selectedImage)}
                        className="bg-[#5B8FB9] text-white p-3.5 rounded-2xl shadow-md min-h-[48px] min-w-[48px] flex items-center justify-center disabled:opacity-50 disabled:active:scale-100 active:scale-95 transition-all"
                    >
                        <Send size={18} className="translate-x-0.5" />
                    </button>
                </form>
            </div>
        </div>
    );
}
