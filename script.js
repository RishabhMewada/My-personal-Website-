(() => {
  const STORAGE_KEY = "console.config.v1";
  const PHOTOS_KEY = "console.photos.v1";

  const defaults = {
    username: "",
    name: "",
    tagline: "",
    bio: "",
    status: "available",
    currentWork: "",
    location: "",
    twitter: "",
    email: "",
  };

  const STATUS_LABEL = { available: "available", building: "building", focus: "focus mode", away: "away" };
  const STATUS_BAR = { available: 30, building: 78, focus: 92, away: 8 };

  const $ = (sel) => document.querySelector(sel);

  function loadConfig() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
    catch { return { ...defaults }; }
  }
  function saveConfig(cfg) { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }

  function loadPhotos() {
    try { return JSON.parse(localStorage.getItem(PHOTOS_KEY) || "[]"); } catch { return []; }
  }
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
      case "CreateEvent":
        return { time, text: `created ${ev.payload.ref_type} ${ev.payload.ref || ""} in ${repo}`.trim() };
      case "PullRequestEvent":
        return { time, text: `${ev.payload.action} a pull request in ${repo}` };
      case "IssuesEvent":
        return { time, text: `${ev.payload.action} an issue in ${repo}` };
      case "IssueCommentEvent":
        return { time, text: `commented on an issue in ${repo}` };
      case "WatchEvent":
        return { time, text: `starred ${repo}` };
      case "ForkEvent":
        return { time, text: `forked ${repo}` };
      case "DeleteEvent":
        return { time, text: `deleted ${ev.payload.ref_type} in ${repo}` };
      case "PublicEvent":
        return { time, text: `made ${repo} public` };
      default:
        return { time, text: `${ev.type.replace("Event", "").toLowerCase()} in ${repo}` };
    }
  }

  async function fetchGithub(username) {
    const feed = $("#activityFeed");
    feed.innerHTML = `<p class="term-line term-muted">$ connecting to github.com/${username}…<span class="cursor">_</span></p>`;

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
      renderTicker(repos, username);
    } catch (err) {
      feed.innerHTML = `<p class="term-line" style="color:var(--coral)">$ error: could not reach github for "${username}" (${err.message})</p>`;
      $("#projectGrid").innerHTML = `<div class="empty-state">Couldn't load repositories for "${username}". Check the username in settings.</div>`;
    }
  }

  function renderProfile(profile, repos) {
    $("#avatarImg").src = profile.avatar_url;
    $("#avatarImg").style.display = "block";
    $("#avatarFallback").style.display = "none";
    $("#statRepos").textContent = profile.public_repos ?? "–";
    $("#statFollowers").textContent = profile.followers ?? "–";
    const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
    $("#statStars").textContent = totalStars;
    $("#heroGithubLink").href = profile.html_url;
    $("#footGithub").href = profile.html_url;

    const cfg = loadConfig();
    if (!cfg.name) $("#heroName").textContent = profile.name || profile.login;
    if (!cfg.bio && profile.bio) $("#heroBio").textContent = profile.bio;
    if (!cfg.location && profile.location) $("#heroLocation") && ($("#heroLocation").textContent = profile.location);
  }

  function renderProjects(repos) {
    const grid = $("#projectGrid");
    const sub = $("#projectsSub");
    if (!repos || repos.length === 0) {
      grid.innerHTML = `<div class="empty-state">No public repositories found yet.</div>`;
      return;
    }
    const sorted = [...repos]
      .filter(r => !r.fork)
      .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
      .slice(0, 12);
    sub.textContent = `${repos.length} public repositories — showing ${sorted.length} most recently updated`;

    grid.innerHTML = sorted.map(r => `
      <a class="project-card" href="${r.html_url}" target="_blank" rel="noopener">
        <div class="project-card-top">
          <span class="project-name">${escapeHtml(r.name)}</span>
          ${r.language ? `<span class="lang-pill">${escapeHtml(r.language)}</span>` : ""}
        </div>
        <p class="project-desc">${escapeHtml(r.description || "No description provided.")}</p>
        <div class="project-meta">
          <span>updated ${timeAgo(r.pushed_at)}</span>
          ${r.stargazers_count > 0 ? `<span class="project-star">★ ${r.stargazers_count}</span>` : "<span></span>"}
        </div>
        <span class="view-btn">view project ↗</span>
      </a>`).join("");
  }

  function renderActivity(events, username) {
    const feed = $("#activityFeed");
    if (!events || events.length === 0) {
      feed.innerHTML = `<p class="term-line term-muted">$ no recent public activity for ${username}<span class="cursor">_</span></p>`;
      return;
    }
    feed.innerHTML = "";
    const lines = events.slice(0, 20).map(eventLine);
    lines.forEach((line, i) => {
      const el = document.createElement("p");
      el.className = "term-line";
      el.style.animationDelay = `${i * 40}ms`;
      el.innerHTML = `<span class="term-time">${line.time}</span><span>&gt;</span> ${escapeHtml(line.text)}`;
      feed.appendChild(el);
    });
    const cursorLine = document.createElement("p");
    cursorLine.className = "term-line term-muted";
    cursorLine.innerHTML = `$ streaming from github.com/${username}<span class="cursor">_</span>`;
    feed.appendChild(cursorLine);
  }

  function renderTicker(repos, username) {
    const track = $("#tickerTrack");
    const counts = {};
    (repos || []).forEach(r => { if (r.language) counts[r.language] = (counts[r.language] || 0) + 1; });
    const langs = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([lang]) => lang);
    const items = [
      `@${username}`,
      ...langs.slice(0, 8),
      `${(repos || []).length} public repos`,
      "shipping in public",
    ];
    const html = `<span>${items.map(escapeHtml).join(" &nbsp; ")}</span>`;
    track.innerHTML = html + html; // duplicate for seamless loop
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function initials(name) {
    if (!name) return "[ · ]";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
    return `[${chars.toUpperCase()}]`;
  }

  function renderCodeCard(cfg) {
    const name = cfg.name || cfg.username || "you";
    const status = STATUS_LABEL[cfg.status] || cfg.status;
    const focus = cfg.currentWork || "nothing set yet";
    const base = cfg.location || "unknown";
    $("#codeCardTitle").textContent = `${(cfg.username || "status")}.js`;
    $("#heroCodeBlock").innerHTML =
`<span class="c">// live status, edited from settings</span>
<span class="k">const</span> ${escapeHtml(cfg.username ? cfg.username.replace(/[^a-zA-Z0-9_]/g, "_") : "me")} = {
  name: <span class="s">"${escapeHtml(name)}"</span>,
  status: <span class="s">"${escapeHtml(status)}"</span>,
  focus: <span class="s">"${escapeHtml(focus)}"</span>,
  base: <span class="s">"${escapeHtml(base)}"</span>,
};`;
  }

  function applyConfigToUI(cfg) {
    $("#menuLogo").textContent = initials(cfg.name);
    $("#heroName").textContent = cfg.name || "someone";
    $("#heroTagline").textContent = cfg.tagline || "click the gear to configure this console";
    if (cfg.bio) $("#heroBio").textContent = cfg.bio;

    $("#statusWord").textContent = STATUS_LABEL[cfg.status] || cfg.status;
    $("#statusDetail").textContent = cfg.currentWork
      ? `Currently working on: ${cfg.currentWork}`
      : "Set a \"currently working on\" note in settings to show it here.";
    $("#statusBarFill").style.width = `${STATUS_BAR[cfg.status] ?? 30}%`;

    $("#footTwitter").href = cfg.twitter ? `https://twitter.com/${cfg.twitter}` : "#";
    $("#footTwitter").style.display = cfg.twitter ? "flex" : "none";
    $("#footEmail").href = cfg.email ? `mailto:${cfg.email}` : "#";
    $("#footEmail").style.display = cfg.email ? "flex" : "none";
    $("#footCopy").textContent = `© ${new Date().getFullYear()} ${cfg.name || "console"}`;

    renderCodeCard(cfg);

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
      </div>
    `).join("");

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

  function init() {
    const cfg = loadConfig();
    applyConfigToUI(cfg);
    renderPhotos();

    if (cfg.username) {
      fetchGithub(cfg.username);
    } else {
      $("#drawer").classList.add("open");
      $("#scrim").classList.add("open");
    }

    $("#settingsBtn").addEventListener("click", () => {
      $("#drawer").classList.add("open");
      $("#scrim").classList.add("open");
    });
    $("#closeDrawer").addEventListener("click", closeDrawer);
    $("#scrim").addEventListener("click", closeDrawer);
    function closeDrawer() {
      $("#drawer").classList.remove("open");
      $("#scrim").classList.remove("open");
    }

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
    $("#lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") $("#lightbox").classList.remove("open");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        $("#lightbox").classList.remove("open");
        closeDrawer();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
