---
name: Missing avatar upload endpoint symptom
description: How a missing backend route can look like a frontend-only display bug (avatar only visible on the page that set it)
---

If a "chosen image only shows on the page where it was picked, not anywhere else in the app"
is reported, check whether the upload actually persists server-side before assuming it's a
caching/display bug. In WhiteWase (Minecraft mods hub), the profile page called
`POST /api/profiles/avatar` to upload an avatar, but the api-server never defined that route —
only `/profiles/me`, `/profiles/check-username`, `/profiles/:username` existed. The request 404'd,
but the page still showed the picture because it stored the file in local component state before/
regardless of the persisted save, so the bug only became visible on other pages that read the
profile from the database.

**Why:** A silent 404 (or any failed network call) that the frontend still renders optimistically
from local state can perfectly mimic a "display-only-in-one-place" bug. Symptoms and root cause
live in different layers.

**How to apply:** When a feature "shows in one place but not elsewhere", check the network tab /
route registration for the endpoint that's supposed to persist it before assuming it's a rendering
or cache-invalidation issue.
