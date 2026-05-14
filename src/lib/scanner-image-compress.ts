/** Compresión JPEG en cliente (Canvas) antes de enviar al escáner. */

export function compressImageFileToDataUri(
  file: File,
  opts?: { maxWidth?: number; quality?: number }
): Promise<string> {
  const maxWidth = opts?.maxWidth ?? 1200
  const quality = opts?.quality ?? 0.8
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(maxWidth / img.width, 1)
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('No canvas context'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('Error al cargar imagen'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}
