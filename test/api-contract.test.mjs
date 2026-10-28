import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
	CallSyncApi,
	CallSyncTrigger,
	CREDENTIALS,
	hookContext,
	webhookContext,
} from './helpers.mjs';
// Monorepo only: the real CallSync API router and its in-memory database fakes.
import { fakeDb, worker } from '../../../frontend-cloud/dashboard/tests/helpers/mcp-worker.mjs';

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service' };
const header = new CallSyncApi().authenticate.properties.headers.Authorization;

/** Sends what the node asks n8n to send through the real Worker, signed in the way the credential says. */
function viaApi(db) {
	return async (options) => {
		const url = new URL(options.url);
		for (const [key, value] of Object.entries(options.qs ?? {}))
			url.searchParams.set(key, String(value));
		const response = await worker(db).fetch(
			new Request(url, {
				method: options.method,
				headers: {
					Authorization: header
						.replace(/^=/, '')
						.replace('{{$credentials.apiKey}}', CREDENTIALS.apiKey),
				},
				...(options.body ? { body: JSON.stringify(options.body) } : {}),
			}),
			env,
			{ waitUntil() {} },
		);
		const text = await response.text();
		if (!response.ok) throw Object.assign(new Error(text), { httpCode: String(response.status) });
		return JSON.parse(text);
	};
}

test('the trigger subscribes, receives a signed event and unsubscribes against the real API', async () => {
	const db = fakeDb();
	const staticData = {};
	const trigger = new CallSyncTrigger();
	const hooks = trigger.webhookMethods.default;
	const ctx = (events) => hookContext({ respond: viaApi(db), events, staticData });

	assert.equal(await hooks.checkExists.call(ctx(['call_logged'])), false);
	assert.equal(await hooks.create.call(ctx(['call_logged'])), true);
	assert.equal(await hooks.checkExists.call(ctx(['call_logged'])), true);
	const [row] = db.tables.user_webhooks;
	assert.equal(row.url, 'https://n8n.test/webhook/abc/webhook');
	assert.equal(row.secret, staticData.secret);

	// The backend signs JSON.stringify(payload) with the subscription secret.
	const payload = { event: 'call_logged', org_id: 'org', data: { call_id: 1 } };
	const raw = JSON.stringify(payload);
	const signature = createHmac('sha256', row.secret).update(raw).digest('hex');
	const received = await trigger.webhook.call(
		webhookContext({
			body: payload,
			rawBody: Buffer.from(raw),
			headers: { 'x-callsync-signature': signature },
			staticData,
		}),
	);
	assert.deepEqual(received, { workflowData: [[{ json: payload }]] });

	// Changing the events replaces the subscription instead of widening the old one.
	assert.equal(await hooks.checkExists.call(ctx(['ai_analysis'])), false);
	assert.equal(db.tables.user_webhooks.length, 0);
	assert.equal(await hooks.create.call(ctx(['ai_analysis'])), true);
	assert.deepEqual(
		db.tables.user_webhooks.map((r) => [...r.event_types]),
		[['ai_analysis']],
	);

	assert.equal(await hooks.delete.call(ctx(['ai_analysis'])), true);
	assert.equal(db.tables.user_webhooks.length, 0);
	assert.deepEqual(staticData, {});
});

test('activation fails with the API’s own message when the plan has no integrations', async () => {
	const db = fakeDb({
		organizations: [
			{
				org_id: 'org',
				api_key: CREDENTIALS.apiKey,
				has_webhook_access: false,
				plan_expiry_date: null,
			},
		],
	});
	await assert.rejects(
		new CallSyncTrigger().webhookMethods.default.create.call(hookContext({ respond: viaApi(db) })),
		/integrations on an active plan/,
	);
});
