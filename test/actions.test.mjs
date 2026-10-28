import test from 'node:test';
import assert from 'node:assert/strict';
import { CallSync, executeContext, json, NodeApiError, NodeOperationError } from './helpers.mjs';

const node = new CallSync();
const run = (ctx) => node.execute.call(ctx);
const API = 'https://mcp.test/api/v1';
const sent = (ctx) => ctx.requests.map(({ method, url, body, qs }) => ({ method, url, body, qs }));

test('creating a contact sends API field names and drops blank fields', async () => {
	const ctx = executeContext({
		items: [
			{
				resource: 'contact',
				operation: 'create',
				phone: '+919876543210',
				additionalFields: {
					name: 'Asha',
					labels: 'hot lead, follow-up ,',
					stageId: 'st-1',
					company: '',
					isInPipeline: true,
				},
			},
		],
		respond: () => ({ status: 'success', data: { id: 5, name: 'Asha' } }),
	});
	assert.deepEqual(json(await run(ctx)), [{ id: 5, name: 'Asha' }]);
	assert.deepEqual(sent(ctx), [
		{
			method: 'POST',
			url: `${API}/crm/contacts`,
			body: {
				name: 'Asha',
				labels: ['hot lead', 'follow-up'],
				stage_id: 'st-1',
				is_in_pipeline: true,
				phone: '+919876543210',
			},
			qs: undefined,
		},
	]);
});

test('updating needs at least one field, and sends the id with the changes', async () => {
	const empty = executeContext({
		items: [{ resource: 'contact', operation: 'update', contactId: 5, updateFields: { name: '' } }],
		respond: () => assert.fail('nothing should be sent'),
	});
	await assert.rejects(
		run(empty),
		(e) =>
			e instanceof NodeOperationError &&
			/Nothing to update/.test(e.message) &&
			/'Update Fields'/.test(e.description),
	);

	const ctx = executeContext({
		items: [
			{
				resource: 'contact',
				operation: 'update',
				contactId: 5,
				updateFields: { isStarred: false, salesNote: 'Call back' },
			},
		],
		respond: () => ({ data: { id: 5 } }),
	});
	await run(ctx);
	assert.deepEqual(sent(ctx)[0], {
		method: 'PUT',
		url: `${API}/crm/contacts`,
		body: { is_starred: false, sales_note: 'Call back', id: 5 },
		qs: undefined,
	});
});

test('getting many calls follows pages of 10 and stops at the limit or the total', async () => {
	const page = (n, total) => ({
		data: Array.from({ length: n }, (_, i) => ({ id: i })),
		pagination: { total },
	});

	const limited = executeContext({
		items: [
			{
				resource: 'call',
				operation: 'getAll',
				returnAll: false,
				limit: 15,
				filters: { direction: 'missed', search: '' },
			},
		],
		respond: () => page(10, 100),
	});
	assert.equal(json(await run(limited)).length, 15);
	assert.deepEqual(
		limited.requests.map((r) => r.qs),
		[
			{ direction: 'missed', page: 1, limit: 10 },
			{ direction: 'missed', page: 2, limit: 10 },
		],
	);

	const all = executeContext({
		items: [{ resource: 'call', operation: 'getAll', returnAll: true, filters: {} }],
		respond: (o) => page(10, 20 + (o.qs.page > 2 ? 1 : 0)),
	});
	assert.equal(json(await run(all)).length, 20);
	assert.equal(all.requests.length, 2);

	const contacts = executeContext({
		items: [
			{
				resource: 'contact',
				operation: 'getAll',
				returnAll: true,
				filters: { stageId: 'st-1', isInPipeline: false },
			},
		],
		respond: () => ({ data: [{ id: 1 }], total: 1 }),
	});
	assert.deepEqual(json(await run(contacts)), [{ id: 1 }]);
	assert.deepEqual(contacts.requests[0].qs, {
		stage_id: 'st-1',
		is_in_pipeline: false,
		page: 1,
		limit: 10,
	});
});

test('tasks keep the due date and time exactly as entered', async () => {
	const ctx = executeContext({
		items: [
			{
				resource: 'task',
				operation: 'create',
				contactId: 5,
				type: 'FOLLOW_UP',
				additionalFields: {
					due: '2026-10-29T10:30:00.000+05:30',
					showReminder: true,
					reminderMinutesBefore: 15,
				},
			},
			{
				resource: 'task',
				operation: 'update',
				taskId: 9,
				updateFields: { status: 'COMPLETED', due: '2026-11-02' },
			},
			{
				resource: 'task',
				operation: 'getAll',
				returnAll: false,
				limit: 1,
				filters: { contactId: 5, dueDate: '2026-10-29T00:00:00', status: 'PENDING' },
			},
		],
		respond: (o) => (o.method === 'GET' ? { data: [{ id: 1 }, { id: 2 }] } : { data: { id: 9 } }),
	});
	assert.deepEqual(json(await run(ctx)), [{ id: 9 }, { id: 9 }, { id: 1 }]);
	assert.deepEqual(sent(ctx), [
		{
			method: 'POST',
			url: `${API}/crm/tasks`,
			body: {
				due_date: '2026-10-29',
				due_time: '10:30:00',
				show_reminder: true,
				reminder_minutes_before: 15,
				person_id: 5,
				type: 'FOLLOW_UP',
			},
			qs: undefined,
		},
		{
			method: 'PUT',
			url: `${API}/crm/tasks`,
			body: { status: 'COMPLETED', due_date: '2026-11-02', id: 9 },
			qs: undefined,
		},
		{
			method: 'GET',
			url: `${API}/crm/tasks`,
			body: undefined,
			qs: { person_id: 5, status: 'PENDING', due_date: '2026-10-29' },
		},
	]);
});

