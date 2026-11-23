'use strict'

const net = require('node:net')

const COMMAND_QUERY_TABLES = 19
const MAX_FRAME_BYTES = 1024 * 1024

function queryTablesFrame(salon, token = 1) {
  if (!Number.isInteger(salon) || salon < 1 || salon > 999) throw new RangeError('Salón inválido')
  if (!Number.isInteger(token) || token < 1 || token > 127) throw new RangeError('Token inválido')
  const salonBytes = Buffer.from(String(salon), 'ascii')
  // Handys.apk: prefijo de token + byte de comando + salon ASCII + 0x00.
  return Buffer.concat([Buffer.from([token, COMMAND_QUERY_TABLES]), salonBytes, Buffer.from([0])])
}

function readVarint(buffer, offset) {
  let value = 0
  let multiplier = 1
  for (let index = offset; index < Math.min(buffer.length, offset + 5); index++) {
    const byte = buffer[index]
    value += (byte & 127) * multiplier
    if (!(byte & 128)) return { value, next: index + 1 }
    multiplier *= 128
  }
  return null
}

function validateProtobuf(bytes) {
  let pos = 0
  let count = 0
  const fieldNumbers = []
  while (pos < bytes.length) {
    if (count++ >= 2048) throw Error('Excesivos campos de respuesta')
    const tag = readVarint(bytes, pos)
    if (!tag) throw Error('Etiqueta Protobuf incompleta')
    pos = tag.next
    const field = Math.floor(tag.value / 8)
    const wire = tag.value % 8
    if (field < 1) throw Error('Campo Protobuf inválido')
    if (wire === 0) {
      const n = readVarint(bytes, pos)
      if (!n) throw Error('Varint incompleto')
      pos = n.next
    } else if (wire === 1) pos += 8
    else if (wire === 2) {
      const len = readVarint(bytes, pos)
      if (!len) throw Error('Longitud Protobuf incompleta')
      pos = len.next + len.value
    } else if (wire === 5) pos += 4
    else throw Error('Tipo de campo Protobuf no admitido')
    if (pos > bytes.length) throw Error('Protobuf truncado')
    if (fieldNumbers.length < 40) fieldNumbers.push(field)
  }
  return { fieldCount: count, fieldNumbers }
}


/**
 * Campos extraídos de bdpProtos$ProtoMesaEstado en la APK original.
 * La ocupación se devuelve como código bruto: sin suponer equivalencias
 * con las etiquetas que presenta BDP al usuario.
 */
function decodeEstadoMesa(bytes) {
  validateProtobuf(bytes)
  const mesa = {
    numero: null,
    ocupacionCodigo: null,
    mesaPrincipal: null,
    juntada: null,
    reservada: null,
  }
  let pos = 0
  while (pos < bytes.length) {
    const tag = readVarint(bytes, pos)
    if (!tag) throw Error('Campo de mesa incompleto')
    pos = tag.next
    const number = Math.floor(tag.value / 8)
    const wire = tag.value % 8
    if (wire === 0) {
      const n = readVarint(bytes, pos)
      if (!n) throw Error('Valor de mesa incompleto')
      pos = n.next
      if (number === 1) mesa.numero = n.value
      else if (number === 2) mesa.ocupacionCodigo = n.value
      else if (number === 3) mesa.mesaPrincipal = n.value
      else if (number === 4) mesa.juntada = Boolean(n.value)
      else if (number === 5) mesa.reservada = Boolean(n.value)
    } else if (wire === 1) pos += 8
    else if (wire === 5) pos += 4
    else if (wire === 2) {
      const len = readVarint(bytes, pos)
      if (!len) throw Error('Longitud de campo de mesa incompleta')
      pos = len.next + len.value
    } else throw Error('Tipo de campo de mesa desconocido')
    if (pos > bytes.length) throw Error('Campo de mesa truncado')
    if (number >= 1 && number <= 5 && wire !== 0) {
      throw Error('Campo conocido de mesa con tipo Protobuf inesperado')
    }
  }
  return mesa
}

/**
 * bdpProtos$ProtoSalonEstadoMesas:
 * campo 1 = estadomesas (repeated ProtoMesaEstado).
 */
