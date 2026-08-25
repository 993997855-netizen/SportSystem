const { coachReference } = require("./coach-profile-domain");

const ACTIONS = new Set([
  "listActiveCoaches", "getCoachSchedule", "getCoachWorkload", "getCoachWorkSummary",
  "checkSessionConflicts", "assignSessionCoaches", "completeSession", "cancelSession"
]);
const ROLES = { HEAD: "主教练", ASSISTANT: "助理教练", SUBSTITUTE: "代课教练" };

function handles(action) { return ACTIONS.has(action); }
function activeCoaches(data) { return (data.users || []).filter((item) => item.role === "coach" && item.active !== false); }
function coachName(data, coachId) { return ((data.users || []).find((item) => item.id === coachId) || {}).name || "未命名教练"; }
function assignment(coachId, role) { return { coachId, role }; }
function uniqueAssignments(rows) { const seen = new Set(); return (rows || []).filter((item) => item && item.coachId && ROLES[item.role] && !seen.has(item.coachId) && seen.add(item.coachId)).map((item) => ({ coachId: item.coachId, role: item.role })); }
function plannedFromClass(clubClass) { if (!clubClass) return []; return uniqueAssignments([assignment(clubClass.headCoachUserId || clubClass.coachUserId, "HEAD"), ...(clubClass.assistantCoachIds || []).map((id) => assignment(id, "ASSISTANT"))]); }
function effectiveAssignments(session) { return uniqueAssignments((session.actualCoachAssignments || []).length ? session.actualCoachAssignments : session.plannedCoachAssignments); }

function parseTimeRange(value) {
  const matched = String(value || "").match(/(\d{1,2}):(\d{2})\s*[-至~—]\s*(\d{1,2}):(\d{2})/);
  if (!matched) return null;
  const start = Number(matched[1]) * 60 + Number(matched[2]), end = Number(matched[3]) * 60 + Number(matched[4]);
  return end > start ? { start, end, durationMinutes: end - start } : null;
}
function overlaps(left, right) { const a = parseTimeRange(left.time), b = parseTimeRange(right.time); return Boolean(a && b && a.start < b.end && b.start < a.end); }
function dateOffset(value, days) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function weekRange(value) { const date = new Date(`${value}T12:00:00Z`), day = date.getUTCDay() || 7; return { startDate: dateOffset(value, 1 - day), endDate: dateOffset(value, 7 - day) }; }

function validateAssignments(data, rows) {
  const normalized = uniqueAssignments(rows), allowed = new Set(activeCoaches(data).map((item) => item.id));
  if (!normalized.length || normalized.some((item) => !allowed.has(item.coachId))) throw new Error("请选择有效的在职教练");
  return normalized;
}

function sessionConflicts(data, candidate, assignments) {
  const coachIds = new Set((assignments || effectiveAssignments(candidate)).map((item) => item.coachId));
  const conflicts = [];
  (data.sessions || []).filter((item) => item.id !== candidate.id && item.date === candidate.date && item.status !== "CANCELLED" && overlaps(item, candidate)).forEach((item) => {
    const classRow = data.classes.find((row) => row.id === item.classId) || {};
    const matchedCoaches = effectiveAssignments(item).filter((entry) => coachIds.has(entry.coachId));
    matchedCoaches.forEach((entry) => conflicts.push({ type: "COACH", coachId: entry.coachId, coachName: coachName(data, entry.coachId), sessionId: item.id, title: item.title, className: classRow.name || item.title, date: item.date, time: item.time, message: `${coachName(data, entry.coachId)} ${item.time} 已有 ${classRow.name || item.title}` }));
    if (candidate.venue && item.venue === candidate.venue) conflicts.push({ type: "VENUE", sessionId: item.id, title: item.title, date: item.date, time: item.time, venue: item.venue, message: `${item.venue} 同时已有 ${item.title}` });
    if (candidate.classId && item.classId === candidate.classId) conflicts.push({ type: "CLASS", sessionId: item.id, title: item.title, date: item.date, time: item.time, message: `${classRow.name || item.title} 同一时间已有课程` });
  });
  return conflicts;
}

function coachView(data, coach) {
  const profile = coachReference(data, coach.id, coach.name);
  const classNames = data.classes.filter((item) => item.status === "ACTIVE" && ((item.headCoachUserId || item.coachUserId) === coach.id || (item.assistantCoachIds || []).includes(coach.id))).map((item) => item.name);
  const currentDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { id: coach.id, name: coach.name, avatarUrl: profile.avatarUrl, classNames, todayCount: (data.sessions || []).filter((item) => item.date === currentDate && item.status !== "CANCELLED" && effectiveAssignments(item).some((entry) => entry.coachId === coach.id)).length, active: coach.active !== false };
}

