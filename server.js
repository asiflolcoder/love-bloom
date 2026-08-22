require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const webpush = require("web-push");
const cron = require("node-cron");
const store = require("./store");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const START_DATE = process.env.START_DATE || "2026-01-01";
const PARTNER_NAME = process.env.PARTNER_NAME || "love";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

// ---------- Push notifications (optional) ----------
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT_EMAIL || "mailto:example@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

// ---------- Helpers ----------
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dayNumber(dateISO = todayISO()) {
  const start = new Date(START_DATE + "T00:00:00Z");
  const now = new Date(dateISO + "T00:00:00Z");
  const diffMs = now.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(days, 1);
}

// deterministic pseudo-random number in [0,1) from a string seed
function seededRandom(seed) {
  const hash = crypto.createHash("sha256").update(seed).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}

function getMessageForDate(dateISO) {
  const custom = store.getCustomMessages();
  if (custom[dateISO]) {
    return { text: custom[dateISO], custom: true };
  }
  const bank = store.getDefaultMessages();
  const day = dayNumber(dateISO);
  const index = day % bank.length;
  return { text: bank[index] || "Thinking of you today.", custom: false };
}

// Flower "genome" derived from the day, used by the frontend to draw
// a slightly different, deterministic flower each day.
function getFlowerGenome(dateISO) {
  const day = dayNumber(dateISO);
  const growthStage = Math.min(day, 21); // grows for the first 21 days, then stays in full bloom
  const r1 = seededRandom(dateISO + "-hue");
  const r2 = seededRandom(dateISO + "-petals");
  const r3 = seededRandom(dateISO + "-rotate");
  return {
    day,
    growthStage,
    petalCount: 8 + Math.floor(r2 * 5), // 8-12 petals
    hueShift: Math.floor(r1 * 40) - 20, // -20..20 degrees around the base rose hue
    rotation: Math.floor(r3 * 360),
  };
}

// Pick today's nickname deterministically from the bank (same nickname all day)
function getNicknameForDate(dateISO) {
  const bank = store.getDefaultNicknames();
  if (!bank.length) return PARTNER_NAME;
  const day = dayNumber(dateISO);
  return bank[day % bank.length];
}

// Deterministic seeded shuffle (mulberry32) — same seed always produces the same order
function seededShuffle(array, seed) {
  const arr = array.slice();
  let s = seed >>> 0;
  function rand() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pick today's flower photo from uploaded photos, if any.
// Cycles through every photo once (in a shuffled, non-repeating order) before
// starting a new cycle, and avoids repeating the same photo back-to-back
// across cycle boundaries — so even with just 2-3 photos it never feels stuck.
// Returns null if no photos have been uploaded yet (frontend falls back to the generative flower).
function getFlowerPhotoForDate(dateISO) {
  const photos = store.getFlowerPhotos();
  const n = photos.length;
  if (n === 0) return null;
  if (n === 1) return photos[0];

  const day = dayNumber(dateISO); // 1-indexed

  // With exactly 2 photos there are only 2 possible orderings, so a shuffle
  // can't do better than simple alternation — and alternation guarantees
  // zero back-to-back repeats, which a "random" 2-item shuffle can't promise.
  if (n === 2) return photos[(day - 1) % 2];

  const cycleIndex = Math.floor((day - 1) / n);
  const position = (day - 1) % n;

  const order = seededShuffle(photos, cycleIndex + 1);

  // Decide (independent of which position is being requested) whether this
  // cycle's shuffle happens to start with the same photo that closed out the
  // previous cycle, and fix it — so every day in this cycle sees a consistent,
  // already-corrected order, not just whichever day triggered the check.
  if (cycleIndex > 0) {
    const prevOrder = seededShuffle(photos, cycleIndex);
    if (order[0].id === prevOrder[n - 1].id) {
      const swapWith = n > 1 ? 1 : 0;
      [order[0], order[swapWith]] = [order[swapWith], order[0]];
    }
  }

  return order[position];
}

const MOOD_OPTIONS = ["happy", "sad", "confused"];

function requireAdmin(req, res, next) {
  const secret = req.headers["x-admin-secret"] || req.query.secret;
  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: "Server has no ADMIN_SECRET configured." });
  }
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Incorrect passphrase." });
  }
  next();
}

// ---------- API routes ----------

// Today's card: photo + message + nickname + flower genome + streak info
app.get("/api/today", (req, res) => {
  const dateISO = todayISO();
  const { text, custom } = getMessageForDate(dateISO);
  const genome = getFlowerGenome(dateISO);
  const reactions = store.getReactions();
  const moods = store.getMoods();
  const photo = getFlowerPhotoForDate(dateISO);
  res.json({
    date: dateISO,
    day: genome.day,
    partnerName: PARTNER_NAME,
    nickname: getNicknameForDate(dateISO),
    message: text,
    isCustomMessage: custom,
    flower: genome,
    flowerPhoto: photo ? { imageDataUrl: photo.imageDataUrl, caption: photo.caption || "" } : null,
    reaction: reactions[dateISO] || null,
    mood: moods[dateISO]?.mood || null,
  });
});

// React to today's bouquet (e.g. a heart tap)
app.post("/api/react", (req, res) => {
  const { reaction } = req.body || {};
  if (!reaction || typeof reaction !== "string") {
    return res.status(400).json({ error: "Missing reaction." });
  }
  const dateISO = todayISO();
  const reactions = store.setReaction(dateISO, reaction);
  res.json({ date: dateISO, reaction: reactions[dateISO] });
});

