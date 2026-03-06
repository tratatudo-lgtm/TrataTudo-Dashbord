const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

async function evo(path: string, options: RequestInit = {}) {
  const res = await fetch(`${EVO_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: EVO_KEY,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function createEvolutionInstance(name: string) {
  return evo("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: name,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
}

export async function deleteEvolutionInstance(name: string) {
  return evo(`/instance/delete/${name}`, {
    method: "DELETE",
  });
}

export async function fetchEvolutionInstances() {
  return evo("/instance/fetchInstances");
}

export async function getEvolutionInstanceStatus(name: string) {
  return evo(`/instance/connectionState/${name}`);
}

export async function getEvolutionInstanceQR(name: string) {
  return evo(`/instance/connect/${name}`);
}

export async function getEvolutionPairingCode(name: string) {
  return evo(`/instance/pairingCode/${name}`);
}

export async function setEvolutionInstanceWebhook(
  name: string,
  webhookUrl: string
) {
  return evo(`/webhook/set/${name}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: webhookUrl,
      events: ["messages.upsert"],
    }),
  });
}

export async function sendEvolutionText(
  instanceName: string,
  number: string,
  text: string
) {
  return evo(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number,
      text,
    }),
  });
}