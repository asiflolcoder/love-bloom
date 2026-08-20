const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Draw a deterministic flower into #flower based on the day's "genome"
function drawFlower(genome) {
  const svg = document.getElementById("flower");
  svg.innerHTML = "";

  const growth = Math.max(genome.growthStage, 1) / 21; // 0..1
  const scale = 0.4 + 0.6 * Math.min(growth, 1);
  const petalOpacity = 0.55 + 0.45 * Math.min(growth, 1);
  const baseHue = 335 + genome.hueShift; // rose family
  const petalColor = `hsl(${baseHue}, 55%, 78%)`;
  const petalColorDeep = `hsl(${baseHue}, 45%, 66%)`;

  const group = el("g", { transform: `translate(0,0) scale(${scale})` });

  // stem
  const stem = el("path", {
    d: "M0,10 C -4,60 4,90 0,140",
    stroke: "#8FAE93",
    "stroke-width": "5",
    fill: "none",
    "stroke-linecap": "round",
  });
  svg.appendChild(stem);

  // leaf
  const leaf = el("path", {
    d: "M0,70 C 30,65 46,80 40,100 C 14,100 -2,88 0,70 Z",
    fill: "#8FAE93",
    opacity: "0.9",
  });
  svg.appendChild(leaf);

  // petals
  const petalCount = genome.petalCount;
  for (let i = 0; i < petalCount; i++) {
    const angle = (360 / petalCount) * i + genome.rotation;
    const petal = el("ellipse", {
      class: "petal",
      cx: "0",
      cy: "-56",
      rx: "26",
      ry: "58",
      transform: `rotate(${angle})`,
      fill: i % 2 === 0 ? petalColor : petalColorDeep,
      opacity: String(petalOpacity),
    });
    group.appendChild(petal);
  }

  // center
  const center = el("circle", { cx: "0", cy: "0", r: "22", fill: "#D8AE6E" });
  group.appendChild(center);

  // little texture dots on the center
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    const dot = el("circle", {
      cx: String(Math.cos(a) * 11),
      cy: String(Math.sin(a) * 11),
      r: "2",
      fill: "#B98A4B",
      opacity: "0.6",
    });
    group.appendChild(dot);
  }

  svg.appendChild(group);
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "still up?";
  if (h < 12) return "good morning";
  if (h < 18) return "good afternoon";
  return "good evening";
}

async function loadToday() {
  try {
    const res = await fetch("/api/today");
    const data = await res.json();

    document.getElementById("greeting").textContent = `for ${data.partnerName}`;
    document.querySelector(".eyebrow").textContent = timeGreeting();
    document.getElementById("nickname").textContent = data.nickname || data.partnerName;
    document.getElementById("message").textContent = data.message;
    document.getElementById("dayNumber").textContent = data.day;
    document.querySelector(".day-count").lastChild.textContent =
      ` ${data.day === 1 ? "day" : "days"} of this`;

    const photoEl = document.getElementById("flowerPhoto");
    const svgEl = document.getElementById("flower");
    if (data.flowerPhoto) {
      photoEl.src = data.flowerPhoto.imageDataUrl;
      photoEl.alt = data.flowerPhoto.caption || "Today's flower";
      photoEl.classList.remove("hidden");
      svgEl.classList.add("hidden");
    } else {
      photoEl.classList.add("hidden");
      svgEl.classList.remove("hidden");
      drawFlower(data.flower);
    }

    const reactBtn = document.getElementById("reactBtn");
    const reactLabel = document.getElementById("reactLabel");
    if (data.reaction) {
      reactBtn.setAttribute("aria-pressed", "true");
      reactLabel.textContent = "Sent";
    }

    if (data.mood) setMoodUI(data.mood, false);
  } catch (err) {
    document.getElementById("message").textContent =
      "Couldn't load today's note — check your connection.";
  }
}

// ---------- Mood check-in ----------
const MOOD_MESSAGES = {
  happy: "Glad today's a good one. 💛",
  sad: "Sorry today's hard. I'm here.",
  confused: "That's okay — no need to have it figured out.",
};

function setMoodUI(mood, announce = true) {
  document.querySelectorAll(".mood-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.mood === mood));
  });
  if (announce) {
    document.getElementById("moodStatus").textContent = MOOD_MESSAGES[mood] || "Thanks for sharing.";
  }
}

async function sendMood(mood) {
  setMoodUI(mood);
  try {
    await fetch("/api/mood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood }),
    });
  } catch {
    // optimistic UI stays even if offline
  }
}

document.querySelectorAll(".mood-btn").forEach((btn) => {
  btn.addEventListener("click", () => sendMood(btn.dataset.mood));
});

async function sendReaction() {
  const reactBtn = document.getElementById("reactBtn");
  const reactLabel = document.getElementById("reactLabel");
  const alreadySent = reactBtn.getAttribute("aria-pressed") === "true";
  if (alreadySent) return;

  reactBtn.setAttribute("aria-pressed", "true");
  reactLabel.textContent = "Sent";

  try {
    await fetch("/api/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction: "heart" }),
    });
  } catch {
    // Keep the optimistic UI state even if offline; harmless if it fails silently.
  }
}

async function loadMemories() {
  const list = document.getElementById("memoriesList");
  try {
    const res = await fetch("/api/memories");
    const memories = await res.json();
    if (!memories.length) return; // keep the default empty state
    list.innerHTML = "";
    for (const m of memories) {
      const item = document.createElement("div");
      item.className = "memory-item";
      const date = new Date(m.createdAt);
      item.innerHTML = `
        ${m.title ? `<h3>${escapeHTML(m.title)}</h3>` : ""}
        ${m.note ? `<p>${escapeHTML(m.note)}</p>` : ""}
        ${m.imageDataUrl ? `<img src="${m.imageDataUrl}" alt="${escapeHTML(m.title || "memory")}" />` : ""}
        <time>${date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</time>
      `;
      list.appendChild(item);
    }
  } catch {
    // leave default empty state on failure
  }
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- PWA install prompt ----------
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!localStorage.getItem("lovebloom-install-dismissed")) {
    document.getElementById("installBanner").classList.remove("hidden");
  }
});

document.getElementById("installBtn")?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById("installBanner").classList.add("hidden");
});

document.getElementById("dismissInstall")?.addEventListener("click", () => {
  document.getElementById("installBanner").classList.add("hidden");
  try {
    localStorage.setItem("lovebloom-install-dismissed", "1");
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
});

// ---------- Service worker + push ----------
async function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.register("/service-worker.js");

  try {
    const res = await fetch("/api/push/public-key");
    const { enabled, publicKey } = await res.json();
    if (!enabled || Notification.permission === "denied") return;

    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // already subscribed

    // Only ask for permission after the user has interacted once,
    // so it doesn't feel like a jump-scare on first load.
    document.getElementById("reactBtn").addEventListener(
      "click",
      async () => {
        if (Notification.permission === "granted") {
          await subscribeForPush(reg, publicKey);
        } else if (Notification.permission === "default") {
          const perm = await Notification.requestPermission();
          if (perm === "granted") await subscribeForPush(reg, publicKey);
        }
      },
      { once: true }
    );
  } catch {
    // push not available server-side yet; that's fine, app still works
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribeForPush(reg, publicKey) {
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
  } catch (err) {
    console.warn("Push subscription failed:", err);
  }
}

// ---------- Init ----------
document.getElementById("reactBtn").addEventListener("click", sendReaction);
loadToday();
loadMemories();
setupServiceWorker();
