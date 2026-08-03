const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const UPLOADS_DIR = path.join(ROOT_DIR, 'img', 'uploads');
const ADMIN_SESSION_COOKIE = 'tb_admin_session';
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;
const adminSessions = new Map();

const DEFAULT_PRODUCTS = [
  {
    id: 'camiseta-branca',
    nome: 'Camiseta Branca',
    preco: 59.9,
    tamanhos: ['P', 'M', 'G', 'GG'],
    descricao: 'Camiseta branca em algodao premium com toque macio e caimento moderno para uso diario.',
    imagem: 'img/camisaBrancaF.png',
  },
  {
    id: 'camiseta-preta',
    nome: 'Camiseta Preta',
    preco: 59.9,
    tamanhos: ['P', 'M', 'G', 'GG'],
    descricao: 'Camiseta preta em algodao premium com acabamento reforcado e visual versatil para qualquer ocasiao.',
    imagem: 'img/camisaPreta.png',
  },
];

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

function getAdminCredentials() {
  const envConfig = getEnvConfig();
  return {
    user: process.env.ADMIN_USER || envConfig.ADMIN_USER || 'exemplo',
    password: process.env.ADMIN_PASSWORD || envConfig.ADMIN_PASSWORD || 'vazio',
  };
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const idx = pair.indexOf('=');
      if (idx < 0) return acc;
      const key = pair.slice(0, idx).trim();
      const value = decodeURIComponent(pair.slice(idx + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function createAdminSession(username) {
  const id = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + (ADMIN_SESSION_TTL_SECONDS * 1000);
  adminSessions.set(id, { username, expiresAt });
  return id;
}

function clearExpiredAdminSessions() {
  const now = Date.now();
  for (const [id, session] of adminSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      adminSessions.delete(id);
    }
  }
}

function isAdminAuthenticated(req) {
  clearExpiredAdminSessions();
  const cookies = parseCookies(req);
  const sessionId = cookies[ADMIN_SESSION_COOKIE];
  if (!sessionId) return false;

  const session = adminSessions.get(sessionId);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(sessionId);
    return false;
  }
  return true;
}

function setAdminCookie(res, sessionId, req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isHttps = req.socket?.encrypted || proto === 'https';
  const secure = isHttps ? '; Secure' : '';
  const cookie = `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_TTL_SECONDS}${secure}`;
  res.setHeader('Set-Cookie', cookie);
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function requireAdminAuth(req, res) {
  if (isAdminAuthenticated(req)) return true;
  sendJson(res, 401, { error: 'Nao autorizado.' });
  return false;
}

function isSensitiveStaticPath(safePath) {
  const normalized = safePath.replace(/\\/g, '/').toLowerCase();
  if (!normalized) return false;

  if (normalized.startsWith('.')) return true;
  if (normalized.includes('/.')) return true;
  if (normalized.startsWith('data/')) return true;
  if (normalized.startsWith('test/')) return true;

  const blockedFiles = new Set([
    'server.js',
    'package.json',
    'package-lock.json',
    '.env',
    '.gitignore',
  ]);
  return blockedFiles.has(normalized);
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

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('JSON invalido.'));
      }
    });
    req.on('error', reject);
  });
}

function ensureProductsFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(PRODUCTS_FILE)) {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(DEFAULT_PRODUCTS, null, 2), 'utf8');
  }
}

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function sanitizeFileName(value) {
  return String(value || 'imagem')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'imagem';
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) {
    throw new Error('Arquivo de imagem invalido.');
  }

  const mime = match[1].toLowerCase();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const buffer = Buffer.from(match[3], 'base64');
  if (!buffer.length) {
    throw new Error('Conteudo de imagem vazio.');
  }

  return { buffer, ext };
}

function sanitizeProduct(raw, fallbackId) {
  const nome = String(raw.nome || '').trim();
  const preco = Number(raw.preco);
  const descricao = String(raw.descricao || '').trim();
  const imagem = String(raw.imagem || '').trim();
  const tamanhosArray = Array.isArray(raw.tamanhos) ? raw.tamanhos : String(raw.tamanhos || '').split(',');
  const tamanhos = tamanhosArray
    .map((size) => String(size).trim().toUpperCase())
    .filter(Boolean);

  const id = String(raw.id || fallbackId || '').trim();

  if (!nome) throw new Error('Nome do produto e obrigatorio.');
  if (!Number.isFinite(preco) || preco <= 0) throw new Error('Preco do produto invalido.');
  if (!descricao) throw new Error('Descricao do produto e obrigatoria.');
  if (!imagem) throw new Error('Imagem do produto e obrigatoria.');
  if (!tamanhos.length) throw new Error('Informe ao menos um tamanho.');
  if (!id) throw new Error('ID do produto invalido.');

  return {
    id,
    nome,
    preco: Number(preco.toFixed(2)),
    tamanhos,
    descricao,
    imagem,
  };
}

