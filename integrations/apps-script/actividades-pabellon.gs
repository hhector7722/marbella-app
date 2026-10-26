/**
 * GOOGLE APPS SCRIPT — TRANSPORTADOR DE ACTIVIDADES PABELLÓN
 * Bar La Marbella · Gmail -> webhook de marbella-app
 *
 * Configurar WEBHOOK_SECRET en Propiedades del script y un activador
 * temporal para procesarActividadesEntrantes cada 5–15 minutos.
 *
 * El registro definitivo y la deduplicación por fecha se realizan
 * en Supabase mediante el webhook, nunca con etiquetas de Gmail.
 */

var CONFIG_ACTIVIDADES = {
  SENDER_EMAILS: [
    'fmarco@cemmarbella.cat',
    'abrull@cemmarbella.cat',
    'recepcio@cemmarbella.cat',
    'marbellaremote@gmail.com'
  ],
  NEXT_API_URL: 'https://marbella-app.vercel.app/api/webhooks/pavilion-activities',
  ADMIN_EMAIL: 'hhector7722@gmail.com',
  FECHA_INICIO: '2026-10-26',
  BUSQUEDA_DIAS: 90,
  MAX_HILOS: 200,
  HILOS_POR_PAGINA: 30,
  MAX_ENVIOS_POR_EJECUCION: 8,
  REINTENTO_MINUTOS: 60
};

function _consultaActividades() {
  var from = CONFIG_ACTIVIDADES.SENDER_EMAILS.map(function(email) {
    return 'from:' + email;
  }).join(' ');

  // No depender del estado leído ni de etiquetas antiguas.
  return '{' + from + '} has:attachment filename:pdf newer_than:' +
    CONFIG_ACTIVIDADES.BUSQUEDA_DIAS + 'd';
}

function _remitentePermitido(message) {
  var match = String(message.getFrom()).toLowerCase().match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
  );
  return !!match && CONFIG_ACTIVIDADES.SENDER_EMAILS.indexOf(match[0]) !== -1;
}

function _fechaPdf(filename) {
  var match = String(filename).match(/^(\d{1,2})-(\d{1,2})-(\d{2})(?:\D|$)/);
  if (!match) return null;

  var day = Number(match[1]);
  var month = Number(match[2]);
  var year = 2000 + Number(match[3]);
  var date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) return null;

  return year + '-' +
    ('0' + month).slice(-2) + '-' +
    ('0' + day).slice(-2);
}

function _esPdf(attachment) {
  var name = String(attachment.getName() || '');
  return attachment.getContentType() === 'application/pdf' ||
    /\.pdf$/i.test(name);
}

function _enviarActividad(message, attachment, secret) {
  var filename = attachment.getName();
  var bytes = attachment.getBytes();

  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) {
    throw new Error('PDF vacío o mayor de 10 MB: ' + filename);
  }

  var payload = {
    fileBase64: Utilities.base64Encode(bytes),
    filename: filename,
    emailDate: message.getDate().toISOString(),
    gmailMessageId: message.getId(),
    subject: message.getSubject() || ''
  };

  var response = UrlFetchApp.fetch(CONFIG_ACTIVIDADES.NEXT_API_URL, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + secret },
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var raw = response.getContentText();
  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('HTTP ' + status + ' (respuesta inválida): ' + raw.slice(0, 400));
  }

  if (status < 200 || status >= 300 || data.success !== true ||
      data.accepted !== true) {
    throw new Error('HTTP ' + status + ': ' + raw.slice(0, 500));
  }

  // El servidor puede devolver background, deduplicated,
  // different_version o existing_occupations.
  // Un HTTP 200 significa recepción/control, no OCR completado.
  return data;
}

function procesarActividadesEntrantes() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log('Hay otra ejecución en curso.');
    return;
  }

  try {
    _procesarActividades();
  } finally {
    lock.releaseLock();
  }
}

