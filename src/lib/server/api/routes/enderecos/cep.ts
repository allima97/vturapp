// Migrado para Hono de src/routes/api/v1/enderecos/cep/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { logServerError } from '$lib/server/v1';
import { fetchWithTimeout } from '$lib/server/fetchWithTimeout';

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export const handleEnderecosCepGet = async ({ url, fetch, getClientAddress, platform }: RequestEvent) => {
  const rateLimit = await checkPersistentRateLimit('cep', getClientAddress() || 'unknown', {
    max: 120,
    windowMs: 60_000
  }, platform?.env?.DB);
  if (!rateLimit.allowed) {
    return json(
      { error: 'Muitas requisições. Tente novamente em instantes.' },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) }
      }
    );
  }

  const cep = String(url.searchParams.get('cep') || '').replace(/\D/g, '');

  if (cep.length !== 8) {
    return json({ error: 'CEP invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const response = await fetchWithTimeout(
      `https://viacep.com.br/ws/${cep}/json/`,
      {
        headers: {
          accept: 'application/json'
        }
      },
      4_000,
      fetch
    );

    if (!response.ok) {
      return json({ error: 'CEP indisponivel.' }, { status: 502, headers: NO_STORE_HEADERS });
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('application/json')) {
      return json({ error: 'Resposta invalida do provedor de CEP.' }, { status: 502, headers: NO_STORE_HEADERS });
    }

    const data = (await response.json()) as ViaCepResponse;
    if (data?.erro) {
      return json({ error: 'CEP nao encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    return json(
      {
        cep: data.cep || cep,
        logradouro: data.logradouro || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        localidade: data.localidade || '',
        uf: data.uf || ''
      },
      {
        headers: {
          'cache-control': 'private, max-age=86400'
        }
      }
    );
  } catch (err) {
    logServerError('[enderecos/cep] falha ao consultar CEP', err);
    return json({ error: 'Nao foi possivel consultar o CEP.' }, { status: 502, headers: NO_STORE_HEADERS });
  }
};
