// Mobile menu functionality
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

// Initialize localStorage if not exists
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

// Form submission handling
const form = document.getElementById('pointsForm');
if (form) {
    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const submission = {
            timestamp: new Date().toISOString(),
            house: document.getElementById('house').value,
            studentName: document.getElementById('studentName').value,
            points: parseInt(document.getElementById('points').value),
            teacher: document.getElementById('teacher').value,
            reason: document.getElementById('reason').value
        };

        // Update house points
        const housePoints = JSON.parse(localStorage.getItem('housePoints'));
        housePoints[submission.house] += submission.points;
        localStorage.setItem('housePoints', JSON.stringify(housePoints));

        // Store submission
        const submissions = JSON.parse(localStorage.getItem('submissions'));
        submissions.push(submission);
        localStorage.setItem('submissions', JSON.stringify(submissions));

        // Redirect to standings page
        window.location.href = 'standings.html';
    });
}