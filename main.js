// CONFIG
// Remote API / database base URL (use local Node API)
const API = 'https://unopprobrious-jason-demonstrational.ngrok-free.dev';
const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };
// STATE
let guard = null;
let startDate = null, endDate = null;
const calState = {
    start: { year: new Date().getFullYear(), month: new Date().getMonth() },
    end: { year: new Date().getFullYear(), month: new Date().getMonth() }
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// NAVIGATION
function navigate(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => {
        p.classList.remove('active');
        try { p.style.display = 'none'; } catch (e) { }
    });
    const target = document.getElementById(pageId);
    if (!target) { console.error('navigate: target not found', pageId); return; }
    target.classList.add('active');
    try {
        target.style.display = pageId === 'login-page' ? 'flex' : 'block';  
    } catch (e) { }
    window.scrollTo(0, 0);
}
function logout() {
    guard = null;
    document.getElementById('username-input').value = '';
    document.getElementById('password-input').value = '';
    document.getElementById('login-err').style.display = 'none';
    document.getElementById('navbar').classList.remove('visible');
    navigate('login-page');
}

// LOGIN
async function doLogin() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value.trim();
    const errEl = document.getElementById('login-err');
    const btn = document.getElementById('login-btn');

    if (!username || !password) { showLoginErr('Please enter username and password.'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>Authenticating...';
    errEl.style.display = 'none';

    try {
        console.log('doLogin: sending', username);
        const res = await fetch(`${API}/api/login`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ username, password }) });
        console.log('doLogin: response status', res.status, res.statusText);
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            console.error('doLogin: non-OK response', res.status, txt);
            showLoginErr(`Server error ${res.status}: ${txt || res.statusText}`);
            return;
        }

        let data;
        if (contentType.includes('application/json')) {
            try { data = await res.json(); }
            catch (e) { const txt = await res.text().catch(() => ''); console.error('doLogin: invalid JSON', e, txt); showLoginErr('Invalid JSON response from server.'); return; }
        } else {
            const txt = await res.text().catch(() => '');
            console.error('doLogin: unexpected content-type', contentType, txt);
            showLoginErr('Unexpected server response.');
            return;
        }
        console.log('doLogin: data', data);

        if (!data || !data.success) { showLoginErr(data?.message || 'Login failed'); return; }

        guard = data.guard;
        document.getElementById('guard-name-display').textContent = guard.name.toUpperCase();
        document.getElementById('navbar').classList.add('visible');

        // Set dashboard values
        document.getElementById('dash-post').textContent = guard.post || 'No post assigned';
        document.getElementById('dash-balance').textContent = '₱ ' + Number(guard.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 });

        // Set incident date/time
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toTimeString().slice(0, 5);
        document.getElementById('inc-date').value = today;
        document.getElementById('inc-time').value = now;

        navigate('dashboard-page');
        // call async loaders but protect from errors so UI remains responsive
        try { loadSchedule().catch(e => console.error('loadSchedule error YAWAAAAAAAAAAAAA', e)); } catch (e) { console.error(e); }
        //try { loadCancelRequests().catch(e => console.error('loadCancelRequests error', e)); } catch(e){ console.error(e); }
    } catch (e) {
        showLoginErr('Cannot connect to server. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Access System';
    }
}

function showLoginErr(msg) {
    const el = document.getElementById('login-err');
    el.textContent = msg; el.style.display = 'block';
}

// SCHEDULE
async function loadSchedule() {

    const tbody = document.getElementById('schedule-tbody');
    try {
        const res = await fetch(`${API}/api/schedule/${encodeURIComponent(guard.name)}`, { headers: HEADERS });
        const data = await res.json();
        if (!data.success || !data.schedules?.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No schedules found.</td></tr>';
            document.getElementById('dash-shift').textContent = 'No upcoming shift';
            return;
        }
        // Show first shift on dashboard
        const first = data.schedules[0];
        console.log('RAW shift_date:', JSON.stringify(data.schedules[0]));
        document.getElementById('dash-shift').textContent = `${new Date(first.shift_date).toLocaleDateString('en-PH')} | ${first.time}`;

        console.log('shift_date raw value:', data.schedules[0]?.shift_date);
        tbody.innerHTML = data.schedules.map(s => `
      <tr>
       <td>${s.shift_date ? new Date(s.shift_date).toLocaleDateString('en-PH') : '—'}</td>
        <td>${s.location}</td>
        <td>${s.time}</td>
        <td><button class="btn-cancel-shift"
    data-location="${s.location.replace(/"/g, '&quot;')}" 
    data-date="${s.shift_date}" 
    onclick="requestCancel(this.dataset.location, this.dataset.date)">
      </tr>`).join('');
    } catch {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Failed to load schedules.</td></tr>';
    }
}

