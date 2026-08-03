/* ═══════════════════════════════════════════════════════════════════════
   Liber Amicorum — Hadi Mohammadi, 9 September 2026
   Static front end. Data lives in a Google Sheet behind an Apps Script
   web app. Every request stays a CORS "simple request": POST with
   Content-Type text/plain and no custom headers, because Google answers
   preflight with 405 before the script ever runs.
   ═══════════════════════════════════════════════════════════════════════ */

// ── CONFIG ───────────────────────────────────────────────────────────────
var API = 'https://script.google.com/macros/s/AKfycbxn006w5LtuL_mr9JubTE3UX6Ty11y2afVECW5oY-zFMD_wxfmI_n02r6yph5UUQfjHsg/exec';
var CONFIGURED = API.indexOf('script.google.com') === 0 || /^https?:/.test(API);
var API_SECRET = 'ucgmiGcSkoHtLc3hJDWK8C_bD0YoVtb2m8jsaMMr6K4';   // must match APP_SECRET in Code.gs
var GATE_PASSWORD = 'drhadi123';

var LS_AUTH = 'liber.auth';
var LS_KEYS = 'liber.keys';     // array — a guest often writes for the whole family
var LS_DRAFT = 'liber.draft';
var LS_CACHE = 'liber.book';    // last good copy, so a return visit opens instantly

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

var state = { leaves: [], filter: 'all', editing: null, editFolio: null, openedAt: 0 };
var trapTyped = false;   // browser autofill must not count as a bot

// ── API ──────────────────────────────────────────────────────────────────
function call(payload) {
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request → no preflight
    body: JSON.stringify(Object.assign({ k: API_SECRET }, payload)),
    redirect: 'follow'
  }).then(function (r) { return r.json(); });
}

/** One automatic retry — a guest's words must survive a network blip. */
function callRetry(payload) {
  return call(payload).catch(function () {
    return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return call(payload); });
  });
}

/**
 * Reading the book only. Apps Script wakes cold and has been seen to take
 * fifteen seconds, and to answer a stray request with a 404 HTML page that
 * makes r.json() throw. Neither is worth showing a guest, so try three times.
 * A real answer from the server ({ok:false}) is never retried — that is a
 * configuration fault, not a blip, and repeating it only wastes the wait.
 */
function readRetry(payload) {
  var attempt = function (n) {
    return call(payload).then(function (r) {
      if (!r || !r.ok) { var e = new Error((r && r.error) || 'list failed'); e.server = true; throw e; }
      return r;
    }).catch(function (err) {
      if (err.server || n >= 3) throw err;
      return new Promise(function (res) { setTimeout(res, n === 1 ? 1200 : 3000); })
        .then(function () { return attempt(n + 1); });
    });
  };
  return attempt(1);
}

// ── The last good copy of the book ───────────────────────────────────────
function cacheGet() {
  try { return JSON.parse(localStorage.getItem(LS_CACHE) || 'null'); } catch (e) { return null; }
}
function cacheSet(r) {
  try { localStorage.setItem(LS_CACHE, JSON.stringify({ leaves: r.leaves, stats: r.stats })); }
  catch (e) { /* private mode, or full — the book still works, it just waits */ }
}

// ── Language ─────────────────────────────────────────────────────────────
var RE_FA = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
var RE_NL = /\b(de|het|een|jij|wij|voor|met|niet|ook|heel|veel|jouw|gefeliciteerd|proficiat|succes)\b/i;

function detectLang(s) {
  if (RE_FA.test(s)) return 'fa';
  if (RE_NL.test(s)) return 'nl';
  return 'en';
}

function fmtFolio(n, lang) {
  try { return new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en').format(n); }
  catch (e) { return String(n); }
}

function fmtDate(iso, lang) {
  if (!iso) return '';
  try {
    var loc = lang === 'fa' ? 'fa-IR-u-ca-persian' : lang === 'nl' ? 'nl-NL' : 'en-GB';
    return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(iso));
  } catch (e) { return ''; }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Gate ─────────────────────────────────────────────────────────────────
/** Case-insensitive on purpose — a capital letter must never lock anyone out. */
function matchPass(v) {
  return String(v == null ? '' : v).trim().toLowerCase() === GATE_PASSWORD;
}

function openBook() { $('#book').removeAttribute('data-gated'); }

function unlock(animate) {
  try { localStorage.setItem(LS_AUTH, '1'); } catch (e) {}
  var gate = $('#gate');
  var show = function () {
    gate.hidden = true;
    openBook();
    load();
    handleDeepLink();
  };
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gate.classList.add('is-open');
    setTimeout(show, 480);
  } else { show(); }
}

