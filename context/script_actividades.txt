/**
 * GOOGLE APPS SCRIPT — TRANSPORTADOR ACTIVIDADES PABELLÓN
 * Bar La Marbella · PDF diario desde fmarco@cemmarbella.cat
 *
 * Configuración:
 * 1. Propiedad de script WEBHOOK_SECRET (mismo valor que Vercel).
 * 2. Trigger temporal: procesarActividadesEntrantes — cada 5-15 min.
 */

var CONFIG_ACTIVIDADES = {
  SENDER_EMAIL: 'fmarco@cemmarbella.cat',
  NEXT_API_URL: 'https://marbella-app.vercel.app/api/webhooks/pavilion-activities',
  ADMIN_EMAIL: 'hhector7722@gmail.com',
  LABEL_PROCESADO: 'actividades/procesada',
  LABEL_ERROR: 'actividades/error'
};

function procesarActividadesEntrantes() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('WEBHOOK_SECRET');
  if (!secret) {
    Logger.log('ERROR: No se ha configurado WEBHOOK_SECRET.');
    return;
  }

  var query =
    'from:' + CONFIG_ACTIVIDADES.SENDER_EMAIL +
    ' is:unread has:attachment filename:pdf' +
    ' -label:' + CONFIG_ACTIVIDADES.LABEL_PROCESADO.replace('/', '-') +
    ' -label:' + CONFIG_ACTIVIDADES.LABEL_ERROR.replace('/', '-');

  var threads = GmailApp.search(query);
  if (threads.length === 0) return;

  var labelOk = _getOrCreateLabelActividades(CONFIG_ACTIVIDADES.LABEL_PROCESADO);
  var labelError = _getOrCreateLabelActividades(CONFIG_ACTIVIDADES.LABEL_ERROR);

  threads.forEach(function (thread) {
    var messages = thread.getMessages();
    var lastMessage = messages[messages.length - 1];
    if (!lastMessage.isUnread()) return;

    var emailDate = lastMessage.getDate();
    var gmailMessageId = lastMessage.getId();
    var subject = lastMessage.getSubject() || '';
    var attachments = lastMessage.getAttachments({ includeInlineImages: false });
    var errorEnHilo = false;
    var pdfCount = 0;
    var okCount = 0;

    attachments.forEach(function (att) {
      if (att.getContentType() !== 'application/pdf' && !att.getName().toLowerCase().endsWith('.pdf')) return;

      pdfCount += 1;
      var filename = att.getName();
      var b64 = Utilities.base64Encode(att.getBytes());

      var payload = {
        fileBase64: b64,
        filename: filename,
        emailDate: emailDate.toISOString(),
        gmailMessageId: gmailMessageId,
        subject: subject
      };

      var options = {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + secret },
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      try {
        var response = UrlFetchApp.fetch(CONFIG_ACTIVIDADES.NEXT_API_URL, options);
        var code = response.getResponseCode();
        var responseText = response.getContentText();

        if (code >= 200 && code < 300) {
          okCount += 1;
          Logger.log('✅ Actividad subida OK (' + okCount + '/' + pdfCount + '): ' + filename);
        } else {
          errorEnHilo = true;
          _reportarErrorActividades(lastMessage, 'HTTP ' + code, responseText, filename);
        }
      } catch (e) {
        errorEnHilo = true;
        _reportarErrorActividades(lastMessage, 'FALLO CONEXIÓN', e.toString(), filename);
      }
    });

    if (pdfCount === 0) return;

    if (!errorEnHilo) {
      thread.addLabel(labelOk);
      lastMessage.markRead();
      Logger.log('✅ Email completado: ' + okCount + ' PDF de ' + pdfCount);
    } else {
      thread.addLabel(labelError);
    }
  });
}

function _reportarErrorActividades(message, tipo, detalle, fileName) {
  var asunto = '[🚨 ERROR ACTIVIDADES] ' + fileName;
  var cuerpo = 'Error: ' + fileName + '\nTipo: ' + tipo + '\nDetalle: ' + detalle;
  GmailApp.sendEmail(CONFIG_ACTIVIDADES.ADMIN_EMAIL, asunto, cuerpo);
  Logger.log(asunto + ' - ' + detalle);
}

function _getOrCreateLabelActividades(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) label = GmailApp.createLabel(name);
  return label;
}
