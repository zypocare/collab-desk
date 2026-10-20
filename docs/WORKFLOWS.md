# Collaboration tracking and complete reporting

Apply migrations 20261020000094 through 20261020000097 in order, then deploy the updated website
and Edge Functions. The enum additions are a separate migration so Postgres commits them before use.

```powershell
npx supabase db push
npx supabase functions deploy
cd web
npm run build
```

The studio fetches collaboration snapshots in cursor pages of at most 100. Each page aggregates
its complete nested history in Postgres; the API row limit cannot silently cut off invoices or
messages inside a collaboration. Brands and supporting tables are fetched in ordered ranges.
Failed refreshes retain the last complete snapshot and display an error. Old offline snapshots
are invalidated once because they may have been truncated by the previous loader.

The laptop list displays 25 records per page. Board columns and phone groups initially display
25 and have Show more controls. Search, sorting, totals, CSV exports and quarter packs use the
complete snapshot. Money and Reports also fetch database aggregates for the selected financial
year, independently of the current list page. The complete snapshot supplies offline fallback
and detailed exports. This preserves the current app architecture: all collaboration pages are
still fetched before a fresh snapshot is displayed.

Each deliverable quantity creates that many individual pieces. A piece has a status, due date,
assignee, linked draft and linked Instagram post. Linking a post completes one matching piece;
approving a linked draft updates its piece. Live does not complete the remaining pieces, and
payment cannot wrap unfinished work. Existing completed groups are backfilled as completed pieces.
Reducing quantity cannot remove pieces already started. Individual deadlines appear in Today,
the studio calendar and the private calendar subscription. Export everything includes an
additional deliverable-items.csv.

Pause and Cancel require a reason visible to the brand. Pausing optionally sets a review date;
resuming is manual and restores the previous stage. Work reminders and scheduled posting stop
while held. Held scheduled posts require their time to be reviewed and scheduled again after
resuming. Cancellation preserves invoices, receipts and production history; review invoices
separately for settlement. Cancelled collaborations can be reopened at their previous stage.

## Regression checks

```powershell
cd web
npm run test:workflow
npm run check
npm run build
npm run test:e2e -- tests/e2e/workflows.spec.ts --project=laptop
```

Run supabase/tests/workflows.sql against a migrated local/test database with psql and
ON_ERROR_STOP=1 as its administrator. It creates more than 1,000 collaborations, brands and
invoices, checks complete nested history, financial aggregates, currency conversion, GST/TDS,
partial receipts, production progress, lifecycle transitions and role isolation, then rolls back.
It disables outgoing job configuration inside the test transaction. CI runs this check against
its fresh local Supabase database. The new browser tests support WORKFLOW_REST_URL for an isolated
PostgREST test instance while authentication uses the local Supabase email catcher.