test('notes go to the picked contact’s timeline, and call analysis is fetched by the picked call', async () => {
	const ctx = executeContext({
		items: [
			{
				resource: 'note',
				operation: 'create',
				contactId: { __rl: true, mode: 'id', value: '5' },
				type: 'SITE_VISIT',
				title: 'Visited site',
				additionalFields: { description: 'Liked plot 4' },
			},
			{
				resource: 'call',
				operation: 'getAnalysis',
				callId: { __rl: true, mode: 'list', value: '77' },
			},
		],
		respond: () => ({ data: { ok: true } }),
	});
	await run(ctx);
	assert.deepEqual(sent(ctx), [
		{
			method: 'POST',
			url: `${API}/crm/activities`,
			body: {
				description: 'Liked plot 4',
				person_id: 5,
				type: 'SITE_VISIT',
				title: 'Visited site',
			},
			qs: undefined,
		},
		{ method: 'GET', url: `${API}/analysis`, body: undefined, qs: { call_id: 77 } },
	]);
});

test('API failures become node errors, or error items when the workflow continues on fail', async () => {
	const fail = () => {
		throw Object.assign(new Error('Webhooks need integrations on an active plan.'), {
			httpCode: '403',
		});
	};
	const items = [
		{
			resource: 'note',
			operation: 'create',
			contactId: 5,
			type: 'NOTE',
			title: 'x',
			additionalFields: {},
		},
	];
	await assert.rejects(
		run(executeContext({ items, respond: fail })),
		(e) => e instanceof NodeApiError,
	);
	const output = await run(executeContext({ items, respond: fail, continueOnFail: true }));
	assert.equal(output[0][0].pairedItem.item, 0);
	assert.match(output[0][0].json.error, /active plan/);
});

test('picklists load the workspace’s own CRM stages', async () => {
	const ctx = executeContext({
		items: [],
		respond: () => ({ stages: [{ id: 's1', label: 'New' }], priorities: [] }),
	});
	assert.deepEqual(await node.methods.loadOptions.getStages.call(ctx), [
		{ name: 'New', value: 's1' },
	]);
	assert.deepEqual(await node.methods.loadOptions.getPriorities.call(ctx), []);
	assert.equal(ctx.requests[0].url, `${API}/crm/config`);
});

test('a picked ID that is not a number stops the item before anything is sent', async () => {
	const ctx = executeContext({
		items: [
			{
				resource: 'task',
				operation: 'update',
				taskId: { __rl: true, mode: 'id', value: 'abc' },
				updateFields: { status: 'COMPLETED' },
			},
		],
		respond: () => assert.fail('nothing should be sent'),
	});
	await assert.rejects(
		run(ctx),
		(e) =>
			e instanceof NodeOperationError &&
			e.message === "'abc' in 'Task' is not a CallSync ID" &&
			/numeric ID/.test(e.description),
	);
});

test('record pickers search contacts and calls page by page, and list pending tasks', async () => {
	const contacts = executeContext({
		items: [],
		respond: (o) => ({
			data: Array.from({ length: o.qs.page === 1 ? 10 : 2 }, (_, i) => ({
				id: o.qs.page * 100 + i,
				name: i ? `Asha ${i}` : '',
				phone: '+919876543210',
			})),
			total: 12,
		}),
	});
	const search = node.methods.listSearch;
	const first = await search.searchContacts.call(contacts, 'asha');
	assert.equal(first.results.length, 10);
	assert.deepEqual(first.results[0], { name: '+919876543210', value: '100' });
	assert.deepEqual(first.results[1], { name: 'Asha 1 · +919876543210', value: '101' });
	assert.equal(first.paginationToken, '2');
	const last = await search.searchContacts.call(contacts, 'asha', first.paginationToken);
	assert.equal(last.paginationToken, undefined);
	assert.deepEqual(
		contacts.requests.map((r) => [r.url, r.qs]),
		[
			[`${API}/crm/contacts`, { page: 1, limit: 10, search: 'asha' }],
			[`${API}/crm/contacts`, { page: 2, limit: 10, search: 'asha' }],
		],
	);

	const calls = executeContext({
		items: [],
		respond: () => ({
			data: [
				{
					id: 7,
					direction: 'missed',
					time: '2026-10-28T09:15:42Z',
					caller: { name: 'Unknown', phone: '+911234' },
				},
			],
			pagination: { total: 1 },
		}),
	});
	assert.deepEqual(await search.searchCalls.call(calls), {
		results: [{ name: '+911234 · missed · 2026-10-28 09:15', value: '7' }],
		paginationToken: undefined,
	});
	assert.deepEqual(calls.requests[0].qs, { page: 1, limit: 10 });

	const tasks = executeContext({
		items: [],
		respond: () => ({
			data: [
				{ id: 1, contact_name: 'Asha', description: 'Send brochure', due_date: '2026-10-29' },
				{ id: 2, contact_name: 'Ravi', type: 'CALL' },
			],
		}),
	});
	assert.deepEqual(await search.searchTasks.call(tasks, 'BROCHURE'), {
		results: [{ name: 'Asha · Send brochure · due 2026-10-29', value: '1' }],
	});
	assert.deepEqual(tasks.requests[0].qs, { status: 'PENDING' });
});
