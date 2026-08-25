const assert = require("assert");
const storage = {};
global.wx = { getStorageSync(key) { return storage[key]; }, setStorageSync(key, value) { storage[key] = value; } };
const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (id, action, data = {}) => domain.call(action, { ...data, previewRole: "coach", previewUserId: id });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });
async function rejects(fn, pattern) { let error; try { await fn(); } catch (caught) { error = caught; } assert(error, "expected rejection"); if (pattern) assert(pattern.test(error.message), error.message); }

async function setup() {
  await admin("resetDemo");
  const original = await admin("getClass", { id: "c1718" });
  await admin("saveClass", { clubClass: { ...original, assistantCoachIds: ["coach2"] } });
  const first = await admin("saveSession", { session: { classId: "c1718", title: "排班回归A", date: "2026-09-01", weekday: "周二", time: "18:00-19:30", venue: "回归测试球场", focus: "排班测试", capacity: 20, status: "published" } });
  const snapshot = await admin("getSession", { id: first.id });
  await admin("saveClass", { clubClass: { ...(await admin("getClass", { id: "c1718" })), assistantCoachIds: ["coach3"] } });
  return { first, snapshot };
}

async function scheduling() {
  const { first, snapshot } = await setup();
  assert.deepStrictEqual(snapshot.plannedCoaches.map((row) => row.coachId), ["coach1", "coach2"]);
  const after = await admin("getSession", { id: first.id });
  assert.deepStrictEqual(after.plannedCoaches.map((row) => row.coachId), ["coach1", "coach2"], "班级后续调整不得改写课程快照");
  const conflict = await admin("saveSession", { session: { classId: "c1516", title: "排班回归B", date: "2026-09-01", weekday: "周二", time: "18:30-20:00", venue: "回归测试球场", focus: "冲突测试", capacity: 20, status: "published" } });
  assert(conflict.confirmationRequired && conflict.conflicts.some((row) => row.type === "COACH") && conflict.conflicts.some((row) => row.type === "VENUE"));
  await rejects(() => admin("saveSession", { session: { classId: "c1516", title: "排班回归B", date: "2026-09-01", weekday: "周二", time: "18:30-20:00", venue: "回归测试球场", focus: "冲突测试", capacity: 20, status: "published", forceConflict: true } }), /原因/);
  const forced = await admin("saveSession", { session: { classId: "c1516", title: "排班回归B", date: "2026-09-01", weekday: "周二", time: "18:30-20:00", venue: "回归测试球场", focus: "冲突测试", capacity: 20, status: "published", forceConflict: true, conflictReason: "两块分区场地已确认" } });
  assert(forced.id);
  return 5;
}

async function substitution() {
  const { first } = await setup(); const beforeClass = await admin("getClass", { id: "c1718" });
  await admin("assignSessionCoaches", { sessionId: first.id, actualCoachAssignments: [{ coachId: "coach4", role: "SUBSTITUTE" }], reason: "游导临时赛事带队" });
  const session = await admin("getSession", { id: first.id }), afterClass = await admin("getClass", { id: "c1718" });
  assert.strictEqual(session.actualCoaches[0].coachId, "coach4"); assert.strictEqual(session.actualCoaches[0].role, "SUBSTITUTE");
  assert.strictEqual(afterClass.headCoachUserId, beforeClass.headCoachUserId, "代课不得修改班级主教练");
  await admin("completeSession", { sessionId: first.id });
  await rejects(() => coach("coach1", "getSession", { id: first.id }), /无权/);
  assert.strictEqual((await coach("coach4", "getSession", { id: first.id })).status, "COMPLETED");
  return 5;
}

async function workload() {
  const { first } = await setup();
  await admin("assignSessionCoaches", { sessionId: first.id, actualCoachAssignments: [{ coachId: "coach4", role: "SUBSTITUTE" }], reason: "临时代课" });
  await admin("completeSession", { sessionId: first.id });
  const rows = await admin("getCoachWorkload", { month: "2026-09" }), substitute = rows.rows.find((row) => row.coach.id === "coach4");
  assert.strictEqual(substitute.actualCount, 1); assert.strictEqual(substitute.substituteCount, 1); assert.strictEqual(substitute.durationMinutes, 90); assert.strictEqual(substitute.matchCoachCount, 0);
  const cancelled = await admin("saveSession", { session: { classId: "c1718", title: "取消课", date: "2026-09-03", weekday: "周四", time: "18:00-19:30", venue: "测试B场", focus: "取消", status: "published" } }); await admin("cancelSession", { sessionId: cancelled.id, reason: "天气原因" });
  const after = await admin("getCoachWorkload", { month: "2026-09", coachId: "coach1" }); assert(after.rows[0].cancelledCount >= 1);
  await admin("assignSessionCoaches", { sessionId: first.id, actualCoachAssignments: [{ coachId: "coach3", role: "SUBSTITUTE" }], reason: "赛后核对更正" });
  const corrected = await admin("getCoachWorkload", { month: "2026-09", coachId: "coach3" }); assert.strictEqual(corrected.rows[0].actualCount, 1);
  return 7;
}

async function permissions() {
  await setup();
  await rejects(() => parent("getCoachWorkload"), /权限|数据/);
  await rejects(() => parent("listActiveCoaches"), /权限|数据/);
  await rejects(() => coach("coach2", "assignSessionCoaches", { sessionId: "x", actualCoachAssignments: [] }), /管理员/);
  const mine = await coach("coach2", "getCoachWorkload", { month: "2026-09", coachId: "coach1" }); assert.strictEqual(mine.rows[0].coach.id, "coach2");
  const active = await admin("listActiveCoaches"); assert(active.length >= 4 && active.every((row) => "todayCount" in row));
  return 5;
}
module.exports = { scheduling, substitution, workload, permissions };
