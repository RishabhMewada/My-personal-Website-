(() => {
  const STORAGE_KEY = "observatory.config.v1";
  const PHOTOS_KEY = "observatory.photos.v1";

  const defaults = {
    username: "", name: "", tagline: "", bio: "", status: "available",
    currentWork: "", location: "", twitter: "", email: "",
  };

  const STATUS_LABEL = { available: "available", building: "building", focus: "focus mode", away: "away" };
  const STATUS_ANGLE = { available: -55, building: 35, focus: 65, away: -80 }; // degrees for gauge needle, range -90..90
  const ORBIT_COLORS = ["#E8B559", "#7FC7C2", "#B7A6E0"];

  const $ = (sel) => document.querySelector(sel);
  const $all = (sel) => document.querySelectorAll(sel);

  function loadConfig() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
    catch { return { ...defaults }; }
  }
  function saveConfig(cfg) { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
  function loadPhotos() { try { return JSON.parse(localStorage.getItem(PHOTOS_KEY) || "[]"); } catch { return []; } }
  function savePhotos(photos) { localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos)); }

  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    const table = [[31536000,"y"],[2592000,"mo"],[604800,"w"],[86400,"d"],[3600,"h"],[60,"m"]];
    for (const [secs, label] of table) {
      const v = Math.floor(diff / secs);
      if (v >= 1) return `${v}${label} ago`;
    }
    return "just now";
  }

  function eventLine(ev) {
    const time = new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const repo = ev.repo ? ev.repo.name : "";
    switch (ev.type) {
      case "PushEvent": {
        const n = ev.payload && ev.payload.commits ? ev.payload.commits.length : 0;
        return { time, text: `pushed ${n} commit${n === 1 ? "" : "s"} to ${repo}` };
      }
      case "CreateEvent": return { time, text: `created ${ev.payload.ref_type} ${ev.payload.ref || ""} in ${repo}`.trim() };
      case "PullRequestEvent": return { time, text: `${ev.payload.action} a pull request in ${repo}` };
      case "IssuesEvent": return { time, text: `${ev.payload.action} an issue in ${repo}` };
      case "IssueCommentEvent": return { time, text: `commented on an issue in ${repo}` };
      case "WatchEvent": return { time, text: `starred ${repo}` };
      case "ForkEvent": return { time, text: `forked ${repo}` };
      case "DeleteEvent": return { time, text: `deleted ${ev.payload.ref_type} in ${repo}` };
      case "PublicEvent": return { time, text: `made ${repo} public` };
      default: return { time, text: `${ev.type.replace("Event", "").toLowerCase()} in ${repo}` };
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  async function fetchGithub(username) {
    const feed = $("#activityFeed");
    feed.innerHTML = `<p class="log-line log-muted">connecting to github.com/${escapeHtml(username)}…</p>`;

    try {
      const [profileRes, reposRes, eventsRes] = await Promise.all([
        fetch(`https://api.github.com/users/${username}`),
        fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=100`),
        fetch(`https://api.github.com/users/${username}/events/public?per_page=30`),
      ]);
      if (!profileRes.ok) throw new Error("user not found");
      const profile = await profileRes.json();
      const repos = reposRes.ok ? await reposRes.json() : [];
      const events = eventsRes.ok ? await eventsRes.json() : [];

      renderProfile(profile, repos);
      renderProjects(repos);
      renderActivity(events, username);
      renderLangRow(repos);
      renderOrbit(repos, profile);
    } catch (err) {
      feed.innerHTML = `<p class="log-line log-muted">error: could not reach github for "${escapeHtml(username)}" (${escapeHtml(err.message)})</p>`;
      $("#projectGrid").innerHTML = `<div class="empty-state">Couldn't load repositories for "${escapeHtml(username)}". Check the username in settings.</div>`;
      $("#orbitChart").innerHTML = `<p class="empty-state">Couldn't reach GitHub for "${escapeHtml(username)}".</p>`;
    }
  }

  function renderProfile(profile, repos) {
    $("#statRepos") && ($("#statRepos").textContent = profile.public_repos ?? "–");
    $("#heroGithubLink").href = profile.html_url;
    $("#footGithub").href = profile.html_url;
    const cfg = loadConfig();
    if (!cfg.name) $("#heroName").textContent = profile.name || profile.login;
    if (!cfg.bio && profile.bio) $("#heroBio").textContent = profile.bio;
  }

  function renderProjects(repos) {
    const grid = $("#projectGrid");
    const sub = $("#projectsSub");
    if (!repos || repos.length === 0) {
      grid.innerHTML = `<div class="empty-state">No public repositories found yet.</div>`;
      return;
    }
    const sorted = [...repos].filter(r => !r.fork).sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at)).slice(0, 14);
    sub.textContent = `${repos.length} public repositories — showing ${sorted.length} most recently updated`;
    grid.innerHTML = sorted.map(r => `
      <a class="project-card" href="${r.html_url}" target="_blank" rel="noopener">
        <div class="project-card-top">
          <span class="project-name">${escapeHtml(r.name)}</span>
          ${r.language ? `<span class="project-lang">${escapeHtml(r.language)}</span>` : ""}
        </div>
        <p class="project-desc">${escapeHtml(r.description || "No description provided.")}</p>
        <div class="project-meta">
          <span>updated ${timeAgo(r.pushed_at)}</span>
          ${r.stargazers_count > 0 ? `<span class="star">★ ${r.stargazers_count}</span>` : ""}
        </div>
      </a>`).join("");
  }

  function renderActivity(events, username) {
    const feed = $("#activityFeed");
    if (!events || events.length === 0) {
      feed.innerHTML = `<p class="log-line log-muted">no recent public activity for ${escapeHtml(username)}</p>`;
      return;
    }
    feed.innerHTML = "";
    events.slice(0, 20).map(eventLine).forEach((line, i) => {
      const el = document.createElement("p");
      el.className = "log-line";
      el.style.animationDelay = `${i * 35}ms`;
      el.innerHTML = `<span class="log-time">${line.time}</span><span class="log-text">${escapeHtml(line.text)}</span>`;
      feed.appendChild(el);
    });
  }

  function renderLangRow(repos) {
    const counts = {};
    (repos || []).forEach(r => { if (r.language) counts[r.language] = (counts[r.language] || 0) + 1; });
    const langs = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l]) => l);
    $("#langRow").innerHTML = langs.map(l => `<span>${escapeHtml(l)}</span>`).join("");
  }

  function renderOrbit(repos, profile) {
    const container = $("#orbitChart");
    const legend = $("#orbitLegend");
    const nonForks = (repos || []).filter(r => !r.fork).sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
    const picked = nonForks.slice(0, 7);

    if (picked.length === 0) {
      container.innerHTML = `<p class="empty-state">No public repositories to plot yet.</p>`;
      legend.innerHTML = "";
      return;
    }

    const size = 480, cx = size / 2, cy = size / 2;
    const baseR = 68, maxR = 218;
    const step = picked.length > 1 ? (maxR - baseR) / (picked.length - 1) : 0;
    const goldenAngle = 137.508;

    let rings = "";
    let nodes = "";
    let legendHtml = "";

    picked.forEach((r, i) => {
      const orbitR = baseR + step * i;
      rings += `<circle class="orbit-ring" cx="${cx}" cy="${cy}" r="${orbitR.toFixed(1)}"></circle>`;
      const angleDeg = -90 + i * goldenAngle;
      const angleRad = (angleDeg * Math.PI) / 180;
      const nx = cx + orbitR * Math.cos(angleRad);
      const ny = cy + orbitR * Math.sin(angleRad);
      const nodeR = Math.max(5, Math.min(16, 5 + Math.sqrt((r.stargazers_count || 0) + 1) * 2));
      const color = ORBIT_COLORS[i % ORBIT_COLORS.length];
      nodes += `<a href="${r.html_url}" target="_blank" rel="noopener">
        <circle class="orbit-node" cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="${nodeR.toFixed(1)}" fill="${color}" fill-opacity="0.9">
          <title>${escapeHtml(r.name)} — ${r.stargazers_count || 0} stars, updated ${timeAgo(r.pushed_at)}</title>
        </circle>
      </a>`;
      legendHtml += `<li><span class="dot" style="background:${color}"></span>${escapeHtml(r.name)}</li>`;
    });

    const avatarId = "orbitAvatarClip";
    const avatarUrl = profile && profile.avatar_url ? profile.avatar_url : "";
    const centerAvatar = avatarUrl
      ? `<defs><clipPath id="${avatarId}"><circle cx="${cx}" cy="${cy}" r="40"></circle></clipPath></defs>
         <image href="${avatarUrl}" x="${cx - 40}" y="${cy - 40}" width="80" height="80" clip-path="url(#${avatarId})"></image>
         <circle cx="${cx}" cy="${cy}" r="40" fill="none" stroke="${ORBIT_COLORS[0]}" stroke-width="1.5"></circle>`
      : `<circle cx="${cx}" cy="${cy}" r="40" fill="var(--void-2)" stroke="${ORBIT_COLORS[0]}" stroke-width="1.5"></circle>`;

    container.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        ${rings}
        ${centerAvatar}
        <g class="orbit-group">${nodes}</g>
      </svg>`;
    legend.innerHTML = legendHtml;
  }

  function buildGauge(status) {
    const angle = STATUS_ANGLE[status] ?? 0;
    const cx = 75, cy = 75, r = 58;
    const rad = ((angle - 90) * Math.PI) / 180;
    const nx = cx + r * 0.72 * Math.cos(rad);
    const ny = cy + r * 0.72 * Math.sin(rad);
    const ticks = [-90, -45, 0, 45, 90].map(a => {
      const tr = ((a - 90) * Math.PI) / 180;
      const x1 = cx + (r - 6) * Math.cos(tr), y1 = cy + (r - 6) * Math.sin(tr);
      const x2 = cx + r * Math.cos(tr), y2 = cy + r * Math.sin(tr);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--hairline)" stroke-width="2"/>`;
    }).join("");
    return `
      <svg viewBox="0 0 150 92" xmlns="http://www.w3.org/2000/svg">
        <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="var(--hairline)" stroke-width="2"/>
        ${ticks}
        <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--gold)"/>
      </svg>`;
  }

  function initials(name) {
    if (!name) return "observatory";
    return name.trim();
  }

  function applyConfigToUI(cfg) {
    const wm = initials(cfg.name);
    $("#wordmark").textContent = wm;
    $("#wordmarkMobile").textContent = wm;
    $("#heroName").textContent = cfg.name || "someone";
    $("#heroTagline").textContent = cfg.tagline || "open settings to point this at a GitHub username";
    if (cfg.bio) $("#heroBio").textContent = cfg.bio;

    $("#statusWord").textContent = STATUS_LABEL[cfg.status] || cfg.status;
    $("#statusDetail").textContent = cfg.currentWork
      ? `Currently working on: ${cfg.currentWork}`
      : "Set a \"currently working on\" note in settings to show it here.";
    $("#gaugeWrap").innerHTML = buildGauge(cfg.status);

    $("#footTwitter").href = cfg.twitter ? `https://twitter.com/${cfg.twitter}` : "#";
    $("#footTwitter").style.display = cfg.twitter ? "flex" : "none";
    $("#footEmail").href = cfg.email ? `mailto:${cfg.email}` : "#";
    $("#footEmail").style.display = cfg.email ? "flex" : "none";
    $("#footCopy").textContent = `© ${new Date().getFullYear()} ${cfg.name || "observatory"}`;

    $("#ghUsername").value = cfg.username || "";
    $("#displayName").value = cfg.name || "";
    $("#tagline").value = cfg.tagline || "";
    $("#bioText").value = cfg.bio || "";
    $("#workStatus").value = cfg.status || "available";
    $("#currentWork").value = cfg.currentWork || "";
    $("#locationText").value = cfg.location || "";
    $("#twitterHandle").value = cfg.twitter || "";
    $("#emailAddr").value = cfg.email || "";
  }

  function renderPhotos() {
    const photos = loadPhotos();
    const grid = $("#photoGrid");
    if (photos.length === 0) {
      grid.innerHTML = `<div class="empty-state">No photos yet — add one below (screenshots, builds, whatever tells the story).</div>`;
      return;
    }
    grid.innerHTML = photos.map((p, i) => `
      <div class="photo-item" data-index="${i}">
        <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.caption || "")}" loading="lazy">
        ${p.caption ? `<div class="photo-caption">${escapeHtml(p.caption)}</div>` : ""}
        <button class="photo-remove" data-remove="${i}" aria-label="Remove photo">✕</button>
      </div>`).join("");

    grid.querySelectorAll(".photo-item img").forEach(img => {
      img.addEventListener("click", () => {
        $("#lightboxImg").src = img.src;
        $("#lightboxCaption").textContent = img.alt || "";
        $("#lightbox").classList.add("open");
      });
    });
    grid.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.remove, 10);
        const photos = loadPhotos();
        photos.splice(idx, 1);
        savePhotos(photos);
        renderPhotos();
      });
    });
  }

  function tickClock() {
    const now = new Date();
    $("#railTime").textContent = now.toLocaleTimeString([], { hour12: false });
  }

  function setupScrollReveal() {
    $all(".block, .hero").forEach(el => el.classList.add("reveal"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); } });
    }, { threshold: 0.1 });
    $all(".reveal").forEach(el => io.observe(el));
  }

  function init() {
    const cfg = loadConfig();
    applyConfigToUI(cfg);
    renderPhotos();
    tickClock();
    setInterval(tickClock, 1000);
    setupScrollReveal();

    if (cfg.username) fetchGithub(cfg.username);
    else { $("#drawer").classList.add("open"); $("#scrim").classList.add("open"); }

    function openDrawer() { $("#drawer").classList.add("open"); $("#scrim").classList.add("open"); }
    function closeDrawer() { $("#drawer").classList.remove("open"); $("#scrim").classList.remove("open"); }
    $("#settingsBtn").addEventListener("click", openDrawer);
    $("#settingsBtnMobile").addEventListener("click", openDrawer);
    $("#closeDrawer").addEventListener("click", closeDrawer);
    $("#scrim").addEventListener("click", closeDrawer);

    $("#saveSettings").addEventListener("click", () => {
      const newCfg = {
        username: $("#ghUsername").value.trim(),
        name: $("#displayName").value.trim(),
        tagline: $("#tagline").value.trim(),
        bio: $("#bioText").value.trim(),
        status: $("#workStatus").value,
        currentWork: $("#currentWork").value.trim(),
        location: $("#locationText").value.trim(),
        twitter: $("#twitterHandle").value.trim(),
        email: $("#emailAddr").value.trim(),
      };
      saveConfig(newCfg);
      applyConfigToUI(newCfg);
      closeDrawer();
      if (newCfg.username) fetchGithub(newCfg.username);
    });

    $("#photoAddForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const url = $("#photoUrl").value.trim();
      const caption = $("#photoCaption").value.trim();
      if (!url) return;
      const photos = loadPhotos();
      photos.unshift({ url, caption });
      savePhotos(photos);
      $("#photoUrl").value = "";
      $("#photoCaption").value = "";
      renderPhotos();
    });

    $("#lightboxClose").addEventListener("click", () => $("#lightbox").classList.remove("open"));
    $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") $("#lightbox").classList.remove("open"); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { $("#lightbox").classList.remove("open"); closeDrawer(); }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
