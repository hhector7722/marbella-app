'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const {
  COMMAND_QUERY_TABLES, queryTablesFrame, validateProtobuf, queryTableStates,
} = require('./handy-client.cjs')

test('La consulta de mesas genera la trama documentada en la APK', () => {
  assert.equal(COMMAND_QUERY_TABLES, 19)
  assert.deepEqual([...queryTablesFrame(1, 1)], [1, 19, 49, 0])
  assert.deepEqual([...queryTablesFrame(12, 9)], [9, 19, 49, 50, 0])
  assert.throws(() => queryTablesFrame(0), RangeError)
  assert.throws(() => queryTablesFrame(1, 0), RangeError)
})

test('Parser Protobuf valida campos y truncamientos sin exponer contenido', () => {
  assert.deepEqual(validateProtobuf(Buffer.from([0x0a, 0])), { fieldCount: 1, fieldNumbers: [1] })
  assert.throws(() => validateProtobuf(Buffer.from([0x0a, 3, 1])), /truncado/)
})

async function mockServer(reply) {
  const server = net.createServer((socket) => {
    let payload = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      payload = Buffer.concat([payload, chunk])
      if (payload.length >= 4) {
        assert.deepEqual([...payload], [1, 19, 49, 0])
        reply(socket)
      }
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, port: server.address().port }
}

test('Consulta a servidor simulado: respuesta fragmentada y token correcto', async () => {
  const { server, port } = await mockServer((socket) => {
    socket.write(Buffer.from([1]))
    setImmediate(() => { socket.end(Buffer.from([2, 0x0a, 0])) })
  })
  try {
    const response = await queryTableStates({host:'127.0.0.1', port, timeoutMs:1000})
    assert.equal(response.matchedToken, true)
    assert.equal(response.responseBytes, 2)
    assert.deepEqual(response.fieldNumbers, [1])
  } finally { await new Promise(resolve=>server.close(resolve)) }
})

test('Token incorrecto se rechaza sin reintentar', async () => {
  const { server, port } = await mockServer(socket => socket.end(Buffer.from([2, 0])))
  try {
    await assert.rejects(queryTableStates({host:'127.0.0.1', port, timeoutMs:1000}), /Token/)
  } finally { await new Promise(resolve=>server.close(resolve)) }
})

test('Servidor que no contesta produce timeout sin reintentos', async () => {
  const {server,port} = await mockServer(() => {})
  try { await assert.rejects(queryTableStates({host:'127.0.0.1',port,timeoutMs:90}), /espera/) }
  finally {await new Promise(resolve=>server.close(resolve))}
})

test('Conexión cerrada antes de responder produce error explícito', async () => {
  const { server, port } = await mockServer(socket => socket.end())
  try {
    await assert.rejects(queryTableStates({host:'127.0.0.1', port, timeoutMs:1000}), /Conexión cerrada/)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('Descodifica estados de mesas según el esquema Protobuf real de BDP Handy', () => {
  const { decodeEstadoSalon } = require('./handy-client.cjs')
  const salon = Buffer.from([
    0x0a, 0x08, 0x08, 12, 0x10, 2, 0x18, 12, 0x28, 1,
    0x0a, 0x06, 0x08, 7, 0x10, 1, 0x20, 1,
  ])
  assert.deepEqual(decodeEstadoSalon(salon), [
    {numero:12, ocupacionCodigo:2, mesaPrincipal:12, juntada:null, reservada:true},
    {numero:7, ocupacionCodigo:1, mesaPrincipal:null, juntada:true, reservada:null},
  ])
})

test('Protobuf mal formado no se acepta como mesa válida', () => {
  const { decodeEstadoSalon } = require('./handy-client.cjs')
  assert.throws(()=>decodeEstadoSalon(Buffer.from([0x0a,5,0x08])), /truncado/)
  assert.throws(()=>decodeEstadoSalon(Buffer.from([0x08,0x02])), /Lista de mesas mal formada/)
})

test('La respuesta del servidor simulado incluye mesas ya descodificadas', async () => {
  const {server,port}=await mockServer(socket => {
    socket.end(Buffer.from([1,10,0x0a,8,0x08,12,0x10,2,0x18,12,0x28,1]))
  })
  try {
    const res=await queryTableStates({host:'127.0.0.1',port,timeoutMs:1000})
    assert.deepEqual(res.mesas,[{
      numero:12, ocupacionCodigo:2, mesaPrincipal:12, juntada:null, reservada:true,
    }])
  } finally { await new Promise(resolve=>server.close(resolve)) }
})