function initGate() {
  var params = new URLSearchParams(location.search);
  var authed = false;
  try { authed = localStorage.getItem(LS_AUTH) === '1'; } catch (e) {}

  if (matchPass(params.get('k')) || authed) {
    $('#gate').hidden = true;
    openBook();
    load();
    handleDeepLink();
    try { localStorage.setItem(LS_AUTH, '1'); } catch (e) {}
    return;
  }

  $('#gate').hidden = false;
  $('#gate-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#gate-pass').value.trim();
    if (matchPass(v)) {
      unlock(true);
    } else {
      var err = $('#gate-error');
      err.innerHTML = 'That password is not right. It is in the email that brought you here \u2014 ' +
        'or ask <a href="mailto:m.behbahani@uu.nl?subject=Password%20for%20the%20book">Mohammad</a>.';
      err.hidden = false;
      $('#gate-pass').value = '';
      $('#gate-pass').focus();
    }
  });
}

/** ?p=<id>&k=<token> opens that leaf for editing, then scrubs the address bar. */
function handleDeepLink() {
  var p = new URLSearchParams(location.search);
  var token = p.get('t');
  if (token) {
    remember(token);
    openEditByToken(token);
  }
  if (p.get('t') || p.get('k')) {
    history.replaceState(null, '', location.pathname);
  }
}

// ── Local key store ──────────────────────────────────────────────────────
function keys() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS) || '[]'); } catch (e) { return []; }
}
function remember(token) {
  try {
    var k = keys();
    if (k.indexOf(token) < 0) { k.push(token); localStorage.setItem(LS_KEYS, JSON.stringify(k)); }
  } catch (e) {}
}
function myIds() {
  try { return JSON.parse(localStorage.getItem('liber.ids') || '{}'); } catch (e) { return {}; }
}
function rememberId(id, token) {
  try { var m = myIds(); m[id] = token; localStorage.setItem('liber.ids', JSON.stringify(m)); } catch (e) {}
}

// ── Render ───────────────────────────────────────────────────────────────
/** A photograph is stored as a Drive file id (or a full URL) in the sheet's
 *  photos column, so pictures can be attached to a message by hand without
 *  the site needing any access to Drive. */
function photoSrc(idOrUrl, width) {
  var v = String(idOrUrl).trim();
  if (/^https?:/.test(v)) return v;
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(v) + '&sz=w' + width;
}

function photosHTML(l) {
  if (!l.photos || !l.photos.length) return '';
  return '<div class="leaf__photos">' + l.photos.map(function (p) {
    return '<img src="' + esc(photoSrc(p, 1200)) + '" loading="lazy" decoding="async" alt="">';
  }).join('') + '</div>';
}

function leafHTML(l) {
  var mine = !!myIds()[l.id];
  var rtl = l.lang === 'fa';
  var meta = [l.relation, l.city].filter(Boolean).join(' · ');
  var date = fmtDate(l.updated || l.created, l.lang);
  return '<article class="leaf" lang="' + esc(l.lang) + '" dir="' + (rtl ? 'rtl' : 'ltr') +
    '" data-lang="' + esc(l.lang) + '" data-id="' + esc(l.id) + '">' +
    '<p class="leaf__folio">' + (rtl ? 'صفحه ' : 'page ') + fmtFolio(l.folio, l.lang) + '</p>' +
    '<div class="leaf__body">' + esc(l.body) + '</div>' +
    photosHTML(l) +
    '<p class="leaf__sig"><span class="leaf__name">' + esc(l.name) + '</span>' +
    (meta ? '<br><span class="leaf__meta">' + esc(meta) + '</span>' : '') +
    (date ? '<br><span class="leaf__meta">' + esc(date) + '</span>' : '') +
    '</p>' +
    (mine ? '<button class="leaf__edit" data-edit="' + esc(l.id) + '" type="button">✎ Edit my message</button>' : '') +
    '</article>';
}