function createProductId(nome) {
  const base = String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

  const suffix = Date.now().toString(36).slice(-4);
  return `${base || 'produto'}-${suffix}`;
}

function loadProducts() {
  ensureProductsFile();
  try {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_PRODUCTS];
    return parsed;
  } catch {
    return [...DEFAULT_PRODUCTS];
  }
}

function saveProducts(products) {
  ensureProductsFile();
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
}

function routeProductsApi(req, res, requestUrl) {
  if (req.method === 'GET' && requestUrl.pathname === '/api/products') {
    sendJson(res, 200, { products: loadProducts() });
    return true;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/products') {
    if (!requireAdminAuth(req, res)) return true;
    parseJsonBody(req)
      .then((payload) => {
        const products = loadProducts();
        const id = createProductId(payload.nome);
        const nextProduct = sanitizeProduct({ ...payload, id }, id);
        products.push(nextProduct);
        saveProducts(products);
        sendJson(res, 201, { product: nextProduct });
      })
      .catch((error) => {
        sendJson(res, 400, { error: error.message || 'Erro ao criar produto.' });
      });
    return true;
  }

  const matchProductId = requestUrl.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (!matchProductId) return false;

  const productId = decodeURIComponent(matchProductId[1]);

  if (req.method === 'PUT') {
    if (!requireAdminAuth(req, res)) return true;
    parseJsonBody(req)
      .then((payload) => {
        const products = loadProducts();
        const index = products.findIndex((product) => product.id === productId);
        if (index === -1) {
          sendJson(res, 404, { error: 'Produto nao encontrado.' });
          return;
        }

        const merged = { ...products[index], ...payload, id: productId };
        const updatedProduct = sanitizeProduct(merged, productId);
        products[index] = updatedProduct;
        saveProducts(products);
        sendJson(res, 200, { product: updatedProduct });
      })
      .catch((error) => {
        sendJson(res, 400, { error: error.message || 'Erro ao atualizar produto.' });
      });
    return true;
  }

  if (req.method === 'DELETE') {
    if (!requireAdminAuth(req, res)) return true;
    const products = loadProducts();
    const index = products.findIndex((product) => product.id === productId);

    if (index === -1) {
      sendJson(res, 404, { error: 'Produto nao encontrado.' });
      return true;
    }

    const removed = products.splice(index, 1)[0];
    saveProducts(products);
    sendJson(res, 200, { deleted: removed });
    return true;
  }

  sendJson(res, 405, { error: 'Metodo nao permitido.' });
  return true;
}

function routeUploadApi(req, res, requestUrl) {
  if (req.method !== 'POST' || requestUrl.pathname !== '/api/upload-image') {
    return false;
  }

  if (!requireAdminAuth(req, res)) return true;

  parseJsonBody(req)
    .then((payload) => {
      const { buffer, ext } = parseDataUrl(payload.dataUrl);
      const originalName = sanitizeFileName(payload.fileName || 'camisa');
      const baseName = originalName.replace(/\.[a-z0-9]+$/i, '') || 'camisa';
      const fileName = `${baseName}-${Date.now().toString(36)}.${ext}`;

      ensureUploadsDir();
      const absolutePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(absolutePath, buffer);

      sendJson(res, 201, { imagePath: `img/uploads/${fileName}` });
    })
    .catch((error) => {
      sendJson(res, 400, { error: error.message || 'Falha no upload da imagem.' });
    });

  return true;
}

