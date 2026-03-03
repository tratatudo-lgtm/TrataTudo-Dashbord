'use client';

import { useEffect, useMemo, useState } from 'react';

export type DebugPanelProps = {
  endpoint?: string;
  error?: string | null;
  hint?: string | null;
  data?: any;
  title?: string;
};

export function DebugPanel({
  endpoint,
  error,
  hint,
  data,
  title = 'Debug',
}: DebugPanelProps) {
  const [fetched, setFetched] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const shouldFetch = useMemo(() => !!endpoint && typeof data === 'undefined', [endpoint, data]);

  useEffect(() => {
    if (!shouldFetch) return;

    let cancelled = false;

    async function load() {
      try {
        setFetchError(null);
        const res = await fetch(endpoint as string, { cache: 'no-store' });
        const text = await res.text();

        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error('Resposta não é JSON válido');
        }

        if (!cancelled) setFetched({ status: res.status, ok: res.ok, json });
      } catch (e: any) {
        if (!cancelled) setFetchError(e?.message || 'Erro ao fazer fetch');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [shouldFetch, endpoint]);

  const showData = typeof data !== 'undefined' ? data : fetched;

  return (
    <div className="rounded-xl border bg-muted/20 p-4 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          {endpoint ? <div className="text-muted-foreground">Endpoint: {endpoint}</div> : null}
        </div>
      </div>

      {(error || fetchError) ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          <div className="font-medium">Erro</div>
          <div className="mt-1">{error || fetchError}</div>
          {hint ? <div className="mt-2 text-red-600">Sugestão: {hint}</div> : null}
        </div>
      ) : null}

      <div className="mt-3">
        {typeof showData === 'undefined' ? (
          <div className="text-muted-foreground">Sem dados para mostrar.</div>
        ) : (
          <pre className="max-h-72 overflow-auto rounded-lg border bg-background p-3">
            {JSON.stringify(showData, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export default DebugPanel;