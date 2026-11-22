'use strict'
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const os = require('node:os')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { sign } = require('node:crypto')
const iconv = require('iconv-lite')
const TOPIC = 'marbella-kitchen-print'

function clean(value) {
  return String(value ?? '').normalize('NFC').replace(/[\x00-\x1f\x7f]/g, ' ').trim()
}
function wrap(value, width) {
  const words = clean(value).split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    if (current && current.length + word.length + 1 > width) {
      lines.push(current)
      current = ''
    }
    if (word.length > width) {
      if (current) lines.push(current)
      current = ''
      for (let i = 0; i < word.length; i += width) {
        const chunk = word.slice(i, i + width)
        if (chunk.length === width) lines.push(chunk)
        else current = chunk
      }
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current)
  return lines
}
function buildTicketFromLayout(layout) {
  if (!Array.isArray(layout) || !layout.length || layout.length > 1500) {
    throw new Error('Diseño de ticket inválido')
  }
  const output = []
  const command = (...bytes) => output.push(Buffer.from(bytes))
  const print = (value) => output.push(iconv.encode(String(value), 'cp858'))
  command(0x1b, 0x40, 0x1b, 0x74, 0x13, 0x1b, 0x4d, 0x00)
  for (const line of layout) {
    if (!line || typeof line.text !== 'string' || line.text.length > 300) {
      throw new Error('Línea de impresión inválida')
    }
    command(0x1b, 0x61, line.align === 'center' ? 1 : 0)
    command(0x1b, 0x21, line.doubleHeight ? 0x10 : 0)
    command(0x1b, 0x45, line.bold ? 1 : 0)
    if (line.kind === 'item') {
      command(0x1d, 0x21, 0x10)
      print(String(line.quantity) + ' ')
      command(0x1d, 0x21, 0)
      print(line.text + '\n')
    } else {
      print(line.text + '\n')
    }
  }
  command(0x1b, 0x61, 0, 0x1b, 0x21, 0, 0x1b, 0x45, 0, 0x1d, 0x56, 0)
  return Buffer.concat(output)
}
function buildTicket(order) {
  if (Array.isArray(order?.layout)) return buildTicketFromLayout(order.layout)
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    throw new Error('Comanda vacía')
  }
  const lang = {
    ca: ['COMANDA', 'CLIENT', 'OBSERVACIONS', 'MENJAR', 'BEGUDA', 'TOT', 'FI COMANDA'],
    es: ['COMANDA', 'CLIENTE', 'OBSERVACIONES', 'COMIDA', 'BEBIDA', 'TODO', 'FIN COMANDA'],
    en: ['KITCHEN ORDER', 'CUSTOMER', 'NOTES', 'FOOD', 'DRINKS', 'ALL', 'END ORDER'],
  }[order.language] || ['COMANDA', 'CLIENTE', 'OBSERVACIONES', 'COMIDA', 'BEBIDA', 'TODO', 'FIN COMANDA']
  const section = { food: lang[3], drink: lang[4], all: lang[5] }[order.selection] || lang[5]
  const chunks = []
  const txt = (s) => chunks.push(iconv.encode(String(s), 'cp858'))
  const cmd = (...bytes) => chunks.push(Buffer.from(bytes))
  const sep = '-'.repeat(42) + '\n'
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(order.date ?? ''))
  const date = dateParts ? dateParts[3] + '/' + dateParts[2] + '/' + dateParts[1].slice(2) : clean(order.date)
  cmd(0x1b, 0x40, 0x1b, 0x74, 0x13) // ESC/POS init, PC858.
  cmd(0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01)
  txt('BAR LA MARBELLA\n')
  cmd(0x1b, 0x21, 0x10)
  txt(lang[0] + '\n')
  cmd(0x1b, 0x21, 0x00)
  txt(section + '\n')
  cmd(0x1b, 0x45, 0x00, 0x1b, 0x61, 0x00)
  txt(sep)
  txt([date, clean(order.time), Number(order.guests) > 0 ? order.guests + ' PAX' : ''].filter(Boolean).join('  ') + '\n')
  for (const line of wrap(lang[1] + ': ' + (order.name || '-'), 42)) txt(line + '\n')
  txt(sep)
  for (const item of order.items) {
    const qty = Number(item.quantity)
    if (!Number.isFinite(qty) || qty <= 0) continue
    cmd(0x1b, 0x45, 0x01, 0x1d, 0x21, 0x10)
    txt(String(qty) + ' ')
    cmd(0x1d, 0x21, 0x00)
    const name = wrap(item.name, 34)
    txt((name[0] || 'SIN NOMBRE') + '\n')
    for (const line of name.slice(1)) txt('    ' + line + '\n')
    cmd(0x1b, 0x45, 0x00)
    for (const line of wrap(item.note, 36)) txt('    ' + line + '\n')
    txt('\n')
  }
  if (clean(order.observations)) {
    txt(sep)
    cmd(0x1b, 0x45, 0x01)
    txt(lang[2] + ':\n')
    cmd(0x1b, 0x45, 0x00)
    for (const line of wrap(order.observations, 42)) txt(line + '\n')
  }
  txt(sep)
  cmd(0x1b, 0x61, 0x01)
  txt(lang[6] + '\n\n\n')
  cmd(0x1d, 0x56, 0x00) // Cutter.
  return Buffer.concat(chunks)
}
function sendToPrinter(host, port, bytes) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let finished = false
    let flushed = false
    function fail(err) {
      if (finished) return
      finished = true
      socket.destroy()
      reject(err)
    }
    socket.setTimeout(9000, () => fail(new Error('Tiempo de espera agotado')))
    socket.once('error', fail)
    socket.once('close', (hadError) => {
      if (finished) return
      if (hadError || !flushed) return fail(new Error('Conexión cerrada antes del envío'))
      finished = true
      resolve()
    })
    socket.connect(port, host, () => {
      socket.write(bytes, (err) => {
        if (err) return fail(err)
        flushed = true
        socket.end()
      })
    })
  })
}
async function sendToWindowsPrinter(queue, bytes) {
  const run = promisify(execFile)
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'marbella-print-'))
  const file = path.join(dir, 'ticket.bin')
  try {
    await fs.promises.writeFile(file, bytes, { flag: 'wx' })
    await run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'raw-print.ps1'),
      '-PrinterName', queue, '-FilePath', file,
    ], { timeout: 15000, windowsHide: true, maxBuffer: 128 * 1024 })
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

