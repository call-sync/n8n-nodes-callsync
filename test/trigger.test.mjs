import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { CallSyncTrigger, hookContext, webhookContext } from './helpers.mjs';

const trigger = new CallSyncTrigger();
const hooks = trigger.webhookMethods.default;
const URL = 'https://n8n.test/webhook/abc/webhook';
const ID = '00000000-0000-4000-8000-000000000001';
const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('hex');

test('activating subscribes this webhook URL for the chosen events and keeps the signing secret', async () => {
	const ctx = hookContext({
		events: ['call_logged', 'ai_analysis'],
		respond: () => ({ data: { id: ID, secret: 'whsec_1' } }),
	});
	assert.equal(await hooks.create.call(ctx), true);
	assert.deepEqual(ctx.requests, [
		{
			credentialName: 'callSyncApi',
			method: 'POST',
			url: 'https://mcp.test/api/v1/webhooks',
			body: { url: URL, events: ['call_logged', 'ai_analysis'], name: 'n8n: Lead alerts' },
			json: true,
		},
	]);
	assert.deepEqual(ctx.staticData, { webhookId: ID, secret: 'whsec_1' });
});

test('an existing subscription is reused only when it is ours, has its secret and the same events', async () => {
	const listed = (events) => () => ({ data: [{ id: ID, url: URL, events }] });

	const none = hookContext({
		respond: () => ({
			data: [{ id: ID, url: 'https://elsewhere.test/hook', events: ['call_logged'] }],
		}),
	});
	assert.equal(await hooks.checkExists.call(none), false);
	assert.equal(none.requests.length, 1);

	const same = hookContext({
		respond: listed(['call_logged']),
		staticData: { webhookId: ID, secret: 'whsec_1' },
	});
	assert.equal(await hooks.checkExists.call(same), true);
	assert.equal(same.requests.length, 1);

	for (const [events, staticData] of [
		[['call_logged', 'recording_updated'], { webhookId: ID, secret: 'whsec_1' }],
		[['call_logged'], { webhookId: ID }],
		[['call_logged'], {}],
	]) {
		const stale = hookContext({
			respond: (o) => (o.method === 'GET' ? listed(events)() : {}),
			staticData,
		});
		assert.equal(await hooks.checkExists.call(stale), false);
		assert.deepEqual(
			stale.requests.map((r) => [r.method, r.url, r.qs]),
			[
				['GET', 'https://mcp.test/api/v1/webhooks', undefined],
				['DELETE', 'https://mcp.test/api/v1/webhooks', { id: ID }],
			],
		);
		assert.deepEqual(stale.staticData, {});
	}
});

test('deactivating unsubscribes, and a hook already removed in the dashboard is not an error', async () => {
	const ok = hookContext({ respond: () => ({}), staticData: { webhookId: ID, secret: 'whsec_1' } });
	assert.equal(await hooks.delete.call(ok), true);
	assert.deepEqual(
		ok.requests.map((r) => [r.method, r.qs]),
		[['DELETE', { id: ID }]],
	);
	assert.deepEqual(ok.staticData, {});

	const gone = hookContext({
		respond: () => {
			throw Object.assign(new Error('Webhook not found'), { httpCode: '404' });
		},
		staticData: { webhookId: ID, secret: 'whsec_1' },
	});
	assert.equal(await hooks.delete.call(gone), true);
	assert.deepEqual(gone.staticData, {});

	const down = hookContext({
		respond: () => {
			throw Object.assign(new Error('Server error'), { httpCode: '500' });
		},
		staticData: { webhookId: ID, secret: 'whsec_1' },
	});
	assert.equal(await hooks.delete.call(down), false);
	assert.deepEqual(down.staticData, { webhookId: ID, secret: 'whsec_1' });
});

test('signed events start the workflow; unsigned or tampered ones are refused', async () => {
	const body = {
		event: 'call_logged',
		org_id: 'org',
		data: { call_id: 7, caller: { phone: '+919876543210' } },
	};
	const raw = JSON.stringify(body);
	const staticData = { webhookId: ID, secret: 'whsec_1' };

	const good = webhookContext({
		body,
		rawBody: Buffer.from(raw),
		headers: { 'x-callsync-signature': sign(raw, 'whsec_1') },
		staticData,
	});
	assert.deepEqual(await trigger.webhook.call(good), { workflowData: [[{ json: body }]] });

	for (const ctx of [
		webhookContext({ body, rawBody: Buffer.from(raw), headers: {}, staticData }),
		webhookContext({
			body,
			rawBody: Buffer.from(raw),
			headers: { 'x-callsync-signature': sign(raw, 'other') },
			staticData,
		}),
		webhookContext({
			body,
			rawBody: Buffer.from(raw + ' '),
			headers: { 'x-callsync-signature': sign(raw, 'whsec_1') },
			staticData,
		}),
		webhookContext({
			body,
			rawBody: Buffer.from(raw),
			headers: { 'x-callsync-signature': sign(raw, 'whsec_1') },
			staticData: {},
		}),
	]) {
		assert.deepEqual(await trigger.webhook.call(ctx), { noWebhookResponse: true });
		assert.equal(ctx.response.code, 401);
	}
});

test('older event names still match, events not chosen are acknowledged without a run, and a missing raw body falls back', async () => {
	const staticData = { secret: 'whsec_1' };
	const legacy = { event: 'call.received', data: { call_id: 1 } };
	const ctx = webhookContext({
		body: legacy,
		headers: { 'x-callsync-signature': sign(JSON.stringify(legacy), 'whsec_1') },
		staticData,
	});
	assert.deepEqual(await trigger.webhook.call(ctx), { workflowData: [[{ json: legacy }]] });

	const other = { event: 'caller_updated', data: {} };
	const raw = JSON.stringify(other);
	const skipped = webhookContext({
		body: other,
		rawBody: Buffer.from(raw),
		headers: { 'x-callsync-signature': sign(raw, 'whsec_1') },
		staticData,
	});
	assert.deepEqual(await trigger.webhook.call(skipped), {});
});
