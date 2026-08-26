import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

const readProjectFile = (relativePath) => fs.readFile(
  path.join(projectRoot, relativePath),
  'utf8',
);

const transpile = (source, fileName) => ts.transpileModule(source, {
  fileName,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    verbatimModuleSyntax: false,
  },
}).outputText;

const toDataUrl = (source) => (
  `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`
);

const loadListeningRecapModules = async () => {
  const typesSource = await readProjectFile('services/supabase/listeningRecapTypes.ts');
  const typesUrl = toDataUrl(transpile(typesSource, 'listeningRecapTypes.ts'));
  const types = await import(typesUrl);

  const targetSource = await readProjectFile('services/supabase/listeningRecap.ts');
  const clientUrl = toDataUrl('export const ensureSupabase = () => { throw new Error("smoke stub"); };');
  const storageUrl = toDataUrl('export const createSignedCoverUrl = async (path) => path;');
  const targetJavaScript = transpile(targetSource, 'listeningRecap.ts')
    .replaceAll("from './client'", `from '${clientUrl}'`)
    .replaceAll("from './storageApi'", `from '${storageUrl}'`)
    .replaceAll("from './listeningRecapTypes'", `from '${typesUrl}'`);
  const api = await import(toDataUrl(targetJavaScript));

  return { ...types, ...api };
};

const expectMappedCode = (mapListeningRecapError, error, code, retryable = false) => {
  const mapped = mapListeningRecapError(error);
  assert.equal(mapped.code, code, `错误应映射为 ${code}`);
  assert.equal(mapped.retryable, retryable, `${code} 的 retryable 不符合契约`);
};

const runErrorMappingSmoke = (mapListeningRecapError) => {
  const p0001Codes = [
    'not_authenticated',
    'song_not_allowed',
    'invalid_input',
    'invalid_metric',
    'invalid_policy',
    'event_conflict',
    'rpc_unavailable',
  ];

  for (const bracketCode of p0001Codes) {
    expectMappedCode(
      mapListeningRecapError,
      { code: 'P0001', status: 400, message: `业务拒绝 [${bracketCode}]` },
      bracketCode,
    );
  }

  expectMappedCode(
    mapListeningRecapError,
    { code: 'P0001', status: 400, message: '业务拒绝 [song_not_allowed_extra]' },
    'invalid_input',
  );
  expectMappedCode(
    mapListeningRecapError,
    { code: 'P0001', status: 400, message: '业务拒绝 [unknown_code]' },
    'invalid_input',
  );
  expectMappedCode(
    mapListeningRecapError,
    { code: 'P0001', status: 400, message: '业务拒绝 [song_not_allowed]' },
    'song_not_allowed',
  );
  expectMappedCode(
    mapListeningRecapError,
    { code: 'P0001', status: 400, message: '业务拒绝 [rpc_unavailable]' },
    'rpc_unavailable',
  );
  expectMappedCode(
    mapListeningRecapError,
    { status: 400, message: '业务拒绝 [song_not_allowed]' },
    'invalid_input',
  );
  expectMappedCode(
    mapListeningRecapError,
    { code: 'PGRST202', status: 400, message: 'could not find the function' },
    'rpc_unavailable',
  );
  expectMappedCode(mapListeningRecapError, { status: 500, message: 'server error' }, 'server_error', true);
  expectMappedCode(mapListeningRecapError, new TypeError('Failed to fetch'), 'network_error', true);
};

const clone = (value) => structuredClone(value);

const run = async () => {
  const {
    mapListeningRecapError,
    parseListeningRecapResponse,
    parseListeningRecapRecordEventResult,
  } = await loadListeningRecapModules();

  runErrorMappingSmoke(mapListeningRecapError);

  const fixtureDocument = JSON.parse(await readProjectFile(
    'supabase/fixtures/listening-recap-response-fixtures.json',
  ));
  const fixtureNames = Object.keys(fixtureDocument.fixtures);
  assert.deepEqual(
    fixtureNames.sort(),
    ['error', 'event_complete', 'event_partial', 'legacy_only', 'no_event'],
    '响应 fixture 状态集合不完整',
  );

  const parsedFixtures = Object.fromEntries(
    Object.entries(fixtureDocument.fixtures).map(([name, fixture]) => [
      name,
      parseListeningRecapResponse(fixture),
    ]),
  );
  assert.equal(parsedFixtures.event_complete.summary.validPlayCount, 3);
  assert.equal(parsedFixtures.event_partial.coverage.status, 'event_partial');
  assert.equal(parsedFixtures.legacy_only.summary, null);
  assert.equal(parsedFixtures.no_event.summary.validPlayCount, 0);
  assert.equal(parsedFixtures.error.error.code, 'network_error');
  assert.equal(parsedFixtures.error.error.retryable, true);

  const invalidFixtures = [
    {
      name: 'schemaVersion',
      fixture: { ...clone(fixtureDocument.fixtures.event_complete), schemaVersion: 'listening-recap.v2' },
    },
    {
      name: 'period',
      fixture: {
        ...clone(fixtureDocument.fixtures.event_complete),
        period: { ...clone(fixtureDocument.fixtures.event_complete.period), id: '2026-13' },
      },
    },
    {
      name: 'queue order',
      fixture: {
        ...clone(fixtureDocument.fixtures.event_complete),
        queue: { ...clone(fixtureDocument.fixtures.event_complete.queue), order: 'unstable' },
      },
    },
    {
      name: 'error payload',
      fixture: {
        ...clone(fixtureDocument.fixtures.error),
        error: null,
      },
    },
  ];
  for (const { name, fixture } of invalidFixtures) {
    assert.throws(
      () => parseListeningRecapResponse(fixture),
      undefined,
      `非法 ${name} fixture 必须被拒绝`,
    );
  }

  const validEvent = parseListeningRecapRecordEventResult({
    status: 'accepted',
    isNew: true,
    eventId: '00000000-0000-4000-8000-000000000001',
    playSessionId: '00000000-0000-4000-8000-000000000002',
    songId: '00000000-0000-4000-8000-000000000003',
    metric: 'qualified_play',
    policyVersion: 'd1-20pct-v1',
    acceptedAt: '2026-08-26T07:30:00.000Z',
    userSongPlayCount: 22,
  });
  assert.equal(validEvent.status, 'accepted');
  assert.throws(
    () => parseListeningRecapRecordEventResult({ ...validEvent, metric: 'other_metric' }),
    undefined,
    '非法事件 fixture 必须被拒绝',
  );

  console.log(`smoke-listening-recap-api.mjs: 通过（${fixtureNames.length} 个合法响应、${invalidFixtures.length + 1} 个非法 fixture）`);
};

await run();