function printerForJob(config, printerId) {
  const id = printerId || 'kitchen' // Compatibilidad con trabajos anteriores.
  if (!['kitchen','tpv1'].includes(id)) throw new Error('Impresora no autorizada')
  const printer = config.printers?.[id]
  if (!printer) throw new Error('La impresora seleccionada no está configurada')
  if (printer.type === 'tcp' && typeof printer.host === 'string'
    && Number.isInteger(printer.port)) return printer
  if (printer.type === 'windows' && typeof printer.queue === 'string'
    && printer.queue.length > 0) return printer
  throw new Error('Configuración de impresora inválida')
}
async function main() {
  const configPath = path.join(__dirname, 'print-config.json')
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (!/^https:\/\//.test(cfg.apiUrl) || !cfg.supabaseUrl
    || !cfg.publishableKey || !cfg.printers || !cfg.printers.kitchen) {
    throw new Error('Falta configuración de impresión')
  }
  // Clave privada generada y almacenada únicamente en TPV1.
  const privateKey = fs.readFileSync(path.join(__dirname, 'private-key.pem'), 'utf8')
  const pathname = new URL(cfg.apiUrl).pathname
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(cfg.supabaseUrl, cfg.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  let busy = false
  let wake = false
  async function api(method, body) {
    const raw = body ? JSON.stringify(body) : ''
    const timestamp = String(Date.now())
    const message = [method, pathname, timestamp, raw].join('\n')
    const signature = sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64')
    const response = await fetch(cfg.apiUrl, {
      method,
      headers: {
        'x-printer-timestamp': timestamp,
        'x-printer-signature': signature,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: raw || undefined,
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error('API ' + response.status + ': ' + (data.error || 'sin detalle'))
    return data
  }
  async function drain() {
    if (busy) { wake = true; return }
    busy = true
    try {
      for (let i = 0; i < 30; i++) {
        const { job } = await api('GET')
        if (!job) break
        let status = 'sent'
        let error = ''
        try {
          const destination = printerForJob(cfg, job.payload.printerId)
          const bytes = buildTicket(job.payload)
          if (destination.type === 'tcp') {
            await sendToPrinter(destination.host, destination.port, bytes)
          } else {
            await sendToWindowsPrinter(destination.queue, bytes)
          }
        } catch (err) {
          status = 'failed'
          error = err instanceof Error ? err.message : String(err)
          console.error('Comanda ' + job.id + ': ' + error)
        }
        try {
          await api('PATCH', { id: job.id, status, error })
          console.log('Comanda ' + job.id + ': ' + status)
        } catch (err) {
          // No repetir el envío si se desconoce si el papel salió.
          console.error('Confirmación incierta ' + job.id + ':', err)
        }
      }
    } catch (err) {
      console.error('Cola inaccesible:', err)
    } finally {
      busy = false
      if (wake) { wake = false; setImmediate(drain) }
    }
  }
  supabase.channel(TOPIC)
    .on('broadcast', { event: 'new-job' }, () => void drain())
    .subscribe((state) => {
      if (state === 'SUBSCRIBED') {
        console.log('Avisos en tiempo real conectados')
        void drain()
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        console.warn('Avisos desconectados:', state)
      }
    })
  setInterval(() => void drain(), 60000).unref()
  console.log('MarbellaPrint activo: ' + Object.keys(cfg.printers).join(', '))
}
module.exports = { buildTicket, buildTicketFromLayout, wrap, printerForJob }
if (require.main === module) {
  main().catch((err) => { console.error(err); process.exitCode = 1 })
}