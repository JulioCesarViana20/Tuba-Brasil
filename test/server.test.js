const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPixPaymentPayload, resolveBaseUrl } = require('../server');

test('resolveBaseUrl usa https para hosts de produção', () => {
  const req = { headers: { host: 'tubabrasil.com.br' } };
  assert.equal(resolveBaseUrl(req), 'https://tubabrasil.com.br');
});

test('resolveBaseUrl usa domínio público para localhost', () => {
  const req = { headers: { host: 'localhost:3000' } };
  assert.equal(resolveBaseUrl(req), 'https://juliocesarviana20.github.io');
});

test('buildPixPaymentPayload cria um payload Pix compatível', () => {
  const payload = buildPixPaymentPayload([{ nome: 'Teste', preco: 59.9, quantidade: 1 }]);
  assert.equal(payload.transaction_amount, 59.9);
  assert.equal(payload.payment_method_id, 'pix');
  assert.equal(payload.payer.email, 'cliente@tubabrasil.com');
  assert.equal(payload.installments, undefined);
});
