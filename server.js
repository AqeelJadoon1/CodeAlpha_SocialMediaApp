const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(
  session({
    secret: "change-this-to-a-long-random-string",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
  }),
);
app.use(express.static("public"));

// Small helper: block a route unless logged in
function requireLogin(req, res, next) {
  if (!req.session.userId)
    return res.status(401).json({ error: "Please log in" });
  next();
}

// ---------- AUTH ----------
app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "Name, email and password are required" });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  }
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email);
  if (existing)
    return res.status(400).json({ error: "That email is already registered" });

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
    .run(name, email, hash);

  req.session.userId = result.lastInsertRowid;
  res.json({ id: result.lastInsertRowid, name, email });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Wrong email or password" });
  }
  req.session.userId = user.id;
  res.json({ id: user.id, name: user.name, email: user.email });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json(null);
  const user = db
    .prepare("SELECT id, name, email, bio FROM users WHERE id = ?")
    .get(req.session.userId);
  res.json(user || null);
});

// ---------- POSTS ----------

// Create a post
app.post("/api/posts", requireLogin, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Post cannot be empty" });
  }
  const result = db
    .prepare("INSERT INTO posts (user_id, content) VALUES (?, ?)")
    .run(req.session.userId, content.trim());
  res.json({ id: result.lastInsertRowid });
});

// Feed: latest posts, with author name, like count, and whether I liked each one
app.get("/api/posts", (req, res) => {
  const myId = req.session.userId || 0;

  const posts = db
    .prepare(
      `
    SELECT
      posts.id, posts.content, posts.created_at,
      users.id AS author_id, users.name AS author_name,
      (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) AS like_count,
      (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id AND likes.user_id = ?) AS liked_by_me,
      (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) AS comment_count
    FROM posts
    JOIN users ON users.id = posts.user_id
    ORDER BY posts.created_at DESC
  `,
    )
    .all(myId);

  res.json(posts);
});

// ---------- COMMENTS ----------
app.post("/api/posts/:id/comments", requireLogin, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Comment cannot be empty" });
  }
  const post = db
    .prepare("SELECT id FROM posts WHERE id = ?")
    .get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const result = db
    .prepare(
      "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
    )
    .run(req.params.id, req.session.userId, content.trim());
  res.json({ id: result.lastInsertRowid });
});

app.get("/api/posts/:id/comments", (req, res) => {
  const comments = db
    .prepare(
      `
    SELECT comments.id, comments.content, comments.created_at,
           users.name AS author_name
    FROM comments
    JOIN users ON users.id = comments.user_id
    WHERE comments.post_id = ?
    ORDER BY comments.created_at ASC
  `,
    )
    .all(req.params.id);
  res.json(comments);
});

// ---------- LIKES ----------
app.post("/api/posts/:id/like", requireLogin, (req, res) => {
  // INSERT OR IGNORE: if the (post_id, user_id) pair already exists, do nothing
  // instead of throwing an error — this is what our PRIMARY KEY (post_id, user_id) enables
  db.prepare(
    "INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)",
  ).run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

app.delete("/api/posts/:id/like", requireLogin, (req, res) => {
  db.prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?").run(
    req.params.id,
    req.session.userId,
  );
  res.json({ ok: true });
});

// ---------- FOLLOWS ----------
app.post("/api/users/:id/follow", requireLogin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.session.userId) {
    return res.status(400).json({ error: "You can't follow yourself" });
  }
  db.prepare(
    "INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)",
  ).run(req.session.userId, targetId);
  res.json({ ok: true });
});

app.delete("/api/users/:id/follow", requireLogin, (req, res) => {
  db.prepare(
    "DELETE FROM follows WHERE follower_id = ? AND following_id = ?",
  ).run(req.session.userId, req.params.id);
  res.json({ ok: true });
});

// A user's public profile: their info + post count + follower/following counts
app.get("/api/users/:id", (req, res) => {
  const user = db
    .prepare("SELECT id, name, bio FROM users WHERE id = ?")
    .get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const myId = req.session.userId || 0;
  const stats = db
    .prepare(
      `
    SELECT
      (SELECT COUNT(*) FROM posts WHERE user_id = ?) AS post_count,
      (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS follower_count,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?) AS followed_by_me
  `,
    )
    .get(user.id, user.id, user.id, myId, user.id);

  res.json({ ...user, ...stats });
});

app.listen(PORT, () => {
  console.log(`Social app running at http://localhost:${PORT}`);
});
