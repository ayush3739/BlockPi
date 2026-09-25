/**
 * BlockPi — Domain Utility
 * Extract and normalize hostnames from URLs.
 */

/**
 * Extract the base domain from a URL string
 * e.g. "https://www.youtube.com/watch?v=abc" → "youtube.com"
 * @param {string} urlString
 * @returns {string|null}
 */
export function extractDomain(urlString) {
  try {
    const url = new URL(urlString);
    // Only track http/https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return normalizeDomain(url.hostname);
  } catch {
    return null;
  }
}

/**
 * Normalize a hostname by stripping "www." prefix
 * @param {string} hostname
 * @returns {string}
 */
export function normalizeDomain(hostname) {
  return hostname.replace(/^www\./, '').toLowerCase();
}

/**
 * Check if a domain matches a rule domain
 * Handles subdomains: "music.youtube.com" matches "youtube.com"
 * @param {string} pageDomain — the page's domain
 * @param {string} ruleDomain — the rule's domain
 * @returns {boolean}
 */
export function domainMatches(pageDomain, ruleDomain) {
  const normalized = normalizeDomain(pageDomain);
  const rule = normalizeDomain(ruleDomain);
  return normalized === rule || normalized.endsWith('.' + rule);
}

/**
 * Find which rule domain matches the given page domain
 * @param {string} pageDomain
 * @param {Object} rules — rules object keyed by domain
 * @returns {string|null} — the matching rule domain key, or null
 */
export function findMatchingRule(pageDomain, rules) {
  const normalized = normalizeDomain(pageDomain);

  // Direct match first
  if (rules[normalized]) return normalized;

  // Subdomain match - sort by length descending to match most specific first
  const sortedRuleDomains = Object.keys(rules).sort((a, b) => b.length - a.length);
  for (const ruleDomain of sortedRuleDomains) {
    if (domainMatches(normalized, ruleDomain)) {
      return ruleDomain;
    }
  }

  return null;
}

/**
 * Get a display-friendly label for a domain
 * @param {string} domain
 * @returns {string}
 */
export function getDomainLabel(domain) {
  const labels = {
    'youtube.com': 'YouTube',
    'reddit.com': 'Reddit',
    'twitter.com': 'Twitter / X',
    'x.com': 'X (Twitter)',
    'facebook.com': 'Facebook',
    'instagram.com': 'Instagram',
    'tiktok.com': 'TikTok',
    'twitch.tv': 'Twitch',
    'netflix.com': 'Netflix',
    'linkedin.com': 'LinkedIn',
    'pinterest.com': 'Pinterest',
    'snapchat.com': 'Snapchat',
    'discord.com': 'Discord',
    'whatsapp.com': 'WhatsApp',
    'telegram.org': 'Telegram'
  };
  return labels[domain] || domain;
}

/**
 * Get a favicon URL for a domain using Google's favicon service
 * @param {string} domain
 * @returns {string}
 */
export function getFaviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}
