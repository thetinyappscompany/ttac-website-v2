# The Tiny Apps Company: website

The public one-screen site for TTAC, plus an admin panel at `/admin` for editing everything on it.
All content and uploaded images live in this GitHub repository. Vercel (free Hobby plan) only hosts it.

## How publishing works

1. You edit in `/admin`. The preview shows your changes, including new images, before anything goes live.
2. **Publish changes** makes one commit to GitHub with `public/content.json` and any images you added (in `public/uploads/`).
3. The site reads its content and new images live from GitHub through `/api/content` and `/uploads/...`, with Vercel's edge keeping a copy for 30 seconds. Visitors see the change within a minute, without waiting for a redeploy.

No database and no Vercel storage are used. Every change is in the git history, so you can see or undo any edit on GitHub.

## What is here

| Path | What it is |
|---|---|
| `public/index.html`, `styles.css`, `app.js` | The site. `app.js` draws the phone, its apps and dock screens from `content.json` |
| `public/content.json` | All site content. The admin panel edits this file |
| `public/pricing.html`, `terms.html`, `privacy.html`, `refund-policy.html`, `shipping-policy.html`, `contact-us.html` | Products & pricing, policy and contact pages (needed for Razorpay). Not linked from the home page; each links to the others in its footer. Plain HTML styled by `pages.css`; edit them in the repo, not in /admin. Prices come from TTAC HQ's seeds and each product's repo |
| `public/admin.html`, `admin.css`, `admin.js` | The admin panel: edit, preview, publish |
| `public/assets/` | TTAC logo, app icons, share image |
| `api/content.js` | `GET`: the content, live from GitHub. `PUT`: publish (admin only) |
| `api/image.js` | Serves images uploaded in /admin from GitHub until the next deploy includes them |
| `api/login.js`, `api/upload.js` | Admin sign-in, and image uploads for icons and team photos |
| `lib/github.js`, `lib/store.js` | GitHub commits, and the local fallback |
| `dev-server.mjs` | Runs the site and the `api/` handlers on your PC |

## Run it on your PC

1. Copy `.env.example` to `.env.local` and set `ADMIN_USERNAME` and `ADMIN_PASSWORD` (8 characters or more). Leave the GitHub values empty.
2. `npm run dev`, then open http://localhost:5175 and http://localhost:5175/admin.

Without GitHub settings, publishing writes straight to `public/content.json` and `public/uploads/`. Commit those like any other change.

## Put it on Vercel (free plan)

1. **GitHub repository:** push this folder to a new GitHub repository. On the Hobby plan, Vercel can deploy private repositories only from a **personal** GitHub account (like `thetinyappscompany-cyber`, where the SpacePartner site lives), not from an organisation. A public repository works from either.
2. **Access token:** in GitHub, open Settings > Developer settings > Fine-grained tokens and create a token for **this repository only**, with **Contents: Read and write**. Set an expiry date you will remember.
3. **Vercel project:** import the repository in Vercel. Framework preset: Other. No build command. If the site is in a subfolder, set Root Directory to it.
4. **Environment Variables:** in the project's settings, add:
   - `ADMIN_USERNAME` (the admin ID) and `ADMIN_PASSWORD`
   - `GITHUB_REPO`, e.g. `thetinyappscompany-cyber/ttac-website`
   - `GITHUB_TOKEN`, the token from step 2
   - `GITHUB_BRANCH`, if it is not `main`
   - `GITHUB_SITE_DIR`, only if the site is in a subfolder of the repository
5. Deploy, then open `/admin`.

Commits from the admin panel are made by the GitHub account that owns the token, so Vercel's Hobby plan accepts them. Each publish is one deploy. Hobby allows up to 100 deploys a day.

## The admin panel

- **Apps:** add, hide, reorder or delete apps. Each one has an icon (upload or a symbol), header colours, website button, YouTube video, info strip, highlights and feature groups.
- **About, Team, How we build, Contact:** the four dock screens. About also takes a YouTube video.
- **Site settings:** the rotating headline words, the hint, the widget line, and **Zoom the phone when a video plays**.
- **Backup:** download all content as JSON, or load a backup back into the editor. (GitHub's history is a backup too.)

Images must be 2 MB or smaller, because they are stored in the repository. Square PNG or JPG at about 512 × 512 pixels is plenty.

### Videos

Paste any YouTube link: `watch?v=`, `youtu.be/`, or `/shorts/`. Shorts count as vertical; you can override the shape per video.
With zoom on, tapping a video makes the phone grow to fill the screen. It turns sideways for horizontal videos, and goes back when the video ends or the viewer presses × or Esc. With zoom off, the video plays inside its card.

## Notes

- **Domain:** canonical, Open Graph, `robots.txt` and `sitemap.xml` assume `https://thetinyappscompany.com`.
- **One admin sign-in (ID and password), no user accounts.** Change it in Vercel and redeploy to sign everyone out.
- **If publishing fails** with "GitHub refused the request", the token has expired or lacks Contents write access to `GITHUB_REPO`.
