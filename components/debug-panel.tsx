'use client';

import { useEffect, useState } from 'react';

type DebugPanelProps = {
  endpoint?: string; // 🔥 agora opcional
};

export function DebugPanel({ endpoint = '/api/admin/stats' }: DebugPanelProps) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        const text = await res.text();

        try {
          const json = JSON.parse(text);
          setData(json);
        } catch {
          setError('Resposta não é JSON válido');
        }
      } catch (err: any) {
        setError(err.message);
      }
    }

    load();
  }, [endpoint]);

  return (
    <div className="rounded-xl border bg-muted/20 p-4 text-xs">
      <div className="font-semibold mb-2">Debug API ({endpoint})</div>

      {error && (
        <div className="text-red-500 mb-2">
          Erro: {error}
        </div>
      )}

      {data && (
        <pre className="overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}

      {!data && !error && <div>A carregar...</div>}
    </div>
  );
}

export default DebugPanel;