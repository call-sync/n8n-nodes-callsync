import type { INodeProperties } from 'n8n-workflow';

const show = (resource: string, operation: string[]) => ({
	show: { resource: [resource], operation },
});

const returnAllAndLimit = (resource: string): INodeProperties[] => [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		displayOptions: show(resource, ['getAll']),
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: { show: { resource: [resource], operation: ['getAll'], returnAll: [false] } },
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
	},
];

/** CRM picklists come from the workspace's own stages, priorities, segments and sources. */
const crmPicklist = (displayName: string, name: string, method: string): INodeProperties => ({
	displayName: `${displayName} Name or ID`,
	name,
	type: 'options',
	typeOptions: { loadOptionsMethod: method },
	default: '',
	description:
		'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
});

const contactFields: INodeProperties[] = [
	{
		displayName: 'About',
		name: 'about',
		type: 'string',
		default: '',
		description: 'Short description of the contact',
	},
	{ displayName: 'Budget', name: 'budget', type: 'string', default: '' },
	{ displayName: 'Company', name: 'company', type: 'string', default: '' },
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
	},
	{
		displayName: 'In Pipeline',
		name: 'isInPipeline',
		type: 'boolean',
		default: false,
		description: 'Whether the contact is an active lead in the pipeline',
	},
	{
		displayName: 'Labels',
		name: 'labels',
		type: 'string',
		default: '',
		description: 'Comma-separated labels, for example: hot lead, follow-up',
	},
	crmPicklist('Lead Source', 'sourceId', 'getSources'),
	{ displayName: 'Name', name: 'name', type: 'string', default: '' },
	crmPicklist('Priority', 'priorityId', 'getPriorities'),
	{
		displayName: 'Sales Note',
		name: 'salesNote',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
	},
	crmPicklist('Segment', 'segmentId', 'getSegments'),
	crmPicklist('Stage', 'stageId', 'getStages'),
];

const taskTypes = [
	{ name: 'Call', value: 'CALL' },
	{ name: 'Email', value: 'EMAIL' },
	{ name: 'Follow Up', value: 'FOLLOW_UP' },
	{ name: 'Meeting', value: 'MEETING' },
	{ name: 'To Do', value: 'TO_DO' },
];

const taskFields: INodeProperties[] = [
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
	},
	{
		displayName: 'Due',
		name: 'due',
		type: 'dateTime',
		default: '',
		description: 'Due date and time, kept as the wall-clock time you enter',
	},
	crmPicklist('Priority', 'priorityId', 'getPriorities'),
	{
		displayName: 'Remind Minutes Before',
		name: 'reminderMinutesBefore',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 15,
	},
	{
		displayName: 'Show Reminder',
		name: 'showReminder',
		type: 'boolean',
		default: false,
		description: 'Whether to remind the team before the task is due',
	},
];

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Call', value: 'call' },
		{ name: 'Contact', value: 'contact' },
		{ name: 'Note', value: 'note' },
		{ name: 'Task', value: 'task' },
	],
	default: 'contact',
};

export const callProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['call'] } },
		options: [
			{
				name: 'Get AI Analysis',
				value: 'getAnalysis',
				description: 'Get the transcript, summary and suggestions for a call',
				action: 'Get AI analysis of a call',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get calls, newest first',
				action: 'Get many calls',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Call ID',
		name: 'callId',
		type: 'string',
		required: true,
		displayOptions: show('call', ['getAnalysis']),
		default: '',
		description: 'The call_id from a CallSync Trigger event or from Get Many Calls',
	},
	...returnAllAndLimit('call'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: show('call', ['getAll']),
		default: {},
		options: [
			{
				displayName: 'Direction',
				name: 'direction',
				type: 'options',
				options: [
					{ name: 'Blocked', value: 'blocked' },
					{ name: 'Incoming', value: 'incoming' },
					{ name: 'Missed', value: 'missed' },
					{ name: 'Outgoing', value: 'outgoing' },
					{ name: 'Rejected', value: 'rejected' },
				],
				default: 'incoming',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Matches phone, caller name, notes, team member and AI summary',
			},
		],
	},
];

export const contactProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contact'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Add a CRM contact, linked to their calls by phone number',
				action: 'Create a contact',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get CRM contacts',
				action: 'Get many contacts',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a CRM contact',
				action: 'Update a contact',
			},
		],
		default: 'create',
	},
	{
		displayName: 'Phone',
		name: 'phone',
		type: 'string',
		required: true,
		displayOptions: show('contact', ['create']),
		placeholder: '+919876543210',
		default: '',
		description: 'An existing caller with this number is linked instead of duplicated',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: show('contact', ['create']),
		default: {},
		options: contactFields,
	},
	{
		displayName: 'Contact ID',
		name: 'contactId',
		type: 'number',
		required: true,
		displayOptions: show('contact', ['update']),
		default: 0,
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: show('contact', ['update']),
		default: {},
		options: (
			[
				...contactFields,
				{ displayName: 'Archived', name: 'isArchived', type: 'boolean', default: false },
				{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
				{ displayName: 'Starred', name: 'isStarred', type: 'boolean', default: false },
			] as INodeProperties[]
		).sort((a, b) => a.displayName.localeCompare(b.displayName)),
	},
	...returnAllAndLimit('contact'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: show('contact', ['getAll']),
		default: {},
		options: [
			{ displayName: 'In Pipeline', name: 'isInPipeline', type: 'boolean', default: true },
			{ displayName: 'Label', name: 'label', type: 'string', default: '' },
			crmPicklist('Priority', 'priorityId', 'getPriorities'),
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Matches name, phone, email and sales note',
			},
			crmPicklist('Segment', 'segmentId', 'getSegments'),
			crmPicklist('Stage', 'stageId', 'getStages'),
		],
	},
];

export const taskProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['task'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a task for a contact',
				action: 'Create a task',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get tasks, soonest due first',
				action: 'Get many tasks',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update or complete a task',
				action: 'Update a task',
			},
		],
		default: 'create',
	},
	{
		displayName: 'Contact ID',
		name: 'contactId',
		type: 'number',
		required: true,
		displayOptions: show('task', ['create']),
		default: 0,
		description: 'The CRM contact the task is for',
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		displayOptions: show('task', ['create']),
		options: taskTypes,
		default: 'TO_DO',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: show('task', ['create']),
		default: {},
		options: taskFields,
	},
	{
		displayName: 'Task ID',
		name: 'taskId',
		type: 'number',
		required: true,
		displayOptions: show('task', ['update']),
		default: 0,
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: show('task', ['update']),
		default: {},
		options: [
			...taskFields,
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Cancelled', value: 'CANCELLED' },
					{ name: 'Completed', value: 'COMPLETED' },
					{ name: 'Pending', value: 'PENDING' },
				],
				default: 'COMPLETED',
			},
			{ displayName: 'Type', name: 'type', type: 'options', options: taskTypes, default: 'TO_DO' },
		],
	},
	...returnAllAndLimit('task'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: show('task', ['getAll']),
		default: {},
		options: [
			{ displayName: 'Contact ID', name: 'contactId', type: 'number', default: 0 },
			{
				displayName: 'Due Date',
				name: 'dueDate',
				type: 'dateTime',
				default: '',
				description: 'Only tasks due on this day',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Cancelled', value: 'CANCELLED' },
					{ name: 'Completed', value: 'COMPLETED' },
					{ name: 'Pending', value: 'PENDING' },
				],
				default: 'PENDING',
			},
		],
	},
];

export const noteProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['note'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Add an entry to a contact’s timeline',
				action: 'Create a note',
			},
		],
		default: 'create',
	},
	{
		displayName: 'Contact ID',
		name: 'contactId',
		type: 'number',
		required: true,
		displayOptions: show('note', ['create']),
		default: 0,
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		displayOptions: show('note', ['create']),
		options: [
			{ name: 'Call', value: 'CALL' },
			{ name: 'Email', value: 'EMAIL' },
			{ name: 'Follow Up', value: 'FOLLOW_UP' },
			{ name: 'Meeting', value: 'MEETING' },
			{ name: 'Note', value: 'NOTE' },
			{ name: 'Site Visit', value: 'SITE_VISIT' },
		],
		default: 'NOTE',
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		required: true,
		displayOptions: show('note', ['create']),
		default: '',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: show('note', ['create']),
		default: {},
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
			},
		],
	},
];
