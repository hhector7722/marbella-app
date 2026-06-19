function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/**
 * Genera el PDF en cliente y abre el diálogo de impresión del visor nativo (más fiable que HTML en iOS).
 */
export function printPdfBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob)
  const mobile = isMobileDevice()

  return new Promise((resolve) => {
    let done = false

    const finish = () => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      try {
        iframe.remove()
      } catch {
        /* iframe ya eliminado */
      }
      resolve()
    }

    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', 'Imprimir documento')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = mobile
      ? 'position:fixed;inset:0;width:100%;height:100%;border:0;margin:0;padding:0;z-index:2147483647;background:#fff;'
      : 'position:fixed;left:-10000px;top:0;width:800px;height:1200px;border:0;visibility:hidden;'
    document.body.appendChild(iframe)

    let started = false
    const runPrint = () => {
      if (started || done) return
      const win = iframe.contentWindow
      if (!win) {
        finish()
        return
      }
      started = true
      window.setTimeout(() => {
        try {
          win.focus()
          win.print()
        } finally {
          win.addEventListener('afterprint', finish, { once: true })
          window.setTimeout(finish, 60_000)
        }
      }, mobile ? 800 : 250)
    }

    iframe.addEventListener('load', runPrint, { once: true })
    iframe.src = url
    window.setTimeout(runPrint, 2500)
  })
}
