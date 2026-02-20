(() => {
  const STORAGE_KEY = "youtubeTabVault.v1";
  const CLOUD_CONFIG_KEY = "youtubeTabVault.supabase.v1";
  const DEFAULT_CATEGORY = "Be kategorijos";
  const SORT_OPTIONS = ["newest", "oldest", "title", "channel"];
  const CLOUD_SYNC_DELAY_MS = 900;

  const refs = {};
  let state = loadState();
  let editingId = null;
  let cloudSyncTimer = null;
  const cloud = {
    client: null,
    config: null,
    user: null,
    syncing: false,
  };

  async function init() {
    cacheRefs();
    bindEvents();
    hydrateControls();
    renderAll();
    await initCloud();
    renderCloudStatus();
  }

  function cacheRefs() {
    refs.globalSearch = document.getElementById("globalSearch");
    refs.sortSelect = document.getElementById("sortSelect");
    refs.cloudStatus = document.getElementById("cloudStatus");
    refs.cloudConfigBtn = document.getElementById("cloudConfigBtn");
    refs.cloudAuthBtn = document.getElementById("cloudAuthBtn");
    refs.cloudSyncBtn = document.getElementById("cloudSyncBtn");

    refs.categoryNav = document.getElementById("categoryNav");
    refs.newCategoryBtn = document.getElementById("newCategoryBtn");
    refs.categoryOptions = document.getElementById("categoryOptions");

    refs.entryForm = document.getElementById("entryForm");
    refs.urlInput = document.getElementById("urlInput");
    refs.titleInput = document.getElementById("titleInput");
    refs.channelInput = document.getElementById("channelInput");
    refs.categoryInput = document.getElementById("categoryInput");
    refs.tagsInput = document.getElementById("tagsInput");
    refs.watchDateInput = document.getElementById("watchDateInput");
    refs.watchedInput = document.getElementById("watchedInput");
    refs.descriptionInput = document.getElementById("descriptionInput");
    refs.notesInput = document.getElementById("notesInput");
    refs.autoInfoBtn = document.getElementById("autoInfoBtn");
    refs.cancelEditBtn = document.getElementById("cancelEditBtn");
    refs.formStatus = document.getElementById("formStatus");

    refs.exportBtn = document.getElementById("exportBtn");
    refs.importInput = document.getElementById("importInput");
    refs.clearBtn = document.getElementById("clearBtn");
    refs.toolsStatus = document.getElementById("toolsStatus");

    refs.statAll = document.getElementById("statAll");
    refs.statVisible = document.getElementById("statVisible");
    refs.statCategories = document.getElementById("statCategories");
    refs.statWatched = document.getElementById("statWatched");

    refs.board = document.getElementById("board");

    refs.viewerCard = document.getElementById("viewerCard");
    refs.viewerTitle = document.getElementById("viewerTitle");
    refs.videoFrame = document.getElementById("videoFrame");
    refs.viewerOpenExternalBtn = document.getElementById("viewerOpenExternalBtn");
    refs.viewerToggleWatchedBtn = document.getElementById("viewerToggleWatchedBtn");
    refs.viewerNotesInput = document.getElementById("viewerNotesInput");
    refs.viewerSaveNotesBtn = document.getElementById("viewerSaveNotesBtn");
    refs.viewerStatus = document.getElementById("viewerStatus");
  }

  function bindEvents() {
    refs.entryForm.addEventListener("submit", onFormSubmit);
    refs.autoInfoBtn.addEventListener("click", onAutoInfo);
    refs.cancelEditBtn.addEventListener("click", resetForm);

    refs.globalSearch.addEventListener("input", () => {
      state.settings.query = cleanText(refs.globalSearch.value);
      persist();
      renderAll();
    });

    refs.sortSelect.addEventListener("change", () => {
      state.settings.sort = refs.sortSelect.value;
      persist();
      renderAll();
    });

    refs.newCategoryBtn.addEventListener("click", onCreateCategory);
    refs.categoryNav.addEventListener("click", onCategoryClick);

    refs.exportBtn.addEventListener("click", onExport);
    refs.importInput.addEventListener("change", onImport);
    refs.clearBtn.addEventListener("click", onClearAll);

    refs.board.addEventListener("click", onBoardClick);
    refs.board.addEventListener("change", onBoardChange);

    refs.viewerOpenExternalBtn.addEventListener("click", onViewerOpenExternal);
    refs.viewerToggleWatchedBtn.addEventListener("click", onViewerToggleWatched);
    refs.viewerSaveNotesBtn.addEventListener("click", onViewerSaveNotes);

    refs.cloudConfigBtn.addEventListener("click", onCloudConfigure);
    refs.cloudAuthBtn.addEventListener("click", onCloudAuth);
    refs.cloudSyncBtn.addEventListener("click", onCloudSyncNow);
  }

  function hydrateControls() {
    refs.globalSearch.value = state.settings.query;
    refs.sortSelect.value = state.settings.sort;
    refs.categoryInput.value =
      state.settings.activeCategory !== "all"
        ? state.settings.activeCategory
        : DEFAULT_CATEGORY;
  }

  async function onFormSubmit(event) {
    event.preventDefault();

    const rawUrl = cleanText(refs.urlInput.value);
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) {
      setStatus(refs.formStatus, "Neteisingas URL.", "error");
      return;
    }

    const yt = parseYouTubeUrl(normalized);
    const candidateUrl = yt ? yt.canonicalUrl : normalized;

    const now = new Date().toISOString();
    const current = editingId ? state.entries.find((item) => item.id === editingId) : null;

    let fetched = null;
    const titleMissing = !cleanText(refs.titleInput.value);
    const channelMissing = !cleanText(refs.channelInput.value);
    if (yt && (titleMissing || channelMissing || !current?.thumbnail)) {
      fetched = await fetchYoutubeMeta(candidateUrl);
    }

    const preferredCategory =
      !cleanText(refs.categoryInput.value) && state.settings.activeCategory !== "all"
        ? state.settings.activeCategory
        : refs.categoryInput.value;
    const category = normalizeCategory(preferredCategory);
    ensureCategory(category);

    const entry = {
      id: current ? current.id : makeId(),
      url: candidateUrl,
      type: yt ? "youtube" : "link",
      videoId: yt ? yt.videoId : "",
      thumbnail:
        cleanText(current?.thumbnail) ||
        cleanText(fetched?.thumbnail) ||
        cleanText(yt?.thumbnail) ||
        "",
      title:
        cleanText(refs.titleInput.value) ||
        cleanText(fetched?.title) ||
        cleanText(current?.title) ||
        suggestTitle(candidateUrl),
      channel:
        cleanText(refs.channelInput.value) ||
        cleanText(fetched?.channel) ||
        cleanText(current?.channel) ||
        "Nezinomas kanalas",
      category,
      tags: parseTags(refs.tagsInput.value),
      watchDate: normalizeWatchDate(refs.watchDateInput.value),
      watched: refs.watchedInput.checked,
      watchedAt: refs.watchedInput.checked
        ? current?.watchedAt || now
        : "",
      description: cleanTextarea(refs.descriptionInput.value),
      notes: cleanTextarea(refs.notesInput.value),
      addedAt: current ? current.addedAt : now,
      updatedAt: now,
    };

    if (current) {
      state.entries = state.entries.map((item) => (item.id === entry.id ? entry : item));
    } else {
      state.entries.unshift(entry);
    }

    state.settings.activeCategory = category;
    state.settings.currentEntryId = entry.id;

    persist();
    renderAll();
    resetForm();
    setStatus(
      refs.formStatus,
      current ? "Nuoroda atnaujinta." : "Nuoroda issaugota.",
      "success"
    );
  }

  async function onAutoInfo() {
    const normalized = normalizeUrl(cleanText(refs.urlInput.value));
    if (!normalized) {
      setStatus(refs.formStatus, "Pirmiausia ivesk teisinga URL.", "error");
      return;
    }

    const yt = parseYouTubeUrl(normalized);
    if (!yt) {
      refs.titleInput.value = refs.titleInput.value || suggestTitle(normalized);
      setStatus(refs.formStatus, "Ne YouTube nuoroda: uzpildytas tik pavadinimas.", "success");
      return;
    }

    const meta = await fetchYoutubeMeta(yt.canonicalUrl);
    if (!meta) {
      refs.titleInput.value = refs.titleInput.value || suggestTitle(yt.canonicalUrl);
      setStatus(refs.formStatus, "Nepavyko paimti YouTube info, bet URL atpazintas.", "error");
      return;
    }

    refs.titleInput.value = refs.titleInput.value || meta.title;
    refs.channelInput.value = refs.channelInput.value || meta.channel;
    setStatus(refs.formStatus, "Pavadinimas ir kanalas paimti automatiskai.", "success");
  }

  function onCreateCategory() {
    const input = prompt("Naujos kategorijos pavadinimas:", "");
    if (input === null) return;

    const category = normalizeCategory(input);
    if (state.categories.includes(category)) {
      setStatus(refs.toolsStatus, "Tokia kategorija jau yra.", "error");
      return;
    }

    ensureCategory(category);
    state.settings.activeCategory = category;
    refs.categoryInput.value = category;
    persist();
    renderAll();
    setStatus(refs.toolsStatus, `Kategorija sukurta: ${category}`, "success");
  }

  function onCategoryClick(event) {
    const button = event.target.closest("button[data-category]");
    if (!button) return;

    state.settings.activeCategory = button.dataset.category;
    if (state.settings.activeCategory !== "all") {
      refs.categoryInput.value = state.settings.activeCategory;
    }
    persist();
    renderAll();
  }

  function onExport() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      state,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `youtube-tab-vault-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();

    setStatus(refs.toolsStatus, "Eksportas parsiustas.", "success");
  }

  async function onImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const imported = parsed.state ? parsed.state : parsed;
      state = sanitizeState(imported);
      persist();
      renderAll();
      setStatus(refs.toolsStatus, "Importas sekmingas.", "success");
    } catch {
      setStatus(refs.toolsStatus, "Importuoti nepavyko (blogas JSON).", "error");
    } finally {
      refs.importInput.value = "";
    }
  }

  function onClearAll() {
    if (!confirm("Tikrai istrinti visas nuorodas ir kategorijas?")) return;
    state = defaultState();
    resetForm();
    persist();
    renderAll();
    setStatus(refs.toolsStatus, "Viskas isvalyta.", "success");
  }

  function onBoardClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;

    if (action === "watch-here") {
      state.settings.currentEntryId = entry.id;
      persist();
      renderAll();
      refs.viewerCard.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "open") {
      window.open(entry.url, "_blank", "noopener");
      return;
    }

    if (action === "edit") {
      editingId = entry.id;
      refs.urlInput.value = entry.url;
      refs.titleInput.value = entry.title;
      refs.channelInput.value = entry.channel;
      refs.categoryInput.value = entry.category;
      refs.tagsInput.value = entry.tags.join(", ");
      refs.watchDateInput.value = entry.watchDate || "";
      refs.watchedInput.checked = !!entry.watched;
      refs.descriptionInput.value = entry.description;
      refs.notesInput.value = entry.notes || "";
      refs.cancelEditBtn.classList.remove("hidden");
      state.settings.currentEntryId = entry.id;
      persist();
      renderAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (action === "toggle-watched") {
      const toggled = !entry.watched;
      const now = new Date().toISOString();
      state.entries = state.entries.map((item) =>
        item.id === entry.id
          ? {
              ...item,
              watched: toggled,
              watchedAt: toggled ? now : "",
              updatedAt: now,
            }
          : item
      );
      persist();
      renderAll();
      return;
    }

    if (action === "delete") {
      if (!confirm("Istrinti sia nuoroda?")) return;
      state.entries = state.entries.filter((item) => item.id !== entry.id);
      if (editingId === entry.id) resetForm();
      persist();
      renderAll();
    }
  }

  function onBoardChange(event) {
    const select = event.target.closest("select[data-action='move']");
    if (!select) return;

    const id = select.dataset.id;
    const category = normalizeCategory(select.value);
    ensureCategory(category);

    state.entries = state.entries.map((item) =>
      item.id === id ? { ...item, category, updatedAt: new Date().toISOString() } : item
    );

    persist();
    renderAll();
  }

  function onViewerOpenExternal() {
    const entry = getCurrentEntry();
    if (!entry) {
      setStatus(refs.viewerStatus, "Pasirink video is saraso.", "error");
      return;
    }
    window.open(entry.url, "_blank", "noopener");
  }

  function onViewerToggleWatched() {
    const entry = getCurrentEntry();
    if (!entry) {
      setStatus(refs.viewerStatus, "Pasirink video is saraso.", "error");
      return;
    }

    const toggled = !entry.watched;
    const now = new Date().toISOString();
    state.entries = state.entries.map((item) =>
      item.id === entry.id
        ? {
            ...item,
            watched: toggled,
            watchedAt: toggled ? now : "",
            updatedAt: now,
          }
        : item
    );

    persist();
    renderAll();
    setStatus(
      refs.viewerStatus,
      toggled ? "Video pazymetas kaip perziuretas." : "Video pazymetas kaip neperziuretas.",
      "success"
    );
  }

  function onViewerSaveNotes() {
    const entry = getCurrentEntry();
    if (!entry) {
      setStatus(refs.viewerStatus, "Pasirink video is saraso.", "error");
      return;
    }

    const notes = cleanTextarea(refs.viewerNotesInput.value);
    const now = new Date().toISOString();

    state.entries = state.entries.map((item) =>
      item.id === entry.id
        ? {
            ...item,
            notes,
            updatedAt: now,
          }
        : item
    );

    if (editingId === entry.id) {
      refs.notesInput.value = notes;
    }

    persist();
    renderAll();
    setStatus(refs.viewerStatus, "Uzrasai issaugoti.", "success");
  }

  function getCurrentEntry() {
    if (!state.settings.currentEntryId) return null;
    return state.entries.find((item) => item.id === state.settings.currentEntryId) || null;
  }

  function renderViewer() {
    const entry = getCurrentEntry();
    if (!entry) {
      refs.viewerTitle.textContent = "Pasirink video is saraso ir ziurek cia.";
      refs.videoFrame.src = "";
      refs.videoFrame.dataset.entryId = "";
      refs.videoFrame.setAttribute("srcdoc", "<p style='color:#fff;font-family:sans-serif;text-align:center;margin-top:40px;'>Pasirink video</p>");
      refs.viewerNotesInput.value = "";
      refs.viewerNotesInput.disabled = true;
      refs.viewerSaveNotesBtn.disabled = true;
      refs.viewerOpenExternalBtn.disabled = true;
      refs.viewerToggleWatchedBtn.disabled = true;
      refs.viewerToggleWatchedBtn.textContent = "Pazymeti perziuretu";
      return;
    }

    refs.viewerTitle.textContent = `${entry.title} | ${entry.channel}`;
    const nextUrl = buildViewerUrl(entry);
    if (refs.videoFrame.dataset.entryId !== entry.id) {
      refs.videoFrame.removeAttribute("srcdoc");
      refs.videoFrame.src = nextUrl;
      refs.videoFrame.dataset.entryId = entry.id;
    }
    refs.viewerNotesInput.disabled = false;
    refs.viewerSaveNotesBtn.disabled = false;
    refs.viewerOpenExternalBtn.disabled = false;
    refs.viewerToggleWatchedBtn.disabled = false;
    refs.viewerToggleWatchedBtn.textContent = entry.watched
      ? "Atzymeti kaip neperziureta"
      : "Pazymeti perziuretu";

    if (document.activeElement !== refs.viewerNotesInput) {
      refs.viewerNotesInput.value = entry.notes || "";
    }
  }

  function buildViewerUrl(entry) {
    if (entry.videoId) {
      return `https://www.youtube-nocookie.com/embed/${entry.videoId}?rel=0&modestbranding=1`;
    }
    return entry.url;
  }

  async function initCloud() {
    if (!window.supabase || !window.supabase.createClient) return;

    const config = loadCloudConfig();
    if (!config) return;

    cloud.config = config;
    cloud.client = window.supabase.createClient(config.url, config.anonKey);

    const {
      data: { session },
    } = await cloud.client.auth.getSession();
    cloud.user = session?.user || null;

    cloud.client.auth.onAuthStateChange((_event, sessionState) => {
      cloud.user = sessionState?.user || null;
      renderCloudStatus();
    });

    if (cloud.user) {
      await pullCloudState();
    }
  }

  async function onCloudConfigure() {
    if (!window.supabase || !window.supabase.createClient) {
      setStatus(refs.toolsStatus, "Supabase biblioteka neuzsikrove.", "error");
      return;
    }

    const currentUrl = cloud.config?.url || "";
    const currentKey = cloud.config?.anonKey || "";

    const url = cleanText(prompt("Supabase Project URL:", currentUrl) || "");
    if (!url) return;
    const anonKey = cleanText(prompt("Supabase Anon Key:", currentKey) || "");
    if (!anonKey) return;

    saveCloudConfig({ url, anonKey });
    cloud.config = { url, anonKey };
    cloud.client = window.supabase.createClient(url, anonKey);
    cloud.user = null;
    renderCloudStatus();

    setStatus(
      refs.toolsStatus,
      "DB sukonfiguruota. Dabar spausk Login.",
      "success"
    );
  }

  async function onCloudAuth() {
    if (!cloud.client) {
      setStatus(refs.toolsStatus, "Pirmiausia sukonfiguruok DB.", "error");
      return;
    }

    if (cloud.user) {
      await cloud.client.auth.signOut();
      cloud.user = null;
      renderCloudStatus();
      setStatus(refs.toolsStatus, "Atsijungta nuo DB.", "success");
      return;
    }

    const email = cleanText(prompt("El. pastas:", "") || "");
    if (!email) return;
    const password = prompt("Slaptazodis:", "") || "";
    if (!password) return;

    let signInError = null;
    try {
      const { error } = await cloud.client.auth.signInWithPassword({ email, password });
      signInError = error || null;
    } catch (error) {
      signInError = error;
    }

    if (signInError) {
      const createNew = confirm(
        "Prisijungti nepavyko. Sukurti nauja paskyra su siuo email?"
      );
      if (!createNew) {
        setStatus(refs.toolsStatus, "Prisijungimas nutrauktas.", "error");
        return;
      }

      const { error: signUpError } = await cloud.client.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setStatus(
          refs.toolsStatus,
          `Registracija nepavyko: ${signUpError.message}`,
          "error"
        );
        return;
      }

      const { error: secondTryError } = await cloud.client.auth.signInWithPassword({
        email,
        password,
      });
      if (secondTryError) {
        setStatus(
          refs.toolsStatus,
          `Prisijungimas nepavyko: ${secondTryError.message}`,
          "error"
        );
        return;
      }
    }

    const {
      data: { session },
    } = await cloud.client.auth.getSession();
    cloud.user = session?.user || null;

    if (!cloud.user) {
      setStatus(refs.toolsStatus, "Prisijungimas nepavyko.", "error");
      return;
    }

    await pullCloudState();
    await pushCloudState();
    renderCloudStatus();
    setStatus(refs.toolsStatus, "Prisijungta ir susinchronizuota.", "success");
  }

  async function onCloudSyncNow() {
    if (!cloud.client || !cloud.user) {
      setStatus(refs.toolsStatus, "DB neaktyvi arba neprisijungta.", "error");
      return;
    }

    await pushCloudState();
    setStatus(refs.toolsStatus, "Sinchronizacija baigta.", "success");
  }

  async function pullCloudState() {
    if (!cloud.client || !cloud.user) return;

    const { data, error } = await cloud.client
      .from("vault_states")
      .select("payload")
      .eq("user_id", cloud.user.id)
      .maybeSingle();

    if (error) return;
    if (!data || !data.payload || !data.payload.state) return;

    const cloudState = sanitizeState(data.payload.state);
    state = mergeStates(state, cloudState);
    persistLocalOnly();
    renderAll();
  }

  async function pushCloudState() {
    if (!cloud.client || !cloud.user) return;
    if (cloud.syncing) return;

    cloud.syncing = true;
    renderCloudStatus();

    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      state,
    };

    const { error } = await cloud.client.from("vault_states").upsert(
      {
        user_id: cloud.user.id,
        payload,
      },
      { onConflict: "user_id" }
    );

    cloud.syncing = false;
    renderCloudStatus();

    if (error) {
      setStatus(refs.toolsStatus, `DB sync klaida: ${error.message}`, "error");
    }
  }

  function scheduleCloudSync() {
    if (!cloud.client || !cloud.user) return;
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
      pushCloudState();
    }, CLOUD_SYNC_DELAY_MS);
  }

  function renderCloudStatus() {
    if (!refs.cloudStatus) return;

    if (!cloud.client) {
      refs.cloudStatus.textContent = "DB: Local";
      refs.cloudAuthBtn.textContent = "Login";
      refs.cloudSyncBtn.disabled = true;
      return;
    }

    if (!cloud.user) {
      refs.cloudStatus.textContent = "DB: Configured";
      refs.cloudAuthBtn.textContent = "Login";
      refs.cloudSyncBtn.disabled = true;
      return;
    }

    refs.cloudStatus.textContent = cloud.syncing ? "DB: Syncing..." : "DB: Connected";
    refs.cloudAuthBtn.textContent = "Logout";
    refs.cloudSyncBtn.disabled = false;
  }

  function renderAll() {
    ensureValidState();
    renderCategoryNav();
    renderCategoryDatalist();
    renderStats();
    renderBoard();
    renderViewer();
    renderCloudStatus();
  }

  function renderCategoryNav() {
    const categories = getCategoryList();
    const counts = countByCategory(state.entries);
    refs.categoryNav.innerHTML = "";

    const visibleCount = getVisibleEntries().length;
    refs.categoryNav.appendChild(
      buildCategoryButton("Visi", "all", visibleCount, state.settings.activeCategory === "all")
    );

    categories.forEach((category) => {
      refs.categoryNav.appendChild(
        buildCategoryButton(
          category,
          category,
          counts.get(category) || 0,
          state.settings.activeCategory === category
        )
      );
    });
  }

  function buildCategoryButton(label, value, count, active) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cat-btn";
    if (active) button.classList.add("active");
    button.dataset.category = value;

    const left = document.createElement("span");
    left.textContent = label;

    const right = document.createElement("span");
    right.textContent = String(count);

    button.append(left, right);
    return button;
  }

  function renderCategoryDatalist() {
    refs.categoryOptions.innerHTML = "";
    getCategoryList().forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      refs.categoryOptions.appendChild(option);
    });
  }

  function renderStats() {
    refs.statAll.textContent = String(state.entries.length);
    refs.statVisible.textContent = String(getVisibleEntries().length);
    refs.statCategories.textContent = String(getCategoryList().length);
    refs.statWatched.textContent = String(state.entries.filter((item) => item.watched).length);
  }

  function renderBoard() {
    const visible = getVisibleEntries();
    refs.board.innerHTML = "";

    if (!visible.length) {
      const empty = document.createElement("article");
      empty.className = "empty";
      empty.textContent = "Nieko nerasta pagal dabartinius filtrus.";
      refs.board.appendChild(empty);
      return;
    }

    const byCategory = groupByCategory(visible);
    const orderedCategories =
      state.settings.activeCategory === "all"
        ? getCategoryList().filter((cat) => byCategory.has(cat))
        : [state.settings.activeCategory];

    orderedCategories.forEach((category) => {
      const section = document.createElement("section");
      section.className = "cat-section";

      const head = document.createElement("header");
      head.className = "cat-head";

      const title = document.createElement("h3");
      title.className = "cat-title";
      title.textContent = category;

      const count = document.createElement("span");
      count.className = "cat-count";
      count.textContent = `${(byCategory.get(category) || []).length} video`;

      head.append(title, count);

      const grid = document.createElement("div");
      grid.className = "video-grid";
      (byCategory.get(category) || []).forEach((entry) => {
        grid.appendChild(renderVideoCard(entry));
      });

      section.append(head, grid);
      refs.board.appendChild(section);
    });
  }

  function renderVideoCard(entry) {
    const card = document.createElement("article");
    card.className = "video-card";

    const thumbLink = document.createElement("button");
    thumbLink.type = "button";
    thumbLink.className = "thumb-wrap";
    thumbLink.dataset.action = "watch-here";
    thumbLink.dataset.id = entry.id;

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = entry.title;
    img.src = entry.thumbnail || buildYoutubeThumb(entry.videoId);
    img.onerror = () => {
      img.src =
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='100%' height='100%' fill='%231a1a1a'/><text x='50%' y='50%' fill='%23fff' font-size='24' dominant-baseline='middle' text-anchor='middle'>No Preview</text></svg>";
    };

    const badge = document.createElement("span");
    badge.className = "thumb-badge";
    badge.textContent = entry.type === "youtube" ? "YouTube" : "Link";

    thumbLink.append(img, badge);

    const body = document.createElement("div");
    body.className = "video-body";

    const title = document.createElement("h4");
    title.className = "video-title";
    const titleLink = document.createElement("a");
    titleLink.href = entry.url;
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";
    titleLink.textContent = entry.title;
    title.appendChild(titleLink);

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${entry.channel} | ${formatDate(entry.updatedAt)}`;

    const watchMeta = document.createElement("p");
    watchMeta.className = entry.watched ? "watch-meta watched" : "watch-meta";
    watchMeta.textContent = buildWatchMeta(entry);

    const description = document.createElement("p");
    description.className = "description";
    description.textContent = entry.description || "Aprasymas nepridetas.";

    const notes = document.createElement("p");
    notes.className = "notes";
    notes.textContent = entry.notes || "Uzrasu nera.";

    const chips = document.createElement("div");
    chips.className = "chips";
    chips.appendChild(makeChip(entry.category));
    chips.appendChild(makeChip(entry.watched ? "Perziuretas" : "Nepaziuretas"));
    entry.tags.forEach((tag) => chips.appendChild(makeChip(`#${tag}`)));

    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.appendChild(makeActionButton("Ziureti cia", "watch-here", entry.id));
    actions.appendChild(makeActionButton("Atidaryti", "open", entry.id));
    actions.appendChild(makeActionButton("Redaguoti", "edit", entry.id));
    actions.appendChild(
      makeActionButton(
        entry.watched ? "Atzymeti" : "Perziureta",
        "toggle-watched",
        entry.id,
        false,
        entry.watched
      )
    );
    actions.appendChild(makeActionButton("Istrinti", "delete", entry.id, true));

    const moveSelect = document.createElement("select");
    moveSelect.className = "move-select";
    moveSelect.dataset.action = "move";
    moveSelect.dataset.id = entry.id;
    getCategoryList().forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = `Perkelti i: ${category}`;
      if (category === entry.category) option.selected = true;
      moveSelect.appendChild(option);
    });

    actions.appendChild(moveSelect);
    body.append(title, meta, watchMeta, description, notes, chips, actions);
    card.append(thumbLink, body);
    return card;
  }

  function makeActionButton(label, action, id, danger = false, success = false) {
    const button = document.createElement("button");
    let className = "small-btn";
    if (danger) className += " danger";
    if (success) className += " success";
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.id = id;
    return button;
  }

  function makeChip(text) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = text;
    return chip;
  }

  function getVisibleEntries() {
    let list = [...state.entries];
    const query = state.settings.query.toLowerCase();

    if (query) {
      list = list.filter((entry) =>
        [entry.title, entry.channel, entry.description, entry.category, entry.tags.join(" "), entry.url]
          .concat([entry.notes || "", entry.watchDate || "", entry.watched ? "perziuretas" : "neperziuretas"])
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }

    if (state.settings.activeCategory !== "all") {
      list = list.filter((entry) => entry.category === state.settings.activeCategory);
    }

    list.sort((a, b) => compareEntries(a, b, state.settings.sort));
    return list;
  }

  function compareEntries(a, b, sortType) {
    if (sortType === "oldest") {
      return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
    }
    if (sortType === "title") return a.title.localeCompare(b.title, "lt");
    if (sortType === "channel") return a.channel.localeCompare(b.channel, "lt");
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  }

  function groupByCategory(entries) {
    const map = new Map();
    entries.forEach((entry) => {
      if (!map.has(entry.category)) map.set(entry.category, []);
      map.get(entry.category).push(entry);
    });
    return map;
  }

  function countByCategory(entries) {
    const map = new Map();
    entries.forEach((entry) => {
      map.set(entry.category, (map.get(entry.category) || 0) + 1);
    });
    return map;
  }

  function parseYouTubeUrl(urlString) {
    try {
      const url = new URL(urlString);
      const host = url.hostname.replace(/^www\./, "");
      let videoId = "";

      if (host === "youtu.be") {
        videoId = url.pathname.split("/").filter(Boolean)[0] || "";
      } else if (host === "youtube.com" || host === "m.youtube.com") {
        if (url.pathname === "/watch") {
          videoId = url.searchParams.get("v") || "";
        } else if (/^\/shorts\//.test(url.pathname) || /^\/live\//.test(url.pathname) || /^\/embed\//.test(url.pathname)) {
          videoId = url.pathname.split("/")[2] || "";
        }
      }

      if (!videoId) return null;

      return {
        videoId,
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: buildYoutubeThumb(videoId),
      };
    } catch {
      return null;
    }
  }

  async function fetchYoutubeMeta(url) {
    try {
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const response = await fetch(endpoint);
      if (!response.ok) return null;
      const payload = await response.json();
      return {
        title: cleanText(payload.title),
        channel: cleanText(payload.author_name),
        thumbnail: cleanText(payload.thumbnail_url),
      };
    } catch {
      return null;
    }
  }

  function buildYoutubeThumb(videoId) {
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
  }

  function normalizeUrl(raw) {
    let input = cleanText(raw);
    if (!input) return null;

    if (/^www\./i.test(input)) input = `https://${input}`;
    if (!/^https?:\/\//i.test(input)) {
      if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(input)) input = `https://${input}`;
    }

    try {
      const parsed = new URL(input);
      if (!["http:", "https:"].includes(parsed.protocol)) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  function parseTags(raw) {
    return Array.from(
      new Set(
        String(raw || "")
          .split(",")
          .map((item) => cleanText(item))
          .filter(Boolean)
      )
    );
  }

  function suggestTitle(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      const path = parsed.pathname.split("/").filter(Boolean);
      return path.length ? `${decodeURIComponent(path[path.length - 1])} - ${host}` : host;
    } catch {
      return "Nuoroda";
    }
  }

  function normalizeCategory(value) {
    return cleanText(value) || DEFAULT_CATEGORY;
  }

  function normalizeWatchDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "" : raw;
  }

  function cleanTextarea(value) {
    return String(value || "").replace(/\r/g, "").trim();
  }

  function ensureCategory(category) {
    if (!state.categories.includes(category)) state.categories.push(category);
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("lt-LT", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function cleanText(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function resetForm() {
    editingId = null;
    refs.entryForm.reset();
    refs.categoryInput.value =
      state.settings.activeCategory !== "all"
        ? state.settings.activeCategory
        : DEFAULT_CATEGORY;
    refs.watchedInput.checked = false;
    refs.cancelEditBtn.classList.add("hidden");
  }

  function setStatus(target, message, type) {
    target.textContent = message;
    target.classList.remove("success", "error");
    if (type) target.classList.add(type);
  }

  function persist() {
    persistLocalOnly();
    scheduleCloudSync();
  }

  function persistLocalOnly() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return sanitizeState(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function saveCloudConfig(config) {
    localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
  }

  function loadCloudConfig() {
    try {
      const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const url = cleanText(parsed.url);
      const anonKey = cleanText(parsed.anonKey);
      if (!url || !anonKey) return null;
      return { url, anonKey };
    } catch {
      return null;
    }
  }

  function sanitizeState(input) {
    const safe = defaultState();
    if (!input || typeof input !== "object") return safe;

    if (Array.isArray(input.entries)) {
      safe.entries = input.entries.map(sanitizeEntry).filter(Boolean);
    } else if (Array.isArray(input.tabs)) {
      safe.entries = input.tabs
        .map((tab) => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          channel: tab.channel || "",
          category: tab.category || tab.group || DEFAULT_CATEGORY,
          tags: tab.tags || [],
          watchDate: tab.watchDate || "",
          watched: !!tab.watched,
          watchedAt: tab.watchedAt || "",
          description: tab.description || tab.notes || "",
          notes: tab.notes || "",
          addedAt: tab.createdAt,
          updatedAt: tab.updatedAt,
          type: tab.videoId ? "youtube" : "",
          videoId: tab.videoId || "",
          thumbnail: tab.thumbnail || "",
        }))
        .map(sanitizeEntry)
        .filter(Boolean);
    }

    const categories = Array.isArray(input.categories) ? input.categories : [];
    safe.categories = dedupe(categories.map(normalizeCategory));
    ensureDefaultCategory(safe);

    const settings = input.settings && typeof input.settings === "object" ? input.settings : {};
    safe.settings.query = cleanText(settings.query || "");
    safe.settings.activeCategory = cleanText(settings.activeCategory || "all");
    safe.settings.sort = SORT_OPTIONS.includes(settings.sort) ? settings.sort : "newest";
    safe.settings.currentEntryId = cleanText(settings.currentEntryId || "");

    return safe;
  }

  function sanitizeEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const url = normalizeUrl(entry.url);
    if (!url) return null;

    const yt = parseYouTubeUrl(url);
    const type = cleanText(entry.type) || (yt ? "youtube" : "link");
    const videoId = cleanText(entry.videoId) || (yt ? yt.videoId : "");
    const thumbnail = cleanText(entry.thumbnail) || (yt ? yt.thumbnail : "");

    return {
      id: cleanText(entry.id) || makeId(),
      url: yt ? yt.canonicalUrl : url,
      type,
      videoId,
      thumbnail,
      title: cleanText(entry.title) || suggestTitle(url),
      channel: cleanText(entry.channel) || "Nezinomas kanalas",
      category: normalizeCategory(entry.category),
      tags: parseTags(Array.isArray(entry.tags) ? entry.tags.join(",") : entry.tags),
      watchDate: normalizeWatchDate(entry.watchDate),
      watched: !!entry.watched,
      watchedAt: entry.watched ? parseDate(entry.watchedAt || entry.updatedAt) : "",
      description: cleanTextarea(entry.description),
      notes: cleanTextarea(entry.notes),
      addedAt: parseDate(entry.addedAt),
      updatedAt: parseDate(entry.updatedAt),
    };
  }

  function buildWatchMeta(entry) {
    if (entry.watched) {
      const watchedDate = entry.watchedAt ? formatDate(entry.watchedAt) : "siandien";
      return `Statusas: perziuretas (${watchedDate})`;
    }

    if (!entry.watchDate) return "Statusas: neperziuretas (data neparinkta)";

    const today = new Date().toISOString().slice(0, 10);
    if (entry.watchDate < today) {
      return `Statusas: paveluota, planuota ${formatWatchDate(entry.watchDate)}`;
    }
    return `Statusas: planuota ${formatWatchDate(entry.watchDate)}`;
  }

  function formatWatchDate(dateValue) {
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateValue;
    return new Intl.DateTimeFormat("lt-LT", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function parseDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
  }

  function ensureValidState() {
    ensureDefaultCategory(state);
    if (!SORT_OPTIONS.includes(state.settings.sort)) state.settings.sort = "newest";
    const categories = getCategoryList();
    if (state.settings.activeCategory !== "all" && !categories.includes(state.settings.activeCategory)) {
      state.settings.activeCategory = "all";
    }

    const currentExists = state.entries.some((item) => item.id === state.settings.currentEntryId);
    if (!currentExists) {
      state.settings.currentEntryId = state.entries[0]?.id || "";
    }
  }

  function ensureDefaultCategory(target) {
    if (!target.categories.includes(DEFAULT_CATEGORY)) target.categories.unshift(DEFAULT_CATEGORY);
    target.categories = dedupe(target.categories.map(normalizeCategory));
  }

  function getCategoryList() {
    return dedupe([
      ...state.categories.map(normalizeCategory),
      ...state.entries.map((item) => normalizeCategory(item.category)),
    ]).sort((a, b) => a.localeCompare(b, "lt"));
  }

  function dedupe(list) {
    return Array.from(new Set(list));
  }

  function mergeStates(localState, cloudState) {
    const merged = defaultState();

    const byKey = new Map();
    [...localState.entries, ...cloudState.entries].forEach((entry) => {
      const key = cleanText(entry.id) || `${entry.url}|${entry.category}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, entry);
        return;
      }

      const existingTime = new Date(existing.updatedAt).getTime();
      const nextTime = new Date(entry.updatedAt).getTime();
      if (nextTime >= existingTime) {
        byKey.set(key, entry);
      }
    });

    merged.entries = Array.from(byKey.values())
      .map(sanitizeEntry)
      .filter(Boolean);

    merged.categories = dedupe([
      ...localState.categories,
      ...cloudState.categories,
      ...merged.entries.map((item) => item.category),
    ]).map(normalizeCategory);
    ensureDefaultCategory(merged);

    merged.settings.query = localState.settings.query;
    merged.settings.sort = localState.settings.sort;
    merged.settings.activeCategory = localState.settings.activeCategory;
    merged.settings.currentEntryId =
      localState.settings.currentEntryId || cloudState.settings.currentEntryId || "";

    return sanitizeState(merged);
  }

  function defaultState() {
    return {
      entries: [],
      categories: [DEFAULT_CATEGORY],
      settings: {
        query: "",
        activeCategory: "all",
        sort: "newest",
        currentEntryId: "",
      },
    };
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `yt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
