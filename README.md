# n8n-nodes-callsync

This is an n8n community node. It lets you use [CallSync](https://callsyncapp.com) in your n8n workflows.

CallSync records and syncs your team's business calls from their Android phones, writes AI call summaries, and keeps a light CRM of contacts, tasks and notes.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) · [Compatibility](#compatibility) · [Usage](#usage) · [Example workflows](#example-workflows) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install `n8n-nodes-callsync`.

## Operations

### CallSync Trigger

Starts a workflow the moment something happens in CallSync:

| Event              | When it fires                                |
| ------------------ | -------------------------------------------- |
| Call Logged        | A call syncs from a team member's phone      |
| Recording Uploaded | A call recording finishes uploading          |
| AI Analysis Ready  | A call's transcript and AI summary are ready |
| Contact Updated    | A contact's name, note or labels change      |

Activating the workflow subscribes its webhook URL in CallSync; deactivating it unsubscribes. Every event is signed, and the trigger refuses any request whose signature does not match.

### CallSync

| Resource | Operations                          |
| -------- | ----------------------------------- |
| Call     | Get Many, Get AI Analysis           |
| Contact  | Create, Update, Get Many            |
| Task     | Create, Update, Get Many            |
| Note     | Create (adds to a contact timeline) |

Stage, priority, segment and lead source fields list the options set up in your own CallSync workspace.

## Credentials

1. Sign in to the [CallSync dashboard](https://dash.callsyncapp.com) as the workspace owner.
2. Open **API & Apps** and copy the API key. Integrations need to be on in an active plan.
3. In n8n, create a **CallSync API** credential and paste the key. Leave **API URL** as it is.

## Compatibility

Built with `@n8n/node-cli` 0.54 against `n8n-workflow` 2.16. Requires an n8n version that supports community nodes.

## Usage

- Trigger items are the event exactly as CallSync sends it: `event`, `timestamp`, `org_id`, `payload_id` and `data` (with `call_id`, `staff`, `caller`, `call_details` and `automation` for call events).
- **Call**, **Contact** and **Task** fields let you pick from a searchable list, or switch to **By ID** and use an expression such as `{{ $json.data.call_id }}`.
- Use **Call → Get AI Analysis** with the trigger's `data.call_id` to fetch a summary later.
- Task **Due** keeps the date and time you enter, so 10:00 stays 10:00 for the team.
- Fields left blank are not sent, so an update never wipes saved data by accident.

## Example workflows

**Missed-call alert**

1. **CallSync Trigger** with the event **Call Logged**.
2. **If** `{{ $json.data.call_details.type }}` is equal to `missed`.
3. A **Slack**, **Telegram** or **Gmail** node with the message `Missed call from {{ $json.data.caller.name }} ({{ $json.data.caller.phone }}), handled by {{ $json.data.staff.name }}`.

**AI call summaries in a sheet**

1. **CallSync Trigger** with the event **AI Analysis Ready**.
2. **Google Sheets → Append Row** with columns for `{{ $json.data.caller.phone }}`, `{{ $json.data.automation.ai_summary }}` and `{{ $json.data.automation.suggested_next_action }}`.

**Follow-up task after every answered call**

1. **CallSync Trigger** with the event **Call Logged**, then **If** `{{ $json.data.call_details.type }}` is equal to `answered`.
2. **CallSync → Contact → Get Many** with **Limit** 1 and the filter **Search** set to `{{ $json.data.caller.phone }}`.
3. **CallSync → Task → Create** with **Contact** set to **By ID** `{{ $json.id }}`, **Type** Follow Up and **Due** `{{ $now.plus({ days: 1 }) }}`.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [CallSync help center](https://help.callsyncapp.com)

## Development

```bash
npm install --ignore-scripts
npm run lint
npm test
```

`npm test` builds the package and runs the tests in `test/`. `test/api-contract.test.mjs` drives the real CallSync API router from the CallSync monorepo, so it only runs there.
