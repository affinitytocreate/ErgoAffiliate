// Wording and timing rules Amazon's IP License requires wherever Creators API
// prices or availability are shown.

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const PRICE_DISCLAIMER =
  'Product prices and availability are accurate as of the date/time indicated and are subject to change. ' +
  'Any price and availability information displayed on Amazon.com at the time of purchase will apply to the purchase of this product.';

export const AMAZON_CONTENT_NOTICE =
  "CERTAIN CONTENT THAT APPEARS ON THIS SITE COMES FROM AMAZON. THIS CONTENT IS PROVIDED 'AS IS' AND IS SUBJECT TO CHANGE OR REMOVAL AT ANY TIME.";

// "Nov 23, 2026, 2:11 PM PST". The time zone name follows daylight saving.
export function formatStamp(iso, timeZone = 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}
