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
