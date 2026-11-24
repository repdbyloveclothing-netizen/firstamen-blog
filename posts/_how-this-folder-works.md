# How posts in this folder work

Every `.md` file here is an article for the FirstAmen blog. Nothing is published until you say so.

## Draft, then live

The block at the top of each file controls it:

```
---
title: A Prayer to Start the Day
slug: prayer-to-start-the-day
date: 2026-11-24
status: draft
description: One sentence shown in Google results.
keywords: prayer to start the day, short morning prayer
---
```

**`status: draft`** keeps the post in the repo and off the site. Change it to **`status: published`**, commit, and the site rebuilds with it within about 15 minutes.

Everything else in the file is normal markdown: `##` for section headings, `###` for the questions in the FAQ, `-` or `1.` for lists, `**bold**`, `[text](url)` for links, and `![description](image-url)` for photos. The article title becomes the page's H1, so don't repeat it inside the body.

## What makes a post show up in Google

- `title` and `slug` are the page URL and headline. Keep the slug short and in lowercase, with dashes.
- `description` becomes the meta description. One plain sentence, under about 155 characters.
- A `##` heading containing "FAQ" or "Questions" turns the `###` questions under it into FAQ structured data, which is what Google and AI answers quote. Phrase them as real questions ending in `?`.
- Two or three links to other posts, plus one to the Google Play listing, every time.

Files starting with `_` are ignored, so this note never becomes a post.
