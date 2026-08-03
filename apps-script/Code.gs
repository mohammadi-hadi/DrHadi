/**
 * Liber Amicorum — backend for the PhD defence book of Hadi Mohammadi.
 *
 * Paste this into script.google.com, set the three constants below, then:
 *   Deploy > New deployment > Web app
 *     Execute as:      Me
 *     Who has access:  Anyone
 *
 * TO SHIP CHANGES LATER, NEVER USE "New deployment" — it mints a new URL and
 * breaks the link that went out to 200 people. Always:
 *   Deploy > Manage deployments > (pencil) Edit > Version: New version > Deploy
 */

// ── CONFIG ───────────────────────────────────────────────────────────────────
var SHEET_ID   = 'PASTE_YOUR_SHEET_ID_HERE';       // the one sheet this script touches
var APP_SECRET = 'PASTE_A_LONG_RANDOM_STRING'; // must match API_SECRET in assets/app.js
var TAB        = 'leaves';
var SITE_URL   = 'https://mohammadi.cv/DrHadi/';  // used to build edit links
var GATE_PASS  = 'drhadi123';                    // must match GATE_PASSWORD in assets/app.js

// How the emails to guests are signed. The address they are SENT from is
// always the Google account this script is deployed on — that cannot be
// changed here, so deploy on whichever account should appear as the sender.
var MAIL_FROM_NAME = 'The book for Hadi';
// No replyTo on purpose. A Reply-To that differs from the From address, next to
// a one-off link, is a classic phishing signal — university mail systems score
// it hard, and these messages were landing in quarantine because of it.
// Replies now simply go back to the account that sends them.

// Column order in the sheet. Do not reorder — code indexes by name via HEAD.
var HEAD = ['id','created','updated','name','relation','city','lang','body',
            'email','token','code','status','photos','revisions','ua'];

var MAX = { name: 120, relation: 120, city: 120, body: 6000, email: 200 };

// ── PLUMBING ─────────────────────────────────────────────────────────────────
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(TAB);
  if (!sh) {
    sh = ss.insertSheet(TAB);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
  return vals.map(function (r, i) {
    var o = { _row: i + 2 };
    HEAD.forEach(function (h, c) { o[h] = r[c]; });
    return o;
  });
}

/** The shape the browser is allowed to see. Note: no token, no email, no ua. */
function publicLeaf_(r, folio) {
  return {
    id: String(r.id),
    folio: folio,
    name: String(r.name || ''),
    relation: String(r.relation || ''),
    city: String(r.city || ''),
    lang: String(r.lang || 'en'),
    body: String(r.body || ''),
    photos: r.photos ? String(r.photos).split(',').filter(String) : [],
    created: r.created ? new Date(r.created).toISOString() : null,
    updated: r.updated ? new Date(r.updated).toISOString() : null
  };
}

function isEmail_(v) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(v || ''));
}

