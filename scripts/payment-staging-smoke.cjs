#!/usr/bin/env node
'use strict';

/**
 * Real staging smoke test for the Sophis Central paid-resource flow.
 * Calls the deployed API, real PostgreSQL-backed services, Paystack test mode,
 * and configured private storage. No HTTP, database, provider, auth, or storage mocks.
 *
 * Phase 1: MODE=initialize creates a real Paystack test checkout.
 * Phase 2: Complete checkout in a browser, then MODE=verify checks settlement,
 * purchaser download access, and denial for a separate unpaid student.
 */

const required = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
};

const mode = process.env.MODE || 'initialize';
const apiBase = required('API_BASE_URL').replace(/\/+$/, '');
const resourceId = required('RESOURCE_ID');
const purchaserToken = required('PURCHASER_TOKEN');

if (!/^https:\/\//i.test(apiBase) && !/^http:\/\/localhost(?::\d+)?$/i.test(apiBase)) {
  throw new Error('API_BASE_URL must use HTTPS (HTTP is allowed only for localhost).');
}

async function csrfHeaders() {
  const response = await fetch(`${apiBase}/auth/csrf`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`CSRF bootstrap failed (HTTP ${response.status}).`);
  const body = await response.json();
  if (typeof body.csrfToken !== 'string' || !body.csrfToken) throw new Error('CSRF bootstrap did not return a token.');
  return {
    Cookie: `sophia_csrf_token=${encodeURIComponent(body.csrfToken)}`,
    'X-CSRF-Token': body.csrfToken,
  };
}

async function request(path, token, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const csrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await csrfHeaders() : {};
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...csrf,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  return { status: response.status, ok: response.ok, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function initialize() {
  const result = await request('/payments/initialize', purchaserToken, {
    method: 'POST',
    body: JSON.stringify({ purpose: 'resource_purchase', resourceId }),
  });
  assert(result.ok, `Checkout initialization failed (HTTP ${result.status}). Check the staging API logs and payment configuration.`);
  const data = result.body;
  assert(data && typeof data.reference === 'string', 'API did not return a payment reference.');
  assert(typeof data.checkoutUrl === 'string' && /^https:\/\//i.test(data.checkoutUrl), 'API did not return a secure checkout URL.');
  assert(data.status === 'pending', `Expected a pending payment intent; received ${String(data.status)}.`);
  console.log('REAL STAGING CHECKOUT CREATED');
  console.log(`Reference: ${data.reference}`);
  console.log(`Amount (minor units): ${data.amountMinor}`);
  console.log(`Currency: ${data.currency}`);
  console.log('Open this URL, complete the Paystack TEST checkout, then run this script again in verify mode:');
  console.log(data.checkoutUrl);
}

async function verify() {
  const reference = required('PAYMENT_REFERENCE');
  const unpaidToken = required('UNPAID_STUDENT_TOKEN');

  const verification = await request(`/payments/verify/${encodeURIComponent(reference)}`, purchaserToken);
  assert(verification.ok, `Payment verification request failed (HTTP ${verification.status}).`);
  assert(verification.body?.status === 'success', `Payment is not settled. Current status: ${String(verification.body?.status)}. Do not grant access.`);

  const download = await request(`/resources/${encodeURIComponent(resourceId)}/download`, purchaserToken, { method: 'POST' });
  assert(download.ok, `Purchaser download authorization failed (HTTP ${download.status}).`);

  const purchaserFile = await request(`/resources/${encodeURIComponent(resourceId)}/file-url`, purchaserToken);
  assert(purchaserFile.ok, `Purchaser file access failed (HTTP ${purchaserFile.status}).`);
  assert(typeof purchaserFile.body?.url === 'string' && /^https:\/\//i.test(purchaserFile.body.url), 'Purchaser response did not contain a secure signed file URL.');

  const unpaidFile = await request(`/resources/${encodeURIComponent(resourceId)}/file-url`, unpaidToken);
  assert(unpaidFile.status === 403, `Unpaid account should receive HTTP 403, received HTTP ${unpaidFile.status}. Stop release and investigate.`);

  console.log('REAL STAGING PAYMENT FLOW PASSED');
  console.log(`Payment reference: ${reference}`);
  console.log('Provider verification: success');
  console.log('Purchaser: download and signed file URL authorized');
  console.log('Unpaid student: file access denied (HTTP 403)');
  console.log('No credentials or signed file URL were printed.');
}

(async () => {
  try {
    if (mode === 'initialize') await initialize();
    else if (mode === 'verify') await verify();
    else throw new Error('MODE must be initialize or verify.');
  } catch (error) {
    console.error(`STAGING SMOKE TEST FAILED: ${error.message}`);
    process.exitCode = 1;
  }
})();
