import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	callProperties,
	contactProperties,
	noteProperties,
	resourceProperty,
	taskProperties,
} from './descriptions';
import { callSyncRequest, callSyncRequestAllPages } from './transport';

/** Node field name → API field name. Fields left blank are not sent, so they never wipe saved data. */
const API_FIELDS: Record<string, string> = {
	about: 'about',
	budget: 'budget',
	company: 'company',
	description: 'description',
	email: 'email',
	isArchived: 'is_archived',
	isInPipeline: 'is_in_pipeline',
	isStarred: 'is_starred',
	name: 'name',
	phone: 'phone',
	priorityId: 'priority_id',
	reminderMinutesBefore: 'reminder_minutes_before',
	salesNote: 'sales_note',
	segmentId: 'segment_id',
	showReminder: 'show_reminder',
	sourceId: 'source_id',
	stageId: 'stage_id',
	status: 'status',
	type: 'type',
};

/** Keeps the date and time exactly as entered, so 10:00 stays 10:00 for the team. */
export function dueFields(value: unknown): IDataObject {
	const match = String(value ?? '').match(
		/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?/,
	);
	if (!match) return {};
	return match[2]
		? { due_date: match[1], due_time: `${match[2]}:${match[3] ?? '00'}` }
		: { due_date: match[1] };
}

export function toApiFields(fields: IDataObject): IDataObject {
	const body: IDataObject = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value === '' || value === undefined || value === null) continue;
		if (key === 'labels')
			body.labels = String(value)
				.split(',')
				.map((label) => label.trim())
				.filter(Boolean);
		else if (key === 'due') Object.assign(body, dueFields(value));
		else if (API_FIELDS[key]) body[API_FIELDS[key]] = value;
	}
	return body;
}

async function crmOptions(
	this: ILoadOptionsFunctions,
	group: string,
): Promise<INodePropertyOptions[]> {
	const config = await callSyncRequest.call(this, 'GET', 'crm/config');
	return ((config[group] as IDataObject[]) || []).map((item) => ({
		name: String(item.label),
		value: String(item.id),
	}));
}

export class CallSync implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CallSync',
		name: 'callSync',
		icon: { light: 'file:callsync.svg', dark: 'file:callsync.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Read calls and AI call summaries, and manage CRM contacts, tasks and notes in CallSync',
		defaults: {
			name: 'CallSync',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'callSyncApi',
				required: true,
			},
		],
		properties: [
			resourceProperty,
			...callProperties,
			...contactProperties,
			...taskProperties,
			...noteProperties,
		],
	};

	methods = {
		loadOptions: {
			async getStages(this: ILoadOptionsFunctions) {
				return crmOptions.call(this, 'stages');
			},
			async getPriorities(this: ILoadOptionsFunctions) {
				return crmOptions.call(this, 'priorities');
			},
			async getSegments(this: ILoadOptionsFunctions) {
				return crmOptions.call(this, 'segments');
			},
			async getSources(this: ILoadOptionsFunctions) {
				return crmOptions.call(this, 'sources');
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const fields = (name: string) => this.getNodeParameter(name, i, {}) as IDataObject;
				const limit = () =>
					this.getNodeParameter('returnAll', i)
						? undefined
						: (this.getNodeParameter('limit', i) as number);
				let result: IDataObject | IDataObject[];

				if (resource === 'call' && operation === 'getAll') {
					result = await callSyncRequestAllPages.call(
						this,
						'calls',
						toQuery(fields('filters')),
						limit(),
					);
				} else if (resource === 'call' && operation === 'getAnalysis') {
					const response = await callSyncRequest.call(this, 'GET', 'analysis', undefined, {
						call_id: this.getNodeParameter('callId', i) as string,
					});
					result = response.data as IDataObject;
				} else if (resource === 'contact' && operation === 'create') {
					const body = {
						...toApiFields(fields('additionalFields')),
						phone: this.getNodeParameter('phone', i),
					};
					result = (await callSyncRequest.call(this, 'POST', 'crm/contacts', body))
						.data as IDataObject;
				} else if (resource === 'contact' && operation === 'update') {
					const body = requireUpdate(this, toApiFields(fields('updateFields')), i);
					body.id = this.getNodeParameter('contactId', i) as number;
					result = (await callSyncRequest.call(this, 'PUT', 'crm/contacts', body))
						.data as IDataObject;
				} else if (resource === 'contact' && operation === 'getAll') {
					result = await callSyncRequestAllPages.call(
						this,
						'crm/contacts',
						toQuery(fields('filters')),
						limit(),
					);
				} else if (resource === 'task' && operation === 'create') {
					const body = {
						...toApiFields(fields('additionalFields')),
						person_id: this.getNodeParameter('contactId', i) as number,
						type: this.getNodeParameter('type', i) as string,
					};
					result = (await callSyncRequest.call(this, 'POST', 'crm/tasks', body))
						.data as IDataObject;
				} else if (resource === 'task' && operation === 'update') {
					const body = requireUpdate(this, toApiFields(fields('updateFields')), i);
					body.id = this.getNodeParameter('taskId', i) as number;
					result = (await callSyncRequest.call(this, 'PUT', 'crm/tasks', body)).data as IDataObject;
				} else if (resource === 'task' && operation === 'getAll') {
					const filters = fields('filters');
					const qs: IDataObject = {};
					if (filters.contactId) qs.person_id = filters.contactId;
					if (filters.status) qs.status = filters.status;
					if (filters.dueDate) qs.due_date = dueFields(filters.dueDate).due_date;
					// Tasks come back in one response, soonest due first.
					const tasks =
						((await callSyncRequest.call(this, 'GET', 'crm/tasks', undefined, qs))
							.data as IDataObject[]) || [];
					const max = limit();
					result = max === undefined ? tasks : tasks.slice(0, max);
				} else if (resource === 'note' && operation === 'create') {
					const body = {
						...toApiFields(fields('additionalFields')),
						person_id: this.getNodeParameter('contactId', i) as number,
						type: this.getNodeParameter('type', i) as string,
						title: this.getNodeParameter('title', i) as string,
					};
					result = (await callSyncRequest.call(this, 'POST', 'crm/activities', body))
						.data as IDataObject;
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported operation: ${resource} ${operation}`,
						{
							itemIndex: i,
						},
					);
				}

				returnData.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Both constructors hand back an error that is already of their own class unchanged.
				if (error instanceof NodeOperationError)
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

/** Filters go to the API as query parameters with API field names. */
function toQuery(filters: IDataObject): IDataObject {
	const qs: IDataObject = {};
	for (const [key, value] of Object.entries(filters)) {
		if (value === '' || value === undefined || value === null) continue;
		qs[API_FIELDS[key] ?? key] = value;
	}
	return qs;
}

function requireUpdate(
	context: IExecuteFunctions,
	body: IDataObject,
	itemIndex: number,
): IDataObject {
	if (!Object.keys(body).length)
		throw new NodeOperationError(context.getNode(), 'Add at least one field to update', {
			itemIndex,
		});
	return body;
}
