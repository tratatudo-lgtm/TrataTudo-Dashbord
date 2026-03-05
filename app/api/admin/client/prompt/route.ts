import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v:any){
  if(v===null||v===undefined) return '';
  return String(v).trim();
}

function normalizePhone(v:string){
  const s=safeStr(v).replace(/\s+/g,'');
  if(!s) return '';

  if(s.startsWith('+')) return s;

  if(/^351\d{9}$/.test(s))
    return `+${s}`;

  if(/^\d{9}$/.test(s))
    return `+351${s}`;

  return s;
}

export async function POST(req:Request){

  try{

    const admin = await validateAdmin();

    if(!admin?.isAdmin){
      const status=(admin as any)?.status || 401;
      const error=(admin as any)?.error || 'Não autorizado';
      return NextResponse.json({ok:false,error},{status});
    }

    const body=await req.json().catch(()=>null);

    if(!body){
      return NextResponse.json(
        {ok:false,error:'invalid_json'},
        {status:400}
      );
    }

    const client_id=Number(body.client_id);
    const prompt=safeStr(body.prompt);
    const test_number=normalizePhone(body.test_number || '');

    if(!client_id){
      return NextResponse.json(
        {ok:false,error:'client_id obrigatório'},
        {status:400}
      );
    }

    const supabase=createClient();

    /*
    Atualiza prompt do cliente
    */

    const {error:updateErr}=await supabase
      .from('clients')
      .update({
        bot_instructions:prompt,
        updated_at:new Date().toISOString()
      })
      .eq('id',client_id);

    if(updateErr){
      return NextResponse.json(
        {ok:false,error:updateErr.message},
        {status:500}
      );
    }

    /*
    Se foi passado número de teste,
    cria mapping HUB -> cliente
    */

    if(test_number){

      const {error:mapErr}=await supabase
        .from('hub_client_numbers')
        .upsert({
          phone_e164:test_number,
          client_id,
          enabled:true
        });

      if(mapErr){
        return NextResponse.json(
          {ok:false,error:mapErr.message},
          {status:500}
        );
      }

    }

    return NextResponse.json({
      ok:true,
      data:{
        client_id,
        test_number:test_number || null
      }
    });

  }catch(e:any){

    return NextResponse.json(
      {ok:false,error:e?.message || 'Erro interno'},
      {status:500}
    );

  }

}