// app/app/settings/page.tsx
import { AlertCircle, CheckCircle2, XCircle, KeyRound, Server, Bot, Globe } from "lucide-react";
import { getBaseUrl } from "@/lib/baseUrl";
import { DebugPanel } from "@/components/debug-panel";

export const dynamic = "force-dynamic";

type EnvDiag = {
  ok: boolean;
  values?: Record<string, boolean>;
  error?: string;
};

const ENV_GROUPS: Array<{
  title: string;
  icon: any;
  items: Array<{ key: string; note?: string }>;
}> = [
  {
    title: "Supabase",
    icon: Server,
    items: [
      { key: "NEXT_PUBLIC_SUPABASE_URL" },
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY" },
      { key: "SUPABASE_SERVICE_ROLE_KEY", note: "Obrigatório para rotas admin/automação" },
    ],
  },
  {
    title: "Evolution API",
    icon: Bot,
    items: [
      { key: "EVOLUTION_API_URL" },
      { key: "EVOLUTION_API_KEY" },
    ],
  },
  {
    title: "Groq",
    icon: KeyRound,
    items: [
      { key: "GROQ_API_KEY" },
      { key: "GROQ_MODEL" },
    ],
  },
  {
    title: "URLs",
    icon: Globe,
    items: [
      { key: "NEXT_PUBLIC_SITE_URL" },
      { key: "APP_URL" },
    ],
  },
];

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold " +
        (ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")
      }
    >
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {ok ? "CONFIGURADO" : "EM FALTA"}
    </span>
  );
}

export default async function SettingsPage() {
  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/diagnostics/env`;

  let diag: EnvDiag | null = null;
  let error: string | null = null;
  let hint: string | undefined;

  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    const text = await res.text();

    try {
      diag = JSON.parse(text) as EnvDiag;
    } catch (e: any) {
      diag = { ok: false, error: "Resposta inválida do servidor (JSON malformado)" };
      error = `Resposta inválida: ${e?.message || "JSON malformado"}`;
      hint = "Verifica se o endpoint /api/diagnostics/env está a responder JSON (e não HTML/erro).";
    }

    if (!res.ok || !diag?.ok) {
      error = diag?.error || "Falha ao validar variáveis de ambiente";
      hint =
        "Isto costuma acontecer quando estás numa build diferente (preview) ou quando o endpoint está a falhar. " +
        "Confirma no Vercel as envs em Production e força um redeploy.";
    }
  } catch (e: any) {
    error = e?.message || "Erro inesperado ao validar envs";
    hint = "Erro crítico durante a renderização. Verifica logs do Vercel.";
  }

  const values = diag?.values || {};

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Configurar APIs</h1>
        <p className="text-slate-500 mt-1">
          Estado do sistema e validação de variáveis de ambiente (lido no servidor).
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-rose-900 font-bold">Erro ao validar envs</h3>
            <p className="text-rose-700 text-sm mt-1">{error}</p>
            {hint && <p className="text-rose-600 text-xs mt-2 font-medium">💡 Sugestão: {hint}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ENV_GROUPS.map((group) => {
          const Icon = group.icon;
          const missing = group.items.filter((i) => !values[i.key]).length;

          return (
            <section
              key={group.title}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{group.title}</h2>
                    <p className="text-xs text-slate-500">
                      {missing === 0 ? "Tudo ok" : `${missing} em falta`}
                    </p>
                  </div>
                </div>

                <StatusPill ok={missing === 0} />
              </div>

              <div className="divide-y divide-slate-100">
                {group.items.map((item) => {
                  const ok = !!values[item.key];
                  return (
                    <div key={item.key} className="p-5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{item.key}</p>
                        {item.note ? (
                          <p className="text-xs text-slate-500 mt-1">{item.note}</p>
                        ) : (
                          <p className="text-xs text-slate-400 mt-1">
                            * Por segurança, o valor real não é mostrado.
                          </p>
                        )}
                      </div>
                      <StatusPill ok={ok} />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <DebugPanel endpoint={endpoint} error={error} hint={hint} data={diag} />
    </div>
  );
}