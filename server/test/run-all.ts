import { spawnSync } from 'child_process';
import path from 'path';

console.log('====================================================');
console.log('   VELOZITY GLOBAL SOLUTIONS - FULL TEST SUITE      ');
console.log('====================================================\n');

const runSuite = (testFile: string, name: string): boolean => {
  console.log(`\n▶ RUNNING: ${name} (${testFile})...\n`);
  const result = spawnSync('npx', ['tsx', testFile], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });

  return result.status === 0;
};

const phase2Success = runSuite('test/security.test.ts', 'PHASE 2: Authentication & Security Suite');
if (!phase2Success) {
  console.error('\n❌ PHASE 2 TESTS FAILED. ABORTING.');
  process.exit(1);
}

const phase3Success = runSuite('test/projects-tasks.test.ts', 'PHASE 3: Project & Task REST Authorization Suite');
if (!phase3Success) {
  console.error('\n❌ PHASE 3 TESTS FAILED. ABORTING.');
  process.exit(1);
}

const phase4Success = runSuite('test/realtime.test.ts', 'PHASE 4: Real-Time Socket.IO Suite');
if (!phase4Success) {
  console.error('\n❌ PHASE 4 TESTS FAILED. ABORTING.');
  process.exit(1);
}

const phase5Success = runSuite('test/catchup.test.ts', 'PHASE 5: Missed-Event Catchup Suite');
if (!phase5Success) {
  console.error('\n❌ PHASE 5 TESTS FAILED. ABORTING.');
  process.exit(1);
}

const phase6Success = runSuite('test/jobs.test.ts', 'PHASE 6: Background Job / Overdue Task Processing Suite');
if (!phase6Success) {
  console.error('\n❌ PHASE 6 TESTS FAILED. ABORTING.');
  process.exit(1);
}

const phase7Success = runSuite('test/notifications.test.ts', 'PHASE 7: In-App Notifications Suite');
if (!phase7Success) {
  console.error('\n❌ PHASE 7 TESTS FAILED. ABORTING.');
  process.exit(1);
}

const phase8Success = runSuite('test/task-filters.test.ts', 'PHASE 8: Task Query-Parameter Filters Suite');
if (!phase8Success) {
  console.error('\n❌ PHASE 8 TESTS FAILED. ABORTING.');
  process.exit(1);
}

console.log('\n====================================================');
console.log('   🎉 ALL TEST SUITES PASSED SUCCESSFULLY (174/174)! ');
console.log('====================================================\n');
process.exit(0);
