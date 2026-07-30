const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

function loadEnvFile() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return {};

  return fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce((acc, line) => {
      const index = line.indexOf('=');
      if (index > -1) {
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        acc[key] = value;
      }
      return acc;
    }, {});
}

function getEnvConfig() {
  return loadEnvFile();
}

function getApiKey() {
  return process.env.API_KEY || process.env.MP_ACCESS_TOKEN || getEnvConfig().API_KEY || getEnvConfig().MP_ACCESS_TOKEN || '';
}

function getMercadoPagoBaseUrl() {
  return process.env.MP_MODE === 'sandbox' ? 'https://api.mercadopago.com' : 'https://api.mercadopago.com';
}

function normalizeItems(itens) {
  const items = Array.isArray(itens) ? itens : [];
  return items
    .map((item) => ({
      title: String(item.nome || 'Produto Tuba Brasil'),
      quantity: Math.max(1, Number(item.quantidade || 1)),
      unit_price: Number(Number(item.preco || 0).toFixed(2)),
    }))
    .filter((item) => Number.isFinite(item.unit_price) && item.unit_price > 0);
}

function buildPreferencePayload(itens, baseUrl) {
  const normalizedItems = normalizeItems(itens);

  return {
    items: normalizedItems,
    auto_return: 'approved',
    binary_mode: true,
    statement_descriptor: 'Tuba Brasil',
    back_urls: {
      success: `${baseUrl}/cart.html?status=approved`,
      failure: `${baseUrl}/cart.html?status=failed`,
      pending: `${baseUrl}/cart.html?status=pending`,
    },
    payer: {
      email: 'cliente@tubabrasil.com',
    },
  };
}

function buildPixPaymentPayload(itens) {
  const normalizedItems = normalizeItems(itens);
  const totalAmount = normalizedItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

  return {
    transaction_amount: Number(totalAmount.toFixed(2)),
    description: `Pedido Tuba Brasil${normalizedItems.length ? ` - ${normalizedItems.map((item) => item.title).slice(0, 3).join(', ')}` : ''}`,
    payment_method_id: 'pix',
    payer: {
      email: 'cliente@tubabrasil.com',
    },
    external_reference: `tubabrasil-${Date.now()}`,
  };
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveBaseUrl(req) {
  const envConfig = getEnvConfig();
  const configuredBaseUrl = normalizeBaseUrl(
    process.env.BACK_URL_BASE ||
    envConfig.BACK_URL_BASE ||
    process.env.SITE_URL ||
    envConfig.SITE_URL
  );

  if (configuredBaseUrl) return configuredBaseUrl;

  const host = req.headers.host || 'localhost:3000';
  if (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0')) {
    return 'https://juliocesarviana20.github.io';
  }

  if (req.headers.origin) {
    const origin = normalizeBaseUrl(req.headers.origin);
    if (origin) return origin;
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const headerProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const isHttps = headerProto === 'https' || req.socket?.encrypted;

  return isHttps ? `https://${host}` : `https://${host}`;
}

function getBaseUrl(req) {
  return resolveBaseUrl(req);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    default: return 'application/octet-stream';
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const safePath = pathname.replace(/^\/+/, '');
  const filePath = path.join(ROOT_DIR, safePath || 'index.html');

  if (!filePath.startsWith(ROOT_DIR)) {
    sendJson(res, 403, { error: 'Acesso negado.' });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      if (pathname === '/cart.html' || pathname === '/index.html') {
        const fallbackFile = path.join(ROOT_DIR, pathname === '/cart.html' ? 'cart.html' : 'index.html');
        fs.readFile(fallbackFile, 'utf8', (readError, content) => {
          if (readError) {
            sendJson(res, 404, { error: 'Página não encontrada.' });
            return;
          }
          res.writeHead(200, { 'Content-Type': getContentType(fallbackFile) });
          res.end(content);
        });
        return;
      }
      sendJson(res, 404, { error: 'Arquivo não encontrado.' });
      return;
    }

    fs.readFile(filePath, (readError, content) => {
      if (readError) {
        sendJson(res, 500, { error: 'Erro ao ler o arquivo.' });
        return;
      }
      res.writeHead(200, { 'Content-Type': getContentType(filePath) });
      res.end(content);
    });
  });
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/create-preference') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const apiKey = getApiKey();
          if (!apiKey) {
            sendJson(res, 500, { error: 'Token do Mercado Pago não encontrado.' });
            return;
          }

          const payload = JSON.parse(body || '{}');
          const preferencePayload = buildPreferencePayload(payload.itens || [], getBaseUrl(req));

          const response = await fetch(`${getMercadoPagoBaseUrl()}/checkout/preferences`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(preferencePayload),
          });

          const result = await response.json();

          if (!response.ok) {
            sendJson(res, response.status, { error: result.message || 'Não foi possível criar a preferência de pagamento.' });
            return;
          }

          sendJson(res, 200, {
            init_point: result.init_point || result.sandbox_init_point,
            preference_id: result.id,
          });
        } catch (error) {
          sendJson(res, 500, { error: error.message || 'Erro inesperado ao criar a preferência.' });
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/create-pix-payment') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const apiKey = getApiKey();
          if (!apiKey) {
            sendJson(res, 500, { error: 'Token do Mercado Pago não encontrado.' });
            return;
          }

          const payload = JSON.parse(body || '{}');
          const pixPayload = buildPixPaymentPayload(payload.itens || []);

          const response = await fetch(`${getMercadoPagoBaseUrl()}/v1/payments`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pixPayload),
          });

          const result = await response.json();

          if (!response.ok) {
            const message = result.message || 'Não foi possível gerar o pagamento por Pix.';
            const cause = result.cause?.[0]?.description || '';
            sendJson(res, response.status, { error: message, detail: cause });
            return;
          }

          const transactionData = result.point_of_interaction?.transaction_data || {};

          sendJson(res, 200, {
            paymentId: result.id,
            status: result.status,
            transactionAmount: result.transaction_amount,
            qrCodeBase64: transactionData.qr_code_base64 || '',
            qrCode: transactionData.qr_code || '',
            ticketUrl: transactionData.ticket_url || '',
          });
        } catch (error) {
          sendJson(res, 500, { error: error.message || 'Erro inesperado ao criar o pagamento por Pix.' });
        }
      });
      return;
    }

    serveStatic(req, res);
  });

  server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  buildPixPaymentPayload,
  buildPreferencePayload,
  getApiKey,
  loadEnvFile,
  resolveBaseUrl,
  startServer,
};
