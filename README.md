# SEO Ghost — GBP agent workspace

A local, single-operator workspace for auditing and managing a plumbing business’s Google Business Profile.

## Start the app

From this folder, run:

```sh
npm start
```

Then open **http://127.0.0.1:8765/#gbp**. Node.js 20 or newer is required. There are no packages to install. Keep this address consistent: browser storage belongs to the browser and origin.

## Works now without connected accounts

- Save and edit verified business facts from Session 01.
- Capture the current listing manually, including categories, services, hours, review/photo counts, eligibility details, and address visibility.
- See the next three actions, with blockers and evidence checks prioritized ahead of lower-priority content. Record action taken without falsely marking it verified.
- Run a prioritized, evidence-linked audit. Missing evidence is labeled as a check, not a proven defect. Audit coverage is not a ranking score.
- Draft descriptions and service updates from saved facts.
- Prepare review-request messages and review replies; copy them for manual use.
- Queue website, phone, description, and weekly schedule proposals with readable before-and-after values.
- Record manual completion explicitly as user-reported, not independently verified.
- Record actual local Maps observations and competitor context, with matched before/after comparisons and explicit not-found scan depth.
- Save activity history and export/import a GBP workspace backup.

Built-in drafting uses templates, and the baseline audit uses rules. Neither is represented as a live AI call or a Google ranking analysis.

## Available after Google approval and account connection

The connector implements real Google API requests for:

- Listing account discovery and current listing capture.
- Category lookup and primary/additional category update proposals.
- Google-supported service-type lookup, service name resolution, and approved additions to the existing service list.
- Recent reviews (up to 50 per fetch, clearly labeled) and approved review replies.
- A recent 28-day UTC date window of Google performance data; availability may lag.
- Approved website, primary phone, description, categories, service additions, and regular-hours updates.

Before each profile update, the server checks the current values, sends a validate-only request to Google, and creates a preview that expires after 15 minutes. Publishing requires explicit approval and another conflict check. The server then reads back the result and distinguishes a match from an uncertain result. API acceptance/readback does not establish that the public listing already displays the change.

Categories, regular hours, and phone-number collections are sent as complete field values, preserving captured additional phone numbers and deliberately selected categories. Special hours are not overwritten. The weekly editor supports one period per selected day and overnight hours. Split shifts and 24-hour schedules should be edited manually in GBP in this version.

Service additions use the connected Google catalog; service removal, editing existing service descriptions/prices, service areas, photos, attributes, special hours, addresses, verification, and duplicate-resolution work receive manual recommendations. Posts are drafted for manual publishing. This version does not create/delete profiles, publish photos/posts, edit all GBP field types, scrape competitor listings, fetch geographic rankings automatically, or send customer messages.

## Priorities and measurement

The audit’s next-three plan groups overlapping address issues and prioritizes eligibility, verification, accurate core details, and relevant service coverage. A saved priority service helps order applicable service work. Missing evidence remains a check. Recording that you took action does not resolve an issue: recapture the listing to assess its current state. Seven-day capture freshness and 90-day review recency are workflow heuristics, not Google ranking rules.

In **Local visibility**, record genuine measurements using a stable search query, exact point label/coordinates, measurement source/settings, date, position, and scan depth. Leave position blank only when the business was not found within that depth. Comparisons match query, point, source, and depth; first and latest distinct dates are compared. A not-found result is censored and never converted into a fabricated numeric position. Top-three share describes only the latest recorded samples, not whole-city visibility. Manual records are not independently verified and do not prove causality.

Competitor review counts, ratings, and categories are recorded as context for the same query and point. They are not ranking predictions or a recommended review-count target. A local rank tracker is recommended for repeatable measurements. There is no Local Falcon/BrightLocal API connection in this build.

In **Services**, capture Google and load supported service types for the listing’s existing categories. The picker resolves standardized names and prepares only confirmed, actually offered services. Existing entries and prices are preserved. The server rejects invented service IDs, service removals, custom duplicates of standard types, and stale category dependencies. Apply category changes separately, recapture, then load services for the new categories. Do not add services merely because competitors list them.

## Google setup

