import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const bucketListMarkers = [];

  // 仅拦截本 smoke 使用的 COS 读请求，其他页面资源照常加载。
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (!requestUrl.hostname.toLowerCase().endsWith('myqcloud.com')) {
      await route.continue();
      return;
    }

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,HEAD,OPTIONS',
          'access-control-allow-origin': '*',
        },
      });
      return;
    }

    const isBucketListRequest = requestUrl.searchParams.has('max-keys')
      || requestUrl.searchParams.has('prefix');
    if (!isBucketListRequest) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }

    const marker = requestUrl.searchParams.get('marker') || '';
    bucketListMarkers.push(marker);
    const body = marker
      ? [
          '<ListBucketResult>',
          '<Name>smoke-bucket</Name>',
          '<Prefix></Prefix>',
          '<Marker>page-1</Marker>',
          '<MaxKeys>1000</MaxKeys>',
          '<IsTruncated>false</IsTruncated>',
          '<Contents><Key>smoke/page-2.mp3</Key><Size>30</Size></Contents>',
          '</ListBucketResult>',
        ].join('')
      : [
          '<ListBucketResult>',
          '<Name>smoke-bucket</Name>',
          '<Prefix></Prefix>',
          '<Marker></Marker>',
          '<MaxKeys>1000</MaxKeys>',
          '<IsTruncated>true</IsTruncated>',
          '<NextMarker>page-2</NextMarker>',
          '<Contents><Key>smoke/page-1-a.mp3</Key><Size>10</Size></Contents>',
          '<Contents><Key>smoke/page-1-b.mp3</Key><Size>20</Size></Contents>',
          '</ListBucketResult>',
        ].join('');

    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'application/xml',
      },
      body,
    });
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const mediaFailure = await import('/utils/mediaFailure.ts');
    const cosModule = await import('/cosClient.ts');
    const storageApi = await import('/services/supabase/storageApi.ts');
    const { cosClient } = cosModule;

    const bucketUsage = cosClient.isEnabled ? await cosClient.getBucketUsage() : null;

    cosClient.isEnabled = true;

    const signedCalls = [];
    const headCalls = [];
    cosClient.getSignedUrl = async (path, expiresInSeconds, responseCacheControl) => {
      signedCalls.push({ path, expiresInSeconds, responseCacheControl });
      return `https://smoke.invalid/audio-${signedCalls.length}.mp3`;
    };
    cosClient.headObject = async (path) => {
      headCalls.push(path);
      return { ok: true, statusCode: 200 };
    };
    storageApi.clearSignedUrlCache();

    const firstUrl = await storageApi.createSignedAudioUrl('smoke/audio.mp3');
    const cachedUrl = await storageApi.createSignedAudioUrl('smoke/audio.mp3');
    const otherUrl = await storageApi.createSignedAudioUrl('smoke/other.mp3');
    const normalPlaybackHeadCount = headCalls.length;

    storageApi.invalidateSignedAudioUrlCache('smoke/audio.mp3');
    const otherUrlAfterInvalidation = await storageApi.createSignedAudioUrl('smoke/other.mp3');
    const refreshedUrl = await storageApi.createSignedAudioUrl('smoke/audio.mp3');

    cosClient.headObject = async (path) => {
      headCalls.push(path);
      if (path.includes('missing')) return { ok: false, statusCode: 404, code: 'NoSuchKey' };
      if (path.includes('forbidden')) return { ok: false, statusCode: 403, code: 'AccessDenied' };
      if (path.includes('network')) return { ok: false, code: 'NetworkError' };
      if (path.includes('available')) return { ok: true, statusCode: 200 };
      return { ok: false, statusCode: 418, code: 'Unexpected' };
    };

    const diagnostics = await Promise.all([
      storageApi.diagnoseAudioPath('smoke/missing.mp3'),
      storageApi.diagnoseAudioPath('smoke/forbidden.mp3'),
      storageApi.diagnoseAudioPath('smoke/network.mp3'),
      storageApi.diagnoseAudioPath('smoke/available.mp3'),
      storageApi.diagnoseAudioPath('smoke/unknown.mp3'),
    ]);

    const categories = {
      missing: mediaFailure.classifyMediaFailure({ statusCode: 404, code: 'NoSuchKey' }),
      forbidden: mediaFailure.classifyMediaFailure({ statusCode: 403, code: 'AccessDenied' }),
      network: mediaFailure.classifyMediaFailure({ name: 'NetworkError' }),
      available: mediaFailure.classifyMediaFailure({ ok: true, statusCode: 200 }),
      unknown: mediaFailure.classifyMediaFailure({ statusCode: 418, code: 'Unexpected' }),
    };
    const messages = Object.fromEntries(
      mediaFailure.MEDIA_FAILURE_CATEGORIES.map((category) => [category, mediaFailure.getMediaFailureMessage(category)]),
    );

    return {
      bucketUsage,
      normalPlaybackHeadCount,
      signedCallCount: signedCalls.length,
      firstWasCached: firstUrl === cachedUrl,
      otherWasUnaffected: otherUrl === otherUrlAfterInvalidation,
      pathWasRefreshed: refreshedUrl !== firstUrl,
      audioCacheMaxAgeSeconds: cosModule.COS_AUDIO_BROWSER_CACHE_MAX_AGE_SECONDS,
      audioCacheControl: cosModule.COS_AUDIO_BROWSER_CACHE_CONTROL,
      audioSignedUrlTtlSeconds: storageApi.AUDIO_SIGNED_URL_TTL_SECONDS,
      signedCallTtlSeconds: signedCalls[0]?.expiresInSeconds,
      signedCallCacheControl: signedCalls[0]?.responseCacheControl,
      diagnostics: diagnostics.map((item) => item.category),
      categories,
      messages,
    };
  });

  assert.equal(result.bucketUsage, 60, 'COS 分页对象大小必须完整累加');
  assert.deepEqual(bucketListMarkers, ['', 'page-2'], 'COS 分页必须使用 NextMarker 请求下一页');
  assert.equal(result.normalPlaybackHeadCount, 0, '正常播放签名不能额外触发 HEAD');
  assert.equal(result.firstWasCached, true, '同一音频 path 应复用签名缓存');
  assert.equal(result.otherWasUnaffected, true, '精确失效不能清除其他音频 path');
  assert.equal(result.pathWasRefreshed, true, '失效 path 必须获得新签名');
  assert.equal(result.audioCacheMaxAgeSeconds, 30 * 24 * 60 * 60, '音频浏览器缓存应为约 30 天');
  assert.equal(result.audioSignedUrlTtlSeconds, 30 * 24 * 60 * 60, '音频签名有效期应为约 30 天');
  assert.equal(result.signedCallTtlSeconds, 30 * 24 * 60 * 60, '默认签名请求必须使用 30 天 TTL');
  assert.equal(result.audioCacheControl, result.signedCallCacheControl, '签名响应缓存控制应与音频缓存常量一致');
  assert.deepEqual(result.diagnostics, ['missing', 'forbidden', 'network', 'available', 'unknown']);
  assert.deepEqual(result.categories, {
    missing: 'missing',
    forbidden: 'forbidden',
    network: 'network',
    available: 'available',
    unknown: 'unknown',
  });
  for (const message of Object.values(result.messages)) {
    assert.doesNotMatch(message, /https?:\/\/|secret|accesskey|[?&](?:sign|key|token)=/i, '用户提示不能泄露 URL 或密钥');
  }

  const [cosSource, storeSource] = await Promise.all([
    fs.readFile(new URL('../cosClient.ts', import.meta.url), 'utf8'),
    fs.readFile(new URL('../store.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(cosSource, /IsTruncated/);
  assert.match(cosSource, /NextMarker/);
  assert.match(cosSource, /Marker: marker/);
  assert.match(storeSource, /diagnoseAudioPath/);
  assert.match(storeSource, /invalidateSignedAudioUrlCache/);
  assert.match(storeSource, /song\.audioPath, song\.sourceAudioPath/);
  assert.ok(storeSource.indexOf('await diagnoseAudioPath') > storeSource.indexOf('for (const source of sources)'), 'HEAD 诊断必须位于所有音源尝试之后');

  console.log(JSON.stringify({
    bucketUsage: result.bucketUsage,
    bucketListMarkers,
    normalPlaybackHeadCount: result.normalPlaybackHeadCount,
    signedCallCount: result.signedCallCount,
    firstWasCached: result.firstWasCached,
    otherWasUnaffected: result.otherWasUnaffected,
    pathWasRefreshed: result.pathWasRefreshed,
    audioCacheMaxAgeSeconds: result.audioCacheMaxAgeSeconds,
    audioSignedUrlTtlSeconds: result.audioSignedUrlTtlSeconds,
    diagnostics: result.diagnostics,
    categories: result.categories,
  }, null, 2));
} finally {
  await browser.close();
}