function render() {
  var box = $('#leaves');
  var list = state.leaves.filter(function (l) {
    return state.filter === 'all' || l.lang === state.filter;
  });

  if (!state.leaves.length) {
    box.innerHTML = '<p class="empty">Nobody has written yet. Yours would be the first message — ' +
      'and being first in a book is worth something.</p>';
    return;
  }
  if (!list.length) {
    box.innerHTML = '<p class="empty">No leaves in that language yet.</p>';
    return;
  }
  box.innerHTML = list.map(leafHTML).join('');
  var where = { all: '', en: ' in English', nl: ' in Dutch', fa: ' in Persian' }[state.filter] || '';
  var st = $('#leaves-status');
  if (st) {
    st.textContent = list.length + (list.length === 1 ? ' message' : ' messages') + where + '.' +
      // Say so, or someone who has just edited their words will think the
      // change was lost when the saved copy shows the old text for a moment.
      (state.stale ? ' Saved copy — checking for newer ones…' : '');
  }
  observe();
}

var io;
function observe() {
  if (!('IntersectionObserver' in window)) {
    $$('.leaf').forEach(function (n) { n.classList.add('is-in'); });
    return;
  }
  if (io) io.disconnect();
  io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('#leaves .leaf').forEach(function (n) { io.observe(n); });
}

/** Paint a list — from the cache first, then again from the server. */
function applyList(r, stale) {
  state.leaves = r.leaves || [];
  state.stale = !!stale;
  // The second "write" button only earns its place once there are leaves
  // above it; otherwise it sits inches below the first and reads as a bug.
  $('#tail-cta').hidden = false;          // the ask must always be reachable
  $('#filters').hidden = state.leaves.length < 4;
  $('#count').textContent = r.stats.leaves;
  $('#stat-leaves').textContent = r.stats.leaves;
  $('#stat-langs').textContent = r.stats.langs;
  $('#stat-cities').textContent = r.stats.cities;
  $('#w-leaves').textContent = r.stats.leaves === 1 ? 'message' : 'messages';
  $('#w-langs').textContent = r.stats.langs === 1 ? 'language' : 'languages';
  $('#w-cities').textContent = r.stats.cities === 1 ? 'city' : 'cities';
  render();
}

/**
 * Google can take fifteen seconds to answer. A page that says nothing for
 * fifteen seconds reads as broken, and people leave — so say what is
 * happening, and offer a way out.
 */
function waitingCopy() {
  var t1 = setTimeout(function () {
    var el = $('#loading');
    if (el) el.textContent = 'Still opening — this can take up to fifteen seconds.';
  }, 4000);
  var t2 = setTimeout(function () {
    var el = $('#loading');
    if (el) {
      el.innerHTML = 'This is slower than it should be. ' +
        '<button class="btn btn--quiet" type="button" id="retry-load">Try again</button>';
    }
  }, 14000);
  return function () { clearTimeout(t1); clearTimeout(t2); };
}

var loading = false, loadAgain = false;

function load() {
  // A guest who writes while the book is still opening must still see their
  // own leaf, so a second call is remembered rather than thrown away.
  if (loading) { loadAgain = true; return; }
  loading = true;

  var cached = cacheGet();
  if (cached && cached.leaves && cached.leaves.length) applyList(cached, true);

  var el = $('#loading');
  if (el) el.textContent = 'Opening the book…';
  var done = waitingCopy();

  readRetry({ action: 'list' }).then(function (r) {
    done();
    loading = false;
    cacheSet(r);
    applyList(r, false);
    flushQueue();
    if (loadAgain) { loadAgain = false; load(); }
  }).catch(function () {
    done();
    loading = false;
    if (loadAgain) { loadAgain = false; load(); return; }
    if (state.leaves.length) {          // the cached book is on screen; keep it
      var st = $('#leaves-status');
      if (st) st.textContent = 'Showing the copy saved on this device. Refresh for the latest.';
      return;
    }
    var box = $('#loading');
    if (box) {
      box.className = 'empty';
      box.innerHTML = CONFIGURED
        ? 'The book could not be opened just now. Nothing has been lost. ' +
          '<button class="btn btn--quiet" type="button" id="retry-load">Try again</button>'
        : 'The book is not open yet. It will be ready shortly.';
    }
  });
}

// ── Sheet: write / edit ──────────────────────────────────────────────────
function openSheet(mode) {
  $('#write-form').hidden = mode === 'find';
  $('#find-form').hidden = mode !== 'find';
  $('#exlibris').hidden = true;
  $('#sent').hidden = true;
  state.openedAt = Date.now();
  var d = $('#sheet');
  if (!d.open) d.showModal();
  setTimeout(function () {
    var f = mode === 'find' ? $('#f-find-email') : $('#f-body');
    f && f.focus();
  }, 60);
}

/** Editing needs no email: the row already has one, and update_ never
 *  touches it. Leaving the field `required` made the browser silently
 *  refuse to submit — no error, no save. */
