# Smart Placement Preparation Protocol

Web platform for campus placement prep: skill assessment, performance analysis, personalised study plan and progress tracking.

**Stack:** HTML/CSS/JavaScript frontend, Node.js + Express backend, PostgreSQL database, JWT auth, Git/GitHub.

## Run locally
1. Install Node.js 18+ and PostgreSQL.
2. Create the database: `createdb placement_prep` (or create it in pgAdmin).
3. Copy `.env.example` to `.env` and set `DATABASE_URL` and `JWT_SECRET`.
4. `npm install`
5. `npm start`, then open http://localhost:3000

Tables are created automatically on first start.

## API
| Method | Route | Purpose |
|---|---|---|
| POST | /api/register | Create account, returns token |
| POST | /api/login | Log in, returns token |
| GET | /api/data | User, attempts and completed tasks |
| POST | /api/attempts | Save an assessment/practice result |
| POST | /api/done | Tick or untick a study-plan task |
| DELETE | /api/progress | Reset progress |

## Structure
```
server.js        Express API + table setup
public/index.html  Frontend (login, assessment, plan, progress)
```
