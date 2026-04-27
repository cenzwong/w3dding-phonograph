# AI Agent Guidelines

This document contains important guidelines and architectural decisions for AI agents working on the `w3dding-phonograph` repository. Please adhere to these rules when making changes.

## 1. Architecture & Repository Structure

- **Feature-Based (Modular) Architecture:** The project uses a strict feature-based modular structure.
  - Source code resides in `src/`.
  - Group related code by domain or module within `src/features/` (e.g., `src/features/camera/`, `src/features/admin/`).
  - Shared utilities and libraries should be placed in `src/lib/`.
- **Root-Level Separation:** Maintain strict root-level separation for source (`src/`), compiled output (`dist/`), and tests (`tests/`). Do not mix these domains.
- **TypeScript Configuration:** `vitest.config.ts` must be excluded from the root `tsconfig.json` `include` array to avoid TS6305 errors, as it is already handled by the `tsconfig.node.json` reference.

## 2. Testing Guidelines (Vitest & JSDOM)

The application relies on Vitest, JSDOM, and React Testing Library. Because JSDOM does not natively support many browser APIs used in this project, rigorous mocking is required.

- **MediaRecorder API:** You must provide custom mocking for `MediaRecorder` in tests since it is not natively supported by JSDOM.
- **Mocking Global `navigator` APIs:** When mocking global APIs like `navigator.mediaDevices`, `navigator.wakeLock`, and `navigator.storage`, always use `vi.stubGlobal('navigator', { ...global.navigator, ...mocks })`. Do not use `Object.defineProperty`, as `stubGlobal` provides cleaner teardown and robust testing.
- **Simulating IndexedDB Errors:**
  - When simulating `indexedDB.open` errors, use `vi.spyOn(indexedDB, 'open')` with `mockImplementation` to return a mocked request object.
  - You must trigger the `onerror` event asynchronously using `setTimeout` to accurately simulate IndexedDB's async behavior.
- **Test Ordering for DB Initialization:** Tests simulating database initialization failures (e.g., `indexedDB.open` errors) *must* run before tests for successful initialization. This avoids false failures caused by module-level caching of the database promise (`dbPromise`).
- **Avoiding ID Collisions in Mocks:** When mocking multiple saves to IndexedDB (e.g., calling `saveVideoToDB` multiple times in a test), include a small delay (e.g., `10ms`) between consecutive calls. IDs are generated using `Date.now()`, so executing them synchronously will cause collisions.

## 3. Performance & IndexedDB Usage

The application uses IndexedDB (Database: `'WeddingBoothDB'`, Store: `'videos'`) to persist video recordings locally as Blobs.

- **Use Cursors for Large Blobs:** For performance and memory efficiency when dealing with large IndexedDB objects (like video blobs), **always use `openCursor()`** to stream and iterate over records.
- Do not use `getAll()` for retrieving videos, as this can lead to RAM exhaustion and cause the application to crash.

## 4. Repository Cleanliness

- **No Clutter:** Avoid cluttering the repository. Delete any artifact files immediately (like `*.orig` and `*.patch`).
- **Git Ignore:** Ensure `.gitignore` properly tracks standard ignore patterns, including but not limited to `node_modules/`, `dist/`, `build/`, `.DS_Store`, `.env`, `*.orig`, and `*.patch`.
