// ======================
// Mobile menu functionality
// ======================
const menuButton = document.querySelector('.menu-button');
const navLinks = document.querySelector('.nav-links');

if (menuButton && navLinks) {
    menuButton.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!navLinks.contains(e.target) && !menuButton.contains(e.target)) {
            navLinks.classList.remove('active');
        }
    });

    // Close menu when window is resized to desktop size
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            navLinks.classList.remove('active');
        }
    });
}

// ======================
// Initialize localStorage
// ======================
if (!localStorage.getItem('housePoints')) {
    localStorage.setItem('housePoints', JSON.stringify({
        Ambrosius: 0,
        Valerius: 0,
        Nicostratus: 0,
        Sapientia: 0
    }));
}

if (!localStorage.getItem('submissions')) {
    localStorage.setItem('submissions', JSON.stringify([]));
}

// ======================
// Form submission handling
// ======================
const form = document.getElementById('pointsForm');
if (form) {
    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const submission = {
            timestamp: new Date().toISOString(),
            house: document.getElementById('house').value,
            student_name: document.getElementById('studentName').value,
            points: parseInt(document.getElementById('points').value),
            teacher: document.getElementById('teacher').value,
            reason: document.getElementById('reason').value
        };

        // Optional: Update localStorage for offline fallback
        const housePoints = JSON.parse(localStorage.getItem('housePoints'));
        housePoints[submission.house] += submission.points;
        localStorage.setItem('housePoints', JSON.stringify(housePoints));

        const submissions = JSON.parse(localStorage.getItem('submissions'));
        submissions.push(submission);
        localStorage.setItem('submissions', JSON.stringify(submissions));

        // POST to Vercel API
        try {
            const res = await fetch('https://next-js-api-silk.vercel.app/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submission)
            });
            const result = await res.json();
            console.log('Submitted to API:', result);
        } catch (err) {
            console.error('API submission failed:', err);
        }

        // Redirect to standings page
        window.location.href = 'standings.html';
    });
}

// ======================
// Fetch and display house standings
// ======================
async function fetchStandings() {
    try {
        const res = await fetch('https://next-js-api-silk.vercel.app/api/data');
        const data = await res.json();

        // Sum points by house
        const totals = data.reduce((acc, row) => {
            acc[row.house] = (acc[row.house] || 0) + row.points;
            return acc;
        }, {});

        // Render standings
        const container = document.getElementById('standings');
        if (container) {
            container.innerHTML = '';
            const houseColors = {
                Ambrosius: 'blue',
                Valerius: 'purple',
                Nicostratus: 'green',
                Sapientia: 'maroon'
            };

            for (const house in totals) {
                const div = document.createElement('div');
                div.textContent = `${house}: ${totals[house]} points`;
                div.style.color = houseColors[house] || 'black';
                div.style.fontWeight = 'bold';
                div.style.marginBottom = '0.5em';
                container.appendChild(div);
            }
        }
    } catch (err) {
        console.error('Failed to fetch standings:', err);
    }
}

// Only call fetchStandings if the standings container exists
if (document.getElementById('standings')) {
    fetchStandings();
}
