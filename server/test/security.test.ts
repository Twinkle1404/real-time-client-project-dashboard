import app from '../src/index';
import http from 'http';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma';

interface ApiResponse {
  [key: string]: any;
}

const toJson = async (res: Response): Promise<ApiResponse> => (await res.json()) as ApiResponse;

interface TestResult {
  id: number;
  description: string;
  expectedStatus: number;
  actualStatus: number;
  expectedCondition: string;
  actualDetail: string;
  passed: boolean;
}

const results: TestResult[] = [];
let testCounter = 1;

function record(
  description: string,
  expectedStatus: number,
  actualStatus: number,
  expectedCondition: string,
  actualDetail: string,
  extraCheck: boolean = true
) {
  const passed = expectedStatus === actualStatus && extraCheck;
  results.push({
    id: testCounter++,
    description,
    expectedStatus,
    actualStatus,
    expectedCondition,
    actualDetail,
    passed,
  });
}

function extractCookieValue(setCookieHeader: string, name: string): string {
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : '';
}

async function runTests() {
  console.log('🚀 Starting Phase 2 Security & RBAC Test Suite...\n');

  const TEST_PORT = 4099;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, () => {
      console.log(`Test server running on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  const BASE_URL = `http://localhost:${TEST_PORT}`;
  let allPassed = true;

  try {
    // ── 1. LOGIN TESTS ──
    console.log('--- 1. Authentication & Login Tests ---');

    // Test 1: Valid Admin Login
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@velozity.com', password: 'DevPassword123!' }),
    });
    const adminLoginData = await toJson(adminLoginRes);
    const adminCookie = adminLoginRes.headers.get('set-cookie') || '';
    const hasAdminHttpOnly = adminCookie.toLowerCase().includes('httponly');
    const hasNoAdminPassHash = !adminLoginData.data?.user?.passwordHash;
    const hasNoAdminRefreshInJson = !adminLoginData.data?.refreshToken;
    const adminToken = adminLoginData.data?.accessToken;

    record(
      'Admin login with valid credentials',
      200,
      adminLoginRes.status,
      '200 OK + accessToken + HttpOnly cookie + no passwordHash in JSON',
      `Status: ${adminLoginRes.status}, Token: ${Boolean(adminToken)}, HttpOnly: ${hasAdminHttpOnly}, SafeUser: ${hasNoAdminPassHash}`,
      hasAdminHttpOnly && hasNoAdminPassHash && hasNoAdminRefreshInJson && Boolean(adminToken)
    );

    // Test 2: Valid PM Login
    const pmLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pm1@velozity.com', password: 'DevPassword123!' }),
    });
    const pmLoginData = await toJson(pmLoginRes);
    const pmToken = pmLoginData.data?.accessToken;

    record(
      'PM login with valid credentials',
      200,
      pmLoginRes.status,
      '200 OK + accessToken + role=PM',
      `Status: ${pmLoginRes.status}, Role: ${pmLoginData.data?.user?.role}`,
      pmLoginData.data?.user?.role === 'PM' && Boolean(pmToken)
    );

    // Test 3: Valid Developer Login
    const devLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dev1@velozity.com', password: 'DevPassword123!' }),
    });
    const devLoginData = await toJson(devLoginRes);
    const devToken = devLoginData.data?.accessToken;

    record(
      'Developer login with valid credentials',
      200,
      devLoginRes.status,
      '200 OK + accessToken + role=DEVELOPER',
      `Status: ${devLoginRes.status}, Role: ${devLoginData.data?.user?.role}`,
      devLoginData.data?.user?.role === 'DEVELOPER' && Boolean(devToken)
    );

    // Test 4: Invalid Password
    const badPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@velozity.com', password: 'WrongPassword123!' }),
    });
    const badPassData = await toJson(badPassRes);
    record(
      'Login fails with invalid password',
      401,
      badPassRes.status,
      '401 with code INVALID_CREDENTIALS',
      `Status: ${badPassRes.status}, Code: ${badPassData.error?.code}`,
      badPassData.error?.code === 'INVALID_CREDENTIALS'
    );

    // Test 5: Unknown Email
    const badEmailRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@velozity.com', password: 'DevPassword123!' }),
    });
    const badEmailData = await toJson(badEmailRes);
    record(
      'Login fails with unknown email',
      401,
      badEmailRes.status,
      '401 with code INVALID_CREDENTIALS',
      `Status: ${badEmailRes.status}, Code: ${badEmailData.error?.code}`,
      badEmailData.error?.code === 'INVALID_CREDENTIALS'
    );

    // Test 6: Missing email or password (validation)
    const missingFieldsRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid-email' }),
    });
    const missingFieldsData = await toJson(missingFieldsRes);
    record(
      'Login fails with malformed request body (server validation)',
      400,
      missingFieldsRes.status,
      '400 with code VALIDATION_ERROR',
      `Status: ${missingFieldsRes.status}, Code: ${missingFieldsData.error?.code}`,
      missingFieldsData.error?.code === 'VALIDATION_ERROR'
    );

    // ── 2. GET /api/auth/me TESTS ──
    console.log('\n--- 2. Profile (/api/auth/me) Tests ---');

    // Test 7: /me with valid access token
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meData = await toJson(meRes);
    record(
      '/api/auth/me with valid Bearer token',
      200,
      meRes.status,
      '200 OK with safe user profile',
      `Status: ${meRes.status}, User: ${meData.data?.user?.email}, HasPassHash: ${Boolean(meData.data?.user?.passwordHash)}`,
      meData.data?.user?.email === 'admin@velozity.com' && !meData.data?.user?.passwordHash
    );

    // Test 8: /me missing token
    const meNoTokenRes = await fetch(`${BASE_URL}/api/auth/me`);
    const meNoTokenData = await toJson(meNoTokenRes);
    record(
      '/api/auth/me without Authorization header',
      401,
      meNoTokenRes.status,
      '401 with code UNAUTHORIZED',
      `Status: ${meNoTokenRes.status}, Code: ${meNoTokenData.error?.code}`,
      meNoTokenData.error?.code === 'UNAUTHORIZED'
    );

    // Test 9: /me with invalid Bearer format
    const meBadFormatRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    const meBadFormatData = await toJson(meBadFormatRes);
    record(
      '/api/auth/me with invalid token format',
      401,
      meBadFormatRes.status,
      '401 with code INVALID_TOKEN',
      `Status: ${meBadFormatRes.status}, Code: ${meBadFormatData.error?.code}`,
      meBadFormatData.error?.code === 'INVALID_TOKEN'
    );

    // ── 3. TOKEN REFRESH TESTS ──
    console.log('\n--- 3. Refresh Token & Logout Tests ---');

    // Test 10: Refresh with valid HttpOnly cookie
    const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    const refreshData = await toJson(refreshRes);
    const newAdminToken = refreshData.data?.accessToken;
    const rotatedCookie = refreshRes.headers.get('set-cookie') || '';
    record(
      '/api/auth/refresh with valid HttpOnly cookie',
      200,
      refreshRes.status,
      '200 OK + new accessToken + rotated HttpOnly cookie',
      `Status: ${refreshRes.status}, New Token: ${Boolean(newAdminToken)}, Rotated Cookie: ${rotatedCookie.toLowerCase().includes('httponly')}`,
      Boolean(newAdminToken) && rotatedCookie.toLowerCase().includes('httponly')
    );

    // Test 11: Refresh without cookie
    const refreshNoCookieRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
    });
    const refreshNoCookieData = await toJson(refreshNoCookieRes);
    record(
      '/api/auth/refresh without cookie',
      401,
      refreshNoCookieRes.status,
      '401 with code UNAUTHORIZED',
      `Status: ${refreshNoCookieRes.status}, Code: ${refreshNoCookieData.error?.code}`,
      refreshNoCookieData.error?.code === 'UNAUTHORIZED'
    );

    // Test 12: Logout clears cookie
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: rotatedCookie },
    });
    const logoutCookie = logoutRes.headers.get('set-cookie') || '';
    const cookieCleared =
      logoutCookie.toLowerCase().includes('expires=') ||
      logoutCookie.toLowerCase().includes('max-age=0') ||
      logoutCookie.includes('1970');
    record(
      '/api/auth/logout clears refresh cookie',
      200,
      logoutRes.status,
      '200 OK with cleared/expired cookie header',
      `Status: ${logoutRes.status}, Cookie Cleared: ${cookieCleared}`,
      cookieCleared
    );

    // ── 4. RBAC AUTHORIZATION MATRIX & DIRECT API ACCESS TESTS ──
    console.log('\n--- 4. Role-Based Access Control (RBAC) Matrix Tests ---');

    // Test 13: Admin token -> Admin endpoint
    const tAdminAdmin = await fetch(`${BASE_URL}/api/test/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    record(
      'ADMIN token -> GET /api/test/admin',
      200,
      tAdminAdmin.status,
      '200 OK (Allowed)',
      `Status: ${tAdminAdmin.status}`,
      tAdminAdmin.status === 200
    );

    // Test 14: PM token -> PM endpoint
    const tPmPm = await fetch(`${BASE_URL}/api/test/pm`, {
      headers: { Authorization: `Bearer ${pmToken}` },
    });
    record(
      'PM token -> GET /api/test/pm',
      200,
      tPmPm.status,
      '200 OK (Allowed)',
      `Status: ${tPmPm.status}`,
      tPmPm.status === 200
    );

    // Test 15: Developer token -> Developer endpoint
    const tDevDev = await fetch(`${BASE_URL}/api/test/developer`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    record(
      'DEVELOPER token -> GET /api/test/developer',
      200,
      tDevDev.status,
      '200 OK (Allowed)',
      `Status: ${tDevDev.status}`,
      tDevDev.status === 200
    );

    // Test 16 (CRITICAL): Developer directly calling PM endpoint
    const tDevPm = await fetch(`${BASE_URL}/api/test/pm`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const tDevPmData = await toJson(tDevPm);
    record(
      '[CRITICAL] DEVELOPER directly calling PM endpoint -> /api/test/pm',
      403,
      tDevPm.status,
      '403 FORBIDDEN (Blocked at API level)',
      `Status: ${tDevPm.status}, Code: ${tDevPmData.error?.code}, Message: "${tDevPmData.error?.message}"`,
      tDevPm.status === 403 && tDevPmData.error?.code === 'FORBIDDEN'
    );

    // Test 17: Developer directly calling Admin endpoint
    const tDevAdmin = await fetch(`${BASE_URL}/api/test/admin`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const tDevAdminData = await toJson(tDevAdmin);
    record(
      'DEVELOPER token -> GET /api/test/admin',
      403,
      tDevAdmin.status,
      '403 FORBIDDEN (Blocked at API level)',
      `Status: ${tDevAdmin.status}, Code: ${tDevAdminData.error?.code}`,
      tDevAdmin.status === 403 && tDevAdminData.error?.code === 'FORBIDDEN'
    );

    // Test 18: PM directly calling Admin-only endpoint
    const tPmAdmin = await fetch(`${BASE_URL}/api/test/admin`, {
      headers: { Authorization: `Bearer ${pmToken}` },
    });
    const tPmAdminData = await toJson(tPmAdmin);
    record(
      'PM token -> GET /api/test/admin (admin-only)',
      403,
      tPmAdmin.status,
      '403 FORBIDDEN (Blocked at API level)',
      `Status: ${tPmAdmin.status}, Code: ${tPmAdminData.error?.code}`,
      tPmAdmin.status === 403 && tPmAdminData.error?.code === 'FORBIDDEN'
    );

    // Test 19: Admin -> Admin/PM endpoint
    const tAdminPmCombo1 = await fetch(`${BASE_URL}/api/test/admin-pm`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    record(
      'ADMIN token -> GET /api/test/admin-pm',
      200,
      tAdminPmCombo1.status,
      '200 OK (Allowed)',
      `Status: ${tAdminPmCombo1.status}`,
      tAdminPmCombo1.status === 200
    );

    // Test 20: PM -> Admin/PM endpoint
    const tAdminPmCombo2 = await fetch(`${BASE_URL}/api/test/admin-pm`, {
      headers: { Authorization: `Bearer ${pmToken}` },
    });
    record(
      'PM token -> GET /api/test/admin-pm',
      200,
      tAdminPmCombo2.status,
      '200 OK (Allowed)',
      `Status: ${tAdminPmCombo2.status}`,
      tAdminPmCombo2.status === 200
    );

    // Test 21: Developer -> Admin/PM endpoint
    const tAdminPmCombo3 = await fetch(`${BASE_URL}/api/test/admin-pm`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const tAdminPmCombo3Data = await toJson(tAdminPmCombo3);
    record(
      'DEVELOPER token -> GET /api/test/admin-pm',
      403,
      tAdminPmCombo3.status,
      '403 FORBIDDEN (Blocked at API level)',
      `Status: ${tAdminPmCombo3.status}, Code: ${tAdminPmCombo3Data.error?.code}`,
      tAdminPmCombo3.status === 403 && tAdminPmCombo3Data.error?.code === 'FORBIDDEN'
    );

    // ── 5. SECURITY & TAMPERING TESTS ──
    console.log('\n--- 5. Security & Tampered Token Tests ---');

    // Test 22: Unauthenticated request to protected route
    const tUnauth = await fetch(`${BASE_URL}/api/test/developer`);
    const tUnauthData = await toJson(tUnauth);
    record(
      'Unauthenticated request to protected endpoint',
      401,
      tUnauth.status,
      '401 UNAUTHORIZED',
      `Status: ${tUnauth.status}, Code: ${tUnauthData.error?.code}`,
      tUnauth.status === 401 && tUnauthData.error?.code === 'UNAUTHORIZED'
    );

    // Test 23 (CRITICAL): Tampered token (elevated role to ADMIN with attacker secret)
    const forgedToken = jwt.sign(
      { userId: 'dev-123', role: 'ADMIN' },
      'fake_attacker_secret_not_the_real_one'
    );
    const tForged = await fetch(`${BASE_URL}/api/test/admin`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    const tForgedData = await toJson(tForged);
    record(
      '[CRITICAL] Tampered JWT (role forged to ADMIN with attacker signature)',
      401,
      tForged.status,
      '401 INVALID_TOKEN (Signature verification failure)',
      `Status: ${tForged.status}, Code: ${tForgedData.error?.code}, Message: "${tForgedData.error?.message}"`,
      tForged.status === 401 && tForgedData.error?.code === 'INVALID_TOKEN'
    );

    // Test 24: Corrupted token string
    const tCorrupt = await fetch(`${BASE_URL}/api/test/admin`, {
      headers: { Authorization: 'Bearer not.a.valid.jwt.payload' },
    });
    const tCorruptData = await toJson(tCorrupt);
    record(
      'Corrupted JWT token string',
      401,
      tCorrupt.status,
      '401 INVALID_TOKEN',
      `Status: ${tCorrupt.status}, Code: ${tCorruptData.error?.code}`,
      tCorrupt.status === 401 && tCorruptData.error?.code === 'INVALID_TOKEN'
    );

    // ── 6. CORRECTION TESTS: PAYLOAD MINIMIZATION & REFRESH REUSE REJECTION ──
    console.log('\n--- 6. Phase 2 Corrections: Payload Minimization & Refresh Invalidation ---');

    // Test 25: Verify Access JWT contains ONLY userId and role (NO email)
    const decodedAccessToken = jwt.decode(adminToken) as Record<string, any>;
    const hasUserIdInAccess = Boolean(decodedAccessToken?.userId);
    const hasRoleInAccess = Boolean(decodedAccessToken?.role);
    const hasNoEmailInAccess = decodedAccessToken?.email === undefined;
    record(
      '[CORRECTION 1] Access JWT payload contains ONLY userId and role (no email)',
      200,
      200,
      'userId: present, role: present, email: absent',
      `userId=${decodedAccessToken?.userId}, role=${decodedAccessToken?.role}, email=${decodedAccessToken?.email}`,
      hasUserIdInAccess && hasRoleInAccess && hasNoEmailInAccess
    );

    // Test 26: Verify Refresh JWT contains ONLY userId and sessionId (NO email or role)
    const rawRefreshJwt = extractCookieValue(adminCookie, 'refreshToken');
    const decodedRefreshJwt = jwt.decode(rawRefreshJwt) as Record<string, any>;
    const hasUserIdInRefresh = Boolean(decodedRefreshJwt?.userId);
    const hasSessionIdInRefresh = Boolean(decodedRefreshJwt?.sessionId);
    const hasNoEmailInRefresh = decodedRefreshJwt?.email === undefined;
    const hasNoRoleInRefresh = decodedRefreshJwt?.role === undefined;
    record(
      '[CORRECTION 5] Refresh JWT payload contains ONLY userId and sessionId (no email, no role)',
      200,
      200,
      'userId: present, sessionId: present, email: absent, role: absent',
      `userId=${decodedRefreshJwt?.userId}, sessionId=${decodedRefreshJwt?.sessionId}, email=${decodedRefreshJwt?.email}, role=${decodedRefreshJwt?.role}`,
      hasUserIdInRefresh && hasSessionIdInRefresh && hasNoEmailInRefresh && hasNoRoleInRefresh
    );

    // Test 27 (CRITICAL): Prevent Refresh-Token Reuse (Replay Attack)
    // adminCookie was already rotated in Test 10. Attempting to use adminCookie again MUST fail with 401!
    const replayRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    const replayData = await toJson(replayRes);
    record(
      '[CRITICAL CORRECTION 4] Replay attack: Old refresh token cannot be reused after rotation',
      401,
      replayRes.status,
      '401 UNAUTHORIZED (Revoked/reused session rejected)',
      `Status: ${replayRes.status}, Code: ${replayData.error?.code}, Message: "${replayData.error?.message}"`,
      replayRes.status === 401 && replayData.error?.code === 'UNAUTHORIZED'
    );

    // Test 28 (CRITICAL): Logout invalidates refresh session server-side
    // rotatedCookie was logged out in Test 12. Attempting to refresh with rotatedCookie MUST fail with 401!
    const postLogoutRefreshRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: rotatedCookie },
    });
    const postLogoutData = await toJson(postLogoutRefreshRes);
    record(
      '[CRITICAL CORRECTION 3] Old refresh token cannot be used after logout (server-side invalidation)',
      401,
      postLogoutRefreshRes.status,
      '401 UNAUTHORIZED (Logged-out session rejected)',
      `Status: ${postLogoutRefreshRes.status}, Code: ${postLogoutData.error?.code}`,
      postLogoutRefreshRes.status === 401 && postLogoutData.error?.code === 'UNAUTHORIZED'
    );

    // Test 29: Explicit database verification that session is revoked
    const revokedSession = await prisma.refreshSession.findUnique({
      where: { id: decodedRefreshJwt?.sessionId },
    });
    const isSessionMarkedRevoked = revokedSession?.isRevoked === true;
    record(
      '[CORRECTION 2] PostgreSQL RefreshSession isRevoked status is true in database',
      200,
      isSessionMarkedRevoked ? 200 : 500,
      'Session record exists and isRevoked = true',
      `Session ID: ${revokedSession?.id}, isRevoked: ${revokedSession?.isRevoked}`,
      isSessionMarkedRevoked
    );

    // ── SUMMARY & REPORT ──
    console.log('\n==================================================');
    console.log('            SECURITY TEST RESULTS SUMMARY         ');
    console.log('==================================================\n');

    allPassed = true;
    for (const r of results) {
      const statusIcon = r.passed ? '✅ PASS' : '❌ FAIL';
      if (!r.passed) allPassed = false;
      console.log(`[#${r.id.toString().padStart(2, '0')}] ${statusIcon} | Exp: ${r.expectedStatus} | Act: ${r.actualStatus} | ${r.description}`);
      if (!r.passed) {
        console.log(`     -> Expected: ${r.expectedCondition}`);
        console.log(`     -> Actual:   ${r.actualDetail}`);
      }
    }

    console.log('\n--------------------------------------------------');
    const totalPassed = results.filter((r) => r.passed).length;
    console.log(`Total: ${results.length} | Passed: ${totalPassed} | Failed: ${results.length - totalPassed}`);
    console.log('--------------------------------------------------\n');

    if (allPassed) {
      console.log('🎉 ALL 29 SECURITY & RBAC VERIFICATION TESTS PASSED PERFECTLY!\n');
    } else {
      console.error('⚠️ SOME TESTS FAILED. INVESTIGATION REQUIRED.\n');
    }
  } finally {
    server.close(() => {
      process.exit(allPassed ? 0 : 1);
    });
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
