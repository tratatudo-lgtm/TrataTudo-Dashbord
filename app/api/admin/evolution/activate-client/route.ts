import { NextResponse } from "next/server";
import {
  createEvolutionInstance,
  setEvolutionInstanceWebhook,
  getEvolutionInstanceQR,
  getEvolutionInstanceStatus,
} from "@/lib/evolution";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { client_id, instanceName } = body;

    if (!client_id || !instanceName) {
      return NextResponse.json(
        { ok: false, error: "client_id e instanceName são obrigatórios" },
        { status: 400 }
      );
    }

    // 1️⃣ Criar instância
    const create = await createEvolutionInstance(instanceName);

    if (!create) {
      return NextResponse.json(
        { ok: false, step: "create_instance", error: "Falha ao criar instância" },
        { status: 500 }
      );
    }

    // 2️⃣ Configurar webhook
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/evolution`;

    const wh = await setEvolutionInstanceWebhook(instanceName, webhookUrl);

    if (!wh) {
      return NextResponse.json(
        {
          ok: false,
          step: "set_webhook",
          error: "Falha ao configurar webhook",
        },
        { status: 500 }
      );
    }

    // 3️⃣ Buscar QR code
    const qr = await getEvolutionInstanceQR(instanceName);

    // 4️⃣ Buscar status
    const status = await getEvolutionInstanceStatus(instanceName);

    return NextResponse.json({
      ok: true,
      data: {
        instance: instanceName,
        qr,
        status,
      },
    });
  } catch (err: any) {
    console.error("activate-client error", err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Erro interno",
      },
      { status: 500 }
    );
  }
}