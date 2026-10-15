/**
 * Gmail watcher for Collab Desk.
 *
 * Every 10 minutes it looks for "money credited" emails from your bank and sends them to the app,
 * which marks the matching invoice as paid. Nothing else in your mailbox is read or sent anywhere.
 *
 * Setup (5 minutes):
 *   1. Open https://script.google.com while signed in to the Gmail that gets your bank alerts → New project.
 *   2. Paste this whole file, replacing what's there.
 *   3. Fill in ENDPOINT and TOKEN below (copy both from the app: My page → Billing → "Address" and "Private key").
 *   4. Put your bank's alert sender in BANK_SENDERS (open one credit alert email and copy the "from" address).
 *   5. Choose the function "setup" in the toolbar and press Run. Allow the permissions Google asks for.
 * Done. To test right away, run "checkBankAlerts".
 */

const ENDPOINT = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/bank-alert';
const TOKEN = 'PASTE-YOUR-PRIVATE-KEY';

// The address your bank sends alerts from. Examples only; check one of your own alert emails.
const BANK_SENDERS = ['alerts@hdfcbank.net', 'credit_cards@icicibank.com', 'alerts@axisbank.com', 'donotreply.sbiatm@alerts.sbi.co.in', 'BankAlerts@kotak.com'];

const LABEL = 'collab-checked';

function checkBankAlerts() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const from = BANK_SENDERS.map((s) => 'from:' + s).join(' OR ');
  const query = `(${from}) (credited OR credit) newer_than:3d -label:${LABEL}`;
  const threads = GmailApp.search(query, 0, 30);

  threads.forEach((thread) => {
    thread.getMessages().forEach((m) => {
      const res = UrlFetchApp.fetch(ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-inbox-token': TOKEN },
        payload: JSON.stringify({
          id: m.getId(),
          from: m.getFrom(),
          subject: m.getSubject(),
          body: m.getPlainBody().slice(0, 4000),
          date: m.getDate().toISOString(),
        }),
        muteHttpExceptions: true,
      });
      console.log(m.getSubject() + ' → ' + res.getResponseCode() + ' ' + res.getContentText());
    });
    thread.addLabel(label);
  });
}

/** Run once: checks your inbox every 10 minutes from now on. */
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkBankAlerts').timeBased().everyMinutes(10).create();
  checkBankAlerts();
}
