import { NextResponse } from "next/server";
import { setEvolutionInstanceWebhook } from "@/lib/evolution";

export async function POST(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const instanceName = params.name;

    if (!instanceName) {
      return NextResponse.json(
        { ok: false, error: "Nome da instância não fornecido" },
        { status: 400 }
      );
    }

    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/evolution`;

    const result = await setEvolutionInstanceWebhook(instanceName, webhookUrl);

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Falha ao configurar webhook" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      instance: instanceName,
      webhook: webhookUrl,
      result,
    });
  } catch (error: any) {
    console.error("Webhook error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro interno",
      },
      { status: 500 }
    );
  }
}