import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'tratatudo-dashboard',
    ts: new Date().toISOString(),
  });
<<<<<<< HEAD
}
=======
}
>>>>>>> cce74b2 (Add /api/health endpoint)
