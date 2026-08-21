const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; }
};

const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (action, data = {}) => domain.call(action, { ...data, previewRole: "coach" });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent" });

async function rejects(fn, pattern) {
  let error; try { await fn(); } catch (caught) { error = caught; }
  assert(error, "expected action to reject");
  if (pattern) assert(pattern.test(error.message), `unexpected error: ${error.message}`);
}

async function run() {
  let checks = 0;
  await admin("resetDemo");

  const joined = await parent("joinClass", { classId: "cinterest", studentId: "s1" });
  assert.strictEqual(joined.status, "ACTIVE"); checks += 1;

  await admin("resetDemo");
  storage.nanlianClubV2.classes.find((item) => item.id === "cinterest").standardCapacity = 1;
  const waitlistBefore = storage.nanlianClubV2.waitlist.length;
  const full = await parent("joinClass", { classId: "cinterest", studentId: "s1" });
  storage.nanlianClubV2.sessions.push({ id: "se-full-regular", classId: "cu7base", title: "普通班满员课", date: "2026-08-30", time: "19:00", venue: "瓯北中心小学", capacity: 1, status: "published", enrollmentMode: "open" });
  storage.nanlianClubV2.enrollments.push({ id: "e-full-regular", sessionId: "se-full-regular", studentId: "s2", status: "booked", createdAt: "2026-08-20 12:00" });
  const fullSession = await parent("enrollSession", { sessionId: "se-full-regular", studentId: "s1" });
  assert.strictEqual(full.status, "FULL"); assert.strictEqual(fullSession.status, "booked"); checks += 1;
  assert.strictEqual(storage.nanlianClubV2.waitlist.length, waitlistBefore); checks += 1;

  const warning = await admin("addClassMember", { classId: "cu7base", studentId: "s4" });
  assert(warning.requiresConfirmation); checks += 1;
  const over = await admin("addClassMember", { classId: "cu7base", studentId: "s4", confirmCapacity: true });
  const fullClass = await admin("getClassDetail", { id: "cu7base" });
  assert.strictEqual(fullClass.studentCount, 21); checks += 1;
  assert.strictEqual(fullClass.standardCapacity, 20); assert.strictEqual(over.overCapacity, 1); checks += 1;

  await rejects(() => parent("joinClass", { classId: "c1718", studentId: "s1" }), /精英队/); checks += 1;
  const direct = await admin("addClassMember", { classId: "c1516", studentId: "s4", confirmCapacity: true });
  assert(direct.id); checks += 1;

  const recommendation = await coach("recommendElite", { studentId: "s5", fromClassId: "cu7base", targetEliteClassId: "c1516", recommendationReason: "训练态度与比赛阅读达到精英队观察标准" });
  assert.strictEqual(recommendation.status, "PENDING"); checks += 1;
  await rejects(() => coach("reviewEliteSelection", { id: recommendation.id, approved: true }), /管理员/); checks += 1;
  const approved = await admin("reviewEliteSelection", { id: recommendation.id, approved: true, keepSource: true, reviewRemark: "批准入队" });
  assert.strictEqual(approved.status, "APPROVED"); checks += 1;

  const studentAfter = await admin("getStudent", { id: "s5" });
  assert(studentAfter.classIds.includes("cu7base")); checks += 1;
  assert(studentAfter.classIds.includes("cu7base") && studentAfter.classIds.includes("c1516")); checks += 1;

  const eliteDetail = await admin("getClassDetail", { id: "c1516" });
  const s5Member = eliteDetail.members.find((item) => item.student.id === "s5");
  await admin("removeClassMember", { memberId: s5Member.id, reason: "训练表现" });
  const eliteHistory = await admin("getClassDetail", { id: "c1516", includeInactive: true });
  assert(eliteHistory.members.some((item) => item.id === s5Member.id && item.status === "INACTIVE")); checks += 1;

  const attendanceSnapshot = JSON.stringify(storage.nanlianClubV2.attendance);
  const ledgerSnapshot = JSON.stringify(storage.nanlianClubV2.lessonLedger);
  const sourceMember = (await admin("getClassDetail", { id: "cinterest" })).members.find((item) => item.student.id === "s4");
  await admin("transferClassMember", { memberId: sourceMember.id, targetClassId: "cu8advanced", keepSource: false, reason: "年龄升级", confirmCapacity: true });
  assert.strictEqual(JSON.stringify(storage.nanlianClubV2.attendance), attendanceSnapshot); checks += 1;
  assert.strictEqual(JSON.stringify(storage.nanlianClubV2.lessonLedger), ledgerSnapshot); checks += 1;

  const duplicate = await admin("addClassMember", { classId: "cu8advanced", studentId: "s4", confirmCapacity: true });
  assert.strictEqual(duplicate.duplicate, true); checks += 1;
  await rejects(() => parent("addClassMember", { classId: "cinterest", studentId: "s1" }), /管理员/); checks += 1;

  assert.strictEqual(checks, 18);
  console.log("Class & elite V3 regression: 18 checks passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
