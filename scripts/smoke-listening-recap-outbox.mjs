import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

const toDataUrl = (source) => (
  `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`
);

const loadOutbox = async () => {
  const source = await fs.readFile(path.join(projectRoot, 'utils/listeningRecapEventOutbox.ts'), 'utf8');
  const javascript = ts.transpileModule(source, {
    fileName: 'listeningRecapEventOutbox.ts',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  return import(toDataUrl(javascript));
};

const makeEvent = (suffix, sessionSuffix = suffix) => ({
  eventId: `event-${suffix}`,
  playSessionId: `session-${sessionSuffix}`,
  songId: `song-${suffix}`,
  metric: 'qualified_play',
  policyVersion: 'd1-20pct-v1',
  observedAt: '2026-08-27T00:00:00.000Z',
  qualifyingSeconds: 12,
  listenedSeconds: 18,
});

const ids = (events) => events.map((event) => event.eventId);

const run = async () => {
  const storage = new MemoryStorage();
  globalThis.window = { localStorage: storage };
  const {
    clearListeningRecapEventOutbox,
    enqueueListeningRecapEvent,
    flushListeningRecapEventOutbox,
    getListeningRecapEventOutbox,
  } = await loadOutbox();

  const userId = 'outbox-smoke-user';

  clearListeningRecapEventOutbox(userId);
  assert.equal(enqueueListeningRecapEvent(userId, makeEvent('dedupe')), 'queued');
  assert.equal(enqueueListeningRecapEvent(userId, makeEvent('dedupe')), 'duplicate', '相同 event_id 必须去重');
  assert.equal(
    enqueueListeningRecapEvent(userId, makeEvent('dedupe-session-retry', 'dedupe')),
    'duplicate',
    '相同 play_session_id + metric 必须去重',
  );
  assert.equal(getListeningRecapEventOutbox(userId).length, 1);

  clearListeningRecapEventOutbox(userId);
  const terminalEvent = makeEvent('terminal');
  const followingEvent = makeEvent('following');
  assert.equal(enqueueListeningRecapEvent(userId, terminalEvent), 'queued');
  assert.equal(enqueueListeningRecapEvent(userId, followingEvent), 'queued');
  const terminalCalls = [];
  const terminalResult = await flushListeningRecapEventOutbox(userId, async (event) => {
    terminalCalls.push(event.eventId);
    if (event.eventId === terminalEvent.eventId) {
      throw Object.assign(new Error('song_not_allowed'), {
        code: 'song_not_allowed',
        retryable: false,
      });
    }
    return { acknowledged: true };
  });
  assert.deepEqual(terminalCalls, [terminalEvent.eventId, followingEvent.eventId], '终态错误后必须继续发送后续事件');
  assert.deepEqual(terminalResult, { attempted: 2, acknowledged: 1, pending: 0 });

  clearListeningRecapEventOutbox(userId);
  const retryEvent = makeEvent('retry');
  const blockedEvent = makeEvent('blocked');
  assert.equal(enqueueListeningRecapEvent(userId, retryEvent), 'queued');
  assert.equal(enqueueListeningRecapEvent(userId, blockedEvent), 'queued');
  const retryCalls = [];
  const retryContexts = [];
  const retryResult = await flushListeningRecapEventOutbox(userId, async (event, context) => {
    retryCalls.push(event.eventId);
    retryContexts.push({ eventId: event.eventId, hasPriorAttempt: context.hasPriorAttempt });
    throw Object.assign(new Error('network timeout'), { retryable: true });
  });
  assert.deepEqual(retryCalls, [retryEvent.eventId], '可重试错误必须停止后续发送');
  assert.deepEqual(retryResult, { attempted: 1, acknowledged: 0, pending: 2 });
  assert.deepEqual(ids(getListeningRecapEventOutbox(userId)), [retryEvent.eventId, blockedEvent.eventId]);
  assert.deepEqual(retryContexts, [{ eventId: retryEvent.eventId, hasPriorAttempt: false }]);

  const retryAgainContexts = [];
  const retryAgainResult = await flushListeningRecapEventOutbox(userId, async (event, context) => {
    retryAgainContexts.push({ eventId: event.eventId, hasPriorAttempt: context.hasPriorAttempt });
    return { acknowledged: true };
  });
  assert.deepEqual(retryAgainResult, { attempted: 2, acknowledged: 2, pending: 0 });
  assert.deepEqual(retryAgainContexts, [
    { eventId: retryEvent.eventId, hasPriorAttempt: true },
    { eventId: blockedEvent.eventId, hasPriorAttempt: false },
  ]);

  clearListeningRecapEventOutbox(userId);
  const unconfirmedEvent = makeEvent('unconfirmed');
  const laterEvent = makeEvent('later');
  assert.equal(enqueueListeningRecapEvent(userId, unconfirmedEvent), 'queued');
  assert.equal(enqueueListeningRecapEvent(userId, laterEvent), 'queued');
  const unconfirmedResult = await flushListeningRecapEventOutbox(userId, async () => ({ acknowledged: false }));
  assert.deepEqual(unconfirmedResult, { attempted: 1, acknowledged: 0, pending: 2 });
  assert.deepEqual(ids(getListeningRecapEventOutbox(userId)), [unconfirmedEvent.eventId, laterEvent.eventId]);

  clearListeningRecapEventOutbox(userId);
  const concurrentEvent = makeEvent('concurrent');
  assert.equal(enqueueListeningRecapEvent(userId, concurrentEvent), 'queued');
  let releaseSender;
  const senderGate = new Promise((resolve) => {
    releaseSender = resolve;
  });
  let concurrentCalls = 0;
  const sender = async () => {
    concurrentCalls += 1;
    await senderGate;
    return { acknowledged: true };
  };
  const firstFlush = flushListeningRecapEventOutbox(userId, sender);
  const secondFlush = flushListeningRecapEventOutbox(userId, async () => {
    throw new Error('并发 flush 不应启动第二个 sender');
  });
  assert.strictEqual(firstFlush, secondFlush, '同一用户的并发 flush 必须合并');
  releaseSender();
  assert.deepEqual(await firstFlush, { attempted: 1, acknowledged: 1, pending: 0 });
  assert.equal(concurrentCalls, 1);

  clearListeningRecapEventOutbox('outbox-smoke-user-a');
  clearListeningRecapEventOutbox('outbox-smoke-user-b');
  assert.equal(enqueueListeningRecapEvent('outbox-smoke-user-a', makeEvent('account-a')), 'queued');
  assert.equal(enqueueListeningRecapEvent('outbox-smoke-user-b', makeEvent('account-b')), 'queued');
  const accountCalls = [];
  await flushListeningRecapEventOutbox('outbox-smoke-user-a', async (event) => {
    accountCalls.push(event.eventId);
    return { acknowledged: true };
  });
  assert.deepEqual(accountCalls, ['event-account-a']);
  assert.deepEqual(ids(getListeningRecapEventOutbox('outbox-smoke-user-b')), ['event-account-b']);

  console.log('smoke-listening-recap-outbox.mjs: 通过（去重、终态继续、可重试停止、确认清理、并发合并、账号隔离）');
};

await run();