// Mood check-in: "how are you today, my crush?"
app.post("/api/mood", (req, res) => {
  const { mood } = req.body || {};
  if (!MOOD_OPTIONS.includes(mood)) {
    return res.status(400).json({ error: `Mood must be one of: ${MOOD_OPTIONS.join(", ")}` });
  }
  const dateISO = todayISO();
  const moods = store.setMood(dateISO, mood);
  res.json({ date: dateISO, mood: moods[dateISO].mood });
});

// Memories: shared photos/notes that surface over time
app.get("/api/memories", (req, res) => {
  res.json(store.getMemories());
});

app.post("/api/memories", requireAdmin, (req, res) => {
  const { title, note, imageDataUrl } = req.body || {};
  if (!title && !note) {
    return res.status(400).json({ error: "Add a title or a note." });
  }
  const memory = {
    id: crypto.randomUUID(),
    title: title || "",
    note: note || "",
    imageDataUrl: imageDataUrl || null,
    createdAt: new Date().toISOString(),
  };
  const memories = store.addMemory(memory);
  res.status(201).json(memories);
});

app.delete("/api/memories/:id", requireAdmin, (req, res) => {
  const memories = store.deleteMemory(req.params.id);
  res.json(memories);
});

// Admin: set/override today's (or any date's) message
app.post("/api/admin/message", requireAdmin, (req, res) => {
  const { date, text } = req.body || {};
  const dateISO = date || todayISO();
  if (!text) return res.status(400).json({ error: "Missing message text." });
  store.setCustomMessage(dateISO, text);
  res.json({ date: dateISO, text });
});

app.get("/api/admin/messages", requireAdmin, (req, res) => {
  res.json({
    custom: store.getCustomMessages(),
    bank: store.getDefaultMessages(),
  });
});

app.post("/api/admin/verify", requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// Flower photo bank
app.get("/api/admin/flowers", requireAdmin, (req, res) => {
  res.json(store.getFlowerPhotos());
});

app.post("/api/admin/flowers", requireAdmin, (req, res) => {
  const { imageDataUrl, caption } = req.body || {};
  if (!imageDataUrl) return res.status(400).json({ error: "Missing photo." });
  const photo = {
    id: crypto.randomUUID(),
    imageDataUrl,
    caption: caption || "",
    createdAt: new Date().toISOString(),
  };
  const photos = store.addFlowerPhoto(photo);
  res.status(201).json(photos);
});

app.delete("/api/admin/flowers/:id", requireAdmin, (req, res) => {
  const photos = store.deleteFlowerPhoto(req.params.id);
  res.json(photos);
});

// Nickname bank
app.get("/api/admin/nicknames", requireAdmin, (req, res) => {
  res.json(store.getDefaultNicknames());
});

app.post("/api/admin/nicknames", requireAdmin, (req, res) => {
  const { nickname } = req.body || {};
  if (!nickname || !nickname.trim()) return res.status(400).json({ error: "Missing nickname." });
  const nicknames = store.addNickname(nickname.trim());
  res.status(201).json(nicknames);
});

app.delete("/api/admin/nicknames/:nickname", requireAdmin, (req, res) => {
  const nicknames = store.deleteNickname(decodeURIComponent(req.params.nickname));
  res.json(nicknames);
});

// Mood history — see how she's been feeling day to day
app.get("/api/admin/moods", requireAdmin, (req, res) => {
  res.json(store.getMoods());
});

// Push notifications
app.get("/api/push/public-key", (req, res) => {
  res.json({ enabled: pushEnabled, publicKey: VAPID_PUBLIC_KEY });
});

app.post("/api/push/subscribe", (req, res) => {
  if (!pushEnabled) return res.status(400).json({ error: "Push not configured on server." });
  const subscription = req.body;
  store.addPushSubscription(subscription);
  res.status(201).json({ ok: true });
});

app.post("/api/push/unsubscribe", (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) store.removePushSubscription(endpoint);
  res.json({ ok: true });
});

async function sendDailyPush() {
  if (!pushEnabled) return;
  const dateISO = todayISO();
  const { text } = getMessageForDate(dateISO);
  const genome = getFlowerGenome(dateISO);
  const payload = JSON.stringify({
    title: `Day ${genome.day} 🌸`,
    body: text,
    url: "/",
  });
  const subs = store.getPushSubscriptions();
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        store.removePushSubscription(sub.endpoint);
      } else {
        console.error("Push failed:", err.message);
      }
    }
  }
}

// Manual trigger, useful for testing (protected by admin secret)
app.post("/api/admin/send-daily-push", requireAdmin, async (req, res) => {
  await sendDailyPush();
  res.json({ ok: true, sent: pushEnabled });
});

// Scheduled daily push at DAILY_NOTIFY_HOUR (server local time)
const notifyHour = parseInt(process.env.DAILY_NOTIFY_HOUR || "9", 10);
if (pushEnabled) {
  cron.schedule(`0 ${notifyHour} * * *`, () => {
    sendDailyPush().catch((e) => console.error(e));
  });
}

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`LoveBloom running at http://localhost:${PORT}`);
  if (!ADMIN_SECRET) {
    console.warn("WARNING: ADMIN_SECRET is not set in .env — set one before deploying.");
  }
  if (!pushEnabled) {
    console.log("Push notifications are OFF. Set VAPID keys in .env to enable them.");
  }
});
