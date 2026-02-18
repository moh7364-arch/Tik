(() => {
  "use strict";

  const channel = new BroadcastChannel("aglge_overlay");

  const dot = document.querySelector("#dot");
  const liveText = document.querySelector("#liveText");
  const gameTitle = document.querySelector("#gameTitle");
  const timerEl = document.querySelector("#timer");
  const leaderboardEl = document.querySelector("#leaderboard");
  const eventsEl = document.querySelector("#events");
  const winnerBox = document.querySelector("#winnerBox");
  const winnerName = document.querySelector("#winnerName");
  const winnerPts = document.querySelector("#winnerPts");

  let state = null;
  let tickTimer = null;

  function pad(n){ return String(n).padStart(2,"0"); }

  function setTimer() {
    if (!state?.live?.isLive || !state?.live?.endsAt) {
      timerEl.textContent = "00:00";
      return;
    }
    const ends = new Date(state.live.endsAt).getTime();
    const diff = Math.max(0, ends - Date.now());
    const sec = Math.floor(diff / 1000);
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    timerEl.textContent = `${pad(mm)}:${pad(ss)}`;
  }

  function render() {
    const isLive = !!state?.live?.isLive;
    dot.classList.toggle("live", isLive);
    liveText.textContent = isLive ? "LIVE" : "OFFLINE";

    const g = state?.game;
    gameTitle.textContent = g ? `${g.name} (${g.type})` : "—";

    // Leaderboard
    const lb = state?.round?.leaderboard || [];
    leaderboardEl.innerHTML = lb.length
      ? lb.map((x, i) => `
          <div class="item">
            <div><b>#${i+1}</b> @${x.username}</div>
            <div><b>${Number(x.points).toFixed(2)}</b></div>
          </div>
        `).join("")
      : `<div class="small">لا يوجد مشاركات بعد…</div>`;

    // Events
    const ev = state?.round?.lastEvents || [];
    eventsEl.innerHTML = ev.length
      ? ev.map(e => `
          <div class="item">
            <div>@${e.username} — <span class="small">${e.type}</span></div>
            <div><b>+${Number(e.points || 0).toFixed(2)}</b></div>
          </div>
        `).join("")
      : `<div class="small">—</div>`;

    // Winner
    const w = state?.round?.winner || null;
    if (w) {
      winnerBox.hidden = false;
      winnerName.textContent = `@${w.username}`;
      winnerPts.textContent = `${Number(w.points).toFixed(2)} pts`;
    } else {
      winnerBox.hidden = true;
    }

    setTimer();
  }

  channel.addEventListener("message", (evt) => {
    if (evt?.data?.type === "OVERLAY_STATE") {
      state = evt.data.data;
      render();
      if (!tickTimer) {
        tickTimer = setInterval(setTimer, 300);
      }
    }
  });

  // Initial empty render
  state = { live: { isLive:false }, game:null, round:null };
  render();
})();
