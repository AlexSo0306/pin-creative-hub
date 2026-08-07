# Content Workbench MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reusable local content-reference workbench whose first active space tracks home and lifestyle accounts across Xiaohongshu and Douyin.

**Architecture:** Use a zero-dependency Node.js HTTP server with JSON file persistence and a static frontend. Model spaces, creators, platform accounts, posts, and sync runs separately so three future topic directions remain isolated while sharing the same UI and collection contracts.

**Tech Stack:** Node.js built-in modules, HTML, CSS, vanilla JavaScript, Node test runner

---

### Task 1: Create the data model and persistence layer

**Files:**
- Create: `src/store.js`
- Create: `data/workbench.json`
- Test: `tests/store.test.js`

**Steps:**
1. Write tests for listing spaces, filtering posts, deduplicating by platform and post ID, and recording sync runs.
2. Run `node --test tests/store.test.js` and confirm the tests fail.
3. Implement JSON-backed persistence with atomic writes.
4. Run the tests and confirm they pass.

### Task 2: Create the local API and static server

**Files:**
- Create: `server.js`
- Create: `src/router.js`
- Test: `tests/router.test.js`

**Steps:**
1. Write route tests for dashboard data, post filters, account creation, manual post creation, and sync.
2. Implement the API routes and static-file serving.
3. Validate JSON input and return structured errors.
4. Run `node --test`.

### Task 3: Build the workbench interface

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

**Steps:**
1. Build a stable sidebar for independent topic spaces.
2. Add dashboard counters, latest-post feed, search and platform filters.
3. Add account management, manual post entry, original-link actions, and sync feedback.
4. Add responsive layouts for desktop and mobile without changing control dimensions unexpectedly.

### Task 4: Seed and verify the home-reference MVP

**Files:**
- Modify: `data/workbench.json`
- Create: `README.md`

**Steps:**
1. Seed the home space and the Xiaohongshu/Douyin accounts for 居里富人.
2. Seed representative posts gathered from the publicly visible profile pages, preserving original links.
3. Start the local server and exercise the main API routes.
4. Verify desktop and mobile layouts in the browser.
5. Document startup, data location, current collection limits, and the adapter path for future automatic monitoring.
