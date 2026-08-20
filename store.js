// Tiny file-based data store. No database needed for a project this size.
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

function ensureFile(file, initial) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, JSON.stringify(initial, null, 2));
  }
  return full;
}

function readJSON(file, fallback) {
  const full = ensureFile(file, fallback);
  try {
    return JSON.parse(fs.readFileSync(full, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  const full = path.join(DATA_DIR, file);
  fs.writeFileSync(full, JSON.stringify(data, null, 2));
}

module.exports = {
  // messages.json already exists with the default rotating bank
  getDefaultMessages: () => readJSON("messages.json", []),

  // custom-messages.json: { "2026-08-08": "message text", ... }
  getCustomMessages: () => readJSON("custom-messages.json", {}),
  setCustomMessage: (dateISO, text) => {
    const msgs = readJSON("custom-messages.json", {});
    msgs[dateISO] = text;
    writeJSON("custom-messages.json", msgs);
    return msgs;
  },

  // memories.json: [{ id, title, note, dateISO, createdAt }]
  getMemories: () => readJSON("memories.json", []),
  addMemory: (memory) => {
    const memories = readJSON("memories.json", []);
    memories.unshift(memory);
    writeJSON("memories.json", memories);
    return memories;
  },
  deleteMemory: (id) => {
    let memories = readJSON("memories.json", []);
    memories = memories.filter((m) => m.id !== id);
    writeJSON("memories.json", memories);
    return memories;
  },

  // reactions.json: { "2026-08-08": "heart" }
  getReactions: () => readJSON("reactions.json", {}),
  setReaction: (dateISO, reaction) => {
    const reactions = readJSON("reactions.json", {});
    reactions[dateISO] = reaction;
    writeJSON("reactions.json", reactions);
    return reactions;
  },

  // push-subscriptions.json: [subscription, ...]
  getPushSubscriptions: () => readJSON("push-subscriptions.json", []),
  addPushSubscription: (sub) => {
    const subs = readJSON("push-subscriptions.json", []);
    const exists = subs.some((s) => s.endpoint === sub.endpoint);
    if (!exists) subs.push(sub);
    writeJSON("push-subscriptions.json", subs);
    return subs;
  },
  removePushSubscription: (endpoint) => {
    let subs = readJSON("push-subscriptions.json", []);
    subs = subs.filter((s) => s.endpoint !== endpoint);
    writeJSON("push-subscriptions.json", subs);
    return subs;
  },

  // flowers.json: [{ id, imageDataUrl, caption, createdAt }]
  getFlowerPhotos: () => readJSON("flowers.json", []),
  addFlowerPhoto: (photo) => {
    const photos = readJSON("flowers.json", []);
    photos.push(photo);
    writeJSON("flowers.json", photos);
    return photos;
  },
  deleteFlowerPhoto: (id) => {
    let photos = readJSON("flowers.json", []);
    photos = photos.filter((p) => p.id !== id);
    writeJSON("flowers.json", photos);
    return photos;
  },

  // nicknames.json already exists with a default bank; custom-nicknames.json can override a specific date
  getDefaultNicknames: () => readJSON("nicknames.json", []),
  addNickname: (nickname) => {
    const nicknames = readJSON("nicknames.json", []);
    nicknames.push(nickname);
    writeJSON("nicknames.json", nicknames);
    return nicknames;
  },
  deleteNickname: (nickname) => {
    let nicknames = readJSON("nicknames.json", []);
    nicknames = nicknames.filter((n) => n !== nickname);
    writeJSON("nicknames.json", nicknames);
    return nicknames;
  },

  // moods.json: { "2026-08-08": { mood: "happy", createdAt } }
  getMoods: () => readJSON("moods.json", {}),
  setMood: (dateISO, mood) => {
    const moods = readJSON("moods.json", {});
    moods[dateISO] = { mood, createdAt: new Date().toISOString() };
    writeJSON("moods.json", moods);
    return moods;
  },
};
