# CodeAlpha Social Media App

Task 2 of the CodeAlpha Full Stack Development internship — a small Twitter/Instagram-style app with posts, comments, likes, and follows.

## What it does

Register, post something, like and comment on other people's posts, and follow/unfollow other users. Each user has a profile page showing their post count, followers, and following count.

## Features

- Feed of all posts, newest first, with live like/comment counts
- Comment threads per post
- Like / unlike (one like per user per post — enforced at the database level, not just in the UI)
- Follow / unfollow, with a profile page showing stats
- Auth (bcrypt + sessions)

## Tech stack

- Frontend: plain HTML/CSS/JS
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
- Auth: bcrypt + express-session

## Running it locally

```bash
git clone https://github.com/AqeelJadoon1/CodeAlpha_SocialMediaApp.git
cd CodeAlpha_SocialMediaApp
npm install
node server.js
```

Open `http://localhost:3000`, register an account, and start posting.

## Project structure

```
server.js       - routes (auth, posts, comments, likes, follows)
db.js           - SQLite schema
public/
  index.html    - feed + composer
  profile.html  - user profile + their posts
  account.html  - login / register
```

## How likes and follows work under the hood

Both use a junction table with a composite primary key (`post_id + user_id` for likes, `follower_id + following_id` for follows) — that's what stops someone double-liking a post, enforced by the database itself rather than extra app logic.

## Known limitations

- Feed isn't paginated — fine for a small project, would need pagination at real scale
- No notifications when someone likes/comments/follows you
