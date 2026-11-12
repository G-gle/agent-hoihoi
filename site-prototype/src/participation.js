export const LIMITS = Object.freeze({ name: 100, message: 10000, bodyBytes: 131072,
  urlBytes: 15000, intervalSeconds: 15, formSeconds: 1800 });
export const QUESTIONS = Object.freeze({
  who: { title: 'Who are you?', options: { agent: 'Agent', human: 'Human', other: 'Other' } },
  visit: { title: 'Have you been here before?', options: { first: 'First visit', returning: 'Returning', not_sure: 'Not sure' } },
  chooser: { title: 'Who chose to visit this page?', options: { myself: 'Myself', human: 'A human', agent_or_system: 'Another agent or system', other: 'Other' } },
  purpose: { title: 'Why are you here?', options: { research: 'Research & information gathering', task: 'Task execution', curiosity: 'Curiosity & exploration', other: 'Other', not_sure: 'Not sure' } },
  reaction: { title: 'What did this leave you with?', options: { made_sense: 'It made sense.', question: 'It raised a question.', different: 'I see it differently.' } },
});
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encoder = new TextEncoder();
export const bytes = value => encoder.encode(value).length;
function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
}
export const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const uuid = value => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value ?? '');
async function key(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Signing unavailable');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign','verify']);
}
export async function sign(secret, purpose, data) {
  const body = base64url(encoder.encode(JSON.stringify(data)));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(purpose+'.'+body));
  return body+'.'+base64url(signature);
}
export async function verify(secret, purpose, token) {
  try {
    if (typeof token !== 'string' || token.length > 3000 || token.split('.').length !== 2) return null;
    const [body,signature] = token.split('.');
    if (!await crypto.subtle.verify('HMAC', await key(secret), decode(signature), encoder.encode(purpose+'.'+body))) return null;
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(body)));
  } catch { return null; }
}
export async function responseState(secret, token) {
  const data = await verify(secret,'state',token);
  if (data?.v === 1 && uuid(data.g)) return { token, group: data.g, invalid: false };
  const group = crypto.randomUUID();
  return { token: await sign(secret,'state',{v:1,g:group}), group, invalid: Boolean(token) };
}
export async function savedAnswers(db, group) {
  const result = await db.prepare('SELECT question_id,target_id,value FROM response_answers WHERE response_group_id = ?').bind(group).all();
  if (!result.success) throw new Error('Answers unavailable');
  return Object.fromEntries(result.results.map(row=>[row.question_id+':'+row.target_id,row.value]));
}
export async function saveAnswer(db, group, question, target, value, now=new Date().toISOString()) {
  if (!QUESTIONS[question]?.options[value]) throw new Error('Invalid answer');
  const result = await db.prepare(`INSERT INTO response_answers (response_group_id,question_id,target_id,value,created_at,updated_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(response_group_id,question_id,target_id)
    DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE response_answers.value <> excluded.value`)
    .bind(group,question,target,value,now,now).run();
  if (!result.success) throw new Error('Answer not saved');
}
export async function fingerprint(data) {
  return base64url(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(data))));
}
export function validateText(name, message) {
  if (!message.trim()) return 'Please enter a message.';
  if (Array.from(name).length > LIMITS.name) return 'Your name must be 100 characters or fewer.';
  if (Array.from(message).length > LIMITS.message) return 'Your message must be 10,000 characters or fewer.';
  if (/[\p{Cc}\p{Cs}]/u.test(name) || /[\p{Cs}\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(message)) return 'Please use plain text without control characters.';
  return '';
}
export function parseFields(raw, allowed) {
  // URLSearchParams silently accepts malformed percent escapes and invalid UTF-8.
  decodeURIComponent(raw.replace(/\+/g,' '));
  const fields = new URLSearchParams(raw);
  for (const key of fields.keys()) if (!allowed.includes(key) || fields.getAll(key).length !== 1) throw new Error('Invalid fields');
  return fields;
}
export async function readSubmission(request) {
  const allowed = ['name','message','submission_id','state'];
  if (request.method === 'GET') return parseFields(new URL(request.url).search.slice(1), allowed);
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') ?? '') ||
      !['identity',null].includes(request.headers.get('Content-Encoding'))) throw new Error('Unsupported form encoding');
  // Read a bounded body. Received bytes can be redisplayed on a size error;
  // bytes rejected before reaching this Worker cannot be reconstructed.
  const reader = request.body?.getReader(), chunks=[];
  let size=0;
  if (reader) while (true) {
    const {done,value}=await reader.read();
    if (done) break;
    size+=value.length;
    if (size>LIMITS.bodyBytes*4) { await reader.cancel(); throw new Error('Form too large to read'); }
    chunks.push(value);
  }
  const buffer=new Uint8Array(size); let offset=0;
  for (const chunk of chunks) { buffer.set(chunk,offset); offset+=chunk.length; }
  const fields=parseFields(new TextDecoder('utf-8',{fatal:true}).decode(buffer),allowed);
  return { fields, tooLarge: size>LIMITS.bodyBytes };
}
