# Pathways House Points Tracker

A full House Points tracking web app for school-wide use throughout the year.

## Important Hosting Architecture

This app uses a **split deployment model** for reliability:

- **Frontend**: Static HTML/CSS/JS hosted on GitHub Pages or Netlify
- **Backend API**: Node/Express server with Postgres database
- **Database**: Netlify Database (managed Postgres)

Data persists **all year** in the database, not in browser storage or ephemeral server files.

## Features

- Persistent shared storage for all teachers through a server API
- Point submission form for positive and negative behavior points
- Standings dashboard with live chart, leaderboard, and recent activity
- Full submissions transparency page with filtering and search
- Mobile-friendly navigation and layout

## Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with a local Postgres connection (or use docker):
   ```bash
   DATABASE_URL=postgresql://localhost/house_points
   HOUSE_POINTS_ADMIN_PIN=your-pin
   ```

3. Start the app:
   ```bash
   npm start
   ```

4. Open in browser:
   ```
   http://localhost:3000
   ```

5. For local dev, keep `config.js` as:
   ```javascript
   API_BASE_URL: window.location.origin
   ```

## Deploy to Netlify (Recommended)

### Step 1: Create Netlify Database

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Create a new Netlify Database
3. **Copy the connection string** to your clipboard

### Step 2: Feed This Prompt to Netlify's AI Agent

Copy and paste this exact prompt into Netlify's database AI agent:

```
Create a Postgres database schema for a school house points tracker app with the following:

Tables:
1. submissions
   - id: UUID primary key, auto-generated
   - timestamp: timestamp with timezone, default current_timestamp
   - house: text, NOT NULL, must be one of: 'Ambrosius', 'Valerius', 'Nicostratus', 'Sapientia'
   - student_name: text, NOT NULL, max 120 characters
   - points: integer, NOT NULL, range -200 to 200
   - teacher: text, NOT NULL, max 120 characters
   - reason: text, NOT NULL, max 500 characters

Indexes:
- On house column (for fast house filtering)
- On timestamp column (for sorting by date)

The app will:
- Insert new submissions (POST /api/submissions)
- Query all submissions with optional house/teacher filters (GET /api/submissions)
- Delete submissions by id (DELETE /api/submissions/:id)
- Calculate house point totals by summing points grouped by house (GET /api/standings)

No other tables needed. That's it.
```

### Step 3: Deploy Backend to Netlify Functions

This step differs from a traditional Netlify deploy. For now:

**Option A: Deploy to Render instead** (easier with Netlify Database)
1. Create a Render account at [render.com](https://render.com)
2. Connect your GitHub repo
3. Create a new Web Service
4. In environment variables, add:
   ```
   DATABASE_URL=<your-netlify-database-url>
   HOUSE_POINTS_ADMIN_PIN=<secure-pin>
   CORS_ORIGIN=https://your-github-pages-domain.com
   NODE_ENV=production
   ```
5. Deploy

**Option B: Use GitHub Actions to deploy to your own server** (advanced)

### Step 4: Deploy Frontend to GitHub Pages

1. Ensure GitHub Pages is enabled in your repo settings
2. Update `config.js`:
   ```javascript
   API_BASE_URL: 'https://your-render-domain.onrender.com'
   ```
3. Push changes:
   ```bash
   git add config.js
   git commit -m "Update API base URL for production"
   git push
   ```

### Step 5: Verify

- Visit `https://your-github-pages-domain.com`
- Submit a test point entry
- Check standings update
- Verify submissions appear on submissions page

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# DATABASE_URL from Netlify Database
DATABASE_URL=postgresql://...

# Admin PIN for protected deletion (required)
HOUSE_POINTS_ADMIN_PIN=<your-secure-pin>

# CORS origin (set to your frontend domain)
CORS_ORIGIN=https://your-domain.com

# Node environment
NODE_ENV=production
```

## API Endpoints

- **GET /api/health** — Health check
- **GET /api/standings** — Current house totals and standings
- **GET /api/submissions** — All submissions (supports filters: `?house=`, `?teacher=`, `?q=`)
- **POST /api/submissions** — Submit new points (requires: house, studentName, points, teacher, reason)
- **DELETE /api/submissions/:id** — Delete submission (requires: PIN in body)

## Data Schema

### submissions table

```sql
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    house TEXT NOT NULL CHECK (house IN ('Ambrosius', 'Valerius', 'Nicostratus', 'Sapientia')),
    student_name TEXT NOT NULL,
    points INTEGER NOT NULL CHECK (points >= -200 AND points <= 200),
    teacher TEXT NOT NULL,
    reason TEXT NOT NULL
);
```

## Troubleshooting

**"Unable to load standings"**
- Check `DATABASE_URL` is set correctly
- Verify database is running and accessible
- Check CORS_ORIGIN matches your frontend domain

**"Submission failed"**
- Ensure all required fields are filled
- Points must be between -200 and 200
- House must be one of the four valid names

**Frontend not updating after new submission**
- Clear browser cache or hard refresh (Cmd+Shift+R)
- Check API response in browser DevTools Network tab

## Data Persistence

All submissions are stored in Netlify Database (managed Postgres). Data persists:
- Across server restarts
- Across deployments
- For the entire school year
- Indefinitely (unless database is deleted)

This is much more reliable than JSON files or browser local storage.
