import assert from 'node:assert/strict';
import test from 'node:test';
import { upiLink, upiPaymentLink, type InvoiceView } from '../../src/lib/invoice.ts';

test('payment QR encodes the saved UPI ID, exact INR amount and optional note', () => {
	const url = new URL(upiPaymentLink(' creator@okicici ', 'Creator Name', 1250.75, 'Advance & Reel'));
	assert.equal(url.protocol, 'upi:');
	assert.equal(url.hostname, 'pay');
	assert.equal(url.searchParams.get('pa'), 'creator@okicici');
	assert.equal(url.searchParams.get('pn'), 'Creator Name');
	assert.equal(url.searchParams.get('am'), '1250.75');
	assert.equal(url.searchParams.get('cu'), 'INR');
	assert.equal(url.searchParams.get('tn'), 'Advance & Reel');
	assert.ok(!url.href.includes('+'));
});

test('invalid addresses, zero, negative and non-finite amounts cannot generate payment codes', () => {
	for (const id of ['', 'not-a-upi-id', 'creator@bank&am=1']) assert.equal(upiPaymentLink(id, 'Creator', 100), '');
	for (const amount of [0, -1, NaN, Infinity, 0.001, 1.999]) assert.equal(upiPaymentLink('creator@upi', 'Creator', amount), '');
});

const invoice = {
	number: 'INV/26-27/001', currency: 'INR', total: 10000, tds_amount: 1000, amount_received: 3000,
	tds_deducted: 1000, status: 'partly_paid', seller: { upi_id: 'creator@upi', name: 'Creator' }
} as InvoiceView;

test('invoice QR requests only the outstanding cash after partial payment and TDS', () => {
	const url = new URL(upiLink(invoice));
	assert.equal(url.searchParams.get('am'), '6000.00');
	assert.equal(url.searchParams.get('tn'), 'Invoice INV/26-27/001');
});

test('settled, cancelled, draft and foreign invoices cannot produce payment requests', () => {
	for (const status of ['paid', 'cancelled', 'draft'] as const) assert.equal(upiLink({ ...invoice, status }), '');
	assert.equal(upiLink({ ...invoice, amount_received: 10000 }), '');
	assert.equal(upiLink({ ...invoice, currency: 'USD' }), '');
});
