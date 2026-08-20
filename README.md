# LoveBloom 🌸

A little web app that gives her a new flower and a new note every day. It's a full
web app (backend + frontend together) that's also installable as a PWA, so she
can add it to her home screen and it opens like a real app.

## What it does

- **A daily card** with a real flower photo (from photos you upload), a sweet
  nickname, and a customized message — rotates to a new combination each day
- **Flower photos** — upload your own photos from the admin page; one rotates
  in each day. If you haven't uploaded any yet, it falls back to a generated
  flower that grows over time, so the app still looks good on day one
- **Nicknames** — a bank of sweet nicknames you can edit; a different one shows
  each day
- **A daily message** — rotates through a bank of ~30 messages automatically, or
  you can write today's specific message from the private admin page
- **Day counter** — "Day 47 of this," counted from whatever start date you set
  (your anniversary, first date, or the day you launch this)
- **A heart-back button** — she can send a little reaction back
- **A mood check-in** — "How are you today, my crush?" with happy/sad/confused
  emoji reactions. You can see her mood history from the admin page
- **A memories section** — you can add photos/notes from the admin page that show
  up in a running list
- **Installable as a PWA** — she adds it to her home screen, no app store needed
- **Optional push notifications** — a daily nudge at whatever hour you set, once
  you've configured push (see below)
- **A private admin page** at `/admin.html`, locked behind a passphrase only you know

## 1. Run it locally first

You'll need [Node.js](https://nodejs.org) 18 or newer installed.

```bash
cd lovebloom
npm install
cp .env.example .env
```

Open `.env` and set at least:
- `START_DATE` — the date to start counting "days" from (`YYYY-MM-DD`)
- `PARTNER_NAME` — her name, used in the greeting
- `ADMIN_SECRET` — a passphrase only you know, to unlock `/admin.html`

Then run it:

```bash
npm start
```

Visit `http://localhost:3000` — that's the app she'll see.
Visit `http://localhost:3000/admin.html` — that's your private page to write
today's message and add memories.

## 2. Write today's message

By default, the app rotates through the messages in `data/messages.json` — feel
free to edit that file with your own lines (there are ~30 to start).

For a specific day's message, use `/admin.html`, enter your passphrase, and
write the message for that date. It overrides the rotating default for that day
only.

## 3. Add flower photos and nicknames

From `/admin.html`:
- **Flower photo bank**: upload real flower photos with an optional caption.
  Once you've added a few, they start rotating in as the daily card's photo
  instead of the generated flower.
- **Nicknames**: add/remove sweet nicknames — a different one shows on the
  card each day, rotating through the list the same way messages do.
- **Mood history**: see how she's answered the daily "how are you today, my
  crush?" check-in over time.

## 4. Deploy it somewhere she can reach

The easiest options, in order of simplicity:

**Render / Railway (recommended, free tier available)**
1. Push this folder to a GitHub repo (private repo is fine — see `.gitignore`,
   it already excludes your `.env` and personal data)
2. Create a new Web Service on [Render](https://render.com) or
   [Railway](https://railway.app), connect the repo
3. Build command: `npm install` — Start command: `npm start`
4. Add your `.env` values as environment variables in their dashboard
5. Once deployed you'll get a URL like `https://lovebloom.onrender.com` — that's
   the link you send her, once

**Your own VPS**
- Clone the repo, `npm install`, set up `.env`, run with a process manager like
  `pm2` (`pm2 start server.js --name lovebloom`) behind nginx with HTTPS
  (needed for push notifications and installability)

> **Note:** PWA installability and push notifications require HTTPS. Free hosts
> like Render/Railway give you HTTPS automatically. `localhost` also works for
> testing without HTTPS.

## 5. Have her install it

Send her the link once. On her phone:
- **iPhone (Safari):** open the link → Share button → "Add to Home Screen"
- **Android (Chrome):** open the link → she'll likely get an "Add to Home
  Screen" prompt automatically (the app also shows a banner for this)

After that, it's just an icon on her home screen — no daily link needed.

## 6. (Optional) Turn on push notifications

Without this, she just opens the app when she wants to check it — the flower
and message are already there waiting, no notification needed. If you want an
actual phone notification each day:

1. Generate a key pair:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Put the public/private keys into your `.env` (`VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`) and a contact email in `VAPID_CONTACT_EMAIL`
3. Set `DAILY_NOTIFY_HOUR` to the hour (server time, 0–23) you want the push sent
4. Redeploy. The first time she opens the app and taps the heart button,
   she'll be asked for notification permission — once she allows it, she'll
   get a push at that hour every day the server is running
5. You can test it manually anytime from `/admin.html` → "Send now"

## Project structure

```
lovebloom/
├── server.js           # Express server + all API routes
├── store.js             # simple JSON-file data storage (no database needed)
├── data/
│   └── messages.json    # the default rotating message bank — edit freely
├── public/
│   ├── index.html        # what she sees
│   ├── admin.html        # your private page (passphrase-protected)
│   ├── app.js             # frontend logic + the generative flower
│   ├── styles.css
│   ├── manifest.json      # PWA config
│   ├── service-worker.js  # offline support + push handling
│   └── icons/
└── .env.example          # copy to .env and fill in
```

## Notes

- Data (custom messages, memories, reactions, push subscriptions) is stored as
  plain JSON files in `data/`. That's plenty for a two-person app — no database
  needed. If you redeploy to a host with an ephemeral filesystem (some free
  tiers wipe disk on redeploy), consider a host with a persistent disk, or ask
  me to switch storage to something like SQLite on a volume.
- Everything runs from one server — no separate API to host.
