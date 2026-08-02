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

  const LANG_COLORS = {
    JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5",
    HTML: "#e34c26", CSS: "#563d7c", Java: "#b07219", Go: "#00ADD8",
    Rust: "#dea584", C: "#555555", "C++": "#f34b7d", "C#": "#178600",
    Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138", Kotlin: "#A97BFF",
    Shell: "#89e051", Vue: "#41b883", Dart: "#00B4AB", Jupyter: "#DA5B0B",
  };

  const STATUS_LABEL = {
    available: "available", building: "building", focus: "focus mode", away: "away"
  };
  const STATUS_BAR = { available: 30, building: 78, focus: 92, away: 8 };

  const $ = (sel) => document.querySelector(sel);

  function loadConfig() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch { return { ...defaults }; }
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
        return { time, type: "push", text: `pushed ${n} commit${n === 1 ? "" : "s"} to ${repo}` };
      }
      case "CreateEvent":
        return { time, type: "create", text: `created ${ev.payload.ref_type} ${ev.payload.ref || ""} in ${repo}`.trim() };
      case "PullRequestEvent":
        return { time, type: "pr", text: `${ev.payload.action} a pull request in ${repo}` };
      case "IssuesEvent":
        return { time, type: "issue", text: `${ev.payload.action} an issue in ${repo}` };
      case "IssueCommentEvent":
        return { time, type: "comment", text: `commented on an issue in ${repo}` };
      case "WatchEvent":
        return { time, type: "star", text: `starred ${repo}` };
      case "ForkEvent":
        return { time, type: "fork", text: `forked ${repo}` };
      case "DeleteEvent":
        return { time, type: "delete", text: `deleted ${ev.payload.ref_type} in ${repo}` };
      case "PublicEvent":
        return { time, type: "public", text: `made ${repo} public` };
      default:
        return { time, type: "event", text: `${ev.type.replace("Event", "").toLowerCase()} in ${repo}` };
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
    } catch (err) {
      feed.innerHTML = `<p class="term-line" style="color:var(--red)">$ error: could not reach github for "${username}" (${err.message})</p>`;
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
    if (!cfg.location && profile.location) $("#heroLocation").textContent = profile.location;
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

    grid.innerHTML = sorted.map(r => {
      const color = LANG_COLORS[r.language] || "#8B8D98";
      return `
        <a class="project-card" href="${r.html_url}" target="_blank" rel="noopener">
          <div class="project-card-top">
            <span class="project-name">${escapeHtml(r.name)}</span>
            ${r.stargazers_count > 0 ? `<span class="project-star">★ ${r.stargazers_count}</span>` : ""}
          </div>
          <p class="project-desc">${escapeHtml(r.description || "No description provided.")}</p>
          <div class="project-meta">
            ${r.language ? `<span><span class="lang-dot" style="background:${color}"></span>${escapeHtml(r.language)}</span>` : "<span></span>"}
            <span class="project-updated">updated ${timeAgo(r.pushed_at)}</span>
          </div>
        </a>`;
    }).join("");
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function applyConfigToUI(cfg) {
    $("#menuName").textContent = cfg.name || "console";
    $("#menuStatus").textContent = STATUS_LABEL[cfg.status] || cfg.status;
    $("#heroName").textContent = cfg.name || "set your name in settings";
    $("#heroTagline").textContent = cfg.tagline || "click the gear icon to configure this console";
    if (cfg.bio) $("#heroBio").textContent = cfg.bio;
    $("#heroLocation").textContent = cfg.location ? cfg.location : "— location not set —";

    $("#statusWord").textContent = STATUS_LABEL[cfg.status] || cfg.status;
    $("#statusDetail").textContent = cfg.currentWork
      ? `Currently working on: ${cfg.currentWork}`
      : "Set a \"currently working on\" note in settings to show it here.";
    $("#statusBarFill").style.width = `${STATUS_BAR[cfg.status] ?? 30}%`;

    $("#footTwitter").href = cfg.twitter ? `https://twitter.com/${cfg.twitter}` : "#";
    $("#footTwitter").style.display = cfg.twitter ? "inline" : "none";
    $("#footEmail").href = cfg.email ? `mailto:${cfg.email}` : "#";
    $("#footEmail").style.display = cfg.email ? "inline" : "none";

    // populate drawer fields
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

  function tickClock() {
    const now = new Date();
    const t = now.toLocaleTimeString([], { hour12: false });
    $("#menuClock").textContent = t;
    $("#heroLocalTime").textContent = `local time ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  function init() {
    const cfg = loadConfig();
    applyConfigToUI(cfg);
    renderPhotos();
    tickClock();
    setInterval(tickClock, 1000);

    if (cfg.username) {
      fetchGithub(cfg.username);
    } else {
      $("#drawer").classList.add("open");
      $("#scrim").classList.add("open");
    }

    // Drawer open/close
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

    // Save settings
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

    // Photo add
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

    // Lightbox
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