function sessionView(data, session, coachId) {
  const clubClass = data.classes.find((item) => item.id === session.classId) || {};
  const planned = uniqueAssignments(session.plannedCoachAssignments).map((item) => ({ ...item, roleLabel: ROLES[item.role], coach: coachReference(data, item.coachId, coachName(data, item.coachId)) }));
  const actual = uniqueAssignments(session.actualCoachAssignments).map((item) => ({ ...item, roleLabel: ROLES[item.role], coach: coachReference(data, item.coachId, coachName(data, item.coachId)) }));
  const own = [...actual, ...planned].find((item) => item.coachId === coachId);
  return { ...session, className: clubClass.name || session.title, plannedCoaches: planned, actualCoaches: actual, coachRole: own ? own.role : "", coachRoleLabel: own ? ROLES[own.role] : "", isSubstitute: Boolean(own && own.role === "SUBSTITUTE"), durationMinutes: (parseTimeRange(session.time) || {}).durationMinutes || 0 };
}

function rebuildRecords(data, session, ctx) {
  data.coachSessionRecords = (data.coachSessionRecords || []).filter((item) => item.sessionId !== session.id);
  if (session.status !== "COMPLETED") return;
  const plannedIds = new Set((session.plannedCoachAssignments || []).map((item) => item.coachId));
  const durationMinutes = (parseTimeRange(session.time) || {}).durationMinutes || 0;
  uniqueAssignments(session.actualCoachAssignments).forEach((item) => data.coachSessionRecords.push({ id: ctx.uid("csr"), sessionId: session.id, coachId: item.coachId, role: item.role, planned: plannedIds.has(item.coachId), actual: true, durationMinutes, classId: session.classId, sessionDate: session.date, createdAt: ctx.stamp(), updatedAt: ctx.stamp() }));
}

function ensure(data, ctx = {}) {
  data.coachSessionRecords = data.coachSessionRecords || [];
  const now = ctx.stamp ? ctx.stamp() : "2026-08-24 10:00";
  const coaches = [
    { id: "coach1", name: "游导", classIds: ["c1718", "c1516", "cu8advanced"] },
    { id: "coach2", name: "王蒋生", classIds: ["cinterest", "cu7base"] },
    { id: "coach3", name: "陈教练", classIds: [] },
    { id: "coach4", name: "吴教练", classIds: [] }
  ];
  data.users = data.users || [];
  coaches.forEach((coach) => { const found = data.users.find((item) => item.id === coach.id); if (!found) data.users.push({ ...coach, role: "coach", active: true, studentIds: [] }); else { found.active = found.active !== false; found.classIds = [...new Set([...(found.classIds || []), ...coach.classIds])]; } });
  data.classes.forEach((clubClass) => {
    clubClass.headCoachUserId = clubClass.headCoachUserId || clubClass.coachUserId || "";
    clubClass.coachUserId = clubClass.headCoachUserId;
    clubClass.assistantCoachIds = [...new Set((clubClass.assistantCoachIds || []).filter((id) => id && id !== clubClass.headCoachUserId))];
    if (!clubClass.assistantCoachIds.length && clubClass.assistantCoachName) { const assistant = activeCoaches(data).find((item) => item.name === clubClass.assistantCoachName); if (assistant && assistant.id !== clubClass.headCoachUserId) clubClass.assistantCoachIds = [assistant.id]; }
    clubClass.assistantCoachName = clubClass.assistantCoachIds.map((id) => coachName(data, id)).join("、");
  });
  data.sessions.forEach((session) => { const clubClass = data.classes.find((item) => item.id === session.classId); session.plannedCoachAssignments = uniqueAssignments((session.plannedCoachAssignments || []).length ? session.plannedCoachAssignments : plannedFromClass(clubClass)); session.actualCoachAssignments = uniqueAssignments(session.actualCoachAssignments); });
  const demoDates = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"];
  if (!(data.sessions || []).some((item) => item.demoCoachWork)) {
    for (let index = 0; index < 15; index += 1) {
      const classIds = ["cu7base", "cu8advanced", "cinterest", "c1718", "c1516"], classId = classIds[index % classIds.length], clubClass = data.classes.find((item) => item.id === classId), date = demoDates[index % demoDates.length], startHour = 16 + index % 3, time = `${String(startHour).padStart(2, "0")}:00-${String(startHour + 1).padStart(2, "0")}:30`;
      const planned = plannedFromClass(clubClass); const item = { id: `coach-work-demo-${index + 1}`, classId, title: `${clubClass.name}周训练`, date, weekday: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index % 7], time, venue: index % 2 ? "瓯北中心小学" : "三江南联球场", coachName: coachName(data, (planned[0] || {}).coachId), focus: "教练工作管理演示课程", capacity: 20, enrollmentMode: "fixed", status: index === 13 ? "CANCELLED" : index < 10 ? "COMPLETED" : "published", plannedCoachAssignments: planned, actualCoachAssignments: [], demoCoachWork: true, createdAt: now };
      if (index === 3) { item.actualCoachAssignments = [assignment("coach4", "SUBSTITUTE")]; item.substitutionReason = "临时调整"; }
      else if (item.status === "COMPLETED") item.actualCoachAssignments = planned;
      data.sessions.push(item); if (item.status === "COMPLETED") rebuildRecords(data, item, { uid: ctx.uid || ((prefix) => `${prefix}-${index}`), stamp: ctx.stamp || (() => now) });
    }
  } else data.sessions.filter((item) => item.status === "COMPLETED" && !(data.coachSessionRecords || []).some((record) => record.sessionId === item.id)).forEach((item) => rebuildRecords(data, item, { uid: ctx.uid || ((prefix) => `${prefix}-${item.id}`), stamp: ctx.stamp || (() => now) }));
}