function setMode(isEdit, leaf) {
  var email = $('#f-email');
  email.required = !isEdit;
  $('#email-field').hidden = isEdit;
  $('#sheet-title').textContent = isEdit ? 'Change what you wrote' : 'Write your message';
  $('#sheet-intro').textContent = isEdit
    ? 'Change anything you like, until 30 August.'
    : 'A few lines is plenty — in English, Dutch or Persian. ' +
      'You can come back and change it until 30 August.';
  $('#submit-btn').textContent = isEdit ? 'Save my changes' : 'Send my message';
  $('#remove-btn').hidden = !isEdit;
  var known = leaf && state.leaves.filter(function (l) { return l.id === leaf.id; })[0];
  state.editFolio = known ? known.folio : null;
}

function fillForm(leaf) {
  $('#f-name').value = leaf.name || '';
  $('#f-relation').value = leaf.relation || '';
  $('#f-city').value = leaf.city || '';
  $('#f-body').value = leaf.body || '';
  updateProof();
}

function openEditByToken(token) {
  callRetry({ action: 'lookup', token: token }).then(function (r) {
    if (!r || !r.ok) return;
    state.editing = token;
    rememberId(r.leaf.id, token);
    setMode(true, r.leaf);
    fillForm(r.leaf);
    openSheet('write');
  });
}

function updateProof() {
  var body = $('#f-body').value;
  var box = $('#proof');
  if (!body.trim()) { box.hidden = true; return; }
  box.hidden = false;
  var lang = detectLang(body);
  var leaf = {
    id: '_', folio: state.editFolio || state.leaves.length + 1, lang: lang, body: body,
    name: $('#f-name').value || 'Your name',
    relation: $('#f-relation').value, city: $('#f-city').value,
    created: new Date().toISOString()
  };
  $('#proof-leaf').outerHTML = leafHTML(leaf).replace('class="leaf"', 'class="leaf leaf--proof" id="proof-leaf"');
}

function saveDraft() {
  if (state.editing) return;   // only ever keep a draft of an unsent message
  try {
    localStorage.setItem(LS_DRAFT, JSON.stringify({
      name: $('#f-name').value, relation: $('#f-relation').value,
      city: $('#f-city').value, body: $('#f-body').value, email: $('#f-email').value
    }));
  } catch (e) {}
}

function restoreDraft() {
  try {
    var d = JSON.parse(localStorage.getItem(LS_DRAFT) || 'null');
    if (!d || !d.body) return;
    $('#f-name').value = d.name || ''; $('#f-relation').value = d.relation || '';
    $('#f-city').value = d.city || ''; $('#f-body').value = d.body || '';
    $('#f-email').value = d.email || '';
    updateProof();
  } catch (e) {}
}

/** A failed submit is queued, not lost. Retried on reconnect and next load. */
function queue(payload) {
  try {
    var q = JSON.parse(localStorage.getItem('liber.queue') || '[]');
    q.push(payload);
    localStorage.setItem('liber.queue', JSON.stringify(q));
  } catch (e) {}
}
var flushing = false;
function flushQueue() {
  if (flushing) return;
  var q;
  try { q = JSON.parse(localStorage.getItem('liber.queue') || '[]'); } catch (e) { return; }
  if (!q.length) return;
  flushing = true;
  var left = q.slice(), pending = q.length;
  var save = function () {
    try { localStorage.setItem('liber.queue', JSON.stringify(left)); } catch (e) {}
  };
  // Each entry is removed only once the server has confirmed it. Closing the
  // tab mid-flush therefore loses nothing.
  q.forEach(function (p) {
    call(p).then(function (r) {
      if (r && r.ok) { left = left.filter(function (x) { return x !== p; }); save(); }
    }).catch(function () {}).then(function () {
      if (--pending === 0) { flushing = false; load(); }
    });
  });
}

/** Move focus to a panel that has just replaced the form, so a screen reader
 *  announces it and the keyboard does not land nowhere. */
function focusPanel(sel) {
  var h = $(sel);
  if (!h) return;
  h.setAttribute('tabindex', '-1');
  try { h.focus(); } catch (e) {}
  var d = $('#sheet'); if (d) d.scrollTop = 0;
}

function showExLibris(r) {
  var url = location.origin + location.pathname + '?k=' + encodeURIComponent(GATE_PASSWORD) +
            '&t=' + encodeURIComponent(r.token);
  $('#ex-folio').textContent = r.folio;
  $('#ex-link').value = url;
  $('#ex-code').textContent = r.code;
  $('#write-form').hidden = true;
  $('#find-form').hidden = true;
  $('#exlibris').hidden = false;
  focusPanel('#exlibris');
}

