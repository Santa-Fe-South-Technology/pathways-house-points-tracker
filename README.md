# Pathways House Points Tracker

A full House Points tracking web app for school-wide use throughout the year.

## Features

- Persistent shared storage for all teachers through a server API
- Point submission form for positive and negative behavior points
- Standings dashboard with live chart, leaderboard, and recent activity
- Full submissions transparency page with filtering and search
- Mobile-friendly navigation and layout

## Run Locally or in GitHub Codespaces

1. Install dependencies:

   npm install

2. Start the app:

   npm start

3. Open the app in a browser:

   http://localhost:3000

## Data Persistence

- All data is saved in data/house-points.json.
- This file is used by the API routes in server.js.
- As long as your Codespace is kept active and the file is preserved, standings
  and submissions remain available over the school year.

## API Endpoints

- GET /api/health
- GET /api/standings
- GET /api/submissions
- POST /api/submissions
- DELETE /api/submissions/:id (requires admin PIN)

## Protected Deletion PIN

- To remove a bad point entry, staff must enter the admin PIN on the Submissions
  page.
- The server validates this PIN before deleting any submission.
- Set the PIN with an environment variable before running:

  HOUSE_POINTS_ADMIN_PIN=your-secure-pin npm start

- If this variable is not set, the app uses a default PIN of 1234. Change it for
  production use.
