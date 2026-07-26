const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3500);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString();
}

async function loadStatus() {
  const s = await api('/api/status');
  $('#dbName').textContent = s.dbName;
  $('#status').innerHTML = `
    <div><b>${s.busy ? `⏳ ${s.busy}…` : '✅ Idle'}</b>Current state</div>
    <div><b>${s.lastRun ? (s.lastRun.ok ? '✅ OK' : '❌ Failed') : '—'}</b>Last run ${s.lastRun ? fmtDate(s.lastRun.at) : ''}</div>
    <div><b>${s.cronSchedule}</b>Daily schedule (cron, UTC)</div>
    <div><b>${s.retentionDays}d / ${s.trashRetentionDays}d</b>Retention (live / trash)</div>
  `;
  $('#runNowBtn').disabled = !!s.busy;
}

function rowActions(item) {
  if (item.location === 'live') {
    return `
      <div class="actions">
        <button class="btn-outline" data-download="${item.name}">Download</button>
        <button class="btn-primary" data-restore="${item.name}">Restore</button>
        <button class="btn-danger" data-trash="${item.name}">Delete</button>
      </div>`;
  }
  return `
    <div class="actions">
      <button class="btn-outline" data-download="${item.name}">Download</button>
      <button class="btn-primary" data-untrash="${item.name}">Restore to list</button>
      <button class="btn-danger" data-purge="${item.name}">Delete forever</button>
    </div>`;
}

async function loadBackups() {
  const { live, trash } = await api('/api/backups');
  const liveRows = $('#liveRows');
  const trashRows = $('#trashRows');

  liveRows.innerHTML = live.length
    ? live.map((i) => `<tr><td>${i.name}</td><td>${fmtDate(i.mtime)}</td><td>${i.sizeHuman}</td><td>${rowActions(i)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">No backups yet.</td></tr>';

  trashRows.innerHTML = trash.length
    ? trash.map((i) => `<tr><td>${i.name}</td><td>${fmtDate(i.mtime)}</td><td>${i.sizeHuman}</td><td>${rowActions(i)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Trash is empty.</td></tr>';
}

async function refresh() {
  await Promise.all([loadStatus(), loadBackups()]);
}

function confirmRestore(name) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Restore ${name}?</h3>
      <div class="warn">⚠️ This replaces the entire live database with the contents of this file.
        A fresh safety backup of the current data is taken automatically first, but this action
        cannot be undone beyond that. Type <b>RESTORE</b> to confirm.</div>
      <input type="text" id="confirmInput" placeholder="Type RESTORE" autocomplete="off" />
      <div class="row" style="justify-content:flex-end">
        <button class="btn-outline" id="cancelBtn">Cancel</button>
        <button class="btn-danger" id="confirmBtn" disabled>Restore</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const input = backdrop.querySelector('#confirmInput');
  const confirmBtn = backdrop.querySelector('#confirmBtn');
  input.addEventListener('input', () => { confirmBtn.disabled = input.value !== 'RESTORE'; });
  backdrop.querySelector('#cancelBtn').addEventListener('click', () => backdrop.remove());
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Restoring…';
    try {
      const result = await api('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, confirm: 'RESTORE' }),
      });
      toast(`Restored ${name}. Safety backup: ${result.safetyBackup}`);
      backdrop.remove();
      refresh();
    } catch (err) {
      toast(`Restore failed: ${err.message}`);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Restore';
    }
  });
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  if (t.dataset.download) {
    window.location.href = `/api/backups/${encodeURIComponent(t.dataset.download)}/download`;
  } else if (t.dataset.restore) {
    confirmRestore(t.dataset.restore);
  } else if (t.dataset.trash) {
    if (!confirm(`Move ${t.dataset.trash} to trash?`)) return;
    try { await api(`/api/backups/${encodeURIComponent(t.dataset.trash)}/trash`, { method: 'POST' }); refresh(); }
    catch (err) { toast(err.message); }
  } else if (t.dataset.untrash) {
    try { await api(`/api/backups/${encodeURIComponent(t.dataset.untrash)}/restore-from-trash`, { method: 'POST' }); refresh(); }
    catch (err) { toast(err.message); }
  } else if (t.dataset.purge) {
    if (!confirm(`Permanently delete ${t.dataset.purge}? This cannot be undone.`)) return;
    try { await api(`/api/backups/${encodeURIComponent(t.dataset.purge)}`, { method: 'DELETE' }); refresh(); }
    catch (err) { toast(err.message); }
  } else if (t.id === 'runNowBtn') {
    t.disabled = true;
    t.textContent = 'Backing up…';
    try {
      const r = await api('/api/backups/run', { method: 'POST' });
      toast(`Backup created: ${r.name}`);
    } catch (err) {
      toast(err.message);
    } finally {
      t.disabled = false;
      t.textContent = 'Backup now';
      refresh();
    }
  }
});

$('#uploadInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  try {
    const r = await api('/api/upload', { method: 'POST', body: form });
    toast(`Uploaded as ${r.name} — ready to Restore from the live list.`);
    refresh();
  } catch (err) {
    toast(`Upload failed: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});

refresh();
setInterval(refresh, 15000);
