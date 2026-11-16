require("dotenv").config();
const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: "Server error" }); });
const sign = (id) => jwt.sign({ id }, SECRET, { expiresIn: "7d" });

function requireAuth(req, res, next) {
  try {
    req.uid = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), SECRET).id;
    next();
  } catch (e) {
    res.status(401).json({ error: "Please log in again." });
  }
}

// Register
app.post("/api/register", wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || "") || (password || "").length < 6)
    return res.status(400).json({ error: "Enter a name, a valid email and a password of at least 6 characters." });
  const e = email.toLowerCase();
  const found = await pool.query("SELECT 1 FROM users WHERE email=$1", [e]);
  if (found.rowCount) return res.status(409).json({ error: "That email already has an account. Log in instead." });
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id", [name, e, hash]);
  res.json({ token: sign(r.rows[0].id) });
}));

// Login
app.post("/api/login", wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const r = await pool.query("SELECT id,password_hash FROM users WHERE email=$1", [(email || "").toLowerCase()]);
  if (!r.rowCount || !(await bcrypt.compare(password || "", r.rows[0].password_hash)))
    return res.status(401).json({ error: "Email or password is incorrect." });
  res.json({ token: sign(r.rows[0].id) });
}));

// Everything the dashboard needs
app.get("/api/data", requireAuth, wrap(async (req, res) => {
  const u = await pool.query("SELECT name,email FROM users WHERE id=$1", [req.uid]);
  if (!u.rowCount) return res.status(401).json({ error: "Please log in again." });
  const a = await pool.query("SELECT ts,kind,score,total,t,c FROM attempts WHERE user_id=$1 ORDER BY ts", [req.uid]);
  const d = await pool.query("SELECT topic FROM done_tasks WHERE user_id=$1", [req.uid]);
  const done = {};
  d.rows.forEach((x) => (done[x.topic] = true));
  res.json({ user: u.rows[0], attempts: a.rows.map((x) => ({ ...x, ts: Number(x.ts) })), done });
}));

// Save a test attempt
app.post("/api/attempts", requireAuth, wrap(async (req, res) => {
  const { ts, kind, score, total, t, c } = req.body || {};
  if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || score < 0 || score > total)
    return res.status(400).json({ error: "Invalid attempt." });
  await pool.query(
    "INSERT INTO attempts(user_id,ts,kind,score,total,t,c) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [req.uid, Number(ts) || Date.now(), String(kind).slice(0, 30), score, total, t || {}, c || {}]
  );
  res.json({ ok: true });
}));

// Tick or untick a study-plan task
app.post("/api/done", requireAuth, wrap(async (req, res) => {
  const { topic, value } = req.body || {};
  if (!topic) return res.status(400).json({ error: "Missing topic." });
  if (value) await pool.query("INSERT INTO done_tasks(user_id,topic) VALUES($1,$2) ON CONFLICT DO NOTHING", [req.uid, topic]);
  else await pool.query("DELETE FROM done_tasks WHERE user_id=$1 AND topic=$2", [req.uid, topic]);
  res.json({ ok: true });
}));

// Reset progress
app.delete("/api/progress", requireAuth, wrap(async (req, res) => {
  await pool.query("DELETE FROM attempts WHERE user_id=$1", [req.uid]);
  await pool.query("DELETE FROM done_tasks WHERE user_id=$1", [req.uid]);
  res.json({ ok: true });
}));

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS attempts(
      id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE,
      ts BIGINT NOT NULL, kind TEXT NOT NULL, score INT NOT NULL, total INT NOT NULL,
      t JSONB NOT NULL, c JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS done_tasks(
      user_id INT REFERENCES users(id) ON DELETE CASCADE, topic TEXT NOT NULL,
      PRIMARY KEY(user_id,topic));`);
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("Running at http://localhost:" + port));
}
init().catch((e) => { console.error("Could not start. Check DATABASE_URL and that PostgreSQL is running.\n", e.message); process.exit(1); });
