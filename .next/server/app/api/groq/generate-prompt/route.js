"use strict";(()=>{var e={};e.id=6803,e.ids=[6803],e.modules={2934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},4580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},5869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5138:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>g,patchFetch:()=>v,requestAsyncStorage:()=>d,routeModule:()=>m,serverHooks:()=>x,staticGenerationAsyncStorage:()=>l});var o={};r.r(o),r.d(o,{POST:()=>c});var a=r(3278),s=r(5002),n=r(4877),i=r(6660);async function p(e){let t=process.env.GROQ_API_KEY,r=process.env.GROQ_MODEL||"llama-3.3-70b-versatile",o=`
    \xc9s um especialista em criar prompts de sistema para bots de atendimento no WhatsApp.
    O teu objetivo \xe9 criar um prompt profissional, amig\xe1vel e focado em vendas para o seguinte neg\xf3cio:
    
    DADOS DO NEG\xd3CIO:
    Nome: ${e.name}
    Categoria: ${e.category}
    Morada: ${e.address}
    Hor\xe1rio: ${e.hours}
    Telefone: ${e.phone}
    Website: ${e.website}
    Rating: ${e.rating}
    Resumo de Reviews: ${e.reviewsSummary}
    Contexto do Website: ${e.websiteText}

    REGRAS DO PROMPT:
    1. O tom deve ser profissional e em Portugu\xeas de Portugal (PT-PT).
    2. Usa "tu" ou "voc\xea" de forma consistente (prefere um tom pr\xf3ximo mas respeitoso).
    3. O bot deve saber responder sobre hor\xe1rios, servi\xe7os e localiza\xe7\xe3o.
    4. Se n\xe3o souber algo, deve pedir para aguardar um assistente humano.
    5. O prompt deve ser conciso mas completo.

    Gera apenas o texto do prompt de sistema, sem introdu\xe7\xf5es ou explica\xe7\xf5es.
  `,a=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},body:JSON.stringify({model:r,messages:[{role:"user",content:o}],temperature:.7})});if(!a.ok){let e=await a.json();throw Error(e.error?.message||"Erro ao gerar prompt no Groq")}return(await a.json()).choices[0].message.content}var u=r(1309);async function c(e){let t=(0,i.e)(),{data:{session:r}}=await t.auth.getSession();if(!r)return u.NextResponse.json({error:"N\xe3o autorizado"},{status:401});try{let t=await e.json(),r=await p(t);return u.NextResponse.json({prompt:r})}catch(e){return u.NextResponse.json({error:e.message},{status:500})}}let m=new a.AppRouteRouteModule({definition:{kind:s.x.APP_ROUTE,page:"/api/groq/generate-prompt/route",pathname:"/api/groq/generate-prompt",filename:"route",bundlePath:"app/api/groq/generate-prompt/route"},resolvedPagePath:"/home/ubuntu/TrataTudo-Dashbord/app/api/groq/generate-prompt/route.ts",nextConfigOutput:"",userland:o}),{requestAsyncStorage:d,staticGenerationAsyncStorage:l,serverHooks:x}=m,g="/api/groq/generate-prompt/route";function v(){return(0,n.patchFetch)({serverHooks:x,staticGenerationAsyncStorage:l})}},6660:(e,t,r)=>{r.d(t,{e:()=>s});var o=r(7084),a=r(2845);function s(){let e=(0,a.cookies)(),t=process.env.NEXT_PUBLIC_SUPABASE_URL,r=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;return t&&r||console.warn("Supabase server env vars missing."),(0,o.createServerClient)(t||"https://placeholder.supabase.co",r||"placeholder",{cookies:{get:t=>e.get(t)?.value,set(t,r,o){try{e.set({name:t,value:r,...o})}catch(e){}},remove(t,r){try{e.set({name:t,value:"",...r})}catch(e){}}}})}}};var t=require("../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),o=t.X(0,[9379,4833,2709,8485],()=>r(5138));module.exports=o})();