1. Check [Google’s current GBP API prerequisites](https://developers.google.com/my-business/content/prereqs) and request API access for your Google Cloud project. Approval is required independently of owning a GBP.
2. Enable the approved Google APIs: My Business Account Management, My Business Business Information, Business Profile Performance, and Google My Business API (used by the reviews connector).
3. Configure your OAuth consent screen and a **Web application** OAuth client. Add the Google account that manages your listing as a test user if the consent screen is in testing mode. Configure the `https://www.googleapis.com/auth/business.manage` scope.
4. Register this exact redirect URI:

   ```text
   http://127.0.0.1:8765/auth/callback
   ```

5. Copy `.env.example` to `.env` in this folder. Fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` locally; do not paste the secret into chat.
6. Restart the server, open **GBP agent → Connect Google**, authorize the account, then **Find my Google listings** and **Capture selected listing**.
7. Review the listing and saved business facts. Prepare changes, validate the preview, and approve only the exact changes you intend to publish.

The OAuth flow uses a random state bound to the local browser, PKCE, and offline authorization. Tokens are held by the local server, not browser storage, and refreshed when needed. Test-mode authorizations can expire; reconnect when Google requests it.

## Optional AI assessment

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`. Choose a model available to your API account that supports Responses and Structured Outputs, then restart the server.

Click **Audit & priorities → Analyze audit with AI**. The app confirms before sending the saved business name, city, country, services, service areas, and audit evidence to OpenAI. The server excludes private operating addresses, Google credentials, business notes, and customer review text from the model input. Audit evidence can contain the listing’s customer-facing phone and website. This uses your separately configured OpenAI API account; the chat itself is not the app’s model connection.

The model returns up to five advisory actions and missing-fact questions. Every action must cite evidence IDs from the audit. Incomplete responses and invented IDs are rejected. An analysis becomes stale when relevant facts or audit evidence change. AI has no tools to write to Google; recommendations never publish automatically.

The integration uses the [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), with response storage disabled through `store: false`.

## Storage and backups

Business facts and GBP captures, queues, and drafts stay in browser local storage. Export both the business profile and GBP workspace before clearing browser data or switching browsers. Imports are treated as manual evidence and cannot supply an authorized live preview. Recapture Google to regain live publishing.

The local server stores tokens and change-attempt history in `../../work/seo-ghost-private/`, with restrictive file permissions. This directory is outside the served folder. `.env` is ignored by Git, never served, and never exported. Credentials are stored locally in plaintext files protected by those permissions; this is a single-operator local app, not a publicly deployable credential vault.

Use **Disconnect** to revoke Google access when possible and remove the local token. Disconnecting retains captured business data and drafts. If you want to remove residual data, separately clear browser storage and the private history file after exporting any needed records.

Google Fonts may load remotely; fallback fonts work offline. All Google and AI operations require network access.

## Verification and current limitations

Run:

```sh
npm test
```

Server tests exercise service additions and price preservation, priority ordering, comparable observations and censored ranks, strict field validation, explicit approval, conflict detection, single-use previews, readback, review replies, category updates, cross-site request rejection, and AI evidence validation with a fake transport. Browser checks exercise manual capture, prioritized findings, drafts and queue persistence, manual completion labels, review/content workflows, safe text rendering, backups, disconnected controls, and mobile layout. Additional connected-UI checks use isolated mock responses for service lookup, service-name resolution, additive proposals, category lookup, and AI advice.

Real Google OAuth, Google-specific field acceptance, and live publishing still require testing against your approved project and authorized listing. Live OpenAI analysis requires your configured API account. No real Google writes or paid AI calls were performed during development.

The server binds only to `127.0.0.1`; static files are allowlisted and credential files are inaccessible over HTTP. Public hosting, multiple operators, unattended scheduled operation, encrypted shared storage, and production credential management need a separate implementation. The current agent runs when you choose an action; it does not run unattended daily campaigns.

## Files

- `index.html`, `styles.css`, `app.js`: business workspace and interface.
- `gbp.js`: GBP capture, audit, next actions, queue, service additions, reviews, content, measurement, and performance interface.
- `optimization.js`, `optimization.test.cjs`: priority selection and measured-observation comparison with tests.
- `server.cjs`: local server, OAuth, Google connectors, validation, approved execution, and history.
- `ai.cjs`: optional evidence-grounded AI assessment.
- `server.test.cjs`: meaningful server checks using isolated fake transports.
- `.env.example`: local configuration template.
