import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const dbName = 'jzone-player-upload-draft';
const storeName = 'upload-draft';
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const owners = {
  a: `smoke/A?scope=one&run=${runId}#a`,
  b: `smoke/A?scope=two&run=${runId}#b`,
};

const describeError = (error) => error instanceof Error ? error.message : String(error);

try {
  let response;
  try {
    response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch (error) {
    throw new Error(`本地服务不可用：无法连接 ${baseUrl}。请先启动本地服务（例如 npm run dev）。${describeError(error)}`);
  }
  if (!response || !response.ok()) {
    throw new Error(`本地服务不可用：${baseUrl} 返回 HTTP ${response?.status() ?? '无响应'}。请先启动正确的本地服务。`);
  }

  const result = await page.evaluate(async ({ dbName, storeName, owners }) => {
    const { uploadDraftStorage: storage } = await import('/uploadDraftStorage.ts');

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
    const expectNull = (value, label) => {
      if (value !== null) throw new Error(`${label} 应为 null`);
    };

    const audioA = new File(['audio-A'], 'audio-a.mp3', { type: 'audio/mpeg' });
    const audioB = new File(['audio-B'], 'audio-b.mp3', { type: 'audio/mpeg' });
    const coverA = new File(['cover-A'], 'cover-a.jpg', { type: 'image/jpeg' });
    const coverB = new File(['cover-B'], 'cover-b.jpg', { type: 'image/jpeg' });
    const metaA = { title: '标题 A', artist: '艺人 A', album: '专辑 A', genre: '测试 A' };
    const metaB = { title: '标题 B', artist: '艺人 B', album: '专辑 B', genre: '测试 B' };
    const expected = {
      audioA: await fileInfo(audioA),
      audioB: await fileInfo(audioB),
      coverA: await fileInfo(coverA),
      coverB: await fileInfo(coverB),
    };

    await storage.clearAll(owners.a);
    await storage.clearAll(owners.b);

    await putLegacyAudio();
    expectNull(await storage.getAudio(owners.a), '旧固定 audio 键的 A 读取');
    expectNull(await storage.getAudio(owners.b), '旧固定 audio 键的 B 读取');

    await storage.setAudio(owners.a, audioA);
    await storage.setCover(owners.a, coverA);
    await storage.setMeta(owners.a, metaA);
    await storage.setAudio(owners.b, audioB);
    await storage.setCover(owners.b, coverB);
    await storage.setMeta(owners.b, metaB);

    expectFile(await fileInfo(await storage.getAudio(owners.a)), expected.audioA, 'A 音频');
    expectFile(await fileInfo(await storage.getAudio(owners.b)), expected.audioB, 'B 音频');
    expectFile(await fileInfo(await storage.getCover(owners.a)), expected.coverA, 'A 封面');
    expectFile(await fileInfo(await storage.getCover(owners.b)), expected.coverB, 'B 封面');
    if (JSON.stringify(await storage.getMeta(owners.a)) !== JSON.stringify(metaA)) {
      throw new Error('A meta 不匹配');
    }
    if (JSON.stringify(await storage.getMeta(owners.b)) !== JSON.stringify(metaB)) {
      throw new Error('B meta 不匹配');
    }

    await storage.clearAll(owners.b);
    expectNull(await storage.getAudio(owners.b), 'clearAll(B) 后 B 音频');
    expectNull(await storage.getCover(owners.b), 'clearAll(B) 后 B 封面');
    expectNull(await storage.getMeta(owners.b), 'clearAll(B) 后 B meta');
    expectFile(await fileInfo(await storage.getAudio(owners.a)), expected.audioA, 'clearAll(B) 后 A 音频');
    expectFile(await fileInfo(await storage.getCover(owners.a)), expected.coverA, 'clearAll(B) 后 A 封面');
    if (JSON.stringify(await storage.getMeta(owners.a)) !== JSON.stringify(metaA)) {
      throw new Error('clearAll(B) 后 A meta 不匹配');
    }

    await deleteLegacyAudio();
    await storage.clearAll(owners.a);
    await storage.setAudio(null, audioA);
    await storage.setCover('   ', coverA);
    await storage.setMeta(undefined, metaA);
    expectNull(await storage.getAudio(null), '缺失 owner 的音频读取');
    expectNull(await storage.getCover('  '), '空白 owner 的封面读取');
    expectNull(await storage.getMeta(undefined), '缺失 owner 的 meta 读取');
    await storage.deleteAudio(null);
    await storage.deleteCover('');
    await storage.deleteMeta(undefined);
    await storage.clearAll(' ');

    return { ownersChecked: 2, filesChecked: 4, metaChecked: 2, legacyKeyIgnored: true };
  }, { dbName, storeName, owners });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error(`[smoke-upload-draft-storage] 失败：${describeError(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
