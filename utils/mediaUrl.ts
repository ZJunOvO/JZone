export const normalizeSecureMediaUrl = (url: string | null | undefined) => {
  if (!url || !/^http:\/\//i.test(url)) return url ?? undefined;
  try {
    const parsed = new URL(url);
    if (!/myqcloud\.com$/i.test(parsed.hostname)) return url;
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return url;
  }
};
