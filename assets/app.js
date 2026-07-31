/* ═══════════════════════════════════════════════════════════════════════
   Liber Amicorum — Hadi Mohammadi, 9 September 2026
   Static front end. Data lives in a Google Sheet behind an Apps Script
   web app. Every request stays a CORS "simple request": POST with
   Content-Type text/plain and no custom headers, because Google answers
   preflight with 405 before the script ever runs.
   ═══════════════════════════════════════════════════════════════════════ */

// ── CONFIG ───────────────────────────────────────────────────────────────
var API = 'PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE';
var API_SECRET = 'PASTE_A_LONG_RANDOM_STRING';   // must match APP_SECRET in Code.gs
var GATE_PASSWORD = 'drhadi123';

var LS_AUTH = 'liber.auth';
var LS_KEYS = 'liber.keys';     // array — a guest often writes for the whole family
var LS_DRAFT = 'liber.draft';

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

var state = { leaves: [], filter: 'all', editing: null, openedAt: 0 };

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

function unlock(animate) {
  try { localStorage.setItem(LS_AUTH, '1'); } catch (e) {}
  var gate = $('#gate');
  var show = function () {
    gate.hidden = true;
    $('#book').hidden = false;
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
    $('#book').hidden = false;
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
      err.textContent = 'That is not the key.';
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
function leafHTML(l) {
  var mine = !!myIds()[l.id];
  var rtl = l.lang === 'fa';
  var meta = [l.relation, l.city].filter(Boolean).join(' · ');
  var date = fmtDate(l.updated || l.created, l.lang);
  return '<article class="leaf" lang="' + esc(l.lang) + '" dir="' + (rtl ? 'rtl' : 'ltr') +
    '" data-lang="' + esc(l.lang) + '" data-id="' + esc(l.id) + '">' +
    '<p class="leaf__folio">' + (rtl ? 'برگ ' : 'leaf ') + fmtFolio(l.folio, l.lang) + '</p>' +
    '<div class="leaf__body">' + esc(l.body) + '</div>' +
    '<p class="leaf__sig"><span class="leaf__name">' + esc(l.name) + '</span>' +
    (meta ? '<br><span class="leaf__meta">' + esc(meta) + '</span>' : '') +
    (date ? '<br><span class="leaf__meta">' + esc(date) + '</span>' : '') +
    '</p>' +
    (mine ? '<button class="leaf__edit" data-edit="' + esc(l.id) + '" type="button">✎ Edit my leaf</button>' : '') +
    '</article>';
}

function render() {
  var box = $('#leaves');
  var list = state.leaves.filter(function (l) {
    return state.filter === 'all' || l.lang === state.filter;
  });

  if (!state.leaves.length) {
    box.innerHTML = '<p class="empty">The book is still empty. Yours would be the first leaf — ' +
      'and being first in a book is worth something.</p>';
    return;
  }
  if (!list.length) {
    box.innerHTML = '<p class="empty">No leaves in that language yet.</p>';
    return;
  }
  box.innerHTML = list.map(leafHTML).join('');
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

function load() {
  callRetry({ action: 'list' }).then(function (r) {
    if (!r || !r.ok) throw new Error('list failed');
    state.leaves = r.leaves || [];
    $('#loading') && ($('#loading').hidden = true);
    $('#filters').hidden = false;
    // The second "write" button only earns its place once there are leaves
    // above it; otherwise it sits inches below the first and reads as a bug.
    $('#tail-cta').hidden = state.leaves.length < 3;
    $('#count').textContent = r.stats.leaves;
    $('#stat-leaves').textContent = r.stats.leaves;
    $('#stat-langs').textContent = r.stats.langs;
    $('#stat-cities').textContent = r.stats.cities;
    render();
    flushQueue();
  }).catch(function () {
    var el = $('#loading');
    if (el) {
      el.className = 'empty';
      el.textContent = 'The book could not be opened just now. Please refresh in a moment — ' +
        'nothing has been lost.';
    }
  });
}

// ── Sheet: write / edit ──────────────────────────────────────────────────
function openSheet(mode) {
  $('#write-form').hidden = mode === 'find';
  $('#find-form').hidden = mode !== 'find';
  $('#exlibris').hidden = true;
  state.openedAt = Date.now();
  var d = $('#sheet');
  if (!d.open) d.showModal();
  setTimeout(function () {
    var f = mode === 'find' ? $('#f-code') : $('#f-name');
    f && f.focus();
  }, 60);
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
    $('#sheet-title').textContent = 'Edit your leaf';
    $('#sheet-intro').textContent = 'Change anything you like. The book has not gone to the printer yet.';
    $('#submit-btn').textContent = 'Save my changes';
    $('#remove-btn').hidden = false;
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
    id: '_', folio: state.leaves.length + 1, lang: lang, body: body,
    name: $('#f-name').value || 'Your name',
    relation: $('#f-relation').value, city: $('#f-city').value,
    created: new Date().toISOString()
  };
  $('#proof-leaf').outerHTML = leafHTML(leaf).replace('class="leaf"', 'class="leaf leaf--proof" id="proof-leaf"');
}

function saveDraft() {
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
function flushQueue() {
  var q;
  try { q = JSON.parse(localStorage.getItem('liber.queue') || '[]'); } catch (e) { return; }
  if (!q.length) return;
  localStorage.setItem('liber.queue', '[]');
  q.forEach(function (p) { call(p).catch(function () { queue(p); }); });
}

function showExLibris(r) {
  var url = location.origin + location.pathname + '?k=' + encodeURIComponent(GATE_PASSWORD) +
            '&t=' + encodeURIComponent(r.token);
  $('#ex-folio').textContent = 'leaf ' + r.folio;
  $('#ex-link').value = url;
  $('#ex-code').textContent = r.code;
  $('#write-form').hidden = true;
  $('#find-form').hidden = true;
  $('#exlibris').hidden = false;
}

function submitWrite(e) {
  e.preventDefault();
  var err = $('#write-error');
  err.hidden = true;

  var body = $('#f-body').value.trim();
  var name = $('#f-name').value.trim();
  if (!body || !name) {
    err.textContent = 'Please fill in your name and a message.'; err.hidden = false; return;
  }

  var payload = {
    name: name,
    relation: $('#f-relation').value.trim(),
    city: $('#f-city').value.trim(),
    body: body,
    email: $('#f-email').value.trim(),
    lang: detectLang(body),
    hp: $('#f-hp').value,
    elapsed: Date.now() - state.openedAt,
    ua: navigator.userAgent
  };

  var btn = $('#submit-btn');
  btn.disabled = true;
  btn.textContent = state.editing ? 'Saving…' : 'Binding in…';

  var req = state.editing
    ? callRetry(Object.assign({ action: 'update', token: state.editing }, payload))
    : callRetry(Object.assign({ action: 'create' }, payload));

  req.then(function (r) {
    btn.disabled = false;
    btn.textContent = state.editing ? 'Save my changes' : 'Bind my leaf in';
    if (!r || !r.ok) {
      err.textContent = r && r.error === 'too fast'
        ? 'Please take a moment longer, then try again.'
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
    btn.textContent = state.editing ? 'Save my changes' : 'Bind my leaf in';
    queue(Object.assign({ action: state.editing ? 'update' : 'create' }, payload));
    err.innerHTML = 'You seem to be offline. <strong>Your message is saved on this device</strong> ' +
      'and will be sent as soon as you reconnect. You can also ' +
      '<a href="mailto:mehran1414@gmail.com?subject=' + encodeURIComponent('Liber Amicorum — my message') +
      '&body=' + encodeURIComponent(body) + '">email it instead</a>.';
    err.hidden = false;
  });
}

function submitFind(e) {
  e.preventDefault();
  var err = $('#find-error');
  err.hidden = true;
  var code = $('#f-code').value.trim().toUpperCase();
  callRetry({ action: 'lookup', code: code }).then(function (r) {
    if (!r || !r.ok) {
      err.textContent = 'That code was not found. Check it, or ask Mehran or Mohammad.';
      err.hidden = false;
      return;
    }
    state.editing = r.token;
    remember(r.token);
    rememberId(r.leaf.id, r.token);
    $('#sheet-title').textContent = 'Edit your leaf';
    $('#sheet-intro').textContent = 'Change anything you like.';
    $('#submit-btn').textContent = 'Save my changes';
    $('#remove-btn').hidden = false;
    fillForm(r.leaf);
    openSheet('write');
  });
}

// ── Wire up ──────────────────────────────────────────────────────────────
function init() {
  document.documentElement.classList.add('enhanced');
  initGate();

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
    if (!confirm('Remove your leaf from the book?')) return;
    callRetry({ action: 'update', token: state.editing, remove: true }).then(function () {
      state.editing = null; $('#sheet').close(); load();
    });
  });

  $('#copy-link').addEventListener('click', function () {
    var i = $('#ex-link'); i.select();
    try { navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand('copy'); }
    this.textContent = 'Copied';
  });

  $('#ex-done').addEventListener('click', function () { $('#sheet').close(); });

  $('#leaves').addEventListener('click', function (e) {
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

  window.addEventListener('online', flushQueue);
}

function newLeaf() {
  state.editing = null;
  $('#sheet-title').textContent = 'Write your leaf';
  $('#sheet-intro').textContent = 'A few lines is plenty — in English, Dutch or Persian. ' +
    'You can come back and change what you wrote at any time.';
  $('#submit-btn').textContent = 'Bind my leaf in';
  $('#remove-btn').hidden = true;
  ['#f-name', '#f-relation', '#f-city', '#f-body', '#f-email'].forEach(function (s) { $(s).value = ''; });
  restoreDraft();
  openSheet('write');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else { init(); }
