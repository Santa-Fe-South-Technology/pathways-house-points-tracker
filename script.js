const HOUSE_NAMES = ['Ambrosius', 'Valerius', 'Nicostratus', 'Sapientia'];
const HOUSE_COLORS = {
    'Ambrosius': '2563EB',
    'Valerius': '7E57C2',
    'Nicostratus': '2D6A4F',
    'Sapientia': '8B3A3A'
};

function getHouseColor(house) {
    return HOUSE_COLORS[house] || 'd4af37';
}

function getApiBaseUrl() {
    const configured = window.HOUSE_POINTS_CONFIG && window.HOUSE_POINTS_CONFIG.API_BASE_URL;
    if (!configured) {
        return window.location.origin;
    }

    return configured.replace(/\/$/, '');
}

function apiUrl(path) {
    return `${getApiBaseUrl()}${path}`;
}

function formatTimestamp(value) {
    if (!value) return '--';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
}

function showStatus(message, isError = false) {
    const node = document.getElementById('formStatus');
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? '#b00020' : '#0f6b30';
}

// Mobile menu functionality
const menuButton = document.querySelector('.menu-button');
const navLinks = document.querySelector('.nav-links');

if (menuButton && navLinks) {
    menuButton.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });

    document.addEventListener('click', (event) => {
        if (!navLinks.contains(event.target) && !menuButton.contains(event.target)) {
            navLinks.classList.remove('active');
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            navLinks.classList.remove('active');
        }
    });
}

async function fetchStandingsData() {
    const response = await fetch(apiUrl('/api/standings'));
    if (!response.ok) {
        throw new Error(`Standings request failed: ${response.status}`);
    }
    return response.json();
}

async function fetchSubmissionsData() {
    const response = await fetch(apiUrl('/api/submissions'));
    if (!response.ok) {
        throw new Error(`Submissions request failed: ${response.status}`);
    }
    const payload = await response.json();
    return Array.isArray(payload.submissions) ? payload.submissions : [];
}

function renderHomeStats(standingsPayload) {
    const totalNode = document.getElementById('totalSubmissions');
    const leadingNode = document.getElementById('leadingHouse');
    const teacherNode = document.getElementById('recentTeacher');

    if (!totalNode && !leadingNode && !teacherNode) {
        return;
    }

    const housePoints = standingsPayload.housePoints || {};
    const leader = HOUSE_NAMES.reduce(
        (best, house) => {
            const score = Number(housePoints[house] || 0);
            if (score > best.score) {
                return { house, score };
            }
            return best;
        },
        { house: '--', score: Number.NEGATIVE_INFINITY }
    );

    if (totalNode) {
        totalNode.textContent = String(standingsPayload.submissionCount || 0);
    }

    if (leadingNode) {
        leadingNode.textContent = leader.house === '--' ? '--' : `${leader.house} (${leader.score})`;
    }

    if (teacherNode) {
        teacherNode.textContent = standingsPayload.lastSubmission?.teacher || '--';
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();
    showStatus('Saving submission...');

    const submission = {
        house: document.getElementById('house').value,
        studentName: document.getElementById('studentName').value.trim(),
        points: Number.parseInt(document.getElementById('points').value, 10),
        teacher: document.getElementById('teacher').value.trim(),
        reason: document.getElementById('reason').value.trim(),
    };

    try {
        const response = await fetch(apiUrl('/api/submissions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submission),
        });

        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.error || 'Unable to save submission');
        }

        showStatus('Saved successfully. Redirecting...');
        window.location.href = 'standings.html';
    } catch (error) {
        console.error(error);
        showStatus(error.message || 'Unable to save submission', true);
    }
}

async function renderSubmissionsTable() {
    const tbody = document.getElementById('submissionsBody');
    const mobileList = document.getElementById('mobileSubmissionsList');
    if (!tbody && !mobileList) return;

    try {
        const submissions = await fetchSubmissionsData();
        if (tbody) tbody.innerHTML = '';
        if (mobileList) mobileList.innerHTML = '';

        if (submissions.length === 0) {
            const msg = 'No submissions yet.';
            if (tbody) tbody.innerHTML = '<tr><td colspan="6">' + msg + '</td></tr>';
            if (mobileList) mobileList.innerHTML = '<div class="no-submissions">' + msg + '</div>';
            return;
        }

        submissions.forEach((sub) => {
            const pointsClass = (sub.points > 0) ? 'positive' : (sub.points < 0) ? 'negative' : '';
            const pointsSign = (sub.points > 0) ? '+' : '';
            
            // Desktop table row
            if (tbody) {
                const tr = document.createElement('tr');
                tr.id = `row-${sub.id}`;
                tr.innerHTML = `
                    <td>${formatTimestamp(sub.timestamp)}</td>
                    <td><span class="house-pill" style="background:#${getHouseColor(sub.house)}">${sub.house || '--'}</span></td>
                    <td>${sub.studentName || '--'}</td>
                    <td class="points-cell ${pointsClass}">${pointsSign}${sub.points ?? '--'} points</td>
                    <td><strong>By:</strong> ${sub.teacher || '--'}</td>
                    <td><strong>For:</strong> ${sub.reason || '--'}</td>
                    <td><button onclick="deleteSubmission('${sub.id}')" style="background:#b00020;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;">Delete</button></td>
                `;
                tbody.appendChild(tr);
            }
            
            // Mobile list item
            if (mobileList) {
                const item = document.createElement('div');
                item.className = 'mobile-submission-item';
                item.id = `mobile-row-${sub.id}`;
                item.innerHTML = `
                    <div class="mobile-sub-header">
                        <span class="house-badge" style="background:#${getHouseColor(sub.house)}">${sub.house || '--'}</span>
                        <span class="mobile-points ${pointsClass}">${pointsSign}${sub.points ?? '--'}</span>
                    </div>
                    <div class="mobile-sub-name">${sub.studentName || '--'}</div>
                    <div class="mobile-sub-meta">${sub.teacher || '--'}</div>
                    <div class="mobile-sub-reason">${sub.reason || '--'}</div>
                    <div class="mobile-sub-time">${formatTimestamp(sub.timestamp)}</div>
                    <button onclick="deleteSubmission('${sub.id}')" class="mobile-delete-btn">Delete</button>
                `;
                mobileList.appendChild(item);
            }
        });
    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6">Unable to load submissions. Check backend API configuration.</td></tr>';
        if (mobileList) mobileList.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Unable to load submissions. Check backend API configuration.</div>';
    }
}

async function initializePageData() {
    try {
        const standings = await fetchStandingsData();
        renderHomeStats(standings);
    } catch (error) {
        console.error(error);
    }

    await renderSubmissionsTable();
}

const form = document.getElementById('pointsForm');
if (form) {
    form.addEventListener('submit', handleFormSubmit);
}

initializePageData();