function prepareSession(data, incoming, previous, ctx) {
  const clubClass = data.classes.find((item) => item.id === incoming.classId); if (!clubClass) throw new Error("班级不存在");
  const plannedCoachAssignments = validateAssignments(data, (incoming.plannedCoachAssignments || []).length ? incoming.plannedCoachAssignments : previous && previous.plannedCoachAssignments && previous.plannedCoachAssignments.length ? previous.plannedCoachAssignments : plannedFromClass(clubClass));
  const candidate = { ...previous, ...incoming, id: incoming.id || (previous || {}).id || "", plannedCoachAssignments, actualCoachAssignments: uniqueAssignments((previous || {}).actualCoachAssignments) };
  const conflicts = sessionConflicts(data, candidate, plannedCoachAssignments);
  if (conflicts.length && !incoming.forceConflict) return { confirmationRequired: true, conflictType: "SCHEDULE", conflicts };
  if (conflicts.length && !String(incoming.conflictReason || "").trim()) throw new Error("强制排课必须填写冲突原因");
  if (conflicts.length) ctx.audit("FORCE_SESSION_CONFLICT", "session", candidate.id || "new", { conflicts, reason: incoming.conflictReason, operatorId: ctx.userId });
  return { session: { ...candidate, plannedCoachAssignments, coachUserId: (plannedCoachAssignments.find((item) => item.role === "HEAD") || {}).coachId || "", coachName: coachName(data, (plannedCoachAssignments.find((item) => item.role === "HEAD") || {}).coachId), schedulingConflictOverride: conflicts.length ? { reason: incoming.conflictReason, conflicts, operatorId: ctx.userId, createdAt: ctx.stamp() } : null } };
}

function workload(data, coachId, startDate, endDate) {
  const sessions = data.sessions.filter((item) => item.date >= startDate && item.date <= endDate);
  const planned = sessions.filter((item) => (item.plannedCoachAssignments || []).some((row) => row.coachId === coachId));
  const records = (data.coachSessionRecords || []).filter((item) => item.coachId === coachId && item.sessionDate >= startDate && item.sessionDate <= endDate && item.actual);
  return { coach: coachView(data, data.users.find((item) => item.id === coachId) || { id: coachId, name: coachName(data, coachId) }), plannedCount: planned.length, actualCount: records.length, headCount: records.filter((item) => item.role === "HEAD").length, assistantCount: records.filter((item) => item.role === "ASSISTANT").length, substituteCount: records.filter((item) => item.role === "SUBSTITUTE").length, cancelledCount: planned.filter((item) => item.status === "CANCELLED").length, durationMinutes: records.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0), matchCoachCount: 0 };
}

