const SUPABASE_PUBLIC_STORAGE_BASE_URL =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

export function manualesVideoUrl(path: string): string {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `${SUPABASE_PUBLIC_STORAGE_BASE_URL}/manuales/${encodedPath}`;
}

export function privateManualesVideoUrl(path: string): string {
    return `/api/manuales/video?path=${encodeURIComponent(path)}`;
}