function submitWrite(e) {
  e.preventDefault();
  var err = $('#write-error');
  err.hidden = true;

  var body = $('#f-body').value.trim();
  var name = $('#f-name').value.trim();
  var email = $('#f-email').value.trim();
  if (!body || !name) {
    err.textContent = 'Please fill in your name and a message.'; err.hidden = false; return;
  }
  if (!state.editing && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    err.textContent = 'Please add your email, so we can send you a link to change this later.';
    err.hidden = false; $('#f-email').focus(); return;
  }

  var payload = {
    name: name,
    relation: $('#f-relation').value.trim(),
    city: $('#f-city').value.trim(),
    body: body,
    email: email,
    lang: detectLang(body),
    hp: trapTyped ? $('#f-hp').value : '',
    elapsed: Date.now() - state.openedAt,
    ua: navigator.userAgent
  };

  var btn = $('#submit-btn');
  btn.disabled = true;
  btn.textContent = state.editing ? 'Saving…' : 'Sending…';

  var req = state.editing
    ? callRetry(Object.assign({ action: 'update', token: state.editing }, payload))
    : call(Object.assign({ action: 'create' }, payload));   // never retried: it would print them twice

  req.then(function (r) {
    btn.disabled = false;
    btn.textContent = state.editing ? 'Save my changes' : 'Send my message';
    // The server answers a sprung trap with {ok:true, folio:0, token:'x'} and
    // keeps nothing. Never show that as success, and never drop the draft.
    if (r && r.ok && !state.editing && (r.token === 'x' || r.folio === 0)) {
      err.innerHTML = 'Something went wrong at our end. <strong>Your words are still in the box ' +
        'above</strong> — please copy them, or email them to ' +
        '<a href="mailto:m.behbahani@uu.nl?subject=My%20message%20for%20the%20book">' +
        'm.behbahani@uu.nl</a>, so nothing is lost.';
      err.hidden = false;
      return;
    }
    if (!r || !r.ok) {
      err.textContent = r && r.error === 'too fast'
        ? 'Please take a moment longer, then try again.'
        : r && r.error === 'bademail'
        ? 'Please check your email address.'
        : 'That did not save. Your words are still here — please try again.';
      err.hidden = false;
      return;
    }
    try { localStorage.removeItem(LS_DRAFT); } catch (ex) {}
    if (state.editing) {
      state.editing = null;
      $('#sheet').close();
      load();
    } else {
      remember(r.token);
      rememberId(r.id, r.token);
      showExLibris(r);
      load();
    }
  }).catch(function () {
    btn.disabled = false;
    btn.textContent = state.editing ? 'Save my changes' : 'Send my message';
    var mailto = '<a href="mailto:m.behbahani@uu.nl?subject=' +
      encodeURIComponent('The book for Hadi — my message') +
      '&body=' + encodeURIComponent(body) + '">send it by email instead</a>';
    if (!CONFIGURED) {
      // Nothing to queue against — be honest rather than blaming the network.
      err.innerHTML = 'The book is not accepting messages yet. ' +
        '<strong>Nothing you typed has been lost</strong> — it is still on this page. ' +
        'Please try again shortly, or ' + mailto + '.';
    } else {
      queue(Object.assign({ action: state.editing ? 'update' : 'create' }, payload));
      err.innerHTML = (navigator.onLine === false
        ? 'You seem to be offline. '
        : 'We could not reach the book just now. ') +
        '<strong>Your message is saved on this device</strong> and will be sent automatically ' +
        'as soon as we can reach it. You can also ' + mailto + '.';
    }
    err.hidden = false;
  });
}

function submitFind(e) {
  e.preventDefault();
  var err = $('#find-error');
  err.hidden = true;
  var email = $('#f-find-email').value.trim();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    err.textContent = 'Please check that email address.';
    err.hidden = false;
    return;
  }
  var btn = $('#find-btn');
  btn.disabled = true; btn.textContent = 'Sending…';
  callRetry({ action: 'requestEdit', email: email }).then(function (r) {
    btn.disabled = false; btn.textContent = 'Email me my link';
    if (!r || !r.ok) {
      err.textContent = 'That did not work. Please try again in a moment.';
      err.hidden = false;
      return;
    }
    // Always the same answer, whether or not that address wrote anything —
    // otherwise this form tells strangers who is in the book.
    $('#find-form').hidden = true;
    $('#sent').hidden = false;
    focusPanel('#sent');
  }).catch(function () {
    btn.disabled = false; btn.textContent = 'Email me my link';
    err.textContent = 'That did not work. Please try again in a moment.';
    err.hidden = false;
  });
}

