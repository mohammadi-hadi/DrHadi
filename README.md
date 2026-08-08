<div align="center">

# Liber Amicorum — a book of friends

*A password-gated keepsake site for the PhD defence of Hadi Mohammadi, Academiegebouw Utrecht, Wednesday 9 September 2026.*

</div>

Guests write a message directly on the site and can edit it themselves
afterwards; everything is printed as an A5 book in time for the defence.

The site is static. The messages live in a Google Sheet behind a Google Apps Script web app, so
there is no server to run and nothing that sleeps or expires.

---

## Setup

### 1. The Sheet and the script

1. Create a Google Sheet on a **personal @gmail.com account**, not the @uu.nl one — a Workspace
   admin can block anonymous web apps, and the university account disappears after the PhD.
2. Copy the Sheet ID from its URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`
3. In that Sheet: **Extensions → Apps Script**. Delete the placeholder and paste
   `apps-script/Code.gs`.
4. At the top of the script set `SHEET_ID` and `APP_SECRET` (any long random string). `SITE_URL`
   and `GATE_PASS` are already set and are used to build the links guests get by email.
5. Run the `setup` function once to create the `leaves` tab and authorise the script.

### 2. Deploy

**Deploy → New deployment → Web app**

| | |
|---|---|
| Execute as | **Me** |
| Who has access | **Anyone** |

Authorise it. On the "unverified app" screen choose **Advanced → Go to project (unsafe)** — this is
your own script, and guests never see this screen.

Copy the `/exec` URL that comes back.

> **Shipping changes later:** never use *New deployment* again — it mints a new URL and breaks the
> link that went out to everyone. Always **Deploy → Manage deployments → ✏️ Edit → Version: New
> version → Deploy**.

### 3. Wire up the site

In `assets/app.js` set:

```js
var API = 'https://script.google.com/macros/s/…/exec';
var API_SECRET = '…';   // exactly the same string as APP_SECRET in Code.gs
```

Check it before going further:

```sh
curl -i -L -H 'Origin: https://mohammadi.cv' '<your-exec-url>?k=<your-secret>'
```

Expect `access-control-allow-origin: *` on both hops and a JSON body. Requests must stay CORS
*simple requests* — `POST`, `Content-Type: text/plain`, no custom headers — because Google answers
preflight with 405 before the script runs.

### 4. Optional

In the Apps Script editor, **Project Settings → Script Properties**:

| Property | Effect |
|---|---|
| `OWNER_EMAIL` | Emails a copy of every message the moment it arrives, so a second copy always exists outside the Sheet |
| `FOLDER_ID` | Google Drive folder for photo uploads |

### How guests change what they wrote

Email is required when writing. Three doors, in the order people actually use them:

1. **The link.** On submitting, the guest sees their edit link on screen *and* receives it by email.
2. **Ask for it again.** "Change what you wrote" takes an email address and sends the link **to that
   address only**. It never says whether that address wrote anything — otherwise the form would tell
   strangers who is in the book. Deliberately not "type an email and edit on the spot": email
   addresses are not secrets, and that would let anyone rewrite anyone's message.
3. **The spoken code** (`HADI-12-KOFFIE`), for someone who no longer has that inbox. A paranymph can
   read it down the phone.

Mail sends via `MailApp` — 100 recipients/day on a consumer account, which is ample here. If the
quota is ever exhausted the write path still works and still shows the link on screen; only the
emailed copy is skipped.

---

## The printed book

`Ctrl/Cmd-P` → paper size **A5**, margins **Default**, **Background graphics on**, browser
headers/footers off. `assets/print.css` sets the page size, folios and running heads.

Final typesetting for a press may still want manual touch-up. Give the printer Pantone, not hex:
**116C** yellow, **199C** red.

---

## The Freeze — 31 August 2026

The guestbook closes 30 August. On 31 August:

1. Download the Sheet as JSON/CSV and commit it to this repo along with the photos.
2. Point the site at the static export instead of the API.

From then on the site never calls Google again, and the export — not the Sheet — is the archive
that outlives every service involved.

---

## Notes

- The password is a **courtesy, not security**. Anyone who is sent the link can read the book.
  Nothing here should be private, and no addresses or telephone numbers are collected.
- The Utrecht University logo is deliberately **not** used. University policy permits students and
  staff to name the university on a personal page in text form but not to use the logo. The identity
  here is built from the palette, the typefaces and the building.
- Senaatszaal photograph: Dick Boetekees / Utrecht University.

---

## How it works

Three pieces, and only the middle one can touch your data.

```
  A guest's browser                Google Apps Script              Google Sheet
  mohammadi.cv/DrHadi/     ──►     the /exec web app        ──►    tab "leaves"
  (static HTML/CSS/JS)     ◄──     runs as YOUR account     ◄──    one row per message
     GitHub Pages                  checks the secret,
                                   guards against spam,
                                   sends the emails
