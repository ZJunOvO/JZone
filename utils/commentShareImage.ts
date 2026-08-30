import type { Comment, Song } from '../types';
import { getAvatarFrameUrl } from '../config/avatarFrames';

const WIDTH = 1080;
const HEIGHT = 1350;

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

const loadImage = async (source?: string | null): Promise<HTMLImageElement | null> => {
  if (!source) return null;
  let objectUrl: string | null = null;
  try {
    const response = await fetch(source, { mode: 'cors' });
    if (!response.ok) return null;
    objectUrl = URL.createObjectURL(await response.blob());
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return image;
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
};

const drawCover = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  const sourceWidth = imageRatio > targetRatio ? image.naturalHeight * targetRatio : image.naturalWidth;
  const sourceHeight = imageRatio > targetRatio ? image.naturalHeight : image.naturalWidth / targetRatio;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
};

const getWrappedTextLines = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) => {
  const characters = Array.from(text.trim());
  const lines: string[] = [];
  let line = '';
  for (const character of characters) {
    const candidate = line + character;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = character;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const truncated = lines.join('').length < characters.length;
  if (truncated && lines.length) {
    let last = lines[lines.length - 1];
    while (last && context.measureText(`${last}...`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}...`;
  }
  return lines;
};

const drawWrappedText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) => {
  const lines = getWrappedTextLines(context, text, maxWidth, maxLines);
  lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
};

export const generateCommentShareImage = async (comment: Comment, song: Song): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持生成分享图片');

  const [cover, avatar, frame] = await Promise.all([
    loadImage(song.coverUrl),
    loadImage(comment.avatarUrl),
    loadImage(getAvatarFrameUrl(comment.avatarFrameId)),
  ]);

  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#3a3f50');
  background.addColorStop(0.48, '#17181d');
  background.addColorStop(1, '#070708');
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  if (cover) {
    context.save();
    context.filter = 'blur(74px) brightness(0.58) saturate(1.35)';
    context.globalAlpha = 0.92;
    drawCover(context, cover, -120, -120, WIDTH + 240, HEIGHT + 240);
    context.restore();
  }

  const shade = context.createLinearGradient(0, 0, 0, HEIGHT);
  shade.addColorStop(0, 'rgba(0,0,0,0.08)');
  shade.addColorStop(1, 'rgba(0,0,0,0.76)');
  context.fillStyle = shade;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = 'rgba(255,255,255,0.11)';
  roundedRect(context, 70, 70, WIDTH - 140, HEIGHT - 140, 56);
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.24)';
  context.lineWidth = 2;
  context.stroke();

  if (cover) {
    context.save();
    roundedRect(context, 130, 130, 230, 230, 42);
    context.clip();
    drawCover(context, cover, 130, 130, 230, 230);
    context.restore();
  }

  context.fillStyle = '#ffffff';
  context.font = '700 52px "HarmonyOS Sans SC", system-ui, sans-serif';
  context.fillText(song.title, 400, 208, 540);
  context.fillStyle = 'rgba(255,255,255,0.66)';
  context.font = '700 30px "HarmonyOS Sans SC", system-ui, sans-serif';
  context.fillText(song.artist, 400, 262, 540);
  context.fillStyle = 'rgba(255,255,255,0.48)';
  context.font = '600 24px "HarmonyOS Sans SC", system-ui, sans-serif';
  context.fillText('JZone 评论', 400, 326);

  let quoteMarkY = 510;
  let commentTextY = 580;
  let commentMaxLines = 7;
  if (comment.quotedLyric) {
    const quoteX = 130;
    const quoteY = 410;
    const quotePaddingX = 28;
    const quotePaddingY = 20;
    const quoteLineHeight = 36;
    const quoteMaxTextWidth = 764;
    const quoteText = `“${comment.quotedLyric}”`;
    context.font = '700 27px "HarmonyOS Sans SC", system-ui, sans-serif';
    const quoteLines = getWrappedTextLines(context, quoteText, quoteMaxTextWidth, 2);
    const quoteTextWidth = Math.max(0, ...quoteLines.map((line) => context.measureText(line).width));
    const quoteWidth = Math.min(820, Math.max(132, Math.ceil(quoteTextWidth + quotePaddingX * 2)));
    const quoteHeight = quotePaddingY * 2 + quoteLines.length * quoteLineHeight;

    context.fillStyle = 'rgba(255,255,255,0.08)';
    roundedRect(context, quoteX, quoteY, quoteWidth, quoteHeight, 24);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.58)';
    context.save();
    context.textBaseline = 'top';
    quoteLines.forEach((line, index) => {
      context.fillText(line, quoteX + quotePaddingX, quoteY + quotePaddingY + index * quoteLineHeight);
    });
    context.restore();
    quoteMarkY = quoteY + quoteHeight + 64;
    commentTextY = quoteMarkY + 70;
    commentMaxLines = 5;
  }

  context.fillStyle = 'rgba(255,255,255,0.9)';
  context.font = '700 58px "HarmonyOS Sans SC", system-ui, sans-serif';
  context.fillText('“', 126, quoteMarkY);
  context.font = '700 48px "HarmonyOS Sans SC", system-ui, sans-serif';
  const textBottom = drawWrappedText(context, comment.text, 150, commentTextY, 780, 76, commentMaxLines);
  context.font = '700 58px "HarmonyOS Sans SC", system-ui, sans-serif';
  context.fillText('”', 894, Math.min(textBottom + 16, 1050));

  const avatarY = 1110;
  if (avatar) {
    context.save();
    context.beginPath();
    context.arc(180, avatarY, 54, 0, Math.PI * 2);
    context.clip();
    drawCover(context, avatar, 126, avatarY - 54, 108, 108);
    context.restore();
  }
  if (frame) drawCover(context, frame, 106, avatarY - 74, 148, 148);

  context.fillStyle = '#ffffff';
  context.font = '700 32px "HarmonyOS Sans SC", system-ui, sans-serif';
  context.fillText(comment.username, 270, avatarY - 4, 610);
  context.fillStyle = 'rgba(255,255,255,0.56)';
  context.font = '600 24px "HarmonyOS Sans SC", system-ui, sans-serif';
  context.fillText(`听到 ${Math.floor(comment.playbackTime / 60)}:${String(Math.floor(comment.playbackTime % 60)).padStart(2, '0')}`, 270, avatarY + 40);

  context.fillStyle = 'rgba(255,255,255,0.42)';
  context.font = '700 22px "HarmonyOS Sans SC", system-ui, sans-serif';
  context.fillText('PRIVATE MUSIC, SHARED MOMENTS', 130, 1255);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('分享图片生成失败')), 'image/png');
  });
};
