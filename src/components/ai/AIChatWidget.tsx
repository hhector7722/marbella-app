'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Send, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { useAIStore } from '@/store/aiStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

export function AIChatWidget() {
    const supabase = createClient();
    const [authError, setAuthError] = useState<string | null>(null);
    const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const closeChat = useAIStore((state) => state.closeChat);



    const [voiceMode, setVoiceMode] = useState(false);
    const [isRecording, setIsRecording] = useState(false); // SpeechRecognition fallback only
    const [isProcessingVoice, setIsProcessingVoice] = useState(false); // SpeechRecognition fallback only
    const [voiceStatus, setVoiceStatus] = useState<'idle' | 'uploading' | 'transcribing' | 'error'>('idle');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const recorder = useVoiceRecorder();

    // Auto-scroll al final del chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleCustomSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedInput = input.trim();
        if (!trimmedInput && !selectedImage) return;

        let mediaUrl = undefined;

        if (selectedImage) {
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

        void sendMessage(trimmedInput, mediaUrl);
    };

    // Escucha Realtime para las inyecciones asíncronas del Agente de Voz
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
                    if (newMsg.role === 'assistant' || newMsg.content_type === 'call_transcript') {
                        setMessages((prev) => [
                            ...prev,
                            {
                                id: crypto.randomUUID(),
                                role: newMsg.role as 'user' | 'assistant',
                                content: newMsg.text_content || 'Transcripción guardada.',
                            },
                        ]);
                    }
                })
                .subscribe();
        }
        initRealtime();
        return () => { if (channel) supabase.removeChannel(channel); }
    }, [supabase]);

    const sendMessage = async (text: string, imageUrl?: string) => {
        const q = text.trim();
        const finalQuery = q || (imageUrl ? 'Imagen adjunta.' : '');
        if (!finalQuery) return;

        setAuthError(null);
        setIsLoading(true);
        setInput('');

        setMessages((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                role: 'user',
                content: finalQuery,
            },
        ]);

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: finalQuery, imageUrl }),
            });

            if (res.status === 401 || res.status === 403) {
                const msg = 'Sesión expirada. Reingresa.';
                setAuthError(msg);
                toast.error(msg);
                return;
            }

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const assistantText = String(data?.response ?? '');

            setMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: assistantText || 'No pude responder. Intenta otra frase.',
                },
            ]);
        } catch (err: any) {
            const msg = err?.message ? String(err.message) : 'Error al llamar al agente IA';
            setAuthError(msg);
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const transcribeOnServer = async (blob: Blob): Promise<string> => {
        setVoiceStatus('uploading');
        const fd = new FormData();
        fd.append('file', blob, 'voice.webm');

        const res = await fetch('/api/ai/stt', { method: 'POST', body: fd });
        if (!res.ok) {
            let errMsg = `STT falló (HTTP ${res.status})`;
            const j = await res.json().catch(() => null);
            if (j?.error) errMsg = String(j.error);
            throw new Error(errMsg);
        }
        setVoiceStatus('transcribing');
        const { text } = await res.json();
        return String(text || '').trim();
    };

    const handleRecordVoiceMessage = async () => {
        // Preferimos servidor (MediaRecorder + /api/ai/stt). Si no existe soporte, fallback SpeechRecognition.
        if (recorder.status === 'recording') {
            const blob = await recorder.stopRecording();
            if (!blob) return;
            try {
                const text = await transcribeOnServer(blob);
                setVoiceStatus('idle');
                if (!text) {
                    toast.error('No pude transcribir. Prueba otra vez.');
                    return;
                }
                setInput(text);
                await sendMessage(text);
            } catch (e: any) {
                setVoiceStatus('error');
                const msg = e?.message ? String(e.message) : 'Error STT';
                toast.error(msg);
                // fallback si el servidor no está configurado
                if (msg.includes('No STT provider configured') || msg.includes('STT_PROVIDER')) {
                    toast.error('STT servidor no configurado. Usando STT del navegador como fallback.');
                    toggleRecording();
                }
            } finally {
                setVoiceStatus('idle');
            }
            return;
        }

        if (recorder.status === 'idle') {
            await recorder.startRecording();
            return;
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            recognitionRef.current?.stop?.();
            setIsRecording(false);
            return;
        }

        const SpeechRecognition =
            typeof window !== 'undefined'
                ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
                : null;

        if (!SpeechRecognition) {
            const msg = 'Speech Recognition no soportado en este navegador.';
            setAuthError(msg);
            toast.error(msg);
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'es-ES';
        recognition.interimResults = false;
        recognition.continuous = false;

        setIsProcessingVoice(false);
        setIsRecording(true);
        recognition.start();

        recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results || [])
                .map((r: any) => r?.[0]?.transcript)
                .filter(Boolean)
                .join(' ')
                .trim();

            if (transcript) {
                setInput(transcript);
                void sendMessage(transcript);
            }
        };

        recognition.onerror = (event: any) => {
            const err = event?.error ? String(event.error) : 'Error STT';
            setAuthError(`STT: ${err}`);
            toast.error(`STT: ${err}`);
            setIsRecording(false);
        };

        recognition.onend = () => {
            setIsRecording(false);
        };
    };

    return (
        <div className="flex flex-col h-full bg-[#fafafa]">
            {/* Cabecera Premium Marbella - Color Petróleo */}
            <div className="bg-[#36606F] p-4 shadow-md flex items-center justify-between sticky top-0 z-10 text-white">
                <div className="flex items-center gap-1">
                    <button
                        onClick={closeChat}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={24} />
                    </button>
                    <img src="/icons/logo-white.png" alt="Logo Marbella" className="h-11 w-auto object-contain" />
                </div>
                <button
                    type="button"
                    onClick={() => setVoiceMode((v) => !v)}
                    className={cn(
                        "min-h-[40px] px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors",
                        voiceMode ? "bg-emerald-500 hover:bg-emerald-600" : "bg-white/10 hover:bg-white/15"
                    )}
                    aria-pressed={voiceMode}
                    title="Conversa por voz"
                >
                    Voz {voiceMode ? 'ON' : 'OFF'}
                </button>
            </div>

            {/* Zona de Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="h-full flex items-center justify-center opacity-0 pointer-events-none" />
                )}

                {messages.map((m) => (
                    <div key={m.id} className={cn("flex flex-col gap-1 w-full max-w-[85%]", m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                        <div className={cn(
                            "p-3 rounded-2xl text-sm shadow-sm relative overflow-hidden",
                            m.role === 'user' ? "bg-zinc-800 text-white rounded-tr-sm" : "bg-white border border-zinc-100 text-zinc-700 rounded-tl-sm"
                        )}>
                            <div className={cn(
                                "prose prose-sm max-w-none break-words",
                                m.role === 'user' ? "prose-invert text-white" : "text-zinc-700",
                                // Estilos personalizados para evitar dependencia estricta de tailwind/typography si no está configurado
                                "[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:p-2 [&_td]:border [&_td]:p-2"
                            )}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {m.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}
                {authError && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-3 py-2 mx-2 my-1">
                        <span className="text-xs font-bold">{authError}</span>
                        <button onClick={() => setAuthError(null)} className="ml-auto text-red-400 hover:text-red-600 text-xs underline">Cerrar</button>
                    </div>
                )}
                {isLoading && !authError && (
                    <div className="flex items-center gap-2 text-zinc-400 p-2">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-xs font-medium">IA pensando...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Zona de Input */}
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
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
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
                            onClick={voiceMode ? handleRecordVoiceMessage : toggleRecording}
                            disabled={voiceMode ? (voiceStatus === 'uploading' || voiceStatus === 'transcribing') : isProcessingVoice}
                            className={cn(
                                "p-2 rounded-xl transition-colors shrink-0 mx-1",
                                voiceMode
                                    ? (recorder.status === 'recording'
                                        ? "bg-red-100 text-red-600 animate-pulse"
                                        : "text-zinc-400 hover:text-zinc-600")
                                    : (isRecording ? "bg-red-100 text-red-600 animate-pulse" : "text-zinc-400 hover:text-zinc-600"),
                                (voiceMode ? (voiceStatus !== 'idle') : isProcessingVoice) ? "opacity-50 cursor-not-allowed" : ""
                            )}
                        >
                            {voiceMode ? (
                                voiceStatus === 'uploading' || voiceStatus === 'transcribing' ? (
                                    <Loader2 size={20} className="animate-spin" />
                                ) : (
                                    <Mic size={20} />
                                )
                            ) : (
                                isProcessingVoice ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} />
                            )}
                        </button>
                    </div>

                    {voiceMode && recorder.status === 'recording' && (
                        <button
                            type="button"
                            onClick={recorder.cancelRecording}
                            className="bg-red-100 text-red-700 px-3 py-3 rounded-2xl min-h-[48px] text-[10px] font-black uppercase tracking-wider shrink-0"
                            title="Cancelar grabación"
                        >
                            Cancelar
                        </button>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading || (!input.trim() && !selectedImage)}
                        className="bg-[#5B8FB9] text-white p-3.5 rounded-2xl shadow-md min-h-[48px] min-w-[48px] flex items-center justify-center disabled:opacity-50 disabled:active:scale-100 active:scale-95 transition-all"
                    >
                        <Send size={18} className="translate-x-0.5" />
                    </button>
                </form>

                {voiceMode && recorder.status === 'recording' && (
                    <div className="mt-2 text-[10px] font-bold text-zinc-500">
                        Grabando… {Math.floor(recorder.durationMs / 1000)}s
                    </div>
                )}
            </div>
        </div>
    );
}
