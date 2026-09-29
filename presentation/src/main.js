import { Building } from "./building.js";
import { FLOORS, SLOTS, STATS, slotState, roomStatus } from "./data.js";
import { NOTES } from "./notes.js";

const $ = s => document.querySelector(s);
const stage = $("#stage");
const slides = [...document.querySelectorAll(".slide")];
const videos = Object.fromEntries([...document.querySelectorAll(".videos video")].map(v => [v.dataset.v, v]));
const shade = $("#shade");

/* ---------- масштабирование сцены 1920×1080 ---------- */
let building = null;
try { building = new Building($("#gl")); } catch (e) { console.warn("WebGL недоступен", e); }

function fit(){
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  building && building.resize(s);
}
addEventListener("resize", fit);
fit();

/* ---------- сцены ---------- */
const FLOOR2 = FLOORS[1];
const BOOK_SLOT = 4;                       // 15:00–16:20 — время выставки
const BOOK_ROOM = FLOOR2.book.find(r => r.w >= 150 && r.x > 900 && slotState(r.id, BOOK_SLOT).st === "free") || FLOOR2.book[0];

let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const every = (fn, ms) => { fn(); timers.push(setInterval(fn, ms)); };
const clearTimers = () => { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; };

function countUp(){
  document.querySelectorAll("[data-count]").forEach((el, i) => {
    const to = STATS[el.dataset.count], t0 = performance.now() + 450 + i * 140, dur = 1400;
    el.textContent = "0";
    const tick = now => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const SCENES = {
  explode(){
    // сначала — реальный корпус, затем он растворяется и этажи раскрываются
    building.setShot("shell"); building.paintStatus(5); countUp();
    later(() => building.setShot("explode"), 1900);
  },
  floor(){
    let slot = 0;
    const clock = $("#floor-clock");
    every(() => {
      building.paintStatus(slot);
      clock.textContent = SLOTS[slot].join("–");
      slot = (slot + 1) % SLOTS.length;
    }, 2300);
  },
  book(){
    const steps = [...document.querySelectorAll("#steps li")];
    const toast = $("#toast");
    $("#toast-t").innerHTML = `<b>${BOOK_ROOM.id}</b> забронирована · 30 сен, ${SLOTS[BOOK_SLOT].join("–")}`;
    const run = () => {
      toast.classList.remove("on");
      building.paintStatus(BOOK_SLOT);
      steps.forEach(s => s.classList.remove("cur", "done"));
      later(() => steps[0].classList.add("cur"), 300);
      later(() => { steps[0].classList.replace("cur", "done"); steps[1].classList.add("cur");
        building.liftRoom(BOOK_ROOM.id, 0.9); building.setRoom(BOOK_ROOM.id, "free", 0.9); }, 2300);
      later(() => { steps[1].classList.replace("cur", "done"); steps[2].classList.add("cur"); }, 4400);
      later(() => { building.setRoom(BOOK_ROOM.id, "mine", 1.4); building.liftRoom(BOOK_ROOM.id, 0.25);
        toast.classList.add("on"); }, 5300);
      later(() => { steps[2].classList.replace("cur", "done"); }, 7000);
    };
    run(); timers.push(setInterval(run, 10000));
  },
  filter(){
    const chips = [...document.querySelectorAll("#chips span")];
    const F = {
      free: r => roomStatus(r, BOOK_SLOT) !== "busy",
      proj: r => r.tags.includes("proj"),
      big:  r => r.cap >= 30,
    };
    const order = [null, "free", "proj", "big"];
    let i = 0;
    every(() => {
      const f = order[i];
      chips.forEach(c => c.classList.toggle("on", c.dataset.f === f));
      building.paintStatus(BOOK_SLOT, f ? F[f] : null);
      i = (i + 1) % order.length;
    }, 2400);
  },
  building(){ building.paintGlass(); },
  final(){ building.paintStatus(5); },
};

/* ---------- сетка времени (слайд 7) ---------- */
(function buildTimetable(){
  const rooms = FLOOR2.book.slice(0, 5);
  let html = "<table><thead><tr><th class='rh'></th>";
  SLOTS.forEach((s, i) => { html += `<th class="${i === BOOK_SLOT ? "now" : ""}">${s[0]}<small>${s[1]}</small></th>`; });
  html += "</tr></thead><tbody>";
  let n = 0;
  rooms.forEach(r => {
    html += `<tr><th class="rh">${r.id}<small>${r.nm} · ${r.cap} мест</small></th>`;
    SLOTS.forEach((_, i) => {
      let st = slotState(r.id, i).st;
      if (r.id === BOOK_ROOM.id && i === BOOK_SLOT) st = "mine";
      const label = st === "busy" ? "занято" : st === "mine" ? "моя бронь" : "свободно";
      html += `<td><div class="cell ${st}${i === BOOK_SLOT ? " nowc" : ""}" style="transition-delay:${(0.5 + n++ * 0.018).toFixed(3)}s">${label}</div></td>`;
    });
    html += "</tr>";
  });
  $("#tt").innerHTML = html + "</tbody></table>";
})();

/* ---------- навигация ---------- */
let cur = -1;
let glStopTimer = null;
$("#total").textContent = String(slides.length).padStart(2, "0");

function playVideo(key){
  Object.entries(videos).forEach(([k, v]) => {
    if (k === key){
      if (k === "hologram") v.currentTime = 0;
      v.classList.add("on");
      const p = v.play(); p && p.catch(() => {});
    } else {
      v.classList.remove("on");
      setTimeout(() => { if (!v.classList.contains("on")) v.pause(); }, 1200);
    }
  });
}

function go(i, fromUser = true){
  i = (i + slides.length) % slides.length;
  if (i === cur) return;
  if (fromUser) bumpAuto();
  clearTimers();
  $("#toast").classList.remove("on");
  slides.forEach((s, k) => s.classList.toggle("on", k === i));
  const s = slides[i];
  cur = i;

  playVideo(s.dataset.video || null);
  shade.dataset.s = s.dataset.shade || "";

  const scene = s.dataset.scene;
  if (scene && building){
    clearTimeout(glStopTimer);
    stage.classList.add("show-gl");
    building.start();
    building.setShot(scene);
    SCENES[scene] && SCENES[scene]();
  } else {
    stage.classList.remove("show-gl");
    clearTimeout(glStopTimer);
    glStopTimer = setTimeout(() => building && building.stop(), 1200);
  }

  $("#cur").textContent = String(i + 1).padStart(2, "0");
  $("#progress").style.width = ((i + 1) / slides.length * 100) + "%";
  try { history.replaceState(null, "", location.href.split("#")[0] + "#" + (i + 1)); } catch (e) {}
  updateTools();
  scheduleAuto();
}
const next = () => go(cur + 1);
const prev = () => go(cur - 1);

/* ---------- автопоказ (киоск) ---------- */
const DUR = { "Решение": 6000, "Как это работает": 10500, "Живой план": 11000, "Фильтры": 10000, "Сетка времени": 9000 };
let auto = /[?&]auto\b/.test(location.search);
let autoTimer = null, resumeTimer = null, pausedByUser = false;

function scheduleAuto(){
  clearTimeout(autoTimer);
  stage.classList.toggle("autoplay", auto);
  if (!auto || pausedByUser) return;
  autoTimer = setTimeout(() => go(cur + 1, false), DUR[slides[cur].dataset.title] || 9000);
}
function bumpAuto(){
  if (!auto) return;
  pausedByUser = true;
  clearTimeout(autoTimer); clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { pausedByUser = false; scheduleAuto(); }, 30000);
}
function toggleAuto(){
  auto = !auto; pausedByUser = false; clearTimeout(resumeTimer);
  scheduleAuto();
}

/* ---------- инструменты докладчика ---------- */
const tools = $("#tools"), notesEl = $("#notes"), gridEl = $("#grid-ov"), blackEl = $("#blackout"), helpEl = $("#help");
const titles = slides.map(s => s.dataset.title);

$("#g-list").innerHTML = titles.map((t, i) =>
  `<button data-i="${i}"><i>${String(i + 1).padStart(2, "0")}</i><b>${t}</b></button>`).join("");
$("#g-list").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  gridEl.hidden = true; go(+b.dataset.i);
});

