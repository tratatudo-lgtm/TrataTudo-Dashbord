export async function createEvolutionInstance(instanceName: string, number: string) {
  const url = `${process.env.EVOLUTION_API_URL}/instance/create`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.EVOLUTION_API_KEY!,
    },
    body: JSON.stringify({
      instanceName,
      number,
      qrcode: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    if (error.message?.includes('already exists') || error.error?.includes('already exists')) {
      return { ok: true, message: 'Instance already exists' };
    }
    throw new Error(error.message || 'Erro ao criar instância na Evolution API');
  }

  return response.json();
}

export async function sendEvolutionMessage(instanceName: string, number: string, text: string) {
  const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${instanceName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.EVOLUTION_API_KEY!,
    },
    body: JSON.stringify({
      number,
      text,
      delay: 1200,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erro ao enviar mensagem via Evolution API');
  }

  return response.json();
}

export async function getEvolutionInstanceStatus(instanceName: string) {
  const url = `${process.env.EVOLUTION_API_URL}/instance/connectionState/${instanceName}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': process.env.EVOLUTION_API_KEY!,
    },
  });
  if (!response.ok) return { state: 'disconnected' };
  const data = await response.json();
  return data.instance || { state: 'disconnected' };
}

export async function getEvolutionInstanceQR(instanceName: string) {
  const url = `${process.env.EVOLUTION_API_URL}/instance/connect/${instanceName}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': process.env.EVOLUTION_API_KEY!,
    },
  });
  if (!response.ok) throw new Error('Erro ao obter QR code');
  return response.json();
}

export async function setEvolutionInstanceWebhook(instanceName: string, webhookUrl: string) {
  const url = `${process.env.EVOLUTION_API_URL}/webhook/set/${instanceName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.EVOLUTION_API_KEY!,
    },
    body: JSON.stringify({
      url: webhookUrl,
      enabled: true,
      events: ['MESSAGES_UPSERT']
    }),
  });
  if (!response.ok) throw new Error('Erro ao definir webhook');
  return response.json();
}

export async function fetchEvolutionInstances() {
  const url = `${process.env.EVOLUTION_API_URL}/instance/fetchInstances`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': process.env.EVOLUTION_API_KEY!,
    },
  });
  if (!response.ok) return [];
  return response.json();
}

export async function getEvolutionPairingCode(instanceName: string, number: string) {
  const url = `${process.env.EVOLUTION_API_URL}/instance/connect/phone/${instanceName}`;
  
  // Normalizar: remove tudo que não for dígito (incluindo o +)
  const digits = number.replace(/\D/g, '');
  
  const urlWithNumber = `${url}?number=${digits}`;
  const response = await fetch(urlWithNumber, {
    method: 'GET',
    headers: {
      'apikey': process.env.EVOLUTION_API_KEY!,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erro ao obter código de pareamento');
  }
  return response.json();
}
