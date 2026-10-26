'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Mic, PhoneOff, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

type CallStage = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';
const getText = (parts: unknown):string => Array.isArray(parts)
  ? parts.filter((part):part is {type:string;text:string}=>part?.type==='text'&&typeof part.text==='string')
    .map(part=>part.text).join(' ').trim() : '';

/** Voz conversacional gratuita por turnos con Groq Whisper y síntesis del navegador. */
export default function VoiceConversation({onClose}:{onClose:()=>void}) {
  const trackStart=useTrackModalApply('chat-voice-call','Conversación por voz');
  const {startRecording,stopRecording,cancelRecording,getStream}=useVoiceRecorder();
  const {messages,sendMessage,status,error:chatError}=useChat({
    transport:new DefaultChatTransport({api:'/api/copiloto'}),
  });
  const [stage,setStage]=useState<CallStage>('idle');
  const [transcript,setTranscript]=useState('');
  const [answer,setAnswer]=useState('');
  const activeRef=useRef(false);
  const stageRef=useRef<CallStage>('idle');
  const animationRef=useRef<number|null>(null);
  const ctxRef=useRef<AudioContext|null>(null);
  const finishingRef=useRef(false);
  const listeningStartedRef=useRef(0);
  const pendingResponseRef=useRef(false);
  const seenBusyRef=useRef(false);
  const lastAnswerRef=useRef<string|null>(null);
  const transcriberRef=useRef<(blob:Blob)=>Promise<void>>(async()=>{});
  const listenRef=useRef<()=>Promise<void>>(async()=>{});

  function update(stage:CallStage){stageRef.current=stage;setStage(stage);}
  function stopAudioMonitor(){
    if(animationRef.current!==null)cancelAnimationFrame(animationRef.current);
    animationRef.current=null;
    void ctxRef.current?.close().catch(()=>{});
    ctxRef.current=null;
  }
  async function processAudio(blob:Blob){
    if(!activeRef.current)return;
    if(blob.size<500){update('error');toast.info('No se ha detectado voz. Vuelve a pulsar el micrófono.');return;}
    update('transcribing');
    try{
      const fd=new FormData();
      const ext=/mp4|m4a|aac/i.test(blob.type)?'mp4':'webm';
      fd.append('file',blob,`llamada.${ext}`);
      const result=await fetch('/api/copiloto/transcribe',{method:'POST',body:fd,credentials:'same-origin'});
      const data=await result.json() as {text?:string;error?:string};
      if(!result.ok || !data.text)throw new Error(data.error||'No se reconoce tu voz.');
      if(!activeRef.current)return;
      setTranscript(data.text);
      update('thinking');
      pendingResponseRef.current=true;
      seenBusyRef.current=false;
      void sendMessage({text:data.text});
    }catch(cause){
      if(!activeRef.current)return;
      update('error');
      toast.error(cause instanceof Error?cause.message:'Error de reconocimiento de voz');
    }
  }
  useEffect(()=>{ transcriberRef.current=processAudio; });

  async function finishTurn(){
    if(finishingRef.current || stageRef.current!=='listening' || !activeRef.current)return;
    finishingRef.current=true;
    stopAudioMonitor();
    try{
      const audio=await stopRecording();
      if(audio && activeRef.current)await transcriberRef.current(audio);
    }catch{
      if(activeRef.current)update('error');
    }finally{finishingRef.current=false;}
  }

  async function listen(){
    if(!activeRef.current || stageRef.current==='listening' || finishingRef.current)return;
    window.speechSynthesis?.cancel();
    update('listening');
    listeningStartedRef.current=Date.now();
    try{
      await startRecording();
      if(!activeRef.current){cancelRecording();return;}
      const stream=getStream();
      if(!stream)throw new Error('Micrófono no disponible');
      const audioContext=new AudioContext();
      ctxRef.current=audioContext;
      // Safari puede dejar AudioContext suspendido si el permiso se concedió
      // tras perder la activación inicial. Intentar reanudar con micro abierto.
      if(audioContext.state==='suspended')void audioContext.resume().catch(()=>{});
      const source=audioContext.createMediaStreamSource(stream);
      const analyser=audioContext.createAnalyser();
      analyser.fftSize=1024;
      source.connect(analyser);
      const values=new Uint8Array(analyser.fftSize);
      let heardVoice=false;
      let lastSound=Date.now();
      const tick=()=>{
        if(!activeRef.current || stageRef.current!=='listening')return;
        analyser.getByteTimeDomainData(values);
        let power=0;
        for(let i=0;i<values.length;i++)power+=((values[i]-128)/128)**2;
        const rms=Math.sqrt(power/values.length);
        const now=Date.now();
        if(rms>0.025){heardVoice=true;lastSound=now;}
        if((heardVoice && now-lastSound>1350 && now-listeningStartedRef.current>1600)
          || now-listeningStartedRef.current>22000){
          void finishTurn();
        }else animationRef.current=requestAnimationFrame(tick);
      };
      animationRef.current=requestAnimationFrame(tick);
    }catch(cause){
      stopAudioMonitor();
      if(activeRef.current){update('error');toast.error(cause instanceof Error?cause.message:'El micrófono no está disponible');}
    }
  }
  useEffect(()=>{ listenRef.current=listen; });

  useEffect(()=>{
    if(status==='submitted'||status==='streaming')seenBusyRef.current=true;
    if(!activeRef.current || !pendingResponseRef.current || !seenBusyRef.current || status!=='ready')return;
    const last=[...messages].reverse().find(m=>m.role==='assistant');
    if(!last || last.id===lastAnswerRef.current)return;
    lastAnswerRef.current=last.id;
    pendingResponseRef.current=false;
    const spoken=getText(last.parts);
    // El callback asíncrono evita efectos encadenados al actualizar el estado.
    queueMicrotask(()=>{
      if(!activeRef.current)return;
      if(!spoken){update('error');return;}
      setAnswer(spoken);
      update('speaking');
      if(!('speechSynthesis' in window)){
        toast.info('Este navegador no dispone de lectura en voz alta.');
        update('error');
        return;
      }
      const utterance=new SpeechSynthesisUtterance(spoken.slice(0,4000));
      utterance.lang='es-ES';utterance.rate=1.03;
      utterance.onend=()=>{if(activeRef.current)void listenRef.current();};
      utterance.onerror=()=>{if(activeRef.current)update('error');};
      window.speechSynthesis.speak(utterance);
    });
  },[messages,status]);

  useEffect(()=>{
    if(chatError && activeRef.current){update('error');toast.error('No se pudo obtener respuesta de la IA.');}
  },[chatError]);

  useEffect(()=>()=>{
    activeRef.current=false;
    stopAudioMonitor();
    cancelRecording();
    window.speechSynthesis?.cancel();
  // Desmontar debe cerrar los recursos una sola vez.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  async function startCall(){
    trackStart('Iniciar conversación');
    activeRef.current=true;
    setTranscript('');setAnswer('');
    await listenRef.current();
  }
  function hangup(){
    activeRef.current=false;
    stopAudioMonitor();
    cancelRecording();
    window.speechSynthesis?.cancel();
    update('idle');
    onClose();
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[var(--color-envolvente-bajo)] text-white">
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="text-sm font-medium">Conversación por voz</span>
        <button type="button" onClick={hangup} aria-label="Cerrar llamada" className="rounded-xl p-2 text-white/65 hover:bg-white/10">✕</button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto px-6 text-center">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${stage==='listening'?'animate-pulse bg-emerald-400/20 text-emerald-300':'bg-white/10 text-sky-200'}`}>
          {stage==='speaking'?<Volume2 size={33}/>:<Mic size={32}/>}
        </div>
        <p className="text-sm font-semibold">{{idle:'Llamada lista',listening:'Te escucho…',transcribing:'Reconociendo tu voz…',thinking:'Consultando Marbella…',speaking:'Respondiendo…',error:'No se ha podido completar el turno'}[stage]}</p>
        <div aria-live="polite" className="max-h-44 w-full space-y-2 overflow-auto text-left text-xs leading-relaxed">
          {transcript && <p className="rounded-xl bg-[#315a86] px-3 py-2">{transcript}</p>}
          {answer && (
            <div className="space-y-2 rounded-xl bg-[#192b52] px-3 py-2">
              <p>{answer}</p>
              <button type="button" className="flex items-center gap-1.5 text-sky-200 underline underline-offset-2" onClick={()=>{
                if(!('speechSynthesis' in window))return;
                window.speechSynthesis.cancel();
                const voice=new SpeechSynthesisUtterance(answer.slice(0,4000));
                voice.lang='es-ES';
                voice.onend=()=>{if(activeRef.current)void listenRef.current();};
                window.speechSynthesis.speak(voice);
                update('speaking');
              }}><Volume2 size={13}/> Reproducir respuesta</button>
            </div>
          )}
        </div>
        {stage==='idle' || stage==='error' ? (
          <button type="button" onClick={()=>void startCall()} className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold">{stage==='idle'?'Iniciar conversación':'Reintentar micrófono'}</button>
        ) : stage==='listening' ? (
          <button type="button" onClick={()=>void finishTurn()} className="rounded-xl border border-sky-300/30 px-4 py-2 text-xs text-sky-100">Enviar voz ahora</button>
        ) : null}
      </div>
      <div className="flex shrink-0 justify-center px-4 py-4">
        <button type="button" onClick={hangup} className="flex items-center gap-2 rounded-xl bg-rose-500/20 px-5 py-3 text-sm text-rose-200"><PhoneOff size={17}/> Colgar</button>
      </div>
    </div>
  );
}