function updateTools(){
  $("#t-num").textContent = `${cur + 1} / ${slides.length}`;
  const n = NOTES[cur] || { say: "", q: null };
  $("#n-title").textContent = `${String(cur + 1).padStart(2, "0")} · ${titles[cur]}`;
  $("#n-say").textContent = n.say;
  $("#n-q").textContent = n.q || "";
  gridEl.querySelectorAll("button").forEach((b, k) => b.classList.toggle("cur", k === cur));
  tools.querySelector('[data-act="notes"]').classList.toggle("on", !notesEl.hidden);
  tools.querySelector('[data-act="auto"]').classList.toggle("on", auto);
  tools.querySelector('[data-act="black"]').classList.toggle("on", !blackEl.hidden);
}

// таймер выступления
let t0 = null, tAcc = 0, tInt = null;
function renderTime(){
  const ms = tAcc + (t0 ? Date.now() - t0 : 0), sec = Math.floor(ms / 1000);
  $("#t-time").textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
function toggleTimer(){
  const btn = tools.querySelector('[data-act="timer"]');
  if (t0){ tAcc += Date.now() - t0; t0 = null; clearInterval(tInt); btn.classList.remove("run"); }
  else { t0 = Date.now(); tInt = setInterval(renderTime, 500); btn.classList.add("run"); }
  renderTime();
}
function resetTimer(){ tAcc = 0; if (t0) t0 = Date.now(); renderTime(); }

const toggle = el => { el.hidden = !el.hidden; updateTools(); };
const ACT = {
  prev: () => prev(), next: () => next(),
  grid: () => toggle(gridEl), notes: () => toggle(notesEl), help: () => toggle(helpEl),
  black: () => toggle(blackEl), auto: () => { toggleAuto(); updateTools(); },
  timer: toggleTimer, fs: () => toggleFs(),
};
tools.addEventListener("click", e => { const b = e.target.closest("button[data-act]"); if (b){ b.blur(); ACT[b.dataset.act](); } });
$("#fs-btn").addEventListener("click", e => { e.currentTarget.blur(); toggleFs(); });
blackEl.addEventListener("click", () => toggle(blackEl));

// курсор и панель прячутся через 3 секунды без движения
let idleT = null, first = true;
function wake(){
  document.body.classList.remove("idle");
  clearTimeout(idleT);
  idleT = setTimeout(() => document.body.classList.add("idle"), first ? 6000 : 3000); first = false;
}
["mousemove", "mousedown", "touchstart"].forEach(ev => addEventListener(ev, wake, { passive:true }));
wake();

/* ---------- ввод ---------- */
const KEYS = { f:"fs", "а":"fs", a:"auto", "ф":"auto", n:"notes", "т":"notes", g:"grid", "п":"grid",
  b:"black", "и":"black", t:"timer", "е":"timer", h:"help", "р":"help", "?":"help" };
addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key, kl = k.toLowerCase();
  if (k === "Escape"){ gridEl.hidden = helpEl.hidden = blackEl.hidden = true; updateTools(); return; }
  if (!blackEl.hidden && !["b","и"].includes(kl)){ blackEl.hidden = true; updateTools(); }
  if (["ArrowRight","ArrowDown","PageDown"," ","Enter"].includes(k)){ e.preventDefault(); next(); }
  else if (["ArrowLeft","ArrowUp","PageUp","Backspace"].includes(k)){ e.preventDefault(); prev(); }
  else if (k === "Home") go(0);
  else if (k === "End") go(slides.length - 1);
  else if (/^[0-9]$/.test(k)) go(k === "0" ? 9 : +k - 1);
  else if (kl === "r" || kl === "к") resetTimer();
  else if (KEYS[kl]) ACT[KEYS[kl]]();
});
$("#next").addEventListener("click", next);
$("#prev").addEventListener("click", prev);

let tx = null, ty = null;
addEventListener("touchstart", e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive:true });
addEventListener("touchend", e => {
  if (tx === null) return;
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : prev)();
  tx = ty = null;
}, { passive:true });

function toggleFs(){
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
}
document.addEventListener("fullscreenchange", () => document.body.classList.toggle("fs", !!document.fullscreenElement));

/* ---------- старт ---------- */
const fromHash = () => { const n = parseInt(location.hash.slice(1), 10); return Number.isFinite(n) ? n - 1 : 0; };
addEventListener("hashchange", () => go(fromHash()));
go(fromHash(), false);
