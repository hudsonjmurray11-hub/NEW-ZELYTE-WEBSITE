/* ==========================================================================
   ZELYTE — api/_lib/klaviyo.js
   Marketing list and purchase events. Failures reach the webhook handler
   so it can return a failure for monitoring and configured retry/replay.
   This asynchronous webhook is separate from signup and order creation.
   ========================================================================== */
const API = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

async function call(path, body) {
  const key = process.env.KLAVIYO_PRIVATE_KEY;
  if (!key) throw new Error('Klaviyo API key is not configured');
  try {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Klaviyo-API-Key ' + key,
        'revision': REVISION,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Klaviyo request was rejected');
    return true;
  } catch (e) {
    // Do not expose provider response bodies, credentials, or recipient data.
    throw new Error('Klaviyo request failed');
  }
}

/* Creates or updates the profile with custom properties. */
export function upsertProfile(email, properties) {
  return call('/profile-import/', {
    data: { type: 'profile', attributes: { email, properties: properties || {} } }
  });
}

/* Email marketing consent + list membership. Only for people who asked to be
   on the list (the launch-list form, or an account with marketing_opt_in). A
   buyer who never opted in gets the profile and events, not the subscription. */
export function subscribe(email) {
  const list = process.env.KLAVIYO_LIST_ID;
  if (!list) throw new Error('Klaviyo list is not configured');
  return call('/profile-subscription-bulk-create-jobs/', {
    data: {
      type: 'profile-subscription-bulk-create-job',
      attributes: {
        custom_source: 'takezelyte.com',
        profiles: { data: [{ type: 'profile', attributes: { email, subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } } } }] }
      },
      relationships: { list: { data: { type: 'list', id: list } } }
    }
  });
}

/* `uniqueId` makes a retried webhook a no-op on Klaviyo's side too. */
export function track(email, metric, properties, value, uniqueId) {
  return call('/events/', {
    data: {
      type: 'event',
      attributes: {
        properties: properties || {},
        value: value,
        unique_id: uniqueId,
        metric: { data: { type: 'metric', attributes: { name: metric } } },
        profile: { data: { type: 'profile', attributes: { email } } }
      }
    }
  });
}
