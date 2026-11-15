import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveWorkspaceDir } from './workspace.mjs';

const tests = [
  {
    name: 'resolve_from_workspacePaths_array',
    run: () => {
      const payload = { workspacePaths: ['/test/project/dir'] };
      const res = resolveWorkspaceDir(payload, '/fallback');
      assert.equal(res, '/test/project/dir');
    }
  },
  {
    name: 'resolve_from_workspacePaths_file_uri',
    run: () => {
      const targetDir = path.resolve('/some/test/path');
      const fileUri = pathToFileURL(targetDir).href;
      const payload = { workspacePaths: [fileUri] };
      const res = resolveWorkspaceDir(payload, '/fallback');
      assert.equal(path.resolve(res), targetDir);
    }
  },
  {
    name: 'workspacePaths_takes_precedence_over_plugin_root_cwd',
    run: () => {
      const payload = {
        workspacePaths: ['/user/actual/workspace'],
        cwd: '/plugin/root/directory'
      };
      const res = resolveWorkspaceDir(payload, '/fallback');
      assert.equal(res, '/user/actual/workspace');
    }
  },
  {
    name: 'fallback_to_payload_cwd_when_workspacePaths_absent',
    run: () => {
      const payload = { cwd: '/user/workspace/from/cwd' };
      const res = resolveWorkspaceDir(payload, '/fallback');
      assert.equal(res, '/user/workspace/from/cwd');
    }
  },
  {
    name: 'fallback_to_process_cwd_when_payload_empty_or_null',
    run: () => {
      const fallback = '/custom/fallback/dir';
      assert.equal(resolveWorkspaceDir(null, fallback), fallback);
      assert.equal(resolveWorkspaceDir({}, fallback), fallback);
      assert.equal(resolveWorkspaceDir({ workspacePaths: [] }, fallback), fallback);
      assert.equal(resolveWorkspaceDir({ workspacePaths: ['   '] }, fallback), fallback);
    }
  }
];

let passed = 0;
for (const t of tests) {
  try {
    t.run();
    passed++;
    console.log(`PASS ${t.name}`);
  } catch (err) {
    console.error(`FAIL ${t.name}:`, err.message);
    process.exitCode = 1;
  }
}
console.log(`WORKSPACE RESOLVER SUMMARY: ${passed}/${tests.length} passed`);
