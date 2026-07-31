# Liber Amicorum — a book of friends

A password-gated keepsake site for the PhD defence of Hadi Mohammadi, Academiegebouw Utrecht,
Wednesday 9 September 2026. Guests write a message directly on the site and can edit it themselves
afterwards; everything is printed as an A5 book in October.

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
4. At the top of the script set `SHEET_ID` and `APP_SECRET` (any long random string).
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

---

## The printed book

`Ctrl/Cmd-P` → paper size **A5**, margins **Default**, **Background graphics on**, browser
headers/footers off. `assets/print.css` sets the page size, folios and running heads.

Final typesetting for a press may still want manual touch-up. Give the printer Pantone, not hex:
**116C** yellow, **199C** red.

---

## The Freeze — 1 October 2026

The guestbook closes 30 September. On 1 October:

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
