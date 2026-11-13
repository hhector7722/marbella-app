/**
 * Cámara trasera preferentemente ultra gran angular.
 * El navegador decide qué objetivos expone: jamás se anuncia 0,5x si no se ha solicitado con éxito.
 * El primer permiso de cámara lo gestiona siempre el navegador.
 */
export function ultraWideDevice(devices: readonly Pick<MediaDeviceInfo, 'kind' | 'label' | 'deviceId'>[]) {
  return devices.find(device =>
    device.kind === 'videoinput' && device.deviceId &&
    !/front|frontal|facetime|selfie|user facing/i.test(device.label) &&
    /ultra[\s-]?wide|ultra[\s-]?gran[\s-]?angular|0[.,]5\s?x|0[.,]6\s?x/i.test(device.label),
  )
}

type ZoomCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number } }
type ZoomConstraint = MediaTrackConstraintSet & { zoom?: number }

export async function openPreferredRearCamera(): Promise<{ stream: MediaStream; wide: boolean }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Tu navegador no permite usar la cámara. Abre la app con HTTPS.')
  }
  const fallbackConstraints: MediaStreamConstraints = {
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
  }
  let stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
  let wide = false

  // Los nombres de objetivos suelen estar disponibles solo tras autorizar la cámara.
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const ultraWide = ultraWideDevice(devices)
    if (ultraWide) {
      const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId
      if (currentId !== ultraWide.deviceId) {
        stream.getTracks().forEach(track => track.stop())
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { deviceId: { exact: ultraWide.deviceId }, width: { ideal: 1280 } },
          })
          wide = true
        } catch {
          // Un identificador expuesto puede fallar (especialmente en Safari).
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
        }
      } else {
        wide = true
      }
    }
  } catch {
    // Si no se pueden enumerar objetivos, conservamos la cámara trasera inicial.
    if (!stream.active) stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
  }

  const track = stream.getVideoTracks()[0]
  if (track?.getCapabilities) {
    try {
      const zoom = (track.getCapabilities() as ZoomCapabilities).zoom
      // Algunos navegadores exponen el 0,5x mediante zoom; otros no.
      if (zoom && zoom.min < 1 && Number.isFinite(zoom.min) && zoom.max >= zoom.min) {
        await track.applyConstraints({ advanced: [{ zoom: Math.max(zoom.min, Math.min(0.5, zoom.max)) } as ZoomConstraint] })
        wide = true
      }
    } catch {
      // Zoom opcional: no interrumpir el recuento por falta de soporte.
    }
  }
  return { stream, wide }
}
