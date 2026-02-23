'use client';

import { useChat } from 'ai/react';
import { useState, useRef, useEffect } from 'react';
import { Mic, Send, Image as ImageIcon, X, Phone, Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { useAIStore } from '@/store/aiStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function AIChatWidget({ onStartCall }: { onStartCall: () => void }) {
    const supabase = createClient();
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const closeChat = useAIStore((state) => state.closeChat);
    const {
        messages,
        input,
        setInput,
        handleInputChange,
        handleSubmit,
        append,
        isLoading,
    } = useChat({
        api: '/api/chat',
        headers: accessToken ? {
            'Authorization': `Bearer ${accessToken}`
        } : {},
        onResponse: (response) => {
            console.log("[DEBUG] [useChat] Recibida respuesta del servidor:", response.status, response.statusText);
        },
        onFinish: (message) => {
            console.log("[DEBUG] [useChat] Stream finalizado. Mensaje completo:", message.content.substring(0, 50) + "...");
        },
        onError: (error) => {
            console.error("[CRÍTICO] Fallo en el stream de useChat:", error);
            const msg = error.message ?? '';
            if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized')) {
                setAuthError('Sesión expirada. Cierra sesión y vuelve a entrar.');
            } else {
                setAuthError('Error de conexión con la IA. Reinténtalo.');
            }
        },
    });



    const [isRecording, setIsRecording] = useState(false);
    const [isProcessingVoice, setIsProcessingVoice] = useState(false);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // Recuperar token de sesión para RLS
    useEffect(() => {
        const fetchSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) setAccessToken(session.access_token);
        };
        fetchSession();
    }, [supabase]);

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

        // La imagen se adjunta como dato extra
        handleSubmit(e as React.FormEvent<HTMLFormElement>, {
            data: mediaUrl ? { imageUrl: mediaUrl } : undefined
        });
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
    }, [append, supabase]);

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
                    onClick={onStartCall}
                    className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg min-h-[40px]"
                >
                    <Phone size={14} fill="currentColor" />
                    <span className="font-black text-[10px] uppercase tracking-wider">Llamada</span>
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
                            onChange={handleInputChange}
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
                        disabled={isLoading || (!input.trim() && !selectedImage)}
                        className="bg-[#5B8FB9] text-white p-3.5 rounded-2xl shadow-md min-h-[48px] min-w-[48px] flex items-center justify-center disabled:opacity-50 disabled:active:scale-100 active:scale-95 transition-all"
                    >
                        <Send size={18} className="translate-x-0.5" />
                    </button>
                </form>
            </div>
        </div>
    );
}
