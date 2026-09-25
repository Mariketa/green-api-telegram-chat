const API_BASE = (import.meta.env.VITE_GREEN_API_URL || 'https://api.greenapi.com').replace(/\/$/, '');

function buildUrl(idInstance, method, apiTokenInstance, tail = '') {
  return `${API_BASE}/waInstance${idInstance}/${method}/${apiTokenInstance}${tail}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const apiMessage =
      data?.message ||
      data?.description ||
      data?.reason ||
      (typeof data === 'string' ? data : null);

    throw new Error(apiMessage || `GREEN-API: HTTP ${response.status}`);
  }

  return data;
}

export function normalizePhone(value) {
  return value.replace(/\D/g, '');
}

export async function checkAccount(credentials, phoneNumber) {
  const phone = normalizePhone(phoneNumber);

  return request(
    buildUrl(credentials.idInstance, 'checkAccount', credentials.apiTokenInstance),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: Number(phone) }),
    },
  );
}

export async function sendMessage(credentials, chatId, message) {
  return request(
    buildUrl(credentials.idInstance, 'sendMessage', credentials.apiTokenInstance),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    },
  );
}

export async function receiveNotification(credentials, signal) {
  const url = buildUrl(
    credentials.idInstance,
    'receiveNotification',
    credentials.apiTokenInstance,
    '?receiveTimeout=5',
  );

  return request(url, { method: 'GET', signal });
}

export async function deleteNotification(credentials, receiptId) {
  return request(
    buildUrl(
      credentials.idInstance,
      'deleteNotification',
      credentials.apiTokenInstance,
      `/${receiptId}`,
    ),
    { method: 'DELETE' },
  );
}
