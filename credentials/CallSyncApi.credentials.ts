import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CallSyncApi implements ICredentialType {
	name = 'callSyncApi';

	displayName = 'CallSync API';

	icon: Icon = {
		light: 'file:../nodes/CallSync/callsync.svg',
		dark: 'file:../nodes/CallSync/callsync.svg',
	};

	documentationUrl =
		'https://github.com/call-sync/n8n-nodes-callsync?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Copy it from API & Apps in the CallSync dashboard (dash.callsyncapp.com/api-apps). The workspace needs integrations on an active plan.',
		},
		{
			displayName: 'API URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://mcp.callsyncapp.com',
			description: 'Leave as it is unless CallSync support gives you a different address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}/api/v1',
			url: '/calls',
			qs: { limit: 1 },
		},
	};
}
