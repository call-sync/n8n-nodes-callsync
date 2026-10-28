import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { callSyncRequest, canonicalEvent, httpStatus, validSignature } from './transport';

const sameEvents = (a: unknown, b: string[]) =>
	Array.isArray(a) && a.length === b.length && b.every((event) => a.includes(event));

export class CallSyncTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CallSync Trigger',
		name: 'callSyncTrigger',
		icon: { light: 'file:callsync.svg', dark: 'file:callsync.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow when a call syncs, a recording uploads, an AI call summary is ready or a contact changes in CallSync',
		defaults: {
			name: 'CallSync Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'callSyncApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['call_logged'],
				options: [
					{
						name: 'AI Analysis Ready',
						value: 'ai_analysis',
						description: 'A call’s transcript and AI summary are ready',
					},
					{
						name: 'Call Logged',
						value: 'call_logged',
						description: 'A call syncs from a team member’s phone',
					},
					{
						name: 'Contact Updated',
						value: 'caller_updated',
						description: 'A contact’s name, note or labels change',
					},
					{
						name: 'Recording Uploaded',
						value: 'recording_updated',
						description: 'A call recording finishes uploading',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events') as string[];
				const staticData = this.getWorkflowStaticData('node');
				const response = await callSyncRequest.call(this, 'GET', 'webhooks');
				const hook = ((response.data as IDataObject[]) || []).find((h) => h.url === url);
				if (!hook) return false;
				if (
					hook.id === staticData.webhookId &&
					staticData.secret &&
					sameEvents(hook.events, events)
				)
					return true;

				// Events changed, or this workflow lost the signing secret: start over with a fresh subscription.
				await callSyncRequest.call(this, 'DELETE', 'webhooks', undefined, {
					id: hook.id as string,
				});
				delete staticData.webhookId;
				delete staticData.secret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const workflow = this.getWorkflow();
				const response = await callSyncRequest.call(this, 'POST', 'webhooks', {
					url: this.getNodeWebhookUrl('default') as string,
					events: this.getNodeParameter('events') as string[],
					name: workflow.name ? `n8n: ${workflow.name}` : 'n8n',
				});
				const hook = response.data as IDataObject;
				const staticData = this.getWorkflowStaticData('node');
				staticData.webhookId = hook.id;
				staticData.secret = hook.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (staticData.webhookId) {
					try {
						await callSyncRequest.call(this, 'DELETE', 'webhooks', undefined, {
							id: staticData.webhookId as string,
						});
					} catch (error) {
						// Already removed in the dashboard is fine; anything else should be retried.
						if (httpStatus(error) !== 404) return false;
					}
				}
				delete staticData.webhookId;
				delete staticData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const body = this.getBodyData();
		const secret = this.getWorkflowStaticData('node').secret as string | undefined;
		const raw = request.rawBody ?? JSON.stringify(body);
		if (!secret || !validSignature(raw, secret, this.getHeaderData()['x-callsync-signature'])) {
			this.getResponseObject().status(401).send('Invalid signature');
			return { noWebhookResponse: true };
		}

		const events = this.getNodeParameter('events') as string[];
		if (!events.includes(canonicalEvent(body.event))) return {};
		return { workflowData: [this.helpers.returnJsonArray(body)] };
	}
}