async function call(action, input, ctx) {
  const { data, role, userId } = ctx; ensure(data, ctx);
  const staff = () => { if (!['admin', 'coach'].includes(role)) throw new Error("无教练工作数据权限"); };
  const admin = () => { if (role !== "admin") throw new Error("仅管理员可执行该操作"); };
  if (action === "listActiveCoaches") { staff(); const rows = activeCoaches(data).map((item) => coachView(data, item)); return role === "coach" ? rows.filter((item) => item.id === userId) : rows; }
  if (action === "getCoachSchedule") { staff(); const range = input.startDate && input.endDate ? input : weekRange(input.date || ctx.stamp().slice(0, 10)), targetId = role === "coach" ? userId : input.coachId || ""; const sessions = data.sessions.filter((item) => item.date >= range.startDate && item.date <= range.endDate && (!targetId || effectiveAssignments(item).some((row) => row.coachId === targetId))).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((item) => sessionView(data, item, targetId)); return { ...range, coachId: targetId, sessions, todayCount: sessions.filter((item) => item.date === (input.today || ctx.stamp().slice(0, 10))).length }; }
  if (action === "checkSessionConflicts") { admin(); return { conflicts: sessionConflicts(data, input.session, input.assignments) }; }
  if (action === "assignSessionCoaches") { admin(); const session = data.sessions.find((item) => item.id === input.sessionId); if (!session) throw new Error("课程不存在"); const next = validateAssignments(data, input.actualCoachAssignments); const conflicts = sessionConflicts(data, session, next); if (conflicts.length && !input.forceConflict) return { confirmationRequired: true, conflicts }; if (conflicts.length && !String(input.conflictReason || "").trim()) throw new Error("强制安排必须填写冲突原因"); const old = uniqueAssignments(session.actualCoachAssignments); if (session.status === "COMPLETED" && !String(input.reason || "").trim()) throw new Error("修改已完成课程必须填写原因"); session.actualCoachAssignments = next; session.substitutionReason = String(input.reason || input.conflictReason || "临时调整"); session.updatedAt = ctx.stamp(); if (session.status === "COMPLETED") rebuildRecords(data, session, ctx); ctx.audit(session.status === "COMPLETED" ? "UPDATE_COMPLETED_SESSION_COACH" : "UPDATE_SESSION_COACH", "session", session.id, { oldCoachAssignments: old, newCoachAssignments: next, operatorId: userId, reason: session.substitutionReason, conflicts }); ctx.save(); return { ok: true, session: sessionView(data, session) }; }
  if (action === "completeSession") { staff(); const session = data.sessions.find((item) => item.id === input.sessionId); if (!session) throw new Error("课程不存在"); if (session.status === "CANCELLED") throw new Error("已取消课程不能完成"); const actual = uniqueAssignments((session.actualCoachAssignments || []).length ? session.actualCoachAssignments : session.plannedCoachAssignments); if (role === "coach" && !actual.some((item) => item.coachId === userId)) throw new Error("只能完成自己实际执教的课程"); session.actualCoachAssignments = actual; session.status = "COMPLETED"; session.completedAt = ctx.stamp(); session.completedBy = userId; rebuildRecords(data, session, ctx); ctx.audit("COMPLETE_SESSION", "session", session.id, { actualCoachAssignments: actual, operatorId: userId }); ctx.save(); return { ok: true }; }
  if (action === "cancelSession") { admin(); const session = data.sessions.find((item) => item.id === input.sessionId); if (!session) throw new Error("课程不存在"); session.status = "CANCELLED"; session.cancelReason = String(input.reason || "临时取消"); session.cancelledAt = ctx.stamp(); rebuildRecords(data, session, ctx); ctx.audit("CANCEL_SESSION", "session", session.id, { reason: session.cancelReason, operatorId: userId }); ctx.save(); return { ok: true }; }
  if (action === "getCoachWorkload" || action === "getCoachWorkSummary") { staff(); const range = input.startDate && input.endDate ? input : { startDate: `${(input.month || ctx.stamp().slice(0, 7))}-01`, endDate: `${(input.month || ctx.stamp().slice(0, 7))}-31` }; const ids = role === "coach" ? [userId] : input.coachId ? [input.coachId] : activeCoaches(data).map((item) => item.id); const rows = ids.map((id) => workload(data, id, range.startDate, range.endDate)); if (action === "getCoachWorkSummary") { admin(); const row = rows[0] || {}; const recentSessions = data.sessions.filter((item) => effectiveAssignments(item).some((entry) => entry.coachId === input.coachId)).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 5).map((item) => sessionView(data, item, input.coachId)); return { ...row, recentSessions }; } return { ...range, rows }; }
  throw new Error("未知教练工作管理操作");
}

module.exports = { ACTIONS, ROLES, handles, ensure, call, prepareSession, sessionConflicts, sessionView, effectiveAssignments, parseTimeRange, plannedFromClass };
