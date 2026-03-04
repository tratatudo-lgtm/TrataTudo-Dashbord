import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';

function isValidApiKey(req: Request) {
const key = req.headers.get('x-tratatudo-key') || '';
const expected = process.env.TRATATUDO_API_KEY || '';
return expected.length > 0 && key === expected;
}

function isServiceActive(client: any) {
if (!client) return false;

const status = String(client.status || '').toLowerCase();
if (status === 'expired') return false;

if (status === 'trial') {
if (!client.trial_end) return false;
const end = new Date(client.trial_end);
return end.getTime() > Date.now();
}

if (status === 'active') {
if (!client.trial_end) return true;
const end = new Date(client.trial_end);
return end.getTime() > Date.now();
}

return false;
}

function safeStr(v: any) {
if (v === null || v === undefined) return '';
return String(v).trim();
}

// Remove JSON técnico do chat
function extractAndStripReport(fullText: string) {

const text = safeStr(fullText);

const markerPos = text.indexOf('"REPORT"');

if (markerPos === -1) {
return { clean: text, report: null };
}

const start = text.lastIndexOf('{', markerPos);
const end = text.lastIndexOf('}');

if (start === -1 || end === -1) {
return { clean: text, report: null };
}

const chunk = text.slice(start, end + 1);

let obj: any = null;

try {
obj = JSON.parse(chunk);
} catch {
obj = null;
}

const clean = safeStr(
text.slice(0, start) + '\n' + text.slice(end + 1)
);

if (obj && obj.REPORT === true) {
return { clean, report: obj };
}

return { clean, report: null };
}

export async function POST(req: Request) {

try {

const supabase = createClient();

const apiKeyOk = isValidApiKey(req);

const { data: { session } } = await supabase.auth.getSession();

if (!apiKeyOk && !session) {
  return NextResponse.json({ ok:false,error:'Não autorizado' },{ status:401 });
}

const body = await req.json();

const client_id = Number(body.client_id);
const phone_e164 = safeStr(body.phone_e164);
const text = safeStr(body.text);
const push_name = safeStr(body.push_name);

if (!client_id || !phone_e164 || !text) {
  return NextResponse.json({ ok:false,error:'client_id, phone_e164 e text são obrigatórios' },{ status:400 });
}

const { data: client } = await supabase
  .from('clients')
  .select('id,status,trial_end,bot_instructions,company_name,instance_name')
  .eq('id', client_id)
  .single();

if (!isServiceActive(client)) {
  return NextResponse.json({ ok:false,error:'Serviço expirado' },{ status:403 });
}

const base = await getSystemBasePrompt();
const finalPrompt = mergePrompts(base, client?.bot_instructions || '');

const groqKey = process.env.GROQ_API_KEY || '';
const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const messages = [
  { role:'system', content: finalPrompt },
  { role:'user', content: text }
];

const res = await fetch('https://api.groq.com/openai/v1/chat/completions',{

  method:'POST',

  headers:{
    'Content-Type':'application/json',
    Authorization:`Bearer ${groqKey}`
  },

  body:JSON.stringify({
    model,
    temperature:0.2,
    messages
  })

});

const data = await res.json();

const fullReply = safeStr(data?.choices?.[0]?.message?.content);

const { clean, report } = extractAndStripReport(fullReply);

await supabase.from('wa_messages').insert([
  {
    phone_e164,
    instance: client.instance_name,
    direction:'in',
    text,
    raw:{ source:'api/bot/reply', push_name }
  },
  {
    phone_e164,
    instance: client.instance_name,
    direction:'out',
    text: clean,
    raw:{ source:'groq', push_name }
  }
]);

if (report) {

  await supabase.from('tickets').insert([{

    client_id,
    kind: report.type || 'request',
    category: report.category || '',
    description: report.description || '',
    priority: report.urgency || 'normal',
    status:'new',
    customer_name: report.citizen_name || push_name,
    customer_contact: report.citizen_contact || phone_e164,
    location_text: report.location_text || '',
    channel:'whatsapp',
    raw: report

  }]);

}

return NextResponse.json({
  ok:true,
  data:{ reply: clean }
});

} catch(err:any){

console.error(err);

return NextResponse.json({
  ok:false,
  error:'Erro interno'
},{ status:500 });

}

}