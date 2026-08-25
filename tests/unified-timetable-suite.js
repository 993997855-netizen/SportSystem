const assert = require("assert");
const storage = {};
global.wx = { getStorageSync(key) { return storage[key]; }, setStorageSync(key, value) { storage[key] = value; } };
const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (id, action, data = {}) => domain.call(action, { ...data, previewRole: "coach", previewUserId: id });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });
async function rejects(fn, pattern) { let error; try { await fn(); } catch (caught) { error = caught; } assert(error); if (pattern) assert(pattern.test(error.message), error.message); }
async function reset() { await admin("resetDemo"); }
async function create(date = "2026-09-08") { const result = await admin("saveSession", { session: { classId: "c1718", title: "统一课表验收课", date, weekday: "周二", time: "12:00-13:30", venue: "统一课表测试场", focus: "1V1突破", status: "published", capacity: 20 } }); return result.id; }

async function unified() {
  await reset(); const id = await create(); let checks = 0;
  const before = await Promise.all([admin("getUnifiedTimetable", { date: "2026-09-08" }), coach("coach1", "getUnifiedTimetable", { date: "2026-09-08" }), parent("getUnifiedTimetable", { date: "2026-09-08", studentId: "s1" })]);
  assert(before.every((result) => result.items.some((item) => item.sessionId === id))); checks += 3;
  const session = await admin("getSession", { id }); await admin("saveSession", { session: { ...session, time: "13:00-14:30", venue: "同步修改后场地" } });
  const after = await Promise.all([admin("getUnifiedTimetable", { date: "2026-09-08" }), coach("coach1", "getUnifiedTimetable", { date: "2026-09-08" }), parent("getUnifiedTimetable", { date: "2026-09-08", studentId: "s1" })]);
  after.forEach((result) => { const item = result.items.find((row) => row.sessionId === id); assert.strictEqual(item.time, "13:00-14:30"); assert.strictEqual(item.venue, "同步修改后场地"); }); checks += 6;
  assert(!storage.nanlianClubV2.adminSchedules && !storage.nanlianClubV2.coachSchedules && !storage.nanlianClubV2.parentSchedules); checks += 1;
  return checks;
}
async function adminTimetable() {
  await reset(); await create(); let checks = 0; const table = await admin("getUnifiedTimetable", { date: "2026-09-08" });
  assert(table.items.length && table.filters.classes.length >= 5 && table.filters.coaches.length >= 4 && table.filters.venues.length >= 2); checks += 4;
  const conflictA = await admin("saveSession", { session: { classId: "c1516", title: "冲突A", date: "2026-09-09", weekday: "周三", time: "18:00-19:30", venue: "冲突场地", focus: "测试", status: "published" } }); assert(conflictA.id); checks += 1;
  const pending = await admin("saveSession", { session: { classId: "c1516", title: "冲突B", date: "2026-09-09", weekday: "周三", time: "18:30-20:00", venue: "冲突场地", focus: "测试", status: "published" } }); assert(pending.confirmationRequired); checks += 1;
  await admin("saveSession", { session: { classId: "c1516", title: "冲突B", date: "2026-09-09", weekday: "周三", time: "18:30-20:00", venue: "冲突场地", focus: "测试", status: "published", forceConflict: true, conflictReason: "管理员确认保留冲突用于验收" } });
  const conflicted = await admin("getUnifiedTimetable", { date: "2026-09-09" }); assert(conflicted.conflicts.coach >= 1 && conflicted.conflicts.class >= 1 && conflicted.conflicts.venue >= 1); assert(conflicted.items.filter((item) => item.hasConflict).length >= 2); checks += 4;
  return checks;
}
async function coachTimetable() {
  await reset(); const id = await create(); let checks = 0; await admin("assignSessionCoaches", { sessionId: id, actualCoachAssignments: [{ coachId: "coach4", role: "SUBSTITUTE" }], reason: "统一课表代课验收" });
  const substitute = await coach("coach4", "getUnifiedTimetable", { date: "2026-09-08" }), original = await coach("coach1", "getUnifiedTimetable", { date: "2026-09-08" });
  const row = substitute.items.find((item) => item.sessionId === id); assert(row && row.isSubstitute && row.coachRoleLabel === "代课"); checks += 3;
  assert(!original.items.some((item) => item.sessionId === id)); checks += 1;
  assert(substitute.items.every((item) => item.sourceType === "MATCH" || item.coaches.some((teacher) => teacher.coachId === "coach4"))); checks += 1;
  return checks;
}
async function parentTimetable() {
  await reset(); let checks = 0; const requested = await parent("requestLeave", { sessionId: "se1", studentId: "s1", reason: "统一课表请假验收" }); await admin("reviewLeave", { id: requested.id, approved: true });
  const table = await parent("getUnifiedTimetable", { date: "2026-08-20", studentId: "s1" }), leave = table.items.find((item) => item.sessionId === "se1"); assert(leave && leave.leaveStatus === "APPROVED" && /不扣课时/.test(leave.leaveLabel)); checks += 3;
  const ledgerCount = storage.nanlianClubV2.lessonLedger.length; const matchWeek = await parent("getUnifiedTimetable", { date: "2026-08-23", studentId: "s1" }); assert(matchWeek.items.some((item) => item.sourceType === "MATCH" && item.lessonDeduction === 0)); assert.strictEqual(storage.nanlianClubV2.lessonLedger.length, ledgerCount); checks += 2;
  await rejects(() => parent("getUnifiedTimetable", { date: "2026-08-20", studentId: "s2" }), /无权/); checks += 1;
  return checks;
}
async function multiChild() {
  await reset(); const table = await parent("getUnifiedTimetable", { date: "2026-08-24", studentId: "ALL" }), names = new Set(table.items.map((item) => item.studentName)); let checks = 0;
  assert(names.has("陈小南") && names.has("王小雨")); checks += 2;
  assert(table.items.every((item) => item.studentId && item.studentName)); checks += 1;
  const one = await parent("getUnifiedTimetable", { date: "2026-08-24", studentId: "s-family2" }); assert(one.items.every((item) => item.studentId === "s-family2")); checks += 1;
  return checks;
}
module.exports = { unified, adminTimetable, coachTimetable, parentTimetable, multiChild };
