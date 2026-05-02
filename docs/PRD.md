# BlockPi — Browser Extension PRD
### Product Requirements Document · v1.0 · May 2026

---

## 1. Executive Summary

**BlockPi** is a lightweight, privacy-first browser extension that helps users reclaim their focus by:
- Setting per-website **daily time limits** (e.g., YouTube = 30 min/day)
- **Auto-blocking** a site once the limit is reached
- Providing a **visual dashboard** showing daily & weekly usage analytics
- css - #4EDEA3

The extension must be **fast**, **zero-dependency**, and consume minimal CPU/memory so it never impacts browsing performance.

---

## 2. Problem Statement

Distraction from social media, video platforms, and news sites is one of the leading causes of lost productivity. Existing solutions are either too complex, resource-heavy, or lack granular analytics. Users need a tool that:
1. Works silently in the background with negligible overhead
2. Enforces time limits automatically without requiring manual intervention
3. Shows honest, detailed usage analytics so the user can self-correct over time

---

## 3. Goals & Non-Goals

### ? Goals
- Block a site after a configurable daily timer expires
- Track actual time spent on each site per day
- Display a weekly + daily analytics dashboard
- Support multiple sites simultaneously
- Work entirely offline — no servers, no data collection
- Be installable on **Chrome, Brave, and Edge** (all Chromium-based, zero extra work)
- Firefox support as a v2 stretch goal

### ? Non-Goals (v1)
- Syncing data across devices
- Blocking entire categories of sites (e.g., \"social media\")
- Parental controls / password-locking the settings
- Mobile browser support

---

## 4. Tech Stack Decision

### Why Vanilla JS + Chrome Extension Manifest V3?

| Concern | Choice | Reason |
|---|---|---|
| **Runtime** | Pure Vanilla JS (ES2022) | Zero bundle overhead; fastest possible execution |
| **UI framework** | None (plain HTML + CSS) | Popup + options page are tiny — no framework needed |
| **Storage** | \chrome.storage.local\ | Built-in, sync-capable, no IndexedDB overhead for this data size |
| **Background** | Service Worker (MV3) | Required by MV3; sleeps when idle ? near-zero idle CPU |
| **Styling** | CSS Custom Properties + CSS Grid | Modern, lightweight; no preprocessor needed |
| **Charts (dashboard)** | \Chart.js\ (CDN, loaded lazily on dashboard only) | ~60 KB, loaded only when user opens the dashboard tab |
| **Build tool** | None (raw files, optional \esbuild\ for minification) | Keeps dev loop instant; esbuild if we want minification |
| **Browser target** | Chrome, Brave, Edge (MV3) | All Chromium-based; same extension package works on all three with zero changes |

---

*Document Owner: Ayush Maurya*
*Last Updated: May 2026*