function _procesarActividades() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('WEBHOOK_SECRET');
  if (!secret) throw new Error('WEBHOOK_SECRET no configurado.');

  var query = _consultaActividades();
  var enviados = 0;
  var reconocidos = 0;
  var errores = [];
  var avisos = [];
  var limite = false;

  Logger.log('CONSULTA: ' + query);

  for (var offset = 0;
       offset < CONFIG_ACTIVIDADES.MAX_HILOS;
       offset += CONFIG_ACTIVIDADES.HILOS_POR_PAGINA) {

    var threads = GmailApp.search(
      query, offset, CONFIG_ACTIVIDADES.HILOS_POR_PAGINA
    );
    if (!threads.length) break;

    for (var t = 0; t < threads.length && !limite; t++) {
      var messages = threads[t].getMessages();

      for (var m = 0; m < messages.length && !limite; m++) {
        var message = messages[m];
        if (!_remitentePermitido(message)) continue;

        var attachments = message.getAttachments({ includeInlineImages: false });
        for (var a = 0; a < attachments.length; a++) {
          var att = attachments[a];
          if (!_esPdf(att)) continue;

          var name = att.getName();
          var activityDate = _fechaPdf(name);

          // Jamás reenviar el histórico ni PDF con nombres sin fecha válida.
          if (!activityDate) {
            Logger.log('REVISAR fecha inválida: ' + name);
            continue;
          }
          if (activityDate < CONFIG_ACTIVIDADES.FECHA_INICIO) continue;

          var key = 'PAV_ACK_' + message.getId() + '_' + a;
          var state = props.getProperty(key);

          if (state === 'OK') {
            reconocidos++;
            continue;
          }

          if (state && state.indexOf('ERR:') === 0) {
            var last = Number(state.slice(4));
            if (Number.isFinite(last) && Date.now() - last <
                CONFIG_ACTIVIDADES.REINTENTO_MINUTOS * 60000) continue;
          }

          if (enviados + errores.length >=
              CONFIG_ACTIVIDADES.MAX_ENVIOS_POR_EJECUCION) {
            limite = true;
            break;
          }

          try {
            var data = _enviarActividad(message, att, secret);
            props.setProperty(key, 'OK');
            enviados++;

            Logger.log('RECIBIDO ' + name + ' (' +
              data.processing + ', fecha ' + data.activityDate + ')');

            if (data.processing === 'different_version' ||
                data.processing === 'existing_occupations') {
              avisos.push(name + ': ' + data.processing +
                '. No se ha sobrescrito el registro existente.');
            }
          } catch (e) {
            props.setProperty(key, 'ERR:' + Date.now());
            errores.push(name + ': ' + String(e));
            Logger.log('ERROR ' + name + ': ' + String(e));
          }
        }
      }
    }

    if (limite || threads.length < CONFIG_ACTIVIDADES.HILOS_POR_PAGINA) {
      break;
    }
  }

  Logger.log('RESUMEN: aceptados=' + enviados +
    ', ya reconocidos=' + reconocidos +
    ', fallidos=' + errores.length +
    ', avisos de revisión=' + avisos.length);

  if (errores.length || avisos.length) {
    try {
      GmailApp.sendEmail(
        CONFIG_ACTIVIDADES.ADMIN_EMAIL,
        '[ACTIVIDADES] ' + errores.length + ' errores, ' +
          avisos.length + ' avisos',
        'Errores de transporte:\n' +
          (errores.join('\n') || 'Ninguno') +
        '\n\nDocumentos protegidos pendientes de revisión:\n' +
          (avisos.join('\n') || 'Ninguno')
      );
    } catch (e) {
      Logger.log('Error enviando resumen: ' + e);
    }
  }
}

/**
 * Diagnóstico sin envíos ni alteraciones de correo.
 */
function diagnosticarActividades() {
  var props = PropertiesService.getScriptProperties();
  var threads = GmailApp.search(_consultaActividades(), 0, 10);
  var candidatos = 0;

  Logger.log('Hilos encontrados (máximo 10): ' + threads.length);
  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(message) {
      if (!_remitentePermitido(message)) return;
      var attachments = message.getAttachments({ includeInlineImages: false });
      attachments.forEach(function(att, index) {
        if (!_esPdf(att)) return;
        var date = _fechaPdf(att.getName());
        if (!date || date < CONFIG_ACTIVIDADES.FECHA_INICIO) return;

        var key = 'PAV_ACK_' + message.getId() + '_' + index;
        candidatos++;
        Logger.log(date + ' ' + att.getName() +
          ' | Transporte: ' + (props.getProperty(key) || 'PENDIENTE DE ENVÍO'));
      });
    });
  });

  Logger.log('PDF candidatos desde ' +
    CONFIG_ACTIVIDADES.FECHA_INICIO + ': ' + candidatos);
}
