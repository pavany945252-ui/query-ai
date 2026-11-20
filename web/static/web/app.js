/* QueryDesk – single page frontend for the Django REST API (no build step, no libraries). */
(() => {
  'use strict';

  const API = '/api';
  const PAGE_SIZE = 10;
  const TOKEN_KEY = 'querydesk.token';
  const USER_KEY = 'querydesk.user';
  const CATEGORIES = ['Technical', 'Billing', 'General', 'Account Related'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    token: localStorage.getItem(TOKEN_KEY),
    user: localStorage.getItem(USER_KEY),
    page: 1,
    listRequest: 0,
    drawerId: null,
    editingId: null,
  };

  /* ------------------------------------------------------------------ helpers */
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtDate = (iso) =>
    new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const fmtShort = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const priBadge = (p) => `<span class="badge pri-${esc(String(p).toLowerCase())}"><span class="dot"></span>${esc(p)}</span>`;
  const stBadge = (s) => `<span class="badge st-${esc(String(s).toLowerCase().replace(/\s+/g, '-'))}">${esc(s)}</span>`;
  const catBadge = (c) => (c ? `<span class="badge cat">${esc(c)}</span>` : `<span class="badge cat-none">Not set</span>`);

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : ''}`;
    el.textContent = message;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
  }

  /* ---------------------------------------------------------------------- API */
  class ApiError extends Error {
    constructor(status, data) {
      super(typeof data?.detail === 'string' ? data.detail : `Request failed (${status})`);
      this.status = status;
      this.data = data || {};
    }
  }

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && state.token) headers.Authorization = `Token ${state.token}`;

    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new ApiError(0, { detail: 'Cannot reach the server. Check that it is running, then try again.' });
    }

    let data = null;
    if (res.status !== 204) {
      try { data = await res.json(); } catch (e) { data = null; }
    }
    if (res.status === 401 && auth) {
      logout('Your session has expired. Log in again.');
      throw new ApiError(401, data || {});
    }
    if (!res.ok) throw new ApiError(res.status, data || { detail: `Server error (${res.status}).` });
    return data;
  }

  /* ----------------------------------------------------------- form utilities */
  function clearErrors(form, alertEl) {
    $$('.field.invalid', form).forEach((f) => f.classList.remove('invalid'));
    $$('.err', form).forEach((e) => (e.textContent = ''));
    if (alertEl) { alertEl.hidden = true; alertEl.textContent = ''; }
  }

  function setFieldError(form, name, message) {
    const err = $(`.err[data-for="${name}"]`, form);
    if (!err) return false;
    err.textContent = message;
    err.closest('.field')?.classList.add('invalid');
    return true;
  }

  function showAlert(alertEl, messages) {
    if (!messages.length) return;
    alertEl.textContent = messages.join(' ');
    alertEl.hidden = false;
  }

  /** Map a DRF error body ({field: [msgs]}, non_field_errors, detail) onto the form. */
  function applyApiErrors(form, alertEl, error) {
    const general = [];
    const data = error.data || {};
    Object.entries(data).forEach(([key, val]) => {
      const msg = Array.isArray(val) ? val.join(' ') : typeof val === 'string' ? val : JSON.stringify(val);
      if (key === 'non_field_errors' || key === 'detail') general.push(msg);
      else if (!setFieldError(form, key, msg)) general.push(`${key}: ${msg}`);
    });
    if (!general.length && !Object.keys(data).length) general.push(error.message);
    showAlert(alertEl, general);
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setBusy(btn, busy, busyText) {
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = busyText; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  /* --------------------------------------------------------------------- auth */
  function showAuth() {
    $('#app-view').hidden = true;
    $('#auth-view').hidden = false;
    document.title = 'QueryDesk – Log in';
  }

  function showApp() {
    $('#auth-view').hidden = true;
    $('#app-view').hidden = false;
    $('#user-name').textContent = state.user || '';
    $('#user-avatar').textContent = (state.user || '?').charAt(0);
    route();
  }

  function saveSession(token, username) {
    state.token = token;
    state.user = username;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  }

  function logout(message) {
    state.token = null;
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    closeDrawer();
    closeModal();
    showAuth();
    if (message) toast(message);
  }

  function switchTab(tab) {
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('#login-form').hidden = tab !== 'login';
    $('#register-form').hidden = tab !== 'register';
  }

  function initAuth() {
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const alertEl = $('#login-alert');
      clearErrors(form, alertEl);
      const username = form.username.value.trim();
      const password = form.password.value;
      let ok = true;
      if (!username) { setFieldError(form, 'username', 'Enter your username.'); ok = false; }
      if (!password) { setFieldError(form, 'password', 'Enter your password.'); ok = false; }
      if (!ok) return;

      const btn = $('button[type=submit]', form);
      setBusy(btn, true, 'Logging in…');
      try {
        const data = await api('/login/', { method: 'POST', body: { username, password }, auth: false });
        saveSession(data.token, username);
        form.reset();
        showApp();
      } catch (err) {
        applyApiErrors(form, alertEl, err);
      } finally {
        setBusy(btn, false);
      }
    });

    $('#register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const alertEl = $('#register-alert');
      clearErrors(form, alertEl);
      const username = form.username.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;
      let ok = true;
      if (!username) { setFieldError(form, 'username', 'Choose a username.'); ok = false; }
      if (!EMAIL_RE.test(email)) { setFieldError(form, 'email', 'Enter a valid email address.'); ok = false; }
      if (password.length < 8) { setFieldError(form, 'password', 'Password must be at least 8 characters.'); ok = false; }
      if (!ok) return;

      const btn = $('button[type=submit]', form);
      setBusy(btn, true, 'Creating account…');
      try {
        const data = await api('/register/', { method: 'POST', body: { username, email, password }, auth: false });
        saveSession(data.token, username);
        form.reset();
        toast('Account created. Welcome to QueryDesk.');
        showApp();
      } catch (err) {
        applyApiErrors(form, alertEl, err);
      } finally {
        setBusy(btn, false);
      }
    });

    $('#logout-btn').addEventListener('click', () => logout('You have been logged out.'));
  }

  /* ------------------------------------------------------------------ routing */
  function currentRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    return h === 'queries' ? 'queries' : 'dashboard';
  }

  function route() {
    if (!state.token) return;
    const r = currentRoute();
    $('#page-dashboard').hidden = r !== 'dashboard';
    $('#page-queries').hidden = r !== 'queries';
    $$('.nav a[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
    const title = r === 'dashboard' ? 'Dashboard' : 'Queries';
    $('#page-title').textContent = title;
    document.title = `QueryDesk – ${title}`;
    if (r === 'dashboard') loadDashboard();
    else loadQueries();
  }

  /* ---------------------------------------------------------------- dashboard */
  async function loadDashboard() {
    try {
      const [stats, recent] = await Promise.all([
        api('/queries/dashboard/'),
        api('/queries/?ordering=-created_at'),
      ]);
      renderStats(stats);
      renderBars('#chart-category', stats.by_category, stats.total, 'cat', CATEGORIES.concat(['Uncategorised']));
      renderBars('#chart-priority', stats.by_priority, stats.total, 'pri', ['High', 'Medium', 'Low']);
      renderRecent(recent.results.slice(0, 5));
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'error');
    }
  }

  function renderStats(s) {
    $('#stats').innerHTML = `
      <div class="stat total"><b>${s.total}</b><span>Total queries</span></div>
      <div class="stat pending"><b>${s.pending}</b><span>Pending</span></div>
      <div class="stat prog"><b>${s.in_progress}</b><span>In progress</span></div>
      <div class="stat done"><b>${s.resolved}</b><span>Resolved</span></div>`;
  }

  function renderBars(sel, counts, total, kind, order) {
    const rows = order
      .filter((k) => k !== 'Uncategorised' || (counts[k] || 0) > 0)
      .map((k) => {
        const n = counts[k] || 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const cls = kind === 'pri' ? k.toLowerCase() : '';
        return `<div class="bar-row"><span>${esc(k)}</span>
          <div class="bar-track" role="img" aria-label="${esc(k)}: ${n} of ${total}"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
          <b>${n}</b></div>`;
      });
    $(sel).innerHTML = rows.join('');
  }

  function renderRecent(items) {
    const box = $('#recent-list');
    if (!items.length) {
      box.innerHTML = `<div class="empty"><strong>No queries yet</strong>Add your first customer query to see it here.
        <br><button class="btn primary" type="button" data-new>New query</button></div>`;
      return;
    }
    box.innerHTML = items.map((q) => `
      <div class="recent-item" tabindex="0" data-id="${q.id}">
        <strong>${esc(q.subject)}</strong>
        <div class="badges">${catBadge(q.category)} ${priBadge(q.priority)} ${stBadge(q.status)}</div>
        <span class="meta">${esc(q.customer_name)}, ${esc(fmtShort(q.created_at))}</span>
      </div>`).join('');
  }

  /* -------------------------------------------------------------- queries list */
  function filterParams() {
    const p = new URLSearchParams();
    p.set('page', state.page);
    const map = { search: '#f-search', category: '#f-category', priority: '#f-priority', status: '#f-status', ordering: '#f-order' };
    Object.entries(map).forEach(([k, sel]) => {
      const v = $(sel).value.trim();
      if (v) p.set(k, v);
    });
    return p;
  }

  const hasFilters = () => ['#f-search', '#f-category', '#f-priority', '#f-status'].some((s) => $(s).value.trim());

  async function loadQueries() {
    const reqId = ++state.listRequest;
    $('#query-loading').hidden = false;
    $('#query-empty').hidden = true;
    try {
      const data = await api(`/queries/?${filterParams()}`);
      if (reqId !== state.listRequest) return;
      renderTable(data);
    } catch (err) {
      if (reqId !== state.listRequest) return;
      if (err.status === 404 && state.page > 1) { state.page -= 1; return loadQueries(); }
      if (err.status !== 401) toast(err.message, 'error');
    } finally {
      if (reqId === state.listRequest) $('#query-loading').hidden = true;
    }
  }

  function renderTable(data) {
    const rows = $('#query-rows');
    const empty = $('#query-empty');
    const pager = $('#pager');

    if (!data.results.length) {
      rows.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = hasFilters()
        ? `<strong>No queries match these filters</strong>Try a different search or clear the filters.<br><button class="btn" type="button" data-clear>Clear filters</button>`
        : `<strong>No queries yet</strong>Add a customer query and let AI sort it.<br><button class="btn primary" type="button" data-new>New query</button>`;
      pager.hidden = true;
      return;
    }

    empty.hidden = true;
    rows.innerHTML = data.results.map((q) => `
      <tr tabindex="0" data-id="${q.id}">
        <td><div class="cell-main">${esc(q.customer_name)}</div><div class="cell-sub">${esc(q.email)}</div></td>
        <td class="cell-subject" title="${esc(q.subject)}">${esc(q.subject)}</td>
        <td>${catBadge(q.category)}</td>
        <td>${priBadge(q.priority)}</td>
        <td>${stBadge(q.status)}</td>
        <td class="cell-sub">${esc(fmtShort(q.created_at))}</td>
      </tr>`).join('');

    const pages = Math.max(1, Math.ceil(data.count / PAGE_SIZE));
    pager.hidden = pages <= 1;
    $('#page-info').textContent = `Page ${state.page} of ${pages} (${data.count} queries)`;
    $('#prev-page').disabled = !data.previous;
    $('#next-page').disabled = !data.next;
  }

  function initList() {
    let timer;
    const reload = () => { state.page = 1; loadQueries(); };
    $('#f-search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 300); });
    ['#f-category', '#f-priority', '#f-status', '#f-order'].forEach((s) => $(s).addEventListener('change', reload));
    $('#f-reset').addEventListener('click', resetFilters);
    $('#prev-page').addEventListener('click', () => { state.page = Math.max(1, state.page - 1); loadQueries(); });
    $('#next-page').addEventListener('click', () => { state.page += 1; loadQueries(); });

    // Row and card clicks (delegated)
    document.addEventListener('click', (e) => {
      const item = e.target.closest('#query-rows tr, .recent-item');
      if (item) return openDrawer(item.dataset.id);
      if (e.target.closest('[data-new]')) return openModal();
      if (e.target.closest('[data-clear]')) return resetFilters();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const item = e.target.closest?.('#query-rows tr, .recent-item');
      if (item) openDrawer(item.dataset.id);
    });
  }

  function resetFilters() {
    ['#f-search', '#f-category', '#f-priority', '#f-status'].forEach((s) => ($(s).value = ''));
    $('#f-order').value = '-created_at';
    state.page = 1;
    loadQueries();
  }

  function refreshViews() {
    if (currentRoute() === 'dashboard') loadDashboard();
    else loadQueries();
  }

  /* -------------------------------------------------------------------- drawer */
  async function openDrawer(id) {
    state.drawerId = id;
    $('#drawer-backdrop').hidden = false;
    $('#drawer').hidden = false;
    $('#drawer-title').textContent = 'Loading…';
    $('#drawer-sub').textContent = '';
    $('#drawer-body').innerHTML = '';
    $('#drawer-close').focus();
    try {
      const q = await api(`/queries/${id}/`);
      if (state.drawerId !== id) return;
      renderDrawer(q);
    } catch (err) {
      closeDrawer();
      if (err.status !== 401) toast(err.status === 404 ? 'That query no longer exists.' : err.message, 'error');
      refreshViews();
    }
  }

  function closeDrawer() {
    state.drawerId = null;
    $('#drawer').hidden = true;
    $('#drawer-backdrop').hidden = true;
  }

  function renderDrawer(q) {
    $('#drawer-title').textContent = q.subject;
    $('#drawer-sub').textContent = `Query #${q.id}, received ${fmtDate(q.created_at)}`;

    const statuses = ['Pending', 'In Progress', 'Resolved'];
    const stepper = statuses.map((s) => `<button type="button" data-v="${s}" aria-pressed="${q.status === s}">${s}</button>`).join('');

    let triage;
    if (q.suggested_response) {
      const sourceText = q.ai_source === 'ai'
        ? 'Written by the AI model.'
        : 'Written by the built-in rules. The AI service was not configured or did not respond.';
      triage = `
        <div class="triage ${esc(q.priority.toLowerCase())}">
          <div class="triage-head">
            <h4>AI triage</h4>
            <div class="triage-tags">${catBadge(q.category)} ${priBadge(q.priority)}</div>
          </div>
          <div><div class="section-title">Suggested response</div><div class="reply">${esc(q.suggested_response)}</div></div>
          <div class="source">${sourceText}</div>
          <div class="triage-actions">
            <button class="btn small" type="button" id="copy-reply">Copy response</button>
            <button class="btn small quiet" type="button" id="run-ai">Run analysis again</button>
          </div>
        </div>`;
    } else {
      triage = `
        <div class="triage">
          <div class="triage-head"><h4>AI triage</h4></div>
          <p class="muted">Not analysed yet. AI will set the category and priority and draft a short reply. This replaces the current category and priority.</p>
          <div class="triage-actions"><button class="btn primary small" type="button" id="run-ai">Analyze with AI</button></div>
        </div>`;
    }

    $('#drawer-body').innerHTML = `
      <div><div class="section-title">Status</div><div class="stepper" id="stepper">${stepper}</div></div>
      ${triage}
      <div>
        <div class="section-title">Customer</div>
        <dl class="kv">
          <dt>Name</dt><dd>${esc(q.customer_name)}</dd>
          <dt>Email</dt><dd><a class="link" href="mailto:${esc(q.email)}">${esc(q.email)}</a></dd>
          <dt>Category</dt><dd>${catBadge(q.category)}</dd>
          <dt>Priority</dt><dd>${priBadge(q.priority)}</dd>
        </dl>
      </div>
      <div><div class="section-title">Description</div><div class="desc">${esc(q.description)}</div></div>
      <div class="drawer-actions">
        <button class="btn" type="button" id="edit-query">Edit query</button>
        <span class="spacer"></span>
        <button class="btn danger-quiet" type="button" id="delete-query">Delete</button>
      </div>`;

    $('#stepper').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      $$('#stepper button').forEach((x) => (x.disabled = true));
      try {
        const updated = await api(`/queries/${q.id}/status/`, { method: 'PATCH', body: { status: b.dataset.v } });
        toast(`Status changed to ${updated.status}.`);
        renderDrawer(updated);
        refreshViews();
      } catch (err) {
        if (err.status !== 401) toast(err.message, 'error');
        $$('#stepper button').forEach((x) => (x.disabled = false));
      }
    });

    $('#run-ai').addEventListener('click', (e) => runAnalysis(q.id, e.currentTarget));
    $('#copy-reply')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(q.suggested_response); toast('Response copied.'); }
      catch (e) { toast('Could not copy. Select the text and copy it manually.', 'error'); }
    });
    $('#edit-query').addEventListener('click', () => openModal(q));
    $('#delete-query').addEventListener('click', async () => {
      const yes = await confirmDialog(`“${q.subject}” from ${q.customer_name} will be removed permanently.`);
      if (!yes) return;
      try {
        await api(`/queries/${q.id}/`, { method: 'DELETE' });
        toast('Query deleted.');
        closeDrawer();
        refreshViews();
      } catch (err) {
        if (err.status !== 401) toast(err.message, 'error');
      }
    });
  }

  async function runAnalysis(id, btn) {
    setBusy(btn, true, 'Analyzing…');
    try {
      await api(`/queries/${id}/analyze/`, { method: 'POST' });
      const q = await api(`/queries/${id}/`);
      renderDrawer(q);
      toast(q.ai_source === 'ai' ? 'AI analysis saved.' : 'Analysis saved using the built-in fallback rules.');
      refreshViews();
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'error');
      setBusy(btn, false);
    }
  }

  /* --------------------------------------------------------------------- modal */
  function openModal(q = null) {
    const form = $('#query-form');
    clearErrors(form, $('#form-alert'));
    form.reset();
    state.editingId = q ? q.id : null;
    $('#modal-title').textContent = q ? 'Edit query' : 'New query';
    $('#modal-save').textContent = q ? 'Save changes' : 'Save query';
    $('#auto-ai-wrap').hidden = !!q;
    if (q) {
      ['customer_name', 'email', 'subject', 'description', 'category', 'priority', 'status'].forEach((k) => (form[k].value = q[k] ?? ''));
    }
    $('#modal-backdrop').hidden = false;
    $('#modal').hidden = false;
    form.customer_name.focus();
  }

  function closeModal() {
    $('#modal').hidden = true;
    $('#modal-backdrop').hidden = true;
  }

  function validateQueryForm(form) {
    let ok = true;
    const bad = (name, msg) => { setFieldError(form, name, msg); ok = false; };
    if (form.customer_name.value.trim().length < 2) bad('customer_name', 'Enter the customer’s name (at least 2 characters).');
    if (!EMAIL_RE.test(form.email.value.trim())) bad('email', 'Enter a valid email address.');
    if (form.subject.value.trim().length < 3) bad('subject', 'Subject must be at least 3 characters.');
    if (form.description.value.trim().length < 10) bad('description', 'Describe the query in at least 10 characters.');
    return ok;
  }

  function initModal() {
    $('#new-query-btn').addEventListener('click', () => openModal());
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-cancel').addEventListener('click', closeModal);
    $('#modal-backdrop').addEventListener('click', closeModal);

    // If a person picks a category themselves, don't let AI overwrite it unless they tick the box again.
    $('#query-form').category.addEventListener('change', (e) => {
      if (state.editingId === null) $('#query-form').auto_ai.checked = !e.target.value;
    });

    $('#query-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const alertEl = $('#form-alert');
      clearErrors(form, alertEl);
      if (!validateQueryForm(form)) return;

      const payload = {
        customer_name: form.customer_name.value.trim(),
        email: form.email.value.trim(),
        subject: form.subject.value.trim(),
        description: form.description.value.trim(),
        category: form.category.value,
        priority: form.priority.value,
        status: form.status.value,
      };
      const editing = state.editingId;
      const wantsAi = !editing && form.auto_ai.checked;
      const btn = $('#modal-save');
      setBusy(btn, true, wantsAi ? 'Saving and analyzing…' : 'Saving…');
      try {
        if (editing) {
          const updated = await api(`/queries/${editing}/`, { method: 'PUT', body: payload });
          closeModal();
          toast('Changes saved.');
          if (state.drawerId === editing) renderDrawer(updated);
        } else {
          const created = await api('/queries/', { method: 'POST', body: payload });
          let analysed = null;
          if (wantsAi) {
            try { analysed = await api(`/queries/${created.id}/analyze/`, { method: 'POST' }); }
            catch (err) { toast('Query saved, but the analysis failed. Open it and try again.', 'error'); }
          }
          closeModal();
          toast(analysed ? `Query saved. AI set it to ${analysed.category}, ${analysed.priority} priority.` : 'Query saved.');
          if (analysed) openDrawer(created.id);
        }
        refreshViews();
      } catch (err) {
        if (err.status !== 401) applyApiErrors(form, alertEl, err);
      } finally {
        setBusy(btn, false);
      }
    });
  }

  /* ------------------------------------------------------------------- confirm */
  function confirmDialog(text) {
    return new Promise((resolve) => {
      $('#confirm-text').textContent = text;
      $('#confirm-backdrop').hidden = false;
      $('#confirm').hidden = false;
      $('#confirm-cancel').focus();
      const done = (val) => {
        $('#confirm').hidden = true;
        $('#confirm-backdrop').hidden = true;
        $('#confirm-ok').onclick = $('#confirm-cancel').onclick = $('#confirm-backdrop').onclick = null;
        resolve(val);
      };
      $('#confirm-ok').onclick = () => done(true);
      $('#confirm-cancel').onclick = () => done(false);
      $('#confirm-backdrop').onclick = () => done(false);
      state.cancelConfirm = () => done(false);
    });
  }

  /* ---------------------------------------------------------------------- boot */
  function init() {
    initAuth();
    initList();
    initModal();
    $('#drawer-close').addEventListener('click', closeDrawer);
    $('#drawer-backdrop').addEventListener('click', closeDrawer);
    window.addEventListener('hashchange', route);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#confirm').hidden) return state.cancelConfirm?.();
      if (!$('#modal').hidden) return closeModal();
      if (!$('#drawer').hidden) return closeDrawer();
    });

    if (state.token) showApp();
    else showAuth();
  }

  init();
})();