function decodeEstadoSalon(bytes) {
  validateProtobuf(bytes)
  const mesas = []
  let pos = 0
  while (pos < bytes.length) {
    const tag = readVarint(bytes, pos)
    if (!tag) throw Error('Campo de salón incompleto')
    pos = tag.next
    const number = Math.floor(tag.value / 8)
    const wire = tag.value % 8
    if (wire === 2) {
      const len = readVarint(bytes, pos)
      if (!len) throw Error('Longitud de salón incompleta')
      pos = len.next
      const end = pos + len.value
      if (end > bytes.length) throw Error('Mensaje de mesa truncado')
      if (number === 1) {
        if (mesas.length >= 2048) throw Error('Demasiadas mesas en respuesta')
        mesas.push(decodeEstadoMesa(bytes.subarray(pos, end)))
      }
      pos = end
    } else if (wire === 0) {
      const val = readVarint(bytes, pos)
      if (!val) throw Error('Campo de salón incompleto')
      pos = val.next
    } else if (wire === 1) pos += 8
    else if (wire === 5) pos += 4
    else throw Error('Tipo de campo de salón desconocido')
    if (number === 1 && wire !== 2) throw Error('Lista de mesas mal formada')
    if (pos > bytes.length) throw Error('Campo de salón truncado')
  }
  return mesas
}

function queryTableStates({ host, port = 50000, salon = 1, token = 1, timeoutMs = 4000 }) {
  if (typeof host !== 'string' || !host.trim()) throw Error('Falta host')
  const frame = queryTablesFrame(salon, token)
  return new Promise((resolve, reject) => {
    let done = false
    let inbound = Buffer.alloc(0)
    const socket = new net.Socket()
    function finish(err, value) {
      if (done) return
      done = true
      socket.destroy()
      if (err) reject(err)
      else resolve(value)
    }
    socket.setTimeout(timeoutMs, () => finish(Error('Tiempo de espera agotado')))
    socket.on('error', (err) => finish(err))
    socket.on('end', () => finish(Error('Conexión cerrada antes de recibir la respuesta completa')))
    socket.on('data', (chunk) => {
      if (done) return
      if (inbound.length + chunk.length > MAX_FRAME_BYTES + 8) {
        finish(Error('Respuesta demasiado grande'))
        return
      }
      inbound = Buffer.concat([inbound, chunk])
      if (!inbound.length) return
      if (inbound[0] !== token) {
        finish(Error('Token de respuesta diferente al solicitado'))
        return
      }
      if (inbound.length < 2) return
      const header = readVarint(inbound, 1)
      if (!header) return
      if (header.value > MAX_FRAME_BYTES) {
        finish(Error('Mensaje Protobuf demasiado grande'))
        return
      }
      const end = header.next + header.value
      if (inbound.length < end) return
      const body = inbound.subarray(header.next, end)
      try {
        const verified = validateProtobuf(body)
        finish(null, { matchedToken: true, responseBytes: body.length, ...verified, mesas: decodeEstadoSalon(body) })
      } catch (err) {
        finish(err)
      }
    })
    socket.connect(port, host, () => socket.write(frame, (err) => {
      if (err) finish(err)
    }))
  })
}

if (require.main === module) {
  const live = process.argv.includes('--live-readonly')
  if (!live) {
    console.log(JSON.stringify({ mode: 'DRY_RUN', operation: 'queryTableStates',
      opcode: COMMAND_QUERY_TABLES, frame: [...queryTablesFrame(1)], serverContacted: false }, null, 2))
  } else if (process.env.BDP_HANDY_SOURCE_AUTHORIZED !== 'yes' ||
             process.env.BDP_HANDY_HOST === undefined) {
    console.error('Bloqueado: la IP del cliente debe estar autorizada en BDP antes de consultar en vivo.')
    process.exitCode = 2
  } else {
    queryTableStates({ host: process.env.BDP_HANDY_HOST })
      .then((result) => console.log(JSON.stringify({ operation: 'queryTableStates', result }, null, 2)))
      .catch((err) => { console.error('Consulta fallida:', err.message); process.exitCode = 1 })
  }
}

module.exports = { COMMAND_QUERY_TABLES, queryTablesFrame, readVarint, validateProtobuf, decodeEstadoMesa, decodeEstadoSalon, queryTableStates }