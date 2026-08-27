import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const dbName = 'jzone-player-upload-draft';
const storeName = 'upload-draft';
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let page;
let newPage;

const owners = {
  a: `smoke/A?scope=one&run=${runId}#a`,
  b: `smoke/A?scope=two&run=${runId}#b`,
};

const describeError = (error) => error instanceof Error ? error.message : String(error);

const assertPageResponse = (response, targetUrl) => {
  if (!response || !response.ok()) {
    throw new Error(`本地服务不可用：${targetUrl} 返回 HTTP ${response?.status() ?? '无响应'}。请先启动正确的本地服务。`);
  }
};

const runPhase = async (targetPage, phase) => targetPage.evaluate(async ({ dbName, storeName, owners, phase }) => {
  const { uploadDraftStorage: storage } = await import('/uploadDraftStorage.ts');
  const { persistDraftAudio } = await import('/utils/uploadAudio.ts');

  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const putLegacyAudio = async () => {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(new Blob(['legacy-audio'], { type: 'audio/mpeg' }), 'audio');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  };

  const deleteLegacyAudio = async () => {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete('audio');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  };

  const fileInfo = async (file) => file ? {
    name: file.name,
    type: file.type,
    size: file.size,
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
  } : null;
  const expectFile = (actual, expected, label) => {
    const same = actual
      && actual.name === expected.name
      && actual.type === expected.type
      && actual.size === expected.size
      && JSON.stringify(actual.bytes) === JSON.stringify(expected.bytes);
    if (!same) throw new Error(`${label} 不匹配：${JSON.stringify(actual)}`);
  };
  const expectFiles = (actual, expected, label) => {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`${label} 数量不匹配：${JSON.stringify(actual)}`);
    }
    actual.forEach((item, index) => expectFile(item, expected[index], `${label}[${index}]`));
  };
  const expectNull = (value, label) => {
    if (value !== null) throw new Error(`${label} 应为 null`);
  };
  const expectEmptyFiles = (value, label) => {
    if (!Array.isArray(value) || value.length !== 0) throw new Error(`${label} 应为空队列`);
  };

  const audioA = new File(['audio-A'], 'audio-a.mp3', { type: 'audio/mpeg' });
  const audioB = new File(['audio-B'], 'audio-b.mp3', { type: 'audio/mpeg' });
  const coverA = new File(['cover-A'], 'cover-a.jpg', { type: 'image/jpeg' });
  const coverB = new File(['cover-B'], 'cover-b.jpg', { type: 'image/jpeg' });
  const queueA = [
    new File(['queue-A-1'], 'queue-a-1.mp3', { type: 'audio/mpeg' }),
    new File(['queue-A-2'], 'queue-a-2.m4a', { type: 'audio/mp4' }),
  ];
  const queueB = [
    new File(['queue-B-1'], 'queue-b-1.mp3', { type: 'audio/mpeg' }),
  ];
  const metaA = { title: '标题 A', artist: '艺人 A', album: '专辑 A', genre: '测试 A' };
  const metaB = { title: '标题 B', artist: '艺人 B', album: '专辑 B', genre: '测试 B' };
  const expected = {
    audioA: await fileInfo(audioA),
    audioB: await fileInfo(audioB),
    coverA: await fileInfo(coverA),
    coverB: await fileInfo(coverB),
    queueA: await Promise.all(queueA.map(fileInfo)),
    queueB: await Promise.all(queueB.map(fileInfo)),
  };

  const expectOwnerState = async (ownerId, files, meta, label) => {
    expectFile(await fileInfo(await storage.getAudio(ownerId)), files.audio, `${label} 音频`);
    expectFile(await fileInfo(await storage.getCover(ownerId)), files.cover, `${label} 封面`);
    expectFiles(await Promise.all((await storage.getPendingFiles(ownerId)).map(fileInfo)), files.queue, `${label} queue`);
    if (JSON.stringify(await storage.getMeta(ownerId)) !== JSON.stringify(meta)) {
      throw new Error(`${label} meta 不匹配`);
    }
  };

  if (phase === 'seed') {
    await storage.clearAll(owners.a);
    await storage.clearAll(owners.b);
    await storage.deletePendingFiles(owners.a);
    await storage.deletePendingFiles(owners.b);

    await putLegacyAudio();
    expectNull(await storage.getAudio(owners.a), '旧固定 audio 键的 A 读取');
    expectNull(await storage.getAudio(owners.b), '旧固定 audio 键的 B 读取');
    await deleteLegacyAudio();

    await storage.setAudio(owners.a, audioA);
    await storage.setCover(owners.a, coverA);
    await storage.setMeta(owners.a, metaA);
    await storage.setPendingFiles(owners.a, queueA);
    await storage.setAudio(owners.b, audioB);
    await storage.setCover(owners.b, coverB);
    await storage.setMeta(owners.b, metaB);
    await storage.setPendingFiles(owners.b, queueB);

    await expectOwnerState(owners.a, { audio: expected.audioA, cover: expected.coverA, queue: expected.queueA }, metaA, 'A');
    await expectOwnerState(owners.b, { audio: expected.audioB, cover: expected.coverB, queue: expected.queueB }, metaB, 'B');

    await storage.clearAll(owners.b);
    expectNull(await storage.getAudio(owners.b), 'clearAll(B) 后 B 音频');
    expectNull(await storage.getCover(owners.b), 'clearAll(B) 后 B 封面');
    expectNull(await storage.getMeta(owners.b), 'clearAll(B) 后 B meta');
    expectFiles(await Promise.all((await storage.getPendingFiles(owners.b)).map(fileInfo)), expected.queueB, 'clearAll(B) 后 B queue');
    await expectOwnerState(owners.a, { audio: expected.audioA, cover: expected.coverA, queue: expected.queueA }, metaA, 'clearAll(B) 后 A');

    await storage.setAudio(owners.b, audioB);
    await storage.setCover(owners.b, coverB);
    await storage.setMeta(owners.b, metaB);
    return { phase, ownerScoped: true, legacyKeyIgnored: true, filesChecked: 4, queueChecked: 3, metaChecked: 2 };
  }

  if (phase === 'restore') {
    await expectOwnerState(owners.a, { audio: expected.audioA, cover: expected.coverA, queue: expected.queueA }, metaA, `${phase} A`);
    await expectOwnerState(owners.b, { audio: expected.audioB, cover: expected.coverB, queue: expected.queueB }, metaB, `${phase} B`);
    return { phase, audio: true, cover: true, meta: true, queue: true, ownerIsolation: true };
  }

  if (phase === 'clear-current') {
    await storage.clearAll(owners.a);
    expectNull(await storage.getAudio(owners.a), '清理当前草稿后的 A 音频');
    expectNull(await storage.getCover(owners.a), '清理当前草稿后的 A 封面');
    expectNull(await storage.getMeta(owners.a), '清理当前草稿后的 A meta');
    expectFiles(await Promise.all((await storage.getPendingFiles(owners.a)).map(fileInfo)), expected.queueA, '清理当前草稿后的 A queue');
    await storage.setAudio(owners.a, audioA);
    return { phase, currentDraftClearPreservesQueue: true };
  }

  if (phase === 'large-audio') {
    const maxPersistBytes = 25 * 1024 * 1024;
    const largeAudio = new File([new Uint8Array(maxPersistBytes + 1)], 'large-audio.mp3', { type: 'audio/mpeg' });
    const result = await persistDraftAudio(largeAudio, owners.a);
    if (result !== 'too-large') throw new Error(`大文件持久化结果应为 too-large，实际为 ${result}`);
    expectNull(await storage.getAudio(owners.a), '大文件替换后的旧 A 音频');
    expectFiles(await Promise.all((await storage.getPendingFiles(owners.a)).map(fileInfo)), expected.queueA, '大文件替换后的 A queue');
    expectFile(await fileInfo(await storage.getAudio(owners.b)), expected.audioB, '大文件处理后的 B 音频');
    return { phase, largeAudioClearsOldAudio: true, queuePreserved: true, otherOwnerPreserved: true };
  }

  if (phase === 'discard-queue') {
    await storage.deletePendingFiles(owners.a);
    expectEmptyFiles(await storage.getPendingFiles(owners.a), '明确弃置后的 A queue');
    expectFiles(await Promise.all((await storage.getPendingFiles(owners.b)).map(fileInfo)), expected.queueB, '明确弃置后的 B queue');
    return { phase, explicitQueueDiscarded: true, otherOwnerQueuePreserved: true };
  }

  throw new Error(`未知 smoke 阶段：${phase}`);
}, { dbName, storeName, owners, phase });

try {
  page = await context.newPage();
  let response;
  try {
    response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch (error) {
    throw new Error(`本地服务不可用：无法连接 ${baseUrl}。请先启动本地服务（例如 npm run dev）。${describeError(error)}`);
  }
  assertPageResponse(response, baseUrl);

  const results = [];
  results.push(await runPhase(page, 'seed'));

  response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
  assertPageResponse(response, baseUrl);
  results.push(await runPhase(page, 'restore'));

  newPage = await context.newPage();
  response = await newPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  assertPageResponse(response, baseUrl);
  results.push(await runPhase(newPage, 'restore'));
  results.push(await runPhase(newPage, 'clear-current'));
  results.push(await runPhase(newPage, 'large-audio'));
  results.push(await runPhase(newPage, 'discard-queue'));

  console.log(JSON.stringify({ ok: true, reloadAndNewPage: true, results }, null, 2));
} catch (error) {
  console.error(`[smoke-upload-draft-storage] 失败：${describeError(error)}`);
  process.exitCode = 1;
} finally {
  try {
    if (page) {
      await page.evaluate(async ({ owners }) => {
        const { uploadDraftStorage: storage } = await import('/uploadDraftStorage.ts');
        await Promise.all([
          storage.clearAll(owners.a),
          storage.clearAll(owners.b),
          storage.deletePendingFiles(owners.a),
          storage.deletePendingFiles(owners.b),
        ]);
      }, { owners });
    }
  } catch {}
  if (newPage) await newPage.close();
  if (page) await page.close();
  await context.close();
  await browser.close();
}