/** The offline door: a code that can be read down a phone line. */
function submitCode() {
  var err = $('#find-error');
  err.hidden = true;
  var code = $('#f-code').value.trim().toUpperCase();
  if (!code) { err.textContent = 'Enter your code.'; err.hidden = false; return; }
  callRetry({ action: 'lookup', code: code }).then(function (r) {
    if (!r || !r.ok) {
      err.textContent = 'That code was not found. Check it, or email m.behbahani@uu.nl.';
      err.hidden = false;
      return;
    }
    state.editing = r.token;
    remember(r.token);
    rememberId(r.leaf.id, r.token);
    setMode(true, r.leaf);
    fillForm(r.leaf);
    openSheet('write');
  });
}

// ── Wire up ──────────────────────────────────────────────────────────────
function init() {
  document.documentElement.classList.add('enhanced');
  initGate();

  if (!CONFIGURED) {
    ['#open-write', '#open-write-2', '#open-find'].forEach(function (sel) {
      var b = $(sel);
      if (b) { b.disabled = true; b.title = 'The book is not accepting messages yet.'; }
    });
  }

  $('#open-write').addEventListener('click', function () { newLeaf(); });
  $('#open-write-2').addEventListener('click', function () { newLeaf(); });
  $('#open-find').addEventListener('click', function () { openSheet('find'); });

  $('#write-form').addEventListener('submit', submitWrite);
  $('#find-form').addEventListener('submit', submitFind);

  var deb;
  ['#f-name', '#f-relation', '#f-city', '#f-body', '#f-email'].forEach(function (s) {
    $(s).addEventListener('input', function () {
      clearTimeout(deb);
      deb = setTimeout(function () { updateProof(); saveDraft(); }, 300);
    });
  });

  $('#remove-btn').addEventListener('click', function () {
    if (!state.editing) return;
    if (!confirm('Remove your message from the book? This cannot be undone.')) return;
    var e2 = $('#write-error');
    e2.hidden = true;
    callRetry({ action: 'update', token: state.editing, remove: true }).then(function (r) {
      if (!r || !r.ok) {
        e2.textContent = 'That did not remove. Please try again, or email m.behbahani@uu.nl ' +
          'and it will be taken out by hand.';
        e2.hidden = false; return;
      }
      state.editing = null; $('#sheet').close(); load();
    }).catch(function () {
      e2.textContent = 'We could not reach the book just now. Nothing has changed — ' +
        'please try again in a moment.';
      e2.hidden = false;
    });
  });

  $('#copy-link').addEventListener('click', function () {
    var i = $('#ex-link'); i.select();
    try { navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand('copy'); }
    this.textContent = 'Copied';
  });

  $('#ex-done').addEventListener('click', function () { $('#sheet').close(); });
  $('#sent-done').addEventListener('click', function () { $('#sheet').close(); });
  // leaving the dialog must not leave us stuck in edit mode
  $('#sheet').addEventListener('close', function () { state.editing = null; state.editFolio = null; });
  $('#code-btn').addEventListener('click', submitCode);
  // Enter in the code box must open the message, not send the email form
  $('#f-code').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitCode(); }
  });

  $('#leaves').addEventListener('click', function (e) {
    if (e.target.id === 'retry-load') {
      $('#leaves').innerHTML = '<p class="loading" id="loading">Opening the book…</p>';
      load();
      return;
    }
    var b = e.target.closest('[data-edit]');
    if (!b) return;
    var token = myIds()[b.getAttribute('data-edit')];
    if (token) openEditByToken(token);
  });

  $$('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      $$('.chip').forEach(function (x) { x.classList.remove('is-on'); });
      c.classList.add('is-on');
      state.filter = c.getAttribute('data-lang');
      render();
    });
  });

  $('#f-hp').addEventListener('input', function () { trapTyped = true; });
  window.addEventListener('online', flushQueue);
}

function newLeaf() {
  state.editing = null;
  setMode(false, null);
  ['#f-name', '#f-relation', '#f-city', '#f-body', '#f-email'].forEach(function (s) { $(s).value = ''; });
  restoreDraft();
  openSheet('write');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else { init(); }