```

**The page is dumb on purpose.** GitHub Pages can only serve files — it cannot store anything. So
the page ships with no messages in it at all; it asks for them after it loads. That is why viewing
the page source shows you nothing.

**Writing.** The browser POSTs `{k: secret, action: "create", name, body, email, elapsed}`. The
script checks the secret, rejects submissions faster than 4 seconds or with the honeypot filled,
appends a row, and answers with the leaf number, a private `token` and a spoken `code`. It then
emails the guest their edit link, and emails you a copy of the message.

**Reading.** The browser POSTs `{action: "list"}`. The script walks the rows, skips any marked
`hidden`, numbers the rest 1..n, and returns them **without** the token, email or code columns.
Those three never leave the server.

**Editing.** The link `?t=<token>` looks the row up *by token*, never by position. Saving appends
the previous text to the `revisions` column, so nothing written is ever truly overwritten.
"Remove" only sets `status` to `hidden` — the row stays in the sheet.

**One quirk worth knowing.** Requests must stay CORS "simple requests": `POST`, `Content-Type:
text/plain`, no custom headers. Google answers a CORS preflight with `405` before the script ever
runs, so a normal `application/json` POST would fail. The secret travels in the body for the same
reason.

---

## How to test it

### The five-minute check, by hand

1. **Open** `https://mohammadi.cv/DrHadi/` — you should get the password card, and the book should
   not be visible behind it.
2. **Enter** `drhadi123` (capitals are ignored). The book opens.
3. **Write a message.** Take more than 4 seconds over it. You should land on the cream "Ex libris"
   page with a leaf number, an edit link and a code like `HADI-3-KOFFIE`.
4. **Check your inbox** — a "Thank you" email with that link, plus an owner copy of the message.
5. **Open the edit link in a different browser** (or a private window). The form should open
   pre-filled. Change something, save, and confirm the book shows the new text.
6. **Remove it** with "Remove my leaf" so the book is clean again.

If all six work, the whole system works.

### Testing from the command line

Reading can be checked with `curl`:

```sh
curl -s -L "<EXEC_URL>?k=<SECRET>"          # the whole book as JSON
curl -s -L "<EXEC_URL>?k=wrong"             # should answer {"ok":false,"error":"auth"}
```

**Writing cannot be tested with `curl`.** Google answers a POST with a 302 to a different host,
and `curl -L` turns the follow-up into a GET — so the write happens but you get an error page back,
and `--post302` does not help because the redirect target refuses POST. Test writes from a browser
console on the live page instead:

```js
const API = '<EXEC_URL>', K = '<SECRET>';
const call = p => fetch(API, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(Object.assign({ k: K }, p))
}).then(r => r.json());

await call({ action: 'list' });
```

### If something looks wrong

| Symptom | Cause |
|---|---|
| "The book is not open yet" | `API` in `assets/app.js` is still the placeholder |
| "We could not reach the book" | the script is unauthorised, or the deployment was replaced |
| `{"error":"auth"}` | `API_SECRET` and `APP_SECRET` no longer match |
| A message vanished | check the `status` column — it is `hidden`, not deleted |
