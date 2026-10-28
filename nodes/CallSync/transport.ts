import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

type Context = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

/** The API serves at most this many rows per page. */
export const PAGE_SIZE = 10;

export async function callSyncRequest(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('callSyncApi');
	const baseUrl = String(credentials.baseUrl || 'https://mcp.callsyncapp.com').replace(/\/+$/, '');
	return (await this.helpers.httpRequestWithAuthentication.call(this, 'callSyncApi', {
		method,
		url: `${baseUrl}/api/v1/${path}`,
		...(body ? { body } : {}),
		...(qs ? { qs } : {}),
		json: true,
	})) as IDataObject;
}

/** HTTP status of a failed request, whether n8n wrapped it in NodeApiError or not. */
export function httpStatus(error: unknown): number | undefined {
	const e = error as { httpCode?: string; statusCode?: number; response?: { status?: number } };
	const status = Number(e?.httpCode ?? e?.statusCode ?? e?.response?.status);
	return Number.isFinite(status) ? status : undefined;
}

/** Follows page numbers until the API runs out of rows or the limit is reached. */
export async function callSyncRequestAllPages(
	this: IExecuteFunctions,
	path: string,
	qs: IDataObject,
	limit?: number,
): Promise<IDataObject[]> {
	const rows: IDataObject[] = [];
	for (let page = 1; page <= 10000; page++) {
		const response = await callSyncRequest.call(this, 'GET', path, undefined, {
			...qs,
			page,
			limit: PAGE_SIZE,
		});
		const data = (response.data as IDataObject[]) || [];
		rows.push(...data);
		const pagination = response.pagination as IDataObject | undefined;
		const total = Number(pagination?.total ?? response.total);
		if (
			data.length < PAGE_SIZE ||
			(limit !== undefined && rows.length >= limit) ||
			(Number.isFinite(total) && rows.length >= total)
		)
			break;
	}
	return limit === undefined ? rows : rows.slice(0, limit);
}

/** Older event names that existing CallSync endpoints may still send. */
const EVENT_ALIASES: Record<string, string> = {
	'call.received': 'call_logged',
	recording_uploaded: 'recording_updated',
	'recording.available': 'recording_updated',
	'ai_analysis.completed': 'ai_analysis',
	'transcription.completed': 'ai_analysis',
	'ai.transcription.completed': 'ai_analysis',
	'caller.updated': 'caller_updated',
	detail_updated: 'caller_updated',
};

export const canonicalEvent = (event: unknown) =>
	typeof event === 'string' ? (EVENT_ALIASES[event] ?? event) : '';

/** X-CallSync-Signature is the hex HMAC-SHA256 of the raw body, keyed with the subscription secret. */
export function validSignature(body: Buffer | string, secret: string, signature: unknown): boolean {
	if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
	const expected = createHmac('sha256', secret).update(body).digest();
	return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
