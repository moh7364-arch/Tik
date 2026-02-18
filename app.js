/* Agency Live Game Engine - MVP (Web only)
   - localStorage for persistence
   - BroadcastChannel for overlay realtime updates
   - Simulation mode for comments/gifts/likes events
*/

(() => {
  "use strict";

  // -----------------------
  // Helpers
  // -----------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  const nowISO = () => new Date().toISOString();

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  function fmtDT(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("ar", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
    } catch { return iso; }
  }

  // -----------------------
  // Storage
  // -----------------------
  const KEY = "aglge_mvp_v1";

  function seed() {
    return {
      meta: {
        createdAt: nowISO(),
        version: "1.0.0",
      },
      agency: {
        name: "وكالة تيك توك - الألعاب",
      },
      streamers: [
        { id: uid(), name: "StreamerOne", tiktokId: "@streamer1", status: "active", points: 120, wins: 3, createdAt: nowISO() },
        { id: uid(), name: "ProGamer", tiktokId: "@progamer", status: "active", points: 210, wins: 5, createdAt: nowISO() },
      ],
      games: [
        {
          id: uid(),
          name: "Gift Battle",
          type: "gifts",
          durationSec: 60,
          scoring: { comment: 1, like: 0.01, giftPointPerCoin: 10 },
          active: true,
          createdAt: nowISO(),
        },
        {
          id: uid(),
          name: "Lightning Comment",
          type: "comments",
          durationSec: 20,
          scoring: { comment: 1, like: 0.01, giftPointPerCoin: 10 },
          active: true,
          createdAt: nowISO(),
        },
      ],
      rounds: [],
      bans: [],
      live: {
        isLive: false,
        roundId: null,
        gameId: null,
        startedAt: null,
        endsAt: null,
        title: "",
      }
    };
  }

  function loadDB() {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    try { return JSON.parse(raw); }
    catch {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
  }

  function saveDB(db) {
    localStorage.setItem(KEY, JSON.stringify(db));
  }

  // -----------------------
  // Realtime channel (Overlay)
  // -----------------------
  const channel = new BroadcastChannel("aglge_overlay");
  function pushOverlayState(db, payloadExtra = {}) {
    const live = db.live || {};
    const round = db.rounds.find(r => r.id === live.roundId) || null;
    const game = db.games.find(g => g.id === live.gameId) || null;

    const overlayState = {
      live: { ...live },
      game: game ? {
        id: game.id, name: game.name, type: game.type, durationSec: game.durationSec
      } : null,
      round: round ? {
        id: round.id,
        status: round.status,
        startedAt: round.startedAt,
        endsAt: round.endsAt,
        winner: round.winner || null,
        leaderboard: (round.leaderboard || []).slice(0, 5),
        lastEvents: (round.events || []).slice(-6),
      } : null,
      ...payloadExtra
    };

    channel.postMessage({ type: "OVERLAY_STATE", data: overlayState });
  }

  // -----------------------
  // Simulation
  // -----------------------
  let simTimer = null;

  function isBanned(db, username) {
    return db.bans.some(b => b.username.toLowerCase() === username.toLowerCase());
  }

  function addEventToRound(db, roundId, event) {
    const round = db.rounds.find(r => r.id === roundId);
    if (!round) return;

    round.events = round.events || [];
    round.events.push(event);

    // Scoring / leaderboard
    round.leaderboard = round.leaderboard || [];
    const entryIdx = round.leaderboard.findIndex(x => x.username.toLowerCase() === event.username.toLowerCase());
    const pointsAdd = event.points || 0;

    if (entryIdx >= 0) {
      round.leaderboard[entryIdx].points += pointsAdd;
      round.leaderboard[entryIdx].lastAt = event.at;
    } else {
      round.leaderboard.push({ username: event.username, points: pointsAdd, lastAt: event.at });
    }

    // Sort: points desc, lastAt asc (earlier wins tie)
    round.leaderboard.sort((a, b) => (b.points - a.points) || (new Date(a.lastAt) - new Date(b.lastAt)));
  }

  function computePoints(game, eventType, value = 1) {
    const s = game.scoring || { comment: 1, like: 0.01, giftPointPerCoin: 10 };
    if (eventType === "comment") return s.comment;
    if (eventType === "like") return s.like * value;
    if (eventType === "gift") return s.giftPointPerCoin * value; // value=coins
    return 0;
  }

  function stopSimulation() {
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
    $("#startSimBtn").disabled = false;
    $("#stopSimBtn").disabled = true;
    toast("تم إيقاف المحاكاة");
  }

  function startSimulation() {
    const db = loadDB();
    if (!db.live.isLive || !db.live.roundId || !db.live.gameId) {
      toast("ابدأ جولة أولاً من صفحة الجولات");
      return;
    }
    const game = db.games.find(g => g.id === db.live.gameId);
    if (!game) return;

    const sampleUsers = ["ahmed", "noor", "saad", "lena", "faisal", "rana", "moh", "sara", "ali", "huda"];
    const giftCoins = [1, 5, 10, 20, 50, 100];

    simTimer = setInterval(() => {
      const db2 = loadDB();
      if (!db2.live.isLive) return;

      const round = db2.rounds.find(r => r.id === db2.live.roundId);
      const game2 = db2.games.find(g => g.id === db2.live.gameId);
      if (!round || !game2 || round.status !== "running") return;

      const username = sampleUsers[Math.floor(Math.random() * sampleUsers.length)];
      if (isBanned(db2, username)) return;

      // random event based on game type
      let eventType;
      const roll = Math.random();
      if (roll < 0.6) eventType = "comment";
      else if (roll < 0.9) eventType = "like";
      else eventType = "gift";

      let value = 1;
      let text = "";
      if (eventType === "comment") {
        const words = ["🔥", "!join", "اوف", "كم قتلة؟", "فزنا؟", "هههه", "بالتوفيق", "ACE؟", "top1"];
        text = words[Math.floor(Math.random() * words.length)];
      }
      if (eventType === "like") {
        value = 50 + Math.floor(Math.random() * 500);
        text = `+${value} لايك`;
      }
      if (eventType === "gift") {
        value = giftCoins[Math.floor(Math.random() * giftCoins.length)];
        text = `🎁 Gift (${value} coins)`;
      }

      const pts = computePoints(game2, eventType, value);

      const event = {
        id: uid(),
        at: nowISO(),
        username,
        type: eventType,
        value,
        text,
        points: pts
      };

      addEventToRound(db2, db2.live.roundId, event);

      saveDB(db2);
      pushOverlayState(db2);
      refreshTopbarLive(db2);
      // Update current view quickly if open
      if (location.hash.startsWith("#/rounds")) render();
      if (location.hash.startsWith("#/dashboard")) render();

    }, 900);

    $("#startSimBtn").disabled = true;
    $("#stopSimBtn").disabled = false;
    toast("تم تشغيل المحاكاة ✅");
  }

  // -----------------------
  // Live round controls
  // -----------------------
  function setLiveUI(db) {
    const dot = $("#liveDot");
    const status = $("#liveStatus");
    if (db.live.isLive) {
      dot.classList.add("live");
      status.textContent = "جولة نشطة الآن";
    } else {
      dot.classList.remove("live");
      status.textContent = "لا توجد جولة نشطة";
    }
  }

  function refreshTopbarLive(db) { setLiveUI(db); }

  function startRound(db, gameId, title = "") {
    const game = db.games.find(g => g.id === gameId);
    if (!game) throw new Error("Game not found");

    const roundId = uid();
    const startedAt = nowISO();
    const endsAt = new Date(Date.now() + (game.durationSec * 1000)).toISOString();

    db.rounds.unshift({
      id: roundId,
      gameId: game.id,
      gameName: game.name,
      title: title || game.name,
      status: "running", // running|ended
      startedAt,
      endsAt,
      winner: null,
      events: [],
      leaderboard: []
    });

    db.live = {
      isLive: true,
      roundId,
      gameId: game.id,
      startedAt,
      endsAt,
      title: title || game.name
    };

    saveDB(db);
    pushOverlayState(db);
    refreshTopbarLive(db);
    toast("بدأت الجولة ✅");
  }

  function endRound(db, roundId) {
    const r = db.rounds.find(x => x.id === roundId);
    if (!r) return;

    r.status = "ended";
    db.live.isLive = false;
    db.live.roundId = null;
    db.live.gameId = null;
    db.live.startedAt = null;
    db.live.endsAt = null;
    db.live.title = "";

    saveDB(db);
    pushOverlayState(db);
    refreshTopbarLive(db);
    toast("انتهت الجولة");
  }

  function pickWinner(db, roundId, username) {
    const r = db.rounds.find(x => x.id === roundId);
    if (!r) return;
    const entry = (r.leaderboard || []).find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!entry) return;

    r.winner = { username: entry.username, points: entry.points, pickedAt: nowISO() };

    // Update aggregate stats for streamers if matching tiktokId/name
    // Here we only keep a global "participants" scoreboard in rounds; streamers are agency members.
    // Optional: auto map by username.
    saveDB(db);
    pushOverlayState(db);
    toast(`تم اعتماد الفائز: @${entry.username}`);
  }

  // -----------------------
  // Views
  // -----------------------
  const viewRoot = $("#viewRoot");
  const pageTitle = $("#pageTitle");
  const pageHint = $("#pageHint");

  function setActiveNav(route) {
    $$(".nav__item").forEach(a => a.classList.toggle("active", a.dataset.route === route));
  }

  function route() {
    const h = location.hash || "#/dashboard";
    const r = h.replace("#/", "").split("?")[0];
    return r || "dashboard";
  }

  function renderDashboard(db) {
    pageTitle.textContent = "لوحة التحكم";
    pageHint.textContent = "ملخص سريع + آخر النشاط.";

    const activeStreamers = db.streamers.filter(s => s.status === "active").length;
    const totalRounds = db.rounds.length;
    const live = db.live.isLive ? "نعم" : "لا";

    // Top participants across rounds (from events)
    const agg = new Map();
    for (const r of db.rounds) {
      for (const e of (r.events || [])) {
        agg.set(e.username, (agg.get(e.username) || 0) + (e.points || 0));
      }
    }
    const topParticipants = Array.from(agg.entries())
      .map(([username, points]) => ({ username, points }))
      .sort((a,b) => b.points - a.points)
      .slice(0, 5);

    const lastRound = db.rounds[0] || null;

    viewRoot.innerHTML = `
      <div class="grid cols-3">
        <div class="kpi">
          <div class="kpi__v">${activeStreamers}</div>
          <div class="kpi__l">ستريمرز نشطين (داخل الوكالة)</div>
        </div>
        <div class="kpi">
          <div class="kpi__v">${totalRounds}</div>
          <div class="kpi__l">إجمالي الجولات</div>
        </div>
        <div class="kpi">
          <div class="kpi__v">${live}</div>
          <div class="kpi__l">جولة نشطة الآن</div>
        </div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <div class="card__hd">
            <div class="card__title">🏆 أفضل المشاركين (محاكاة)</div>
            <div class="badge ${topParticipants.length ? "ok" : ""}">${topParticipants.length ? "تحديث لحظي" : "لا بيانات"}</div>
          </div>
          <div class="card__bd">
            ${topParticipants.length ? `
              <table class="table">
                <thead><tr><th>المستخدم</th><th>النقاط</th></tr></thead>
                <tbody>
                  ${topParticipants.map(x => `<tr><td>@${x.username}</td><td>${x.points.toFixed(2)}</td></tr>`).join("")}
                </tbody>
              </table>
            ` : `<div class="muted">شغل محاكاة من الأعلى أثناء وجود جولة نشطة.</div>`}
          </div>
        </div>

        <div class="card">
          <div class="card__hd">
            <div class="card__title">⏱️ آخر جولة</div>
            <div class="badge ${lastRound?.status === "running" ? "ok" : "warn"}">${lastRound ? lastRound.status : "لا يوجد"}</div>
          </div>
          <div class="card__bd">
            ${lastRound ? `
              <div class="row">
                <div class="badge">اللعبة: ${lastRound.gameName}</div>
                <div class="badge">بدأت: ${fmtDT(lastRound.startedAt)}</div>
                <div class="badge">تنتهي: ${fmtDT(lastRound.endsAt)}</div>
              </div>
              <div style="margin-top:10px" class="muted">
                الفائز: ${lastRound.winner ? `@${lastRound.winner.username} (${lastRound.winner.points.toFixed(2)} نقطة)` : "لم يتم اختيار فائز بعد"}
              </div>
              <div style="margin-top:12px" class="row">
                <a class="btn btn--ghost" href="#/rounds">فتح صفحة الجولات</a>
                <a class="btn btn--ghost" href="./overlay.html" target="_blank" rel="noreferrer">فتح Overlay</a>
              </div>
            ` : `<div class="muted">ابدأ جولة من صفحة الجولات.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderStreamers(db) {
    pageTitle.textContent = "الستريمرز";
    pageHint.textContent = "إدارة ستريمرز الوكالة (داخلي).";

    const rows = db.streamers.map(s => `
      <tr>
        <td>${s.name}</td>
        <td>${s.tiktokId}</td>
        <td>${s.status === "active" ? `<span class="badge ok">نشط</span>` : `<span class="badge warn">متوقف</span>`}</td>
        <td>${s.points ?? 0}</td>
        <td>${s.wins ?? 0}</td>
        <td>
          <button class="btn btn--ghost" data-action="toggleStreamer" data-id="${s.id}">
            ${s.status === "active" ? "إيقاف" : "تفعيل"}
          </button>
          <button class="btn btn--danger" data-action="deleteStreamer" data-id="${s.id}">حذف</button>
        </td>
      </tr>
    `).join("");

    viewRoot.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <div class="card__hd">
            <div class="card__title">➕ إضافة ستريمر</div>
          </div>
          <div class="card__bd">
            <form class="form" id="addStreamerForm">
              <div class="form__grid">
                <div>
                  <div class="muted">الاسم</div>
                  <input class="input" name="name" placeholder="مثال: ProGamer" required />
                </div>
                <div>
                  <div class="muted">TikTok ID</div>
                  <input class="input" name="tiktokId" placeholder="@username" required />
                </div>
              </div>
              <button class="btn btn--ok" type="submit">إضافة</button>
              <div class="muted">ملاحظة: هذا لإدارة أعضاء الوكالة، ليس جمهور البث.</div>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card__hd">
            <div class="card__title">📄 قائمة الستريمرز</div>
            <div class="badge">${db.streamers.length} عنصر</div>
          </div>
          <div class="card__bd">
            <table class="table">
              <thead>
                <tr>
                  <th>الاسم</th><th>TikTok</th><th>الحالة</th><th>نقاط</th><th>فوز</th><th>إجراءات</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td colspan="6" class="muted">لا يوجد بيانات</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    $("#addStreamerForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const name = String(fd.get("name") || "").trim();
      const tiktokId = String(fd.get("tiktokId") || "").trim();
      if (!name || !tiktokId) return;

      const db2 = loadDB();
      db2.streamers.unshift({ id: uid(), name, tiktokId, status:"active", points:0, wins:0, createdAt: nowISO() });
      saveDB(db2);
      toast("تمت الإضافة ✅");
      render();
    });

    viewRoot.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      const db2 = loadDB();
      if (action === "toggleStreamer") {
        const s = db2.streamers.find(x => x.id === id);
        if (s) s.status = (s.status === "active") ? "paused" : "active";
        saveDB(db2);
        toast("تم تحديث الحالة");
        render();
      }
      if (action === "deleteStreamer") {
        db2.streamers = db2.streamers.filter(x => x.id !== id);
        saveDB(db2);
        toast("تم الحذف");
        render();
      }
    }, { once: true });
  }

  function renderGames(db) {
    pageTitle.textContent = "الألعاب";
    pageHint.textContent = "تعريف الألعاب وقوانين النقاط.";

    const rows = db.games.map(g => `
      <tr>
        <td>${g.name}</td>
        <td>${g.type}</td>
        <td>${g.durationSec}s</td>
        <td>
          <span class="badge">تعليق: ${g.scoring?.comment ?? 1}</span>
          <span class="badge">لايك: ${g.scoring?.like ?? 0.01}</span>
          <span class="badge">هدية/coin: ${g.scoring?.giftPointPerCoin ?? 10}</span>
        </td>
        <td>${g.active ? `<span class="badge ok">نشطة</span>` : `<span class="badge warn">متوقفة</span>`}</td>
        <td>
          <button class="btn btn--ghost" data-action="toggleGame" data-id="${g.id}">
            ${g.active ? "إيقاف" : "تفعيل"}
          </button>
          <button class="btn btn--danger" data-action="deleteGame" data-id="${g.id}">حذف</button>
        </td>
      </tr>
    `).join("");

    viewRoot.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <div class="card__hd">
            <div class="card__title">➕ إضافة لعبة</div>
          </div>
          <div class="card__bd">
            <form class="form" id="addGameForm">
              <div class="form__grid">
                <div>
                  <div class="muted">اسم اللعبة</div>
                  <input class="input" name="name" placeholder="مثال: Like Rush" required />
                </div>
                <div>
                  <div class="muted">النوع</div>
                  <select class="select" name="type" required>
                    <option value="comments">comments</option>
                    <option value="likes">likes</option>
                    <option value="gifts">gifts</option>
                    <option value="hybrid">hybrid</option>
                  </select>
                </div>
              </div>

              <div class="form__grid">
                <div>
                  <div class="muted">مدة الجولة (ثواني)</div>
                  <input class="input" name="durationSec" type="number" min="5" max="600" value="20" required />
                </div>
                <div>
                  <div class="muted">حالة اللعبة</div>
                  <select class="select" name="active">
                    <option value="true">نشطة</option>
                    <option value="false">متوقفة</option>
                  </select>
                </div>
              </div>

              <div class="card" style="background: rgba(255,255,255,.03); border-radius: 18px">
                <div class="card__hd" style="border-bottom:none; background: transparent;">
                  <div class="card__title">⚖️ نظام النقاط</div>
                  <div class="muted">يمكن تغييره لاحقاً</div>
                </div>
                <div class="card__bd">
                  <div class="form__grid">
                    <div>
                      <div class="muted">نقاط التعليق</div>
                      <input class="input" name="scoreComment" type="number" step="0.1" value="1" />
                    </div>
                    <div>
                      <div class="muted">نقاط اللايك (لكل 1 لايك)</div>
                      <input class="input" name="scoreLike" type="number" step="0.001" value="0.01" />
                    </div>
                  </div>
                  <div style="margin-top:10px">
                    <div class="muted">نقاط الهدية (لكل 1 coin)</div>
                    <input class="input" name="scoreGift" type="number" step="0.1" value="10" />
                  </div>
                </div>
              </div>

              <button class="btn btn--ok" type="submit">إضافة</button>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card__hd">
            <div class="card__title">📄 قائمة الألعاب</div>
            <div class="badge">${db.games.length} عنصر</div>
          </div>
          <div class="card__bd">
            <table class="table">
              <thead>
                <tr>
                  <th>الاسم</th><th>النوع</th><th>المدة</th><th>النقاط</th><th>الحالة</th><th>إجراءات</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td colspan="6" class="muted">لا يوجد بيانات</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    $("#addGameForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);

      const name = String(fd.get("name") || "").trim();
      const type = String(fd.get("type") || "").trim();
      const durationSec = clamp(Number(fd.get("durationSec") || 20), 5, 600);
      const active = String(fd.get("active")) === "true";
      const scoring = {
        comment: Number(fd.get("scoreComment") || 1),
        like: Number(fd.get("scoreLike") || 0.01),
        giftPointPerCoin: Number(fd.get("scoreGift") || 10),
      };

      const db2 = loadDB();
      db2.games.unshift({ id: uid(), name, type, durationSec, scoring, active, createdAt: nowISO() });
      saveDB(db2);
      toast("تمت إضافة اللعبة ✅");
      render();
    });

    viewRoot.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      const db2 = loadDB();
      if (action === "toggleGame") {
        const g = db2.games.find(x => x.id === id);
        if (g) g.active = !g.active;
        saveDB(db2);
        toast("تم تحديث اللعبة");
        render();
      }
      if (action === "deleteGame") {
        db2.games = db2.games.filter(x => x.id !== id);
        saveDB(db2);
        toast("تم حذف اللعبة");
        render();
      }
    }, { once: true });
  }

  function renderRounds(db) {
    pageTitle.textContent = "الجولات";
    pageHint.textContent = "بدء/إنهاء جولة + اعتماد فائز + محاكاة.";

    const gamesActive = db.games.filter(g => g.active);
    const liveRound = db.live.isLive ? db.rounds.find(r => r.id === db.live.roundId) : null;

    const roundsRows = db.rounds.map(r => `
      <tr>
        <td>${r.title}</td>
        <td>${r.gameName}</td>
        <td>${r.status === "running" ? `<span class="badge ok">Running</span>` : `<span class="badge warn">Ended</span>`}</td>
        <td>${fmtDT(r.startedAt)}</td>
        <td>${fmtDT(r.endsAt)}</td>
        <td>${r.winner ? `@${r.winner.username} (${r.winner.points.toFixed(2)})` : "—"}</td>
        <td>
          <button class="btn btn--ghost" data-action="openRound" data-id="${r.id}">فتح</button>
        </td>
      </tr>
    `).join("");

    const liveBox = liveRound ? `
      <div class="card">
        <div class="card__hd">
          <div class="card__title">🔴 جولة نشطة</div>
          <div class="badge ok">Realtime</div>
        </div>
        <div class="card__bd">
          <div class="row">
            <span class="badge">العنوان: ${liveRound.title}</span>
            <span class="badge">اللعبة: ${liveRound.gameName}</span>
            <span class="badge">تنتهي: ${fmtDT(liveRound.endsAt)}</span>
          </div>

          <div style="margin-top:12px" class="grid cols-2">
            <div>
              <div class="muted">Leaderboard (Top 5)</div>
              <div style="margin-top:8px">
                ${(liveRound.leaderboard || []).slice(0,5).map(x => `
                  <div class="row" style="justify-content:space-between; padding:8px 10px; border:1px solid var(--border); border-radius:14px; margin-bottom:8px; background: rgba(255,255,255,.03);">
                    <div>@${x.username}</div>
                    <div><b>${x.points.toFixed(2)}</b></div>
                  </div>
                `).join("") || `<div class="muted">لا يوجد مشاركات بعد. شغّل المحاكاة.</div>`}
              </div>
            </div>

            <div>
              <div class="muted">إجراءات</div>
              <div class="row" style="margin-top:8px">
                <button class="btn btn--danger" id="endRoundBtn">⏹️ إنهاء الجولة</button>
                <button class="btn btn--ghost" id="pushOverlayBtn">📤 تحديث Overlay</button>
              </div>

              <div style="margin-top:12px" class="card" >
                <div class="card__hd">
                  <div class="card__title">🏆 اعتماد فائز (يدوي)</div>
                </div>
                <div class="card__bd">
                  <form class="form" id="pickWinnerForm">
                    <div class="muted">اكتب يوزر من الـ leaderboard</div>
                    <input class="input" name="username" placeholder="مثال: ahmed" required />
                    <button class="btn btn--ok" type="submit">اعتماد</button>
                  </form>
                  <div class="muted" style="margin-top:8px">لمنع الاحتيال: المود يعتمد الفوز.</div>
                </div>
              </div>

              <div style="margin-top:12px" class="muted">
                آخر أحداث:
                <div style="margin-top:8px">
                  ${(liveRound.events || []).slice(-5).map(e => `
                    <div class="row" style="justify-content:space-between; padding:8px 10px; border:1px solid var(--border); border-radius:14px; margin-bottom:8px; background: rgba(255,255,255,.02);">
                      <div>@${e.username} — ${e.type}</div>
                      <div>${(e.points || 0).toFixed(2)}+</div>
                    </div>
                  `).join("") || `<div class="muted">—</div>`}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    ` : `
      <div class="card">
        <div class="card__hd">
          <div class="card__title">بدء جولة جديدة</div>
          <div class="badge warn">لا توجد جولة نشطة</div>
        </div>
        <div class="card__bd">
          <form class="form" id="startRoundForm">
            <div class="form__grid">
              <div>
                <div class="muted">اختر لعبة</div>
                <select class="select" name="gameId" required>
                  ${gamesActive.map(g => `<option value="${g.id}">${g.name} (${g.type}, ${g.durationSec}s)</option>`).join("")}
                </select>
                <div class="muted" style="margin-top:6px">اختر لعبة نشطة فقط.</div>
              </div>
              <div>
                <div class="muted">عنوان الجولة (اختياري)</div>
                <input class="input" name="title" placeholder="مثال: الجولة #1" />
              </div>
            </div>
            <button class="btn btn--ok" type="submit">▶️ بدء الجولة</button>
            <div class="muted">بعد بدء الجولة شغّل محاكاة (من الأعلى) لمشاهدة التفاعل.</div>
          </form>
        </div>
      </div>
    `;

    viewRoot.innerHTML = `
      ${liveBox}

      <div class="card">
        <div class="card__hd">
          <div class="card__title">📜 سجل الجولات</div>
          <div class="badge">${db.rounds.length} عنصر</div>
        </div>
        <div class="card__bd">
          <table class="table">
            <thead>
              <tr>
                <th>العنوان</th><th>اللعبة</th><th>الحالة</th><th>بدأت</th><th>انتهت</th><th>الفائز</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${roundsRows || `<tr><td colspan="7" class="muted">لا يوجد بيانات</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Bind live controls
    if (!db.live.isLive) {
      const form = $("#startRoundForm");
      if (form) form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const gameId = String(fd.get("gameId"));
        const title = String(fd.get("title") || "").trim();
        const db2 = loadDB();
        try { startRound(db2, gameId, title); }
        catch (err) { toast("فشل بدء الجولة"); console.error(err); }
        render();
      });
    } else {
      const endBtn = $("#endRoundBtn");
      if (endBtn) endBtn.addEventListener("click", () => {
        const db2 = loadDB();
        endRound(db2, db2.live.roundId);
        stopSimulation();
        render();
      });

      const pushBtn = $("#pushOverlayBtn");
      if (pushBtn) pushBtn.addEventListener("click", () => {
        const db2 = loadDB();
        pushOverlayState(db2);
        toast("تم إرسال تحديث للـ Overlay");
      });

      const pickForm = $("#pickWinnerForm");
      if (pickForm) pickForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const username = String(fd.get("username") || "").trim().replace(/^@/, "");
        const db2 = loadDB();
        pickWinner(db2, db2.rounds.find(r => r.id === db2.live.roundId)?.id, username);
        render();
      });
    }

    // Open old round (basic)
    viewRoot.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='openRound']");
      if (!btn) return;
      const id = btn.dataset.id;

      const db2 = loadDB();
      const r = db2.rounds.find(x => x.id === id);
      if (!r) return;

      alert(
        `Round: ${r.title}\nGame: ${r.gameName}\nStatus: ${r.status}\nWinner: ${r.winner ? '@'+r.winner.username : '—'}\nEvents: ${(r.events || []).length}`
      );
    }, { once: true });
  }

  function renderModeration(db) {
    pageTitle.textContent = "المود";
    pageHint.textContent = "حظر سبام + اعتماد سريع للفوز (يدوي).";

    const banRows = db.bans.map(b => `
      <tr>
        <td>@${b.username}</td>
        <td>${b.reason}</td>
        <td>${fmtDT(b.createdAt)}</td>
        <td><button class="btn btn--danger" data-action="unban" data-username="${b.username}">إلغاء الحظر</button></td>
      </tr>
    `).join("");

    const liveRound = db.live.isLive ? db.rounds.find(r => r.id === db.live.roundId) : null;

    viewRoot.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <div class="card__hd">
            <div class="card__title">🚫 حظر مستخدم</div>
          </div>
          <div class="card__bd">
            <form class="form" id="banForm">
              <div class="muted">يوزر (بدون @)</div>
              <input class="input" name="username" placeholder="مثال: spammer" required />
              <div class="muted">سبب</div>
              <input class="input" name="reason" placeholder="Spam / Abuse" required />
              <button class="btn btn--danger" type="submit">حظر</button>
            </form>
            <div class="muted" style="margin-top:8px">الحظر يوقف احتساب نقاطه أثناء المحاكاة.</div>
          </div>
        </div>

        <div class="card">
          <div class="card__hd">
            <div class="card__title">🏆 اعتماد فائز (اختصار)</div>
            <div class="badge ${liveRound ? "ok" : "warn"}">${liveRound ? "جولة نشطة" : "لا توجد جولة"}</div>
          </div>
          <div class="card__bd">
            ${liveRound ? `
              <div class="muted">Top 5</div>
              <div style="margin-top:8px">
                ${(liveRound.leaderboard || []).slice(0,5).map(x => `
                  <div class="row" style="justify-content:space-between; padding:8px 10px; border:1px solid var(--border); border-radius:14px; margin-bottom:8px; background: rgba(255,255,255,.03);">
                    <div>@${x.username}</div>
                    <div class="row">
                      <b>${x.points.toFixed(2)}</b>
                      <button class="btn btn--ok" data-action="quickWin" data-username="${x.username}">اعتماد</button>
                    </div>
                  </div>
                `).join("") || `<div class="muted">لا يوجد مشاركين بعد.</div>`}
              </div>
            ` : `<div class="muted">ابدأ جولة من صفحة الجولات.</div>`}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__hd">
          <div class="card__title">📄 قائمة المحظورين</div>
          <div class="badge">${db.bans.length} عنصر</div>
        </div>
        <div class="card__bd">
          <table class="table">
            <thead><tr><th>المستخدم</th><th>السبب</th><th>التاريخ</th><th></th></tr></thead>
            <tbody>
              ${banRows || `<tr><td colspan="4" class="muted">لا يوجد محظورين</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    $("#banForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const username = String(fd.get("username") || "").trim().replace(/^@/, "");
      const reason = String(fd.get("reason") || "").trim();
      if (!username || !reason) return;

      const db2 = loadDB();
      if (!db2.bans.some(b => b.username.toLowerCase() === username.toLowerCase())) {
        db2.bans.unshift({ username, reason, createdAt: nowISO() });
        saveDB(db2);
        toast("تم الحظر");
        render();
      } else {
        toast("المستخدم محظور مسبقاً");
      }
    });

    viewRoot.addEventListener("click", (e) => {
      const unban = e.target.closest("button[data-action='unban']");
      if (unban) {
        const username = unban.dataset.username;
        const db2 = loadDB();
        db2.bans = db2.bans.filter(b => b.username.toLowerCase() !== username.toLowerCase());
        saveDB(db2);
        toast("تم إلغاء الحظر");
        render();
        return;
      }

      const quick = e.target.closest("button[data-action='quickWin']");
      if (quick) {
        const username = quick.dataset.username;
        const db2 = loadDB();
        if (!db2.live.isLive) return;
        pickWinner(db2, db2.live.roundId, username);
        render();
      }
    }, { once: true });
  }

  function renderSettings(db) {
    pageTitle.textContent = "الإعدادات";
    pageHint.textContent = "إعدادات الوكالة + ملاحظات تقنية.";

    viewRoot.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <div class="card__hd">
            <div class="card__title">🏷️ بيانات الوكالة</div>
          </div>
          <div class="card__bd">
            <form class="form" id="agencyForm">
              <div class="muted">اسم الوكالة</div>
              <input class="input" name="name" value="${db.agency?.name || ""}" required />
              <button class="btn btn--ok" type="submit">حفظ</button>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card__hd">
            <div class="card__title">ℹ️ ملاحظات</div>
          </div>
          <div class="card__bd">
            <ul style="margin:0; padding:0 18px; color: var(--muted); line-height: 1.8">
              <li>هذه نسخة Web فقط بدون TikTok API.</li>
              <li>الـ Overlay يستخدم BroadcastChannel (يعمل ضمن نفس المتصفح/النطاق).</li>
              <li>عند الانتقال للمرحلة 2: نستبدل المحاكاة بموصل TikTok Live Listener.</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    $("#agencyForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const name = String(fd.get("name") || "").trim();
      const db2 = loadDB();
      db2.agency.name = name;
      saveDB(db2);
      toast("تم الحفظ ✅");
      render();
    });
  }

  // -----------------------
  // Router render
  // -----------------------
  function render() {
    const db = loadDB();
    setLiveUI(db);

    const r = route();
    setActiveNav(r);

    if (r === "dashboard") return renderDashboard(db);
    if (r === "streamers") return renderStreamers(db);
    if (r === "games") return renderGames(db);
    if (r === "rounds") return renderRounds(db);
    if (r === "moderation") return renderModeration(db);
    if (r === "settings") return renderSettings(db);

    // fallback
    location.hash = "#/dashboard";
  }

  // -----------------------
  // Global binds
  // -----------------------
  window.addEventListener("hashchange", render);

  $("#startSimBtn").addEventListener("click", startSimulation);
  $("#stopSimBtn").addEventListener("click", stopSimulation);

  $("#resetDataBtn").addEventListener("click", () => {
    localStorage.removeItem(KEY);
    stopSimulation();
    const db = loadDB();
    pushOverlayState(db);
    toast("تمت إعادة ضبط البيانات");
    location.hash = "#/dashboard";
    render();
  });

  // End round automatically when time passes (basic tick)
  setInterval(() => {
    const db = loadDB();
    if (!db.live.isLive || !db.live.roundId) return;

    const r = db.rounds.find(x => x.id === db.live.roundId);
    if (!r || r.status !== "running") return;

    const endsAt = new Date(r.endsAt).getTime();
    if (Date.now() >= endsAt) {
      endRound(db, r.id);
      stopSimulation();
      render();
    }
  }, 800);

  // Initial
  render();

  // First push overlay state so overlay can show something
  pushOverlayState(loadDB());

})();
