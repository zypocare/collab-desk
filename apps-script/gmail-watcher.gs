/**
 * Miracle: Gmail watcher. Every 10 minutes it sends two kinds of email to your studio:
 *   1. Brand emails you give the label "collab-desk" (by hand, or with a Gmail filter):
 *      new ones become requests, replies go into that collab's messages.
 *   2. "Money credited" alerts from your bank: the matching invoice is marked paid.
 * Nothing else in your mailbox is read or sent anywhere.
 *
 * Easiest: copy it from the app (My page → Inbox, alerts & phone → Brand emails) with your key filled in.
 * Or by hand: fill BASE and TOKEN below, then paste this whole file at https://script.google.com (New project), choose "setup"
 * in the toolbar, press Run and allow the permissions Google asks for. Done.
 */

const BASE = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1';
const TOKEN = 'PASTE-YOUR-PRIVATE-KEY';

// Brand emails: give them this label in Gmail.
const BRAND_LABEL = 'collab-desk';
// Your bank's alert sender (open one "credited" email and check the from address). Leave as is if unsure.
const BANK_SENDERS = ['alerts@hdfcbank.net', 'credit_cards@icicibank.com', 'alerts@axisbank.com', 'donotreply.sbiatm@alerts.sbi.co.in', 'BankAlerts@kotak.com'];

const DONE = 'collab-checked';

function send(path, m) {
  const res = UrlFetchApp.fetch(BASE + '/' + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-inbox-token': TOKEN },
    payload: JSON.stringify({ id: m.getId(), from: m.getFrom(), subject: m.getSubject(), body: m.getPlainBody().slice(0, 6000), date: m.getDate().toISOString() }),
    muteHttpExceptions: true,
  });
  console.log(path + ': ' + m.getSubject() + ' -> ' + res.getResponseCode() + ' ' + res.getContentText());
}

function checkBrandEmails() {
  const done = GmailApp.getUserLabelByName(DONE) || GmailApp.createLabel(DONE);
  GmailApp.getUserLabelByName(BRAND_LABEL) || GmailApp.createLabel(BRAND_LABEL);
  GmailApp.search('label:' + BRAND_LABEL + ' newer_than:14d', 0, 30).forEach((thread) => {
    const seen = PropertiesService.getScriptProperties();
    thread.getMessages().forEach((m) => {
      if (seen.getProperty(m.getId())) return;
      send('inbound-email', m);
      seen.setProperty(m.getId(), '1');
    });
    thread.addLabel(done);
  });
}

function checkBankAlerts() {
  const done = GmailApp.getUserLabelByName(DONE) || GmailApp.createLabel(DONE);
  const from = BANK_SENDERS.map((s) => 'from:' + s).join(' OR ');
  GmailApp.search('(' + from + ') (credited OR credit) newer_than:3d -label:' + DONE, 0, 30).forEach((thread) => {
    thread.getMessages().forEach((m) => send('bank-alert', m));
    thread.addLabel(done);
  });
}

function run() {
  checkBrandEmails();
  checkBankAlerts();
}

/** Run once: checks your inbox every 10 minutes from now on. */
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('run').timeBased().everyMinutes(10).create();
  run();
}
