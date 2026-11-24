export function readSetCookies(response) {
  const header = response.headers['set-cookie'];
  const lines = Array.isArray(header) ? header : header ? [header] : [];
  const cookies = {};

  for (const line of lines) {
    const [pair] = line.split(';');
    const separator = pair.indexOf('=');
    if (separator === -1) {
      continue;
    }
    cookies[pair.slice(0, separator)] = decodeURIComponent(pair.slice(separator + 1));
  }

  return { cookies, lines };
}
