/**
 * BAR LA MARBELLA — IMPORTACIÓN DE NÓMINAS DESDE GMAIL
 * Cuenta del activador: marbellaremote@gmail.com
 * Requiere el servicio avanzado Drive API v3 y WEBHOOK_SECRET en Propiedades del script.
 *
 * Solo procesa nóminas salariales y resúmenes de costes. No utiliza el estado
 * leído/no leído para decidir si hay archivos pendientes.
 */
var CONFIG = {
  SENDER_EMAIL: 'gpierola@sevenlawfirm.com',
  PERSONAL_EMAIL: 'hhector7722@gmail.com',
  REMOTE_EMAIL: 'marbellaremote@gmail.com',
  NEXT_API_URL: 'https://marbella-app.vercel.app/api/webhooks/nominas',
  NEXT_API_URL_SUMMARY: 'https://marbella-app.vercel.app/api/webhooks/nominas-summary',
  ADMIN_EMAIL: 'hhector7722@gmail.com',
  LABEL_PROCESADO: 'nominas/procesada',
  LABEL_ERROR: 'nominas/error',
  SEARCH_DAYS: 90,
  PAGE_SIZE: 25,
  MAX_THREADS: 250
};

function _normalizarNombre(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Devuelve individual, summary o null. Nunca infiere el tipo a partir de un DNI. */
function _tipoNominaPorNombre(filename) {
  if (!/\.pdf$/i.test(String(filename || ''))) return null;
  var name = _normalizarNombre(filename);
  // Un contrato, un alta o una baja NO son nóminas, aunque contengan un DNI.
  if (/\b(registro|reg)\b.*\bjornada\b|\bjornada\b.*\b(registro|reg)\b/.test(name) ||
      /\b(contrato|baja|alta|finiquito|solicitud|liquidacion|certificado)\b/.test(name)) {
    return null;
  }
  if (/^(costes? de empres(?:a)?|costes? de emrpesa|resumen de nomina)\b/.test(name)) {
    return 'summary';
  }
  if (/^nominas?\b/.test(name) || /^recibos? de salario\b/.test(name)) {
    return 'individual';
  }
  return null;
}

function _esRemitenteAutorizado(from) {
  var normalized = String(from || '').toLowerCase();
  return [CONFIG.SENDER_EMAIL, CONFIG.PERSONAL_EMAIL, CONFIG.REMOTE_EMAIL]
    .some(function(email) {
      return normalized.indexOf('<' + email + '>') !== -1 ||
             normalized.trim() === email ||
             normalized.endsWith(' ' + email);
    });
}

function _dniValido(dni) {
  var value = String(dni || '').replace(/[- .]/g, '').toUpperCase();
  if (!/^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(value)) return false;
  var digits = value.slice(0, -1).replace(/^X/, '0').replace(/^Y/, '1').replace(/^Z/, '2');
  return value.slice(-1) === 'TRWAGMYFPDXBNJZSQVHLCKE'.charAt(parseInt(digits, 10) % 23);
}

function _extraerDNI(textContent) {
  var matches = String(textContent || '').match(/(?:[XYZ][- .]?[0-9]{7}[- .]?[A-Z]|[0-9]{8}[- .]?[A-Z])/gi) || [];
  for (var i = 0; i < matches.length; i++) {
    var candidate = matches[i].replace(/[- .]/g, '').toUpperCase();
    if (_dniValido(candidate)) return candidate;
  }
  return null;
}

/** Extrae DNI mediante Drive API v3. Limpia siempre el documento OCR temporal. */
function _dniPorOCR(attachment) {
  var fileId = null;
  try {
    var blob = attachment.copyBlob();
    var converted = Drive.Files.create({
      name: attachment.getName(),
      mimeType: 'application/vnd.google-apps.document'
    }, blob, { fields: 'id' });
    fileId = converted.id;
    if (!fileId) throw new Error('Drive OCR no devolvió ID');
    var content = DocumentApp.openById(fileId).getBody().getText();
    return _extraerDNI(content);
  } finally {
    if (fileId) {
      try { Drive.Files.remove(fileId); }
      catch (cleanError) { Logger.log('WARN limpieza OCR: ' + cleanError); }
    }
  }
}

/** Un webhook 2xx solo cuenta como éxito si confirma success:true. */
function _subirAdjunto(attachment, type, emailDate, secret) {
  var filename = attachment.getName();
  var payload = {
    filename: filename,
    emailDate: emailDate.toISOString(),
    fileBase64: Utilities.base64Encode(attachment.getBytes())
  };
  if (type === 'individual') {
    try {
      var dni = _dniPorOCR(attachment);
      if (dni) payload.extractedDni = dni;
      else Logger.log('WARN sin DNI OCR, se prueba parser del servidor: ' + filename);
    } catch (ocrError) {
      // El webhook individual también sabe leer el PDF mediante pdf2json.
      Logger.log('WARN OCR, se prueba parser del servidor: ' + filename + ' · ' + ocrError);
    }
  }
  var url = type === 'summary' ? CONFIG.NEXT_API_URL_SUMMARY : CONFIG.NEXT_API_URL;
  var response = UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  var body = response.getContentText() || '';
  var parsed = null;
  try { parsed = JSON.parse(body); } catch (_) {}
  if (status < 200 || status >= 300 || !parsed || parsed.success !== true) {
    throw new Error('Webhook ' + status + ': ' + body.slice(0, 400));
  }
  Logger.log('OK ' + type + ': ' + filename + (parsed.skipped ? ' (duplicado)' : ''));
}

/**
 * No modifica etiquetas de un hilo hasta que TODOS sus PDF pertinentes hayan
 * recibido confirmación. Mantiene la etiqueta de error para inspección manual.
 */
function procesarNominasEntrantes() {
  var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!secret) throw new Error('Falta WEBHOOK_SECRET en Propiedades del script');

  var query = '(from:' + CONFIG.SENDER_EMAIL + ' OR from:' + CONFIG.PERSONAL_EMAIL +
    ' OR from:' + CONFIG.REMOTE_EMAIL + ') has:attachment filename:pdf' +
    ' newer_than:' + CONFIG.SEARCH_DAYS + 'd';
  var okLabel = _getOrCreateLabel(CONFIG.LABEL_PROCESADO);
  var errorLabel = _getOrCreateLabel(CONFIG.LABEL_ERROR);
  var checked = 0, done = 0, imported = 0, errors = 0;

  for (var offset = 0; offset < CONFIG.MAX_THREADS; offset += CONFIG.PAGE_SIZE) {
    var threads = GmailApp.search(query, offset, CONFIG.PAGE_SIZE);
    if (!threads.length) break;
    for (var t = 0; t < threads.length; t++) {
      var thread = threads[t];
      var labels = thread.getLabels().map(function(l) { return l.getName(); });
      if (labels.indexOf(CONFIG.LABEL_PROCESADO) !== -1 ||
          labels.indexOf(CONFIG.LABEL_ERROR) !== -1) continue;
      checked++;
      var relevant = 0, failed = false;
      var messages = thread.getMessages();
      for (var m = 0; m < messages.length; m++) {
        var message = messages[m];
        if (!_esRemitenteAutorizado(message.getFrom())) continue;
        var attachments = message.getAttachments({ includeInlineImages: false });
        for (var a = 0; a < attachments.length; a++) {
          var attachment = attachments[a];
          var type = _tipoNominaPorNombre(attachment.getName());
          if (!type) {
            Logger.log('OMITIDO documento no salarial: ' + attachment.getName());
            continue;
          }
          relevant++;
          try {
            _subirAdjunto(attachment, type, message.getDate(), secret);
            imported++;
          } catch (error) {
            failed = true;
            errors++;
            Logger.log('ERROR ' + attachment.getName() + ': ' + error);
            _reportarError(message, 'IMPORTACIÓN', String(error), attachment.getName());
          }
        }
      }
      if (relevant > 0 && !failed) {
        thread.addLabel(okLabel);
        thread.markRead();
        done++;
      } else if (failed) {
        thread.addLabel(errorLabel);
      }
    }
    if (threads.length < CONFIG.PAGE_SIZE) break;
  }
  Logger.log('Nóminas: hilos revisados=' + checked + ', hilos completados=' + done +
    ', archivos OK=' + imported + ', fallos=' + errors);
  if (errors) throw new Error('Importación incompleta: ' + errors + ' PDF con error (ver etiqueta nominas/error)');
}

function _reportarError(message, type, detail, filename) {
  try {
    GmailApp.sendEmail(CONFIG.ADMIN_EMAIL, '[ERROR NÓMINA] ' + filename,
      'Archivo: ' + filename + '\nTipo: ' + type + '\nDetalle: ' + detail +
      '\nCorreo: ' + message.getSubject());
  } catch (emailError) {
    Logger.log('No se pudo enviar alerta: ' + emailError);
  }
}

function _getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
