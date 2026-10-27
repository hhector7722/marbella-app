/**
 * LA MARBELLA — TRANSPORTE DE ALBARANES POR EMAIL (GMAIL -> MARBELLA APP)
 *
 * Instalar en el Apps Script de marbellaremote@gmail.com, NO en nóminas ni
 * actividades. Propiedades del script: WEBHOOK_SECRET (o ALBARANES_WEBHOOK_SECRET).
 * Activador temporal: procesarAlbaranesEntrantes cada 5 minutos.
 *
 * Este script NO clasifica facturas, modifica existencias ni marca mensajes
 * leídos: envía PDF/JPG/PNG a una bandeja de revisión segura en Marbella App.
 * El servidor guarda la huella del archivo y evita la importación doble.
 */
var CONFIG_ALBARANES = {
  CUENTA: 'marbellaremote@gmail.com',
  FECHA_INICIO: '2026/10/27',
  URL: 'https://marbella-app.vercel.app/api/webhooks/albaranes',
  REMITENTES_ADMITIDOS: [
    'info@grupsantateresa.com',
    'peterdelperal@gmail.com',
    'delegacion.barcelona@es.froneri.com',
    'pedido@sanilec.es'
  ],
  // Los proveedores nuevos también entran cuando el asunto o fichero
  // describe claramente un documento de compra.
  PALABRAS_DOCUMENTO: /albar[aá]n|factura|invoice|entrega|pedido|compra|ticket|rebut|facturaci[oó]n/i,
  EXCLUIR_REMITENTES: [
    'gpierola@sevenlawfirm.com',
    'fmarco@cemmarbella.cat',
    'abrull@cemmarbella.cat',
    'recepcio@cemmarbella.cat'
  ],
  MAX_HILOS: 250,
  HILOS_PAGINA: 25,
  MAX_ENVIOS: 8,
  MAX_BYTES: 10 * 1024 * 1024,
  REINTENTO_MINUTOS: 30
};

function _albaranesEmail(from) {
  var match = String(from || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return match ? match[0] : '';
}
function _albaranesArchivoValido(nombre) {
  return /\.(pdf|jpe?g|png)$/i.test(String(nombre || ''));
}
function _albaranesCandidato(message, attachment) {
  var sender = _albaranesEmail(message.getFrom());
  if (!sender || sender === CONFIG_ALBARANES.CUENTA ||
      CONFIG_ALBARANES.EXCLUIR_REMITENTES.indexOf(sender) !== -1) return false;
  if (!_albaranesArchivoValido(attachment.getName())) return false;
  if (CONFIG_ALBARANES.REMITENTES_ADMITIDOS.indexOf(sender) !== -1) return true;
  var text = (message.getSubject() || '') + ' ' + attachment.getName();
  return CONFIG_ALBARANES.PALABRAS_DOCUMENTO.test(text);
}

function _albaranesEnviar(message, attachment, attachmentIndex, secret) {
  var bytes = attachment.getBytes();
  if (!bytes.length || bytes.length > CONFIG_ALBARANES.MAX_BYTES) {
    throw new Error('Adjunto vacío o superior a 10 MB: ' + attachment.getName());
  }
  var payload = {
    gmailMessageId: message.getId(),
    attachmentIndex: attachmentIndex,
    fileBase64: Utilities.base64Encode(bytes),
    filename: attachment.getName(),
    from: _albaranesEmail(message.getFrom()),
    subject: message.getSubject() || '',
    emailDate: message.getDate().toISOString()
  };
  var response = UrlFetchApp.fetch(CONFIG_ALBARANES.URL, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + secret },
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var raw = response.getContentText();
  var parsed;
  try { parsed = JSON.parse(raw); } catch (_e) {
    throw new Error('Respuesta no JSON: HTTP ' + response.getResponseCode());
  }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 ||
      parsed.success !== true || parsed.accepted !== true) {
    throw new Error('HTTP ' + response.getResponseCode() + ': ' + String(parsed.error || raw).slice(0, 250));
  }
  return parsed;
}

function procesarAlbaranesEntrantes() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('ALBARANES_WEBHOOK_SECRET') ||
                 props.getProperty('WEBHOOK_SECRET');
    if (!secret) throw new Error('Falta WEBHOOK_SECRET en Propiedades del script');

    // NO dependemos de is:unread. NO movemos etiquetas ni marcamos leído.
    // Inicio acotado para evitar reimportar el histórico previo al lanzamiento.
    var query = 'to:' + CONFIG_ALBARANES.CUENTA +
      ' has:attachment after:' + CONFIG_ALBARANES.FECHA_INICIO +
      ' -in:spam -in:trash';
    var ok = 0, reconocidos = 0, fallos = 0;
    var limite = false;
    for (var offset = 0; offset < CONFIG_ALBARANES.MAX_HILOS && !limite;
         offset += CONFIG_ALBARANES.HILOS_PAGINA) {
      var threads = GmailApp.search(query, offset, CONFIG_ALBARANES.HILOS_PAGINA);
      if (!threads.length) break;
      for (var t = 0; t < threads.length && !limite; t++) {
        var messages = threads[t].getMessages();
        for (var m = 0; m < messages.length && !limite; m++) {
          var message = messages[m];
          if (message.getDate().getTime() <
              new Date(CONFIG_ALBARANES.FECHA_INICIO.replace(/\//g, '-') + 'T00:00:00Z').getTime()) continue;
          var attachments = message.getAttachments({ includeInlineImages: false });
          for (var a = 0; a < attachments.length; a++) {
            var att = attachments[a];
            if (!_albaranesCandidato(message, att)) continue;
            var key = 'ALB_ACK_' + message.getId() + '_' + a;
            var state = props.getProperty(key);
            if (state === 'OK') { reconocidos++; continue; }
            if (state && state.indexOf('ERR:') === 0) {
              var last = Number(state.slice(4));
              if (isFinite(last) && Date.now() - last < CONFIG_ALBARANES.REINTENTO_MINUTOS * 60000) continue;
            }
            if (ok + fallos >= CONFIG_ALBARANES.MAX_ENVIOS) { limite = true; break; }
            try {
              var result = _albaranesEnviar(message, att, a, secret);
              props.setProperty(key, 'OK');
              ok++;
              Logger.log('RECIBIDO ' + att.getName() + ' / ' + result.processing);
            } catch (error) {
              props.setProperty(key, 'ERR:' + Date.now());
              fallos++;
              Logger.log('ERROR ' + att.getName() + ': ' + String(error));
            }
          }
        }
      }
      if (threads.length < CONFIG_ALBARANES.HILOS_PAGINA) break;
    }
    Logger.log('ALBARANES: nuevos=' + ok + ', ya archivados=' + reconocidos + ', errores=' + fallos);
  } finally {
    lock.releaseLock();
  }
}
