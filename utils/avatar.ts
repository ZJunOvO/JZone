export const getQQAvatarUrl = (email?: string | null) => {
  if (!email) return undefined;
  const match = email.match(/^(\d+)@qq\.com$/i);
  return match ? `https://q1.qlogo.cn/g?b=qq&nk=${match[1]}&s=100` : undefined;
};

export const getFallbackAvatarUrl = (seed: string) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/100/100`;