function routeAdminAuthApi(req, res, requestUrl) {
  if (req.method === 'POST' && requestUrl.pathname === '/api/admin/login') {
    parseJsonBody(req)
      .then((payload) => {
        const { user, password } = getAdminCredentials();
        const usernameInput = String(payload.username || '');
        const passwordInput = String(payload.password || '');

        const validUser = timingSafeEqualString(usernameInput, user);
        const validPass = timingSafeEqualString(passwordInput, password);

        if (!validUser || !validPass) {
          sendJson(res, 401, { error: 'Credenciais invalidas.' });
          return;
        }

        const sessionId = createAdminSession(user);
        setAdminCookie(res, sessionId, req);
        sendJson(res, 200, { ok: true });
      })
      .catch((error) => {
        sendJson(res, 400, { error: error.message || 'Falha no login.' });
      });
    return true;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/admin/logout') {
    const cookies = parseCookies(req);
    const sessionId = cookies[ADMIN_SESSION_COOKIE];
    if (sessionId) adminSessions.delete(sessionId);
    clearAdminCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/session') {
    sendJson(res, 200, { authenticated: isAdminAuthenticated(req) });
    return true;
  }

  return false;
}

function routePaymentApi(req, res, requestUrl) {
  if (req.method === 'POST' && requestUrl.pathname === '/api/create-preference') {
    parseJsonBody(req)
      .then(async (payload) => {
        const apiKey = getApiKey();
        if (!apiKey) {
          sendJson(res, 500, { error: 'Token do Mercado Pago nao encontrado.' });
          return;
        }

        const preferencePayload = buildPreferencePayload(payload.itens || [], getBaseUrl(req));

        const response = await fetch(`${getMercadoPagoBaseUrl()}/checkout/preferences`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(preferencePayload),
        });

        const result = await response.json();

        if (!response.ok) {
          sendJson(res, response.status, { error: result.message || 'Nao foi possivel criar a preferencia de pagamento.' });
          return;
        }

        sendJson(res, 200, {
          init_point: result.init_point || result.sandbox_init_point,
          preference_id: result.id,
        });
      })
      .catch((error) => {
        sendJson(res, 500, { error: error.message || 'Erro inesperado ao criar a preferencia.' });
      });
    return true;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/create-pix-payment') {
    parseJsonBody(req)
      .then(async (payload) => {
        const apiKey = getApiKey();
        if (!apiKey) {
          sendJson(res, 500, { error: 'Token do Mercado Pago nao encontrado.' });
          return;
        }

        const pixPayload = buildPixPaymentPayload(payload.itens || []);

        const response = await fetch(`${getMercadoPagoBaseUrl()}/v1/payments`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pixPayload),
        });

        const result = await response.json();

        if (!response.ok) {
          const message = result.message || 'Nao foi possivel gerar o pagamento por Pix.';
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
      })
      .catch((error) => {
        sendJson(res, 500, { error: error.message || 'Erro inesperado ao criar o pagamento por Pix.' });
      });
    return true;
  }

  return false;
}

function serveStatic(req, res, requestUrl) {
  // 1. Redireciona /admin.html direto para a autenticação se não estiver logado
  if (requestUrl.pathname === '/admin.html') {
    if (!isAdminAuthenticated(req)) {
      res.writeHead(302, { Location: '/admin-login.html' });
      res.end();
      return;
    }
  }

  // 2. Trata a rota amigável /admin
  if (requestUrl.pathname === '/admin') {
    const target = isAdminAuthenticated(req) ? '/admin.html' : '/admin-login.html';
    const targetPath = path.join(ROOT_DIR, target.replace(/^\//, ''));
    fs.readFile(targetPath, (readError, content) => {
      if (readError) {
        sendJson(res, 500, { error: 'Erro ao ler o arquivo.' });
        return;
      }
      res.writeHead(200, {
        'Content-Type': getContentType(targetPath),
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      });
      res.end(content);
    });
    return;
  }

  // 3. Resolução normal de arquivos estáticos
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const safePath = pathname.replace(/^\/+/, '');

  if (isSensitiveStaticPath(safePath)) {
    sendJson(res, 403, { error: 'Acesso negado.' });
    return;
  }

  const filePath = path.join(ROOT_DIR, safePath || 'index.html');

  if (!filePath.startsWith(ROOT_DIR)) {
    sendJson(res, 403, { error: 'Acesso negado.' });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { error: 'Arquivo nao encontrado.' });
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
  ensureProductsFile();
  ensureUploadsDir();

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (routeProductsApi(req, res, requestUrl)) return;
    if (routeAdminAuthApi(req, res, requestUrl)) return;
    if (routeUploadApi(req, res, requestUrl)) return;
    if (routePaymentApi(req, res, requestUrl)) return;

    serveStatic(req, res, requestUrl);
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
  createProductId,
  getApiKey,
  loadEnvFile,
  loadProducts,
  resolveBaseUrl,
  sanitizeProduct,
  saveProducts,
  startServer,
};