async function requestCancel(location, date) {
    // normalize and validate date before confirming
    function parseDateForDisplay(d) {
        if (!d) return null;
        // try direct parsing
        let pd = new Date(d);
        if (!isNaN(pd.getTime())) return pd;
        // try assume it's a YYYY-MM-DD or similar prefix
        const s = String(d).trim();
        if (s.length >= 10) {
            pd = new Date(s.slice(0, 10) + 'T00:00');
            if (!isNaN(pd.getTime())) return pd;
        }
        return null;
    }

    const parsedDate = parseDateForDisplay(date);
    if (!parsedDate) { showToast('Error', 'Invalid date. Cannot submit cancel request.', true); return; }

    const displayDate = parsedDate.toLocaleDateString('en-PH');
    if (!confirm(`Request cancel for ${location} on ${displayDate}?`)) return;
    try {
        const res = await fetch(`${API}/api/request-cancel`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ guard_id: guard.id, guardName: guard.name, location, date: parsedDate.toISOString().split('T')[0] })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Cancel request submitted!', `Location: ${location}`, false);
            loadCancelRequests();
        } else {
            showToast('Already Requested', data.message, true);  // handles 409
        }
    } catch {
        showToast('Error', 'Could not submit request.', true);
    }
}

async function loadCancelRequests() {
    const tbody = document.getElementById('cancel-tbody');
    if (!tbody) return;
    try {
        const res = await fetch(`${API}/api/cancel-requests/${encodeURIComponent(guard.name)}`, { headers: HEADERS });
        const data = await res.json();
        if (!data.success || !data.requests?.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No cancel requests found.</td></tr>';
            return;
        }
        tbody.innerHTML = data.requests.map(r => `
      <tr>
        <td>${s.shift_date ? new Date(s.shift_date.toString().slice(0, 10) + 'T00:00').toLocaleDateString('en-PH') : '—'}</td>
        <td>${r.location}</td>
        <td>${r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-PH') : '—'}</td>
        <td><span class="badge ${r.status}">${r.status.toUpperCase()}</span></td>
      </tr>`).join('');
    } catch {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Failed to load requests.</td></tr>';
    }
}

// INCIDENT
function updateFileName(input) {
    document.getElementById('file-name').textContent = input.files[0]?.name || 'Upload photo or document';
}

async function submitIncident() {
    const title = document.getElementById('inc-title').value.trim();
    const date = document.getElementById('inc-date').value;
    const time = document.getElementById('inc-time').value;
    const desc = document.getElementById('inc-desc').value.trim();
    const file = document.getElementById('file-upload').files[0];
    const btn = document.getElementById('inc-submit');

    if (!title || !date || !time || !desc) { showToast('Error', 'Please fill all required fields.', true); return; }

    const fd = new FormData();
    fd.append('guard_id', guard.id);
    fd.append('guardName', guard.name);
    fd.append('title', title);
    fd.append('incident_date', date);
    fd.append('incident_time', time);
    fd.append('description', desc);
    if (file) fd.append('attachment', file);

    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Submitting...';
    try {
        const res = await fetch(`${API}/api/incident`, {
            method: 'POST',
            headers: { 'ngrok-skip-browser-warning': 'true' },
            body: fd
        });
        const data = await res.json();
        if (data.success) {
            showToast('Incident report submitted!', 'Forwarded to operations center.', false);
            document.getElementById('inc-title').value = '';
            document.getElementById('inc-desc').value = '';
            document.getElementById('file-name').textContent = 'Upload photo or document';
            setTimeout(() => navigate('dashboard-page'), 1600);
        } else showToast('Error', data.message, true);
    } catch {
        showToast('Error', 'Could not submit report.', true);
    } finally {
        btn.disabled = false; btn.textContent = 'Submit Report';
    }
}

// LEAVE
async function loadLeaveBalance() {
    if (!guard) return;
    try {
        const res = await fetch(`${API}/api/leave-balance/${guard.id}`, { headers: HEADERS });
        const data = await res.json();
        if (data.success) {
            document.getElementById('bal-avail').textContent = data.available + ' days';
            document.getElementById('bal-used').textContent = data.used + ' days';
            document.getElementById('bal-pending').textContent = data.pending + ' days';
        }
    } catch { }
}

async function submitLeave() {
    const type = document.getElementById('leave-type').value;
    const reason = document.getElementById('leave-reason').value.trim();
    const btn = document.getElementById('leave-submit-btn');

    if (!type || !startDate || !endDate || !reason) { showToast('Error', 'Please fill all required fields.', true); return; }

    const days = Math.ceil((endDate - startDate) / 86400000) + 1;
    const fmt = d => d.toISOString().split('T')[0];

    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Submitting...';
    try {
        const res = await fetch(`${API}/api/leave`, {
            method: 'POST', headers: HEADERS,
            body: JSON.stringify({ guard_id: guard.id, guardName: guard.name, leave_type: type, start_date: fmt(startDate), end_date: fmt(endDate), days_count: days, reason })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Leave request submitted!', `${days} day(s) requested.`, false);
            resetLeaveForm();
            setTimeout(() => navigate('dashboard-page'), 1600);
        } else showToast('Error', data.message, true);
    } catch {
        showToast('Error', 'Could not submit request.', true);
    } finally {
        btn.disabled = false; btn.textContent = 'Submit Request';
    }
}

function resetLeaveForm() {
    startDate = endDate = null;
    document.getElementById('start-display').textContent = 'Select start date';
    document.getElementById('end-display').textContent = 'Select end date';
    document.getElementById('start-cal-btn').classList.remove('has-date');
    document.getElementById('end-cal-btn').classList.remove('has-date');
    document.getElementById('duration-box').style.display = 'none';
    document.getElementById('leave-submit-btn').disabled = true;
    document.getElementById('leave-type').value = '';
    document.getElementById('leave-reason').value = '';
}

// CALENDAR
function toggleCal(which) {
    const other = which === 'start' ? 'end' : 'start';
    document.getElementById(other + '-cal').classList.remove('open');
    const cal = document.getElementById(which + '-cal');
    if (cal.classList.contains('open')) cal.classList.remove('open');
    else { renderCal(which); cal.classList.add('open'); }
}

function changeMonth(which, delta) {
    calState[which].month += delta;
    if (calState[which].month > 11) { calState[which].month = 0; calState[which].year++; }
    if (calState[which].month < 0) { calState[which].month = 11; calState[which].year--; }
    renderCal(which);
}

function renderCal(which) {
    const { year, month } = calState[which];
    document.getElementById(which + '-month-label').textContent = MONTHS[month] + ' ' + year;
    const grid = document.getElementById(which + '-cal-grid');
    grid.innerHTML = '';
    DAYS.forEach(d => { const h = document.createElement('div'); h.className = 'cal-day-head'; h.textContent = d; grid.appendChild(h); });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) { const e = document.createElement('div'); e.className = 'cal-day empty'; grid.appendChild(e); }
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const cell = document.createElement('div');
        cell.className = 'cal-day';
        cell.textContent = d;
        if (date.getTime() === today.getTime()) cell.classList.add('today');
        if (date < today) { cell.classList.add('disabled'); }
        else {
            const sel = which === 'start' ? startDate : endDate;
            if (sel && date.getTime() === sel.getTime()) cell.classList.add('selected');
            cell.addEventListener('click', () => selectDate(which, new Date(year, month, d)));
        }
        grid.appendChild(cell);
    }
}

function selectDate(which, date) {
    if (which === 'start') {
        startDate = date;
        document.getElementById('start-display').textContent = formatDate(date);
        document.getElementById('start-cal-btn').classList.add('has-date');
        document.getElementById('start-cal').classList.remove('open');
        if (endDate && endDate < startDate) { endDate = null; document.getElementById('end-display').textContent = 'Select end date'; document.getElementById('end-cal-btn').classList.remove('has-date'); }
    } else {
        endDate = date;
        document.getElementById('end-display').textContent = formatDate(date);
        document.getElementById('end-cal-btn').classList.add('has-date');
        document.getElementById('end-cal').classList.remove('open');
    }
    updateDuration();
}

function formatDate(d) { return MONTHS[d.getMonth()].slice(0, 3) + ' ' + String(d.getDate()).padStart(2, '0') + ', ' + d.getFullYear(); }

function updateDuration() {
    const btn = document.getElementById('leave-submit-btn');
    if (startDate && endDate) {
        const days = Math.ceil((endDate - startDate) / 86400000) + 1;
        document.getElementById('duration-text').textContent = days + ' day' + (days > 1 ? 's' : '');
        document.getElementById('duration-box').style.display = 'block';
        btn.disabled = false;
    } else {
        document.getElementById('duration-box').style.display = 'none';
        btn.disabled = true;
    }
}

document.addEventListener('click', e => {
    ['start', 'end'].forEach(which => {
        const wrap = document.getElementById(which + '-cal-wrap');
        if (wrap && !wrap.contains(e.target)) document.getElementById(which + '-cal').classList.remove('open');
    });
});

// TOAST
function showToast(title, sub, isErr) {
    const t = document.getElementById('toast');
    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-sub').textContent = sub;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ENTER KEY LOGIN
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('login-page').classList.contains('active')) doLogin();
});

// INIT
renderCal('start');
renderCal('end');