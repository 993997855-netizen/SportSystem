const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; }
};

const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent" });

async function run() {
  let checks = 0;

  await admin("resetDemo");
  storage.nanlianClubV2.sessions.push({ id: "se-u7-fixed", classId: "cu7base", title: "U7固定成员训练", date: "2026-08-29", time: "09:00-10:30", venue: "瓯北中心小学", status: "published" });
  const membersBeforeLeave = (await admin("getClassDetail", { id: "cu7base" })).studentCount;
  const legacyBeforeLeave = JSON.stringify(storage.nanlianClubV2.waitlist);
  const leave = await parent("requestLeave", { sessionId: "se-u7-fixed", studentId: "s1", reason: "家庭安排" });
  await admin("reviewLeave", { id: leave.id, approved: true });
  const leaveSession = await admin("getSession", { id: "se-u7-fixed" });
  assert.strictEqual((await admin("getClassDetail", { id: "cu7base" })).studentCount, membersBeforeLeave); checks += 1;
  assert.strictEqual(leaveSession.attendanceStats.expected, membersBeforeLeave); checks += 1;
  assert.strictEqual(leaveSession.attendanceStats.expected - leaveSession.attendanceStats.leave, 19); checks += 1;
  assert.strictEqual(JSON.stringify(storage.nanlianClubV2.waitlist), legacyBeforeLeave); checks += 1;

  const warning = await admin("addClassMember", { classId: "cu7base", studentId: "s4" });
  assert(warning.requiresConfirmation && warning.nextCount === 21); checks += 1;
  await admin("addClassMember", { classId: "cu7base", studentId: "s4", confirmCapacity: true });
  const overRegular = await admin("getClassDetail", { id: "cu7base" });
  assert(overRegular.studentCount === 21 && overRegular.standardCapacity === 20 && overRegular.overCapacity === 1); checks += 1;

  await admin("resetDemo");
  const s1Member = (await admin("getClassDetail", { id: "cu7base" })).members.find((item) => item.student.id === "s1");
  await admin("removeClassMember", { memberId: s1Member.id, reason: "调整梯队" });
  await admin("addClassMember", { classId: "cu7base", studentId: "s4", confirmCapacity: true });
  const legacyBeforeFullSignup = JSON.stringify(storage.nanlianClubV2.waitlist);
  const full = await parent("joinClass", { classId: "cu7base", studentId: "s1" });
  assert.strictEqual(full.status, "FULL"); checks += 1;
  assert.strictEqual(JSON.stringify(storage.nanlianClubV2.waitlist), legacyBeforeFullSignup); checks += 1;

  await admin("resetDemo");
  const leavingMember = (await admin("getClassDetail", { id: "cu7base" })).members.find((item) => item.student.id === "s1");
  const legacyBeforeRemoval = JSON.stringify(storage.nanlianClubV2.waitlist);
  await admin("removeClassMember", { memberId: leavingMember.id, reason: "转会/离队" });
  const afterRemoval = await admin("getClassDetail", { id: "cu7base", includeInactive: true });
  assert.strictEqual(afterRemoval.studentCount, 19); checks += 1;
  assert(afterRemoval.members.some((item) => item.id === leavingMember.id && item.status === "INACTIVE" && item.leftAt && item.leftBy && item.leaveReason)); checks += 1;
  assert.strictEqual(JSON.stringify(storage.nanlianClubV2.waitlist), legacyBeforeRemoval); checks += 1;
  const rejoined = await parent("joinClass", { classId: "cu7base", studentId: "s1" });
  assert.strictEqual(rejoined.status, "ACTIVE"); checks += 1;
  assert.strictEqual((await admin("getClassDetail", { id: "cu7base" })).studentCount, 20); checks += 1;

  await admin("resetDemo");
  storage.nanlianClubV2.classes.find((item) => item.id === "c1718").standardCapacity = 2;
  const eliteWarning = await admin("addClassMember", { classId: "c1718", studentId: "s4" });
  assert(eliteWarning.requiresConfirmation && eliteWarning.nextCount === 3); checks += 1;
  await admin("addClassMember", { classId: "c1718", studentId: "s4", confirmCapacity: true });
  const elite = await admin("getClassDetail", { id: "c1718" });
  assert(elite.studentCount === 3 && elite.standardCapacity === 2 && elite.overCapacity === 1); checks += 1;

  const duplicate = await admin("addClassMember", { classId: "c1718", studentId: "s4", confirmCapacity: true });
  assert(duplicate.duplicate && /正式成员/.test(duplicate.message)); checks += 1;

  assert.strictEqual(checks, 16);
  console.log("Fixed class membership regression: 16 checks passed");
  console.log("Waitlist removal regression: 4 checks passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
