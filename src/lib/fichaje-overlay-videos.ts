/**
 * Vídeos de overlay al fichar, por email (entrada/salida).
 * Los clips migrados se sirven desde Supabase Storage.
 */
import { manualesVideoUrl } from '@/lib/public-storage';

export const DEFAULT_FICHAJE_OVERLAY_VIDEO = manualesVideoUrl('fichaje/giff.mp4');
const DAVOO_FICHAJE_OVERLAY_VIDEO = manualesVideoUrl('fichaje/davoo.mp4');

export const FICHAJE_OVERLAY_VIDEOS: Record<string, { entrada: string; salida: string }> = {
    'guillemruizhomet@gmail.com': { entrada: manualesVideoUrl('fichaje/cr7.mp4'), salida: manualesVideoUrl('fichaje/cris.mp4') },
    'hugorubiolarripa@gmail.com': { entrada: manualesVideoUrl('fichaje/cr7.mp4'), salida: manualesVideoUrl('fichaje/cris.mp4') },
    'marbellaremote@gmail.com': { entrada: DEFAULT_FICHAJE_OVERLAY_VIDEO, salida: manualesVideoUrl('fichaje/cris.mp4') },
    'pacostaguiriguet@gmail.com': { entrada: manualesVideoUrl('fichaje/cr7.mp4'), salida: manualesVideoUrl('fichaje/cris.mp4') },
    'pereboladeres@gmail.com': { entrada: manualesVideoUrl('fichaje/video-espana.mp4'), salida: manualesVideoUrl('fichaje/video-espana.mp4') },
    'lurodero04@gmail.com': { entrada: manualesVideoUrl('fichaje/cr7.mp4'), salida: manualesVideoUrl('fichaje/cris.mp4') },
    's29valiente@gmail.com': { entrada: manualesVideoUrl('fichaje/cr7.mp4'), salida: manualesVideoUrl('fichaje/cris.mp4') },
    'aldoruggeri1512@gmail.com': { entrada: manualesVideoUrl('fichaje/cr7.mp4'), salida: manualesVideoUrl('fichaje/cris.mp4') },
    'hernang6799@gmail.com': { entrada: manualesVideoUrl('fichaje/hernan-river.mp4'), salida: manualesVideoUrl('fichaje/hernan-river.mp4') },
    'fggutierrez98es@gmail.com': { entrada: DAVOO_FICHAJE_OVERLAY_VIDEO, salida: DAVOO_FICHAJE_OVERLAY_VIDEO },
    'hhector7722@gmail.com': { entrada: manualesVideoUrl('fichaje/video-espana.mp4'), salida: manualesVideoUrl('fichaje/video-espana.mp4') },
    // El clip personalizado no existe en el repositorio; conserva el fallback operativo.
    'mamadou.ndiaye.7611@gmail.com': { entrada: DEFAULT_FICHAJE_OVERLAY_VIDEO, salida: DEFAULT_FICHAJE_OVERLAY_VIDEO },
    'jalvez853@gmail.com': { entrada: manualesVideoUrl('fichaje/riquelme.mp4'), salida: manualesVideoUrl('fichaje/riquelme.mp4') },
    'albamasia.opos@gmail.com': { entrada: manualesVideoUrl('fichaje/cr7.mp4'), salida: manualesVideoUrl('fichaje/cris.mp4') },
};

/** El vídeo de Héctor cambia solo el 02/11/2026, según la fecha de Barcelona. */
export function getFichajeOverlayVideos(email: string, madridDayYmd: string): { entrada: string; salida: string } | undefined {
    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail === 'hhector7722@gmail.com' && madridDayYmd === '2026-11-02') {
        return { entrada: DAVOO_FICHAJE_OVERLAY_VIDEO, salida: DAVOO_FICHAJE_OVERLAY_VIDEO };
    }
    return FICHAJE_OVERLAY_VIDEOS[normalizedEmail];
}
