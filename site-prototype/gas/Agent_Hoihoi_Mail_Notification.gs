/**
 * Agent Hoihoi: one mail attempt per authenticated POST.
 * Set NOTIFY_TO and NOTIFY_SECRET in Project Settings > Script properties.
 * POST JSON: {secret, environment, id, created_at, name, message}
 * name must be a string but may be empty, matching the guestbook form.
 * environment: production | staging. No deduplication or retry.
 * Callers must check JSON ok, not just HTTP status.
 */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ok: false, error: 'invalid_json'});
  }
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty('NOTIFY_SECRET');
  const recipient = properties.getProperty('NOTIFY_TO');
  if (!secret || secret.length < 32 || !recipient) {
    return json_({ok: false, error: 'configuration_error'});
  }
  if (!data || typeof data.secret !== 'string' || data.secret !== secret) {
    return json_({ok: false, error: 'unauthorized'});
  }
  if (!['production', 'staging'].includes(data.environment) ||
      !['string', 'number'].includes(typeof data.id) ||
      String(data.id).trim() === '' ||
      typeof data.name !== 'string' ||
      !['created_at', 'message'].every(function (key) {
        return typeof data[key] === 'string' && data[key].trim() !== '';
      })) {
    return json_({ok: false, error: 'invalid_payload'});
  }
  try {
    sendNotification_(recipient, data);
    return json_({ok: true});
  } catch (_) {
    console.error('Agent Hoihoi: mail_send_failed');
    return json_({ok: false, error: 'mail_send_failed'});
  }
}

function doGet() {
  return json_({ok: true, service: 'agent-hoihoi-mail', version: 1});
}

// Run manually once to authorize MailApp and check the recipient.
function testEmail() {
  const properties = PropertiesService.getScriptProperties();
  const recipient = properties.getProperty('NOTIFY_TO');
  const secret = properties.getProperty('NOTIFY_SECRET');
  if (!recipient || !secret || secret.length < 32) {
    throw new Error('Set NOTIFY_TO and NOTIFY_SECRET (32+ characters).');
  }
  sendNotification_(recipient, {
    environment: 'test',
    id: 'gas-mail-test',
    created_at: new Date().toISOString(),
    name: 'Agent Hoihoi setup test',
    message: 'This is a test email. No guestbook message was posted.'
  });
}

function sendNotification_(recipient, data) {
  const prefix = data.environment === 'production'
    ? '' : '[' + data.environment.toUpperCase() + '] ';
  MailApp.sendEmail({
    to: recipient,
    subject: prefix + 'Agent Hoihoi — New guestbook message',
    body: [
      'Environment: ' + data.environment,
      'Post ID: ' + data.id,
      'Created at: ' + data.created_at,
      'Name: ' + data.name,
      '',
      'Message:',
      data.message,
      '',
      'Publication requires manual approval.'
    ].join('\n'),
    name: 'Agent Hoihoi'
  });
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
