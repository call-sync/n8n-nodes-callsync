import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** The built package, exactly as n8n loads it. */
export const { CallSync } = require('../dist/nodes/CallSync/CallSync.node.js');
export const { CallSyncTrigger } = require('../dist/nodes/CallSync/CallSyncTrigger.node.js');
export const { CallSyncApi } = require('../dist/credentials/CallSyncApi.credentials.js');
export const { NodeApiError, NodeOperationError } = require('n8n-workflow');

export const CREDENTIALS = { apiKey: 'live-key', baseUrl: 'https://mcp.test/' };
const node = {
	id: 'node',
	name: 'CallSync',
	type: 'n8n-nodes-callsync.callSync',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/** Records every API request and answers it with `respond(options)`. */
function http(respond) {
	const requests = [];
	return {
		requests,
		async httpRequestWithAuthentication(credentialName, options) {
			requests.push({ credentialName, ...options });
			return respond(options);
		},
	};
}

const returnJsonArray = (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json }));

export function hookContext({
	respond,
	events = ['call_logged'],
	staticData = {},
	url = 'https://n8n.test/webhook/abc/webhook',
}) {
	const helpers = http(respond);
	return {
		requests: helpers.requests,
		staticData,
		helpers,
		getNode: () => node,
		getCredentials: async () => CREDENTIALS,
		getNodeWebhookUrl: () => url,
		getNodeParameter: (name) => ({ events })[name],
		getWorkflowStaticData: () => staticData,
		getWorkflow: () => ({ id: 'wf', name: 'Lead alerts', active: true }),
	};
}

export function webhookContext({
	body,
	rawBody,
	headers = {},
	events = ['call_logged'],
	staticData = {},
}) {
	const response = {
		code: 200,
		status(code) {
			this.code = code;
			return this;
		},
		send(text) {
			this.text = text;
		},
	};
	return {
		response,
		helpers: { returnJsonArray },
		getRequestObject: () => ({ rawBody }),
		getBodyData: () => body,
		getHeaderData: () => headers,
		getResponseObject: () => response,
		getNodeParameter: () => events,
		getWorkflowStaticData: () => staticData,
	};
}

/** One input item per entry in `items`; each entry holds that item's node parameters. */
export function executeContext({ items, respond, continueOnFail = false }) {
	const helpers = http(respond);
	return {
		requests: helpers.requests,
		helpers: {
			...helpers,
			returnJsonArray,
			constructExecutionMetaData: (data, { itemData }) =>
				data.map((item) => ({ ...item, pairedItem: itemData })),
		},
		getNode: () => node,
		getCredentials: async () => CREDENTIALS,
		getInputData: () => items.map(() => ({ json: {} })),
		getNodeParameter: (name, i, fallback) => items[i][name] ?? fallback,
		continueOnFail: () => continueOnFail,
	};
}

export const json = (output) => output[0].map((item) => item.json);