function editUrl_(token) {
  return SITE_URL + '?k=' + encodeURIComponent(GATE_PASS) + '&t=' + encodeURIComponent(token);
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

/** Farsi/Arabic script anywhere in the text → treat the leaf as Persian. */
function detectLang_(s) {
  if (/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(s)) return 'fa';
  if (/\b(de|het|een|je|jij|ik|wij|voor|met|niet|ook|heel|veel|jouw|gefeliciteerd|proficiat)\b/i.test(s)) return 'nl';
  return 'en';
}

/** Spoken short code, readable down a phone line in NL / EN / FA. */
var WORDS = ['KOFFIE','TULP','ANKER','KANAAL','BRUG','FIETS','APPEL','MOLEN','TOREN','VUUR',
             'MAAN','STER','RIVIER','BOEK','LAMP','SLEUTEL','ZOMER','WINTER','NOTEN','HONING',
             'SAFFRAAN','JASMIJN','CEDER','GRANAAT','MUNT','ZILVER','KOMPAS','HAVEN','DUIN','WOLK',
             'AMANDEL','ABRIKOOS','LINDE','VIJG','DADEL','WALNOOT','KERS','PEER','OLIJF','MIRTE',
             'ZEIL','ROEIER','VUURTOREN','SCHELP','KIEZEL','VELD','WEIDE','BEEK','MEER','EILAND',
             'KAARS','SPIEGEL','VENSTER','DREMPEL','TRAP','ZOLDER','TUIN','HEK','PAD','BANK',
             'INKT','PEN','PAPIER','ZEGEL','LINT','KOORD','NAALD','DRAAD','STOF','WOL'];

function makeCode_(folio) {
  var a = WORDS[Math.floor(Math.random() * WORDS.length)];
  var b = WORDS[Math.floor(Math.random() * WORDS.length)];
  return 'HADI-' + folio + '-' + a + '-' + b;
}

// ── ENDPOINTS ────────────────────────────────────────────────────────────────
function doGet(e) {
  // Read path also works as GET so the book can load even if POST is blocked.
  var p = (e && e.parameter) || {};
  if (p.k !== APP_SECRET) return out({ ok: false, error: 'auth' });
  return out(list_());
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out({ ok: false, error: 'busy' });
  try {
    var b = JSON.parse(e.postData.contents);
    if (b.k !== APP_SECRET) return out({ ok: false, error: 'auth' });

    if (b.action === 'list')     return out(list_());
    if (b.action === 'create')   return out(create_(b));
    if (b.action === 'update')   return out(update_(b));
    if (b.action === 'lookup')   return out(lookup_(b));
    if (b.action === 'requestEdit') return out(requestEdit_(b));
    return out({ ok: false, error: 'bad action' });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function list_() {
  var all = rows_();
  var leaves = [];
  var folio = 0;
  all.forEach(function (r) {
    if (String(r.status) === 'hidden') return;
    folio++;
    leaves.push(publicLeaf_(r, folio));
  });
  var langs = {}, cities = {};
  leaves.forEach(function (l) {
    langs[l.lang] = 1;
    if (l.city) cities[l.city.toLowerCase()] = 1;
  });
  return {
    ok: true,
    leaves: leaves,
    stats: {
      leaves: leaves.length,
      langs: Object.keys(langs).length,
      cities: Object.keys(cities).length
    }
  };
}

function create_(b) {
  var body  = clean_(b.body, MAX.body);
  var name  = clean_(b.name, MAX.name);
  var email = clean_(b.email, MAX.email);
  if (!body || !name) return { ok: false, error: 'empty' };
  if (!isEmail_(email)) return { ok: false, error: 'bademail' };

  // Spam: honeypot must be empty, and the form must have been open >4s.
  if (clean_(b.hp, 40)) return { ok: true, id: 'x', folio: 0, token: 'x', code: 'x' };
  if (typeof b.elapsed === 'number' && b.elapsed < 4000) return { ok: false, error: 'too fast' };

  var sh = sheet_();
  var now = new Date();
  var id = Utilities.getUuid();
  var token = Utilities.getUuid();
  var folio = rows_().filter(function (r) { return String(r.status) !== 'hidden'; }).length + 1;
  var code = makeCode_(folio);

  var rec = {
    id: id, created: now, updated: now,
    name: name,
    relation: clean_(b.relation, MAX.relation),
    city: clean_(b.city, MAX.city),
    lang: b.lang === 'fa' || b.lang === 'nl' || b.lang === 'en' ? b.lang : detectLang_(body),
    body: body,
    email: email,
    token: token, code: code, status: 'live',
    photos: '', revisions: '[]',
    ua: clean_(b.ua, 300)
  };
  sh.appendRow(HEAD.map(function (h) { return rec[h]; }));

  sendEditLink_(rec, folio);
  notify_(rec, folio);
  return { ok: true, id: id, folio: folio, token: token, code: code };
}

function findByToken_(b) {
  var key = String(b.token || '').trim();
  var code = String(b.code || '').trim().toUpperCase();
  if (!key && !code) return null;
  var all = rows_();
  for (var i = 0; i < all.length; i++) {
    if (key && String(all[i].token) === key) return all[i];
    if (code && String(all[i].code).toUpperCase() === code) return all[i];
  }
  return null;
}

function update_(b) {
  var r = findByToken_(b);
  if (!r) return { ok: false, error: 'notfound' };
  var sh = sheet_();

  // Soft delete only. Nothing written for this event is ever destroyed.
  if (b.remove) {
    sh.getRange(r._row, HEAD.indexOf('status') + 1).setValue('hidden');
    return { ok: true, removed: true };
  }

  var body = clean_(b.body, MAX.body);
  if (!body) return { ok: false, error: 'empty' };

  var revs = [];
  try { revs = JSON.parse(r.revisions || '[]'); } catch (err) { revs = []; }
  revs.push({ at: new Date().toISOString(), body: String(r.body) });

  var set = {
    updated: new Date(),
    name: clean_(b.name, MAX.name) || r.name,
    relation: clean_(b.relation, MAX.relation),
    city: clean_(b.city, MAX.city),
    lang: b.lang === 'fa' || b.lang === 'nl' || b.lang === 'en' ? b.lang : detectLang_(body),
    body: body,
    revisions: JSON.stringify(revs.slice(-20))
  };
  Object.keys(set).forEach(function (h) {
    sh.getRange(r._row, HEAD.indexOf(h) + 1).setValue(set[h]);
  });
  return { ok: true, id: String(r.id) };
}

/** Reopen your own leaf from a secret link or a spoken code. */
function lookup_(b) {
  // A spoken code is short by design so it can be read down a phone line, which
  // also makes it guessable. Wrong guesses are counted per message and cut off
  // after ten. The count is checked only AFTER the lookup, so a correct code
  // always opens the message — otherwise someone guessing at your leaf would
  // lock you out of your own words, which is the opposite of the point.
  var code = String(b.code || '').trim().toUpperCase();
  var cache = CacheService.getScriptCache();
  var bucket = (!b.token && code) ? 'guess_' + code.split('-').slice(0, 2).join('-') : null;

  var r = findByToken_(b);

  if (r && String(r.status) !== 'hidden') {
    if (bucket) cache.remove(bucket);   // a right answer clears the slate
    return {
      ok: true,
      leaf: {
        id: String(r.id), name: String(r.name || ''), relation: String(r.relation || ''),
        city: String(r.city || ''), lang: String(r.lang || 'en'), body: String(r.body || ''),
        code: String(r.code || ''), photos: r.photos ? String(r.photos).split(',').filter(String) : []
      },
      token: String(r.token)
    };
  }

  if (bucket) {
    var n = Number(cache.get(bucket) || 0);
    if (n >= 10) return { ok: false, error: 'toomany' };
    cache.put(bucket, String(n + 1), 3600);
  }
  return { ok: false, error: 'notfound' };
}

/**
 * The edit path. A guest asks for their link by email; we send it to that
 * address and nowhere else. Deliberately NOT "type an email and edit on the
 * spot" — email addresses are not secrets, and colleagues all know each
 * other's, so that would let anyone rewrite anyone's message.
 * Always reports success, so the form can never be used to discover who wrote.
 */
function requestEdit_(b) {
  var email = clean_(b.email, MAX.email);
  if (!isEmail_(email)) return { ok: false, error: 'bademail' };

  var cache = CacheService.getScriptCache();
  var key = 'req_' + Utilities.base64EncodeWebSafe(email.toLowerCase());
  if (cache.get(key)) return { ok: true, sent: true };   // one request a minute
  cache.put(key, '1', 60);

  var mine = rows_().filter(function (r) {
    return String(r.email).toLowerCase() === email.toLowerCase() &&
           String(r.status) !== 'hidden';
  });

  if (mine.length && MailApp.getRemainingDailyQuota() > 2) {
    var lines = mine.map(function (r) {
      return '\u2014 ' + String(r.name) + '  (code ' + String(r.code) + ')\n' + editUrl_(String(r.token));
    }).join('\n\n');
    MailApp.sendEmail({
      to: email,
      name: MAIL_FROM_NAME,
      subject: 'Your message in the book for Hadi',
      body: 'Here ' + (mine.length > 1 ? 'are your messages' : 'is your message') +
            ' in the book for Hadi.\n\nOpen the link below to change or remove what you wrote:\n\n' +
            lines + '\n\nAnyone with this link can edit it, so please keep it to yourself.\n' +
            'You can make changes until 30 August, when the book goes to the printer.\n'
    });
  }
  return { ok: true, sent: true };
}

/** Send the guest their own edit link the moment they write. */
function sendEditLink_(rec, folio) {
  try {
    if (!isEmail_(rec.email)) return;
    if (MailApp.getRemainingDailyQuota() < 3) return;
    MailApp.sendEmail({
      to: rec.email,
      name: MAIL_FROM_NAME,
      subject: 'Thank you \u2014 your message is in the book for Hadi',
      body: 'Thank you for writing in the book for Hadi Mohammadi.\n\n' +
            'Your message is leaf ' + folio + '.\n\n' +
            'If you would like to change or remove it, use this link:\n' +
            editUrl_(rec.token) + '\n\n' +
            'Or email this code to m.behbahani@uu.nl: ' + rec.code + '\n\n' +
            'You can make changes until 30 August, when the book goes to the printer.\n'
    });
  } catch (err) { /* a mail failure must never cost someone their message */ }
}

/**
 * Email Hadi a copy of every leaf the instant it arrives, so an independent
 * copy exists outside the Sheet. Set OWNER_EMAIL in Script Properties to
 * enable; silently skipped if unset or if the daily quota is exhausted.
 */
function notify_(rec, folio) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
    if (!to) return;
    if (MailApp.getRemainingDailyQuota() < 5) return;
    MailApp.sendEmail({
      to: to,
      subject: 'Liber Amicorum — blad ' + folio + ': ' + rec.name,
      body: rec.name + (rec.relation ? ' (' + rec.relation + ')' : '') +
            (rec.city ? ' — ' + rec.city : '') + '\n\n' + rec.body + '\n\n— blad ' + folio
    });
  } catch (err) { /* never let mail failure break a submission */ }
}

/** Run once from the editor to create the sheet + print the header row. */
function setup() {
  sheet_();
  Logger.log('Sheet ready. Remaining mail quota: ' + MailApp.getRemainingDailyQuota());
}
