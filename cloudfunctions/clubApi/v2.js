const cloud = require("wx-server-sdk");
const { createCrmApi } = require("./crm");
const { createClassService } = require("./class-service");
const { createGrowthService } = require("./growth-service");
const { createLeagueService } = require("./league-service");
const { createFamilyService } = require("./family-service");
const { createFinanceService } = require("./finance-service");
const { createTrainingService } = require("./training-service");
const { createCoachService } = require("./coach-service");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const command = db.command;

// 上线前替换为公司管理员的真实 OPENID，避免“第一个访问者自动成为管理员”。
const BOOTSTRAP_ADMIN_OPENIDS = ["REPLACE_WITH_NANLIAN_ADMIN_OPENID"];
const COLLECTIONS = ["users", "students", "studentPrivateProfiles", "parentStudentLinks", "childProfileRequests", "classes", "classMembers", "eliteSelections", "sessions", "enrollments", "waitlist", "leaveRequests", "attendance", "lessonLedger", "feedback", "renewals", "products", "orders", "payments", "refunds", "financeSettings", "invites", "auditLogs", "leads", "leadFollowUps", "trialBookings", "assessmentTemplates", "assessmentRounds", "playerAssessments", "playerGrowthEvents", "playerMatchRecords", "tournaments", "leagues", "leagueSeasons", "leagueRounds", "teams", "teamMembers", "seasonTeams", "externalPlayers", "matches", "matchSquads", "curriculums", "trainingCycles", "weeklyTrainingPlans", "trainingPlanTemplates", "sessionTrainingPlans", "trainingExecutions", "trainingPlanFavorites", "coachProfiles"];
const DEDUCTION = { present: 1, absent: 1, leave: 0, sick: 0 };
const PACKAGES = {
  p14: { name: "一周一练", lessons: 14, amount: 1380 },
  p28: { name: "一周两练", lessons: 28, amount: 1980 }
};
const crmApi = createCrmApi({ db, command, fetchAll, fetchByIds, publicDoc, nowText, todayText, requireRole, audit, saveStudent, packages: PACKAGES, createFinanceOrder: (user, input) => financeService.call("createOrder", input, user) });
const coachService = createCoachService({ db, fetchAll, nowText, requireRole, audit });
const classService = createClassService({ db, fetchAll, fetchByIds, publicDoc, nowText, requireRole, audit, getCoachReference: coachService.getReference });
const growthService = createGrowthService({ db, command, fetchAll, fetchByIds, publicDoc, nowText, todayText, requireRole, audit });
const leagueService = createLeagueService({ db, fetchAll, fetchByIds, publicDoc, nowText, todayText, requireRole, audit, getCoachReference: coachService.getReference });
const familyService = createFamilyService({ db, command, fetchAll, fetchByIds, publicDoc, nowText, requireRole, audit });
const financeService = createFinanceService({ db, command, fetchAll, fetchByIds, publicDoc, nowText, requireRole, audit, assertStudentAccess, allowedStudentIds });
const trainingService = createTrainingService({ db, fetchAll, fetchByIds, publicDoc, nowText, requireRole, audit, assertStudentAccess, allowedStudentIds });
let collectionsReady;

function nowText() { return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 16); }
function todayText() { return nowText().slice(0, 10); }
function publicDoc(doc) { if (!doc) return doc; const value = { ...doc, id: doc._id }; delete value._id; delete value.openid; delete value.idCardNumber; delete value.idCard; return value; }
function requireRole(user, roles) { if (!roles.includes(user.role)) throw new Error("没有执行该操作的权限"); }
function validId(id) { if (!id || typeof id !== "string") throw new Error("请求参数无效"); return id; }

async function ensureCollections() {
  if (!collectionsReady) collectionsReady = Promise.all(COLLECTIONS.map(async (name) => { try { await db.createCollection(name); } catch (error) { if (!String(error.errMsg || error.message || "").includes("exist")) console.warn(`collection ${name}`, error); } }));
  await collectionsReady;
}
async function fetchAll(name, where) {
  const rows = []; let skip = 0;
  while (true) { let query = db.collection(name); if (where) query = query.where(where); const result = await query.skip(skip).limit(100).get(); rows.push(...result.data); if (result.data.length < 100) break; skip += result.data.length; }
  return rows;
}
async function fetchByIds(name, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]; const rows = [];
  for (let i = 0; i < unique.length; i += 100) rows.push(...(await db.collection(name).where({ _id: command.in(unique.slice(i, i + 100)) }).get()).data);
  return rows;
}
async function ensureUser(openid) {
  const found = await db.collection("users").where({ openid }).limit(1).get(); if (found.data.length) return found.data[0];
  const role = BOOTSTRAP_ADMIN_OPENIDS.includes(openid) ? "admin" : "parent";
  const user = { openid, role, name: role === "admin" ? "南联管理员" : "待绑定家长", studentIds: [], classIds: [], createdAt: nowText() };
  const added = await db.collection("users").add({ data: user }); return { ...user, _id: added._id };
}
async function audit(user, action, targetType, targetId, detail) {
  const fields = detail && typeof detail === "object" ? detail : { detail: String(detail || "") };
  await db.collection("auditLogs").add({ data: { userId: user._id, role: user.role, action, targetType, targetId, ...fields, createdAt: nowText() } });
}
async function allowedStudentIds(user) {
  if (user.role === "admin") return null;
  if (user.role === "parent") return (await fetchAll("students", { ownerParentUserId: user._id, status: "active" })).map((item) => item._id);
  const memberships = await fetchAll("classMembers", { status: "ACTIVE" });
  return [...new Set(memberships.filter((item) => (user.classIds || []).includes(item.classId)).map((item) => item.studentId))];
}
async function assertStudentAccess(user, studentId) { if (user.role === "parent") { const student = (await db.collection("students").doc(studentId).get().catch(() => ({ data: null }))).data; if (!student || student.ownerParentUserId !== user._id) throw new Error("无权访问该学员"); return; } const allowed = await allowedStudentIds(user); if (allowed && !allowed.includes(studentId)) throw new Error("无权访问该学员"); }
async function firstOwnedStudentId(user) { const allowed = await allowedStudentIds(user); return allowed && allowed[0] || ""; }

async function listStudents(user) {
  const allowed = await allowedStudentIds(user); if (allowed && !allowed.length) return [];
  const students = allowed === null ? await fetchAll("students", { status: "active" }) : (await fetchByIds("students", allowed)).filter((item) => item.status === "active");
  const classes = await fetchAll("classes", { active: true });
  return students.map((student) => ({ ...publicDoc(student), initial: student.name ? student.name[0] : "学", classNames: classes.filter((item) => (student.classIds || []).includes(item._id)).map((item) => item.name).join("、") }));
}
async function listClasses(user) {
  let classes;
  if (user.role === "admin") classes = await fetchAll("classes", { status: "ACTIVE" });
  else if (user.role === "coach") classes = (await fetchByIds("classes", user.classIds || [])).filter((item) => item.status !== "INACTIVE");
  else classes = await fetchAll("classes", { status: "ACTIVE" });
  const rows = []; for (const item of classes) rows.push(await classService.decorateClass(item)); return rows;
}
async function getStudent(user, id) {
  await assertStudentAccess(user, id); const student = (await db.collection("students").doc(id).get()).data;
  const memberships = await classService.studentMemberships(id);
  const [classes, attendance, renewals, feedback, ledger, selections] = await Promise.all([
    fetchByIds("classes", memberships.map((item) => item.classId)),
    db.collection("attendance").where({ studentId: id }).orderBy("date", "desc").limit(50).get(),
    user.role === "coach" ? Promise.resolve({ data: [] }) : db.collection("renewals").where({ studentId: id }).orderBy("createdAt", "desc").limit(50).get(),
    db.collection("feedback").where({ studentId: id }).orderBy("createdAt", "desc").limit(50).get(),
    db.collection("lessonLedger").where({ studentId: id }).orderBy("createdAt", "desc").limit(100).get(),
    db.collection("eliteSelections").where({ studentId: id }).orderBy("createdAt", "desc").limit(100).get()
  ]);
  let recruitment = null; const leadResult = student.crmLeadId ? await db.collection("leads").doc(student.crmLeadId).get().catch(() => ({ data: null })) : await db.collection("leads").where({ convertedStudentId: id }).limit(1).get(); const lead = student.crmLeadId ? leadResult.data : (leadResult.data || [])[0]; if (lead) { const trial = (await db.collection("trialBookings").where({ leadId: lead._id }).orderBy("trialDate", "desc").limit(1).get()).data[0]; recruitment = { source: lead.source, ownerCoachName: lead.ownerCoachName, firstContactAt: lead.createdAt, trialDate: (trial || {}).trialDate || "", trialCoachName: (trial || {}).coachName || "", trialFeedback: ((trial || {}).feedback || {}).summary || "", convertedAt: lead.convertedAt }; }
  const decoratedClasses = []; for (const item of classes) decoratedClasses.push(await classService.decorateClass(item));
  const latestSelection = selections.data[0]; const recommendationStatus = !latestSelection ? "NONE" : latestSelection.status === "APPROVED" ? "SELECTED" : latestSelection.status === "PENDING" ? "RECOMMENDED" : "WATCH";
  return { ...publicDoc(student), classIds: memberships.map((item) => item.classId), initial: student.name ? student.name[0] : "学", classes: decoratedClasses, memberships: memberships.map(publicDoc), eliteSelections: selections.data.map(publicDoc), selectionStatus: latestSelection ? latestSelection.status : "", eliteRecommendationStatus: recommendationStatus, attendance: attendance.data.map(publicDoc), renewals: renewals.data.map(publicDoc), feedback: feedback.data.filter((item) => user.role !== "parent" || item.visibility !== "STAFF_ONLY").map(publicDoc), lessonLedger: ledger.data.map(publicDoc), recruitment };
}
async function saveStudent(user, payload) {
  requireRole(user, ["admin"]); const requestedClassIds = payload.classIds || [];
  const existing = payload.id ? (await db.collection("students").doc(payload.id).get()).data : null;
  const data = { name: String(payload.name || "").trim(), avatarUrl: String(payload.avatarUrl || (existing || {}).avatarUrl || ""), gender: payload.gender || "男", birthDate: payload.birthDate || "", guardianName: String(payload.guardianName || "").trim(), guardianPhone: String(payload.guardianPhone || ""), emergencyContact: String(payload.emergencyContact || ""), healthNotes: String(payload.healthNotes || ""), school: String(payload.school || ""), grade: String(payload.grade || ""), crmLeadId: String(payload.crmLeadId || ""), source: String(payload.source || ""), registrationDate: String(payload.registrationDate || ""), recruitmentOwnerId: String(payload.recruitmentOwnerId || ""), recruitmentOwnerName: String(payload.recruitmentOwnerName || ""), classIds: existing ? existing.classIds || [] : [], status: "active", updatedAt: nowText() };
  if (!data.name || !data.guardianName || !/^1\d{10}$/.test(data.guardianPhone) || !existing && !data.avatarUrl) throw new Error("请完整填写学员照片、学员和家长信息");
  let id = payload.id;
  if (id) await db.collection("students").doc(id).update({ data });
  else { const lessons = Math.max(0, Number(payload.remainingLessons || 0)); const added = await db.collection("students").add({ data: { ...data, remainingLessons: lessons, totalLessons: lessons, createdAt: nowText() } }); id = added._id; if (lessons) await db.collection("lessonLedger").add({ data: { studentId: id, type: "opening", delta: lessons, balanceAfter: lessons, referenceType: "student", referenceId: id, note: "建档期初课时", createdAt: nowText() } }); }
  if (!existing) for (const classId of requestedClassIds) await classService.call("addClassMember", { classId, studentId: id, source: "ADMIN_ADD", confirmCapacity: true }, user);
  await audit(user, "saveStudent", "student", id, data.name); return { id };
}
async function getClass(user, id) { requireRole(user, ["admin"]); return classService.decorateClass((await db.collection("classes").doc(id).get()).data); }
async function saveClass(user, payload) {
  requireRole(user, ["admin"]); const previous = payload.id ? (await db.collection("classes").doc(payload.id).get()).data : null;
  const data = { name: String(payload.name || "").trim(), classType: payload.classType === "ELITE" ? "ELITE" : "REGULAR", ageGroup: String(payload.ageGroup || payload.group || ""), group: String(payload.ageGroup || payload.group || ""), standardCapacity: Math.max(1, Number(payload.standardCapacity || 20)), headCoachName: String(payload.headCoachName || payload.coachName || "").trim(), coachName: String(payload.headCoachName || payload.coachName || "").trim(), assistantCoachName: String(payload.assistantCoachName || "").trim(), schedule: String(payload.schedule || ""), venue: String(payload.venue || ""), status: payload.status === "INACTIVE" ? "INACTIVE" : "ACTIVE", active: payload.status !== "INACTIVE", remark: String(payload.remark || ""), studentIds: previous ? previous.studentIds || [] : [], updatedAt: nowText() };
  if (!data.name || !data.ageGroup || !data.headCoachName || !data.schedule || !data.venue) throw new Error("班级信息不完整"); let id = payload.id;
  if (id) await db.collection("classes").doc(id).update({ data }); else { const added = await db.collection("classes").add({ data: { ...data, createdAt: nowText() } }); id = added._id; }
  await audit(user, previous ? "updateClass" : "createClass", "class", id, { operator: user._id, classId: id, fromType: previous ? previous.classType || "REGULAR" : "", toType: data.classType, reason: previous && previous.classType !== data.classType ? "班级类型调整" : data.name }); return { id };
}

async function sessionAccess(user, session) { if (user.role === "coach" && !(user.classIds || []).includes(session.classId)) throw new Error("无权管理该课程"); }
async function decorateSession(session, studentId) {
  const [members, trialCount, leaveRows, classResult, attendanceRows] = await Promise.all([
    classService.activeMembers(session.classId),
    db.collection("trialBookings").where({ sessionId: session._id, status: "SCHEDULED" }).count(),
    studentId ? db.collection("leaveRequests").where({ sessionId: session._id, studentId }).limit(100).get() : Promise.resolve({ data: [] }),
    db.collection("classes").doc(session.classId).get().catch(() => ({ data: null })),
    db.collection("attendance").where({ sessionId: session._id }).limit(100).get()
  ]);
  const leave = [...leaveRows.data].sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt)))[0];
  const memberIds = new Set(members.map((item) => item.studentId)); const expected = members.length;
  const attendanceStats = { expected, present: 0, leave: 0, injured: 0, absent: 0, unmarked: expected };
  attendanceRows.data.filter((record) => memberIds.has(record.studentId)).forEach((record) => { const key = record.status === "sick" ? "injured" : record.status; if (key in attendanceStats && key !== "expected" && key !== "unmarked") { attendanceStats[key] += 1; attendanceStats.unmarked = Math.max(0, attendanceStats.unmarked - 1); } });
  const leaveStatus = leave && leave.status === "pending" ? "leave_pending" : leave && leave.status === "approved" ? "leave_approved" : leave && leave.status === "rejected" ? "leave_rejected" : "";
  const clubClass = classResult.data || {}; const standardCapacity = Number(clubClass.standardCapacity || session.capacity || 20); const totalCount = expected + trialCount.total;
  return { ...publicDoc(session), coach: await coachService.getReference(session.coachUserId || clubClass.coachUserId, session.coachName || clubClass.headCoachName), standardCapacity, classType: clubClass.classType || "REGULAR", classTypeLabel: clubClass.classType === "ELITE" ? "精英队" : "普通班", memberCount: expected, enrolledCount: expected, trialCount: trialCount.total, totalCount, overCapacity: Math.max(0, expected - standardCapacity), isFull: expected >= standardCapacity, attendanceStats, myStatus: leaveStatus || (memberIds.has(studentId) ? "booked" : "none"), leaveRequestId: leave ? leave._id : "" };
}
async function listSessions(user, input) {
  let sessions = await fetchAll("sessions"); if (user.role === "parent") sessions = sessions.filter((item) => item.status === "published"); if (user.role === "coach") sessions = sessions.filter((item) => (user.classIds || []).includes(item.classId));
  const studentId = input.studentId || (user.role === "parent" ? await firstOwnedStudentId(user) : ""); if (user.role === "parent" && studentId) await assertStudentAccess(user, studentId); const rows = []; for (const session of sessions.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))) rows.push(await decorateSession(session, studentId)); return rows;
}
async function getSession(user, id, studentId) {
  const session = (await db.collection("sessions").doc(validId(id)).get()).data; if (user.role === "parent" && session.status !== "published") throw new Error("课程尚未发布"); await sessionAccess(user, session);
  const decorated = await decorateSession(session, studentId || (user.role === "parent" ? await firstOwnedStudentId(user) : "")); if (user.role === "parent") return decorated;
  const [members, attendance] = await Promise.all([classService.activeMembers(session.classId), db.collection("attendance").where({ sessionId: id }).limit(100).get()]);
  const students = await fetchByIds("students", members.map((item) => item.studentId));
  return { ...decorated, enrollments: members.map((item) => ({ id: `${id}-${item.studentId}`, sessionId: id, studentId: item.studentId, attendanceStatus: (attendance.data.find((record) => record.studentId === item.studentId) || {}).status || "unmarked", student: publicDoc(students.find((s) => s._id === item.studentId)) })) };
}
async function saveSession(user, payload) {
  requireRole(user, ["admin"]); const data = { classId: validId(payload.classId), title: String(payload.title || "").trim(), date: String(payload.date || ""), weekday: String(payload.weekday || ""), time: String(payload.time || ""), venue: String(payload.venue || ""), coachName: String(payload.coachName || ""), focus: String(payload.focus || ""), capacity: Math.max(1, Number(payload.capacity || 20)), enrollmentMode: payload.enrollmentMode || "open", status: payload.status || "published", updatedAt: nowText() };
  if (!data.title || !data.date || !data.time || !data.venue) throw new Error("课程信息不完整"); let id = payload.id;
  if (id) await db.collection("sessions").doc(id).update({ data }); else { const added = await db.collection("sessions").add({ data: { ...data, createdAt: nowText() } }); id = added._id; }
  await audit(user, "saveSession", "session", id, data.title); return { id };
}
async function enrollSession(user, input) {
  requireRole(user, ["admin", "parent"]); const studentId = validId(input.studentId || (user.role === "parent" ? await firstOwnedStudentId(user) : "")); await assertStudentAccess(user, studentId);
  const session = (await db.collection("sessions").doc(validId(input.sessionId)).get()).data; if (!session || session.status !== "published") throw new Error("课程暂不可报名"); const clubClass = (await db.collection("classes").doc(session.classId).get()).data; if (user.role === "parent" && clubClass.classType === "ELITE") throw new Error("精英队实行俱乐部选拔制"); const student = (await db.collection("students").doc(studentId).get()).data; if (Number(student.remainingLessons || 0) <= 0) throw new Error("剩余课时不足，请先续费");
  const existing = (await db.collection("classMembers").where({ classId: session.classId, studentId, status: "ACTIVE" }).limit(1).get()).data[0]; if (existing) return { status: "booked", message: "已经是本班正式成员" };
  const joined = await classService.call(user.role === "admin" ? "addClassMember" : "joinClass", { classId: session.classId, studentId, source: user.role === "admin" ? "ADMIN_ADD" : "PARENT_SIGNUP", confirmCapacity: user.role === "admin" && Boolean(input.confirmCapacity) }, user);
  return { ...joined, status: joined.status === "FULL" ? "full" : "booked", message: joined.message || "报名成功" };
}
async function requestLeave(user, input) {
  requireRole(user, ["admin", "parent"]); const studentId = validId(input.studentId || (user.role === "parent" ? await firstOwnedStudentId(user) : "")); await assertStudentAccess(user, studentId);
  const session = (await db.collection("sessions").doc(validId(input.sessionId)).get()).data; const membership = session ? await db.collection("classMembers").where({ classId: session.classId, studentId, status: "ACTIVE" }).limit(1).get() : { data: [] }; if (!session || !membership.data.length) throw new Error("该学员不是本班正式成员"); const [duplicate, approved] = await Promise.all([db.collection("leaveRequests").where({ sessionId: input.sessionId, studentId, status: "pending" }).limit(1).get(), db.collection("leaveRequests").where({ sessionId: input.sessionId, studentId, status: "approved" }).limit(1).get()]); if (duplicate.data.length) throw new Error("请假申请已提交"); if (approved.data.length) throw new Error("该课程请假已经批准");
  const submittedAt = nowText(); const added = await db.collection("leaveRequests").add({ data: { sessionId: input.sessionId, classId: session.classId, studentId, reason: String(input.reason || "家长请假"), status: "pending", submittedAt, createdAt: submittedAt, creatorId: user._id } }); await audit(user, "requestLeave", "leave", added._id, { studentId, sessionId: input.sessionId, leaveRequestId: added._id, operator: user._id, oldStatus: "NONE", newStatus: "pending", lessonDelta: 0 }); return { id: added._id, status: "pending" };
}
async function cancelLeave(user, input) {
  requireRole(user, ["admin", "parent"]); const requestId = validId(input.id); const request = (await db.collection("leaveRequests").doc(requestId).get()).data; if (!request) throw new Error("请假申请不存在"); await assertStudentAccess(user, request.studentId);
  const result = await db.runTransaction(async (transaction) => { const current = (await transaction.collection("leaveRequests").doc(requestId).get()).data; if (current.status === "cancelled") return { status: "cancelled", idempotent: true }; if (current.status === "approved") throw new Error("已批准请假请联系俱乐部管理员处理"); if (current.status !== "pending") throw new Error("当前请假状态不可撤销"); await transaction.collection("leaveRequests").doc(requestId).update({ data: { status: "cancelled", cancelledAt: nowText(), cancelledBy: user._id } }); return { status: "cancelled", idempotent: false }; });
  if (!result.idempotent) await audit(user, "cancelLeave", "leave", requestId, { studentId: request.studentId, sessionId: request.sessionId, leaveRequestId: requestId, operator: user._id, oldStatus: "pending", newStatus: "cancelled", lessonDelta: 0 }); return { ok: true, ...result };
}
async function listLeaveRequests(user, input = {}) {
  let rows = await fetchAll("leaveRequests"); if (user.role === "parent") { if (input.studentId) await assertStudentAccess(user, input.studentId); const owned = new Set(await allowedStudentIds(user)); rows = rows.filter((item) => owned.has(item.studentId) && (!input.studentId || item.studentId === input.studentId)); } if (user.role === "coach") { const sessions = await fetchByIds("sessions", rows.map((item) => item.sessionId)); const allowed = new Set(sessions.filter((item) => (user.classIds || []).includes(item.classId)).map((item) => item._id)); rows = rows.filter((item) => allowed.has(item.sessionId)); }
  const [students, sessions] = await Promise.all([fetchByIds("students", rows.map((item) => item.studentId)), fetchByIds("sessions", rows.map((item) => item.sessionId))]); const classes = await fetchByIds("classes", sessions.map((item) => item.classId)); return rows.sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt))).map((item) => { const session = sessions.find((s) => s._id === item.sessionId); return { ...publicDoc(item), submittedAt: item.submittedAt || item.createdAt, student: publicDoc(students.find((s) => s._id === item.studentId)), session: publicDoc(session), clubClass: publicDoc(classes.find((clubClass) => clubClass._id === (item.classId || (session || {}).classId))) }; });
}
async function attendanceChangeInTransaction(transaction, user, session, studentId, status, context = {}) {
  if (!(status in DEDUCTION)) throw new Error("无效出勤状态");
  const existing = (await transaction.collection("attendance").where({ sessionId: session._id, studentId }).limit(1).get()).data[0]; const oldStatus = existing ? existing.status : "unmarked"; const previous = existing ? Number(existing.deductedLessons || 0) : 0; const next = DEDUCTION[status]; const updatedAt = nowText();
  if (existing) await transaction.collection("attendance").doc(existing._id).update({ data: { status, deductedLessons: next, source: context.source || existing.source || "ATTENDANCE", leaveRequestId: context.leaveRequestId || existing.leaveRequestId || "", updatedAt, operatorId: user._id } });
  else await transaction.collection("attendance").add({ data: { sessionId: session._id, classId: session.classId, studentId, date: session.date, status, deductedLessons: next, source: context.source || "ATTENDANCE", leaveRequestId: context.leaveRequestId || "", createdAt: updatedAt, updatedAt, operatorId: user._id } });
  const lessonDelta = previous - next;
  if (lessonDelta) { const student = (await transaction.collection("students").doc(studentId).get()).data; const balance = Number(student.remainingLessons || 0) + lessonDelta; await transaction.collection("students").doc(studentId).update({ data: { remainingLessons: balance, updatedAt } }); await transaction.collection("lessonLedger").add({ data: { studentId, type: context.ledgerType || (lessonDelta < 0 ? "attendance" : "attendance_adjustment"), delta: lessonDelta, balanceAfter: balance, referenceType: "session", referenceId: session._id, note: context.note || `${session.title} ${status}`, createdAt: updatedAt, operatorId: user._id, leaveRequestId: context.leaveRequestId || "" } }); }
  return { oldStatus, newStatus: status, lessonDelta };
}
async function reviewLeave(user, input) {
  requireRole(user, ["admin"]); const requestId = validId(input.id); const request = (await db.collection("leaveRequests").doc(requestId).get()).data; if (!request) throw new Error("请假申请不存在"); const session = (await db.collection("sessions").doc(request.sessionId).get()).data; if (!session) throw new Error("课程不存在"); const status = input.approved ? "approved" : "rejected";
  const result = await db.runTransaction(async (transaction) => { const current = (await transaction.collection("leaveRequests").doc(requestId).get()).data; if (current.status === status) return { status, idempotent: true, correction: { oldStatus: status === "approved" ? "leave" : "unmarked", newStatus: status === "approved" ? "leave" : "unmarked", lessonDelta: 0 } }; if (current.status !== "pending") throw new Error("申请状态已变化"); let correction = { oldStatus: "unmarked", newStatus: "unmarked", lessonDelta: 0 }; if (input.approved) correction = await attendanceChangeInTransaction(transaction, user, session, current.studentId, "leave", { source: "LEAVE_APPROVAL", leaveRequestId: requestId, ledgerType: "leave_correction", note: `${session.title}请假审批课时返还` }); await transaction.collection("leaveRequests").doc(requestId).update({ data: { status, reviewedAt: nowText(), reviewerId: user._id, reviewNote: String(input.note || "") } }); return { status, idempotent: false, correction }; });
  if (!result.idempotent) { await audit(user, input.approved ? "approveLeave" : "rejectLeave", "leave", requestId, { studentId: request.studentId, sessionId: request.sessionId, leaveRequestId: requestId, operator: user._id, oldStatus: "pending", newStatus: status, attendanceOldStatus: result.correction.oldStatus, attendanceNewStatus: result.correction.newStatus, lessonDelta: result.correction.lessonDelta }); if (result.correction.lessonDelta) await audit(user, "leaveLessonCorrection", "student", request.studentId, { studentId: request.studentId, sessionId: request.sessionId, leaveRequestId: requestId, operator: user._id, oldStatus: result.correction.oldStatus, newStatus: "leave", lessonDelta: result.correction.lessonDelta }); }
  return { ok: true, status, idempotent: result.idempotent, lessonDelta: result.correction.lessonDelta, promotedStudentId: null };
}

async function getAttendanceSheet(user, input) {
  requireRole(user, ["admin", "coach"]); const session = (await db.collection("sessions").doc(validId(input.sessionId)).get()).data; await sessionAccess(user, session);
  const [members, records, approvedLeaves] = await Promise.all([classService.activeMembers(session.classId), db.collection("attendance").where({ sessionId: input.sessionId }).limit(100).get(), db.collection("leaveRequests").where({ sessionId: input.sessionId, status: "approved" }).limit(100).get()]); const students = await fetchByIds("students", members.map((item) => item.studentId));
  return { session: publicDoc(session), date: session.date, students: students.map((student) => { const record = records.data.find((item) => item.studentId === student._id); const approvedLeave = approvedLeaves.data.find((item) => item.studentId === student._id); const attendanceStatus = record ? record.status : "unmarked"; return { ...publicDoc(student), initial: student.name ? student.name[0] : "学", attendanceStatus, leaveApproved: Boolean(approvedLeave), leaveRequestId: approvedLeave ? approvedLeave._id : "", leaveLocked: Boolean(approvedLeave && attendanceStatus === "leave"), leaveOverride: Boolean(approvedLeave && attendanceStatus !== "leave") }; }), trialStudents: await crmApi.trialStudents(input.sessionId) };
}
async function submitAttendance(user, input) {
  requireRole(user, ["admin", "coach"]); const session = (await db.collection("sessions").doc(validId(input.sessionId)).get()).data; await sessionAccess(user, session); const members = await classService.activeMembers(session.classId); const allowed = new Set(members.map((item) => item.studentId));
  const overrides = [];
  for (const record of input.records || []) {
    if (!allowed.has(record.studentId)) throw new Error("点名名单包含非本班正式成员"); if (!(record.status in DEDUCTION)) throw new Error("无效出勤状态");
    const change = await db.runTransaction(async (transaction) => { const approvedLeave = (await transaction.collection("leaveRequests").where({ sessionId: input.sessionId, studentId: record.studentId, status: "approved" }).limit(1).get()).data[0]; if (approvedLeave && record.status !== "leave" && !record.overrideApprovedLeave) throw new Error("已批准请假，修改状态前需要确认"); const correction = await attendanceChangeInTransaction(transaction, user, session, record.studentId, record.status, { source: approvedLeave ? (record.status === "leave" ? "LEAVE_APPROVAL" : "LEAVE_ADMIN_OVERRIDE") : "ATTENDANCE", leaveRequestId: approvedLeave ? approvedLeave._id : "" }); return { approvedLeaveId: approvedLeave ? approvedLeave._id : "", correction }; });
    if (change.approvedLeaveId && record.status !== "leave") overrides.push({ studentId: record.studentId, leaveRequestId: change.approvedLeaveId, ...change.correction });
  }
  await crmApi.applyTrialAttendance(user, input.sessionId, input.trialRecords || []);
  for (const change of overrides) await audit(user, "overrideApprovedLeaveAttendance", "attendance", change.studentId, { studentId: change.studentId, sessionId: input.sessionId, leaveRequestId: change.leaveRequestId, operator: user._id, oldStatus: change.oldStatus, newStatus: change.newStatus, lessonDelta: change.lessonDelta });
  await audit(user, "submitAttendance", "session", input.sessionId, `${(input.records || []).length}人`); return { ok: true };
}
async function getLessonLedger(user, studentId) { await assertStudentAccess(user, studentId); return (await db.collection("lessonLedger").where({ studentId }).orderBy("createdAt", "desc").limit(100).get()).data.map(publicDoc); }
async function listFeedback(user, input) {
  if (user.role === "parent" && input.studentId) await assertStudentAccess(user, input.studentId); const allowed = await allowedStudentIds(user); let rows = input.studentId ? (await db.collection("feedback").where({ studentId: input.studentId }).orderBy("createdAt", "desc").limit(100).get()).data : await fetchAll("feedback"); if (allowed) rows = rows.filter((item) => allowed.includes(item.studentId)); if (user.role === "parent") rows = rows.filter((item) => item.visibility !== "STAFF_ONLY"); const [students, sessions] = await Promise.all([fetchByIds("students", rows.map((item) => item.studentId)), fetchByIds("sessions", rows.map((item) => item.sessionId))]); return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({ ...publicDoc(item), student: publicDoc(students.find((s) => s._id === item.studentId)), session: publicDoc(sessions.find((s) => s._id === item.sessionId)) }));
}
async function saveFeedback(user, input) {
  requireRole(user, ["admin", "coach"]); const session = (await db.collection("sessions").doc(validId(input.sessionId)).get()).data; await sessionAccess(user, session); if (user.role === "coach") { const member = await db.collection("classMembers").where({ classId: session.classId, studentId: input.studentId, status: "ACTIVE" }).limit(1).get(); if (!member.data.length) throw new Error("该学员不是本班正式成员"); }
  const content = String(input.content || "").trim(); if (!content) throw new Error("请填写训练反馈"); const added = await db.collection("feedback").add({ data: { sessionId: input.sessionId, studentId: validId(input.studentId), coachName: user.name, rating: Math.max(1, Math.min(5, Number(input.rating || 4))), tags: input.tags || [], content, createdAt: nowText(), operatorId: user._id } }); await audit(user, "saveFeedback", "feedback", added._id, input.studentId); return { id: added._id };
}

async function listRenewals(user, input = {}) {
  if (user.role === "coach") return []; let rows = await fetchAll("renewals"); if (user.role === "parent") { if (input.studentId) await assertStudentAccess(user, input.studentId); const owned = new Set(await allowedStudentIds(user)); rows = rows.filter((item) => owned.has(item.studentId) && (!input.studentId || item.studentId === input.studentId)); } const students = await fetchByIds("students", rows.map((item) => item.studentId)); return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({ ...publicDoc(item), studentName: (students.find((student) => student._id === item.studentId) || {}).name || "" }));
}
async function createRenewal(user, input) { requireRole(user, ["admin", "parent"]); const studentId = input.studentId || (user.role === "parent" ? await firstOwnedStudentId(user) : ""); await assertStudentAccess(user, studentId); const pack = PACKAGES[input.packageId]; if (!pack) throw new Error("续费套餐无效"); const added = await db.collection("renewals").add({ data: { studentId, packageId: input.packageId, ...pack, status: "pending", createdAt: nowText(), creatorId: user._id } }); return { id: added._id }; }
async function confirmRenewal(user, id) {
  requireRole(user, ["admin"]); await db.runTransaction(async (transaction) => { const renewal = (await transaction.collection("renewals").doc(validId(id)).get()).data; if (renewal.status !== "pending") throw new Error("订单状态已变化"); const student = (await transaction.collection("students").doc(renewal.studentId).get()).data; const balance = Number(student.remainingLessons || 0) + Number(renewal.lessons || 0); await transaction.collection("renewals").doc(id).update({ data: { status: "paid", paidAt: nowText(), operatorId: user._id } }); await transaction.collection("students").doc(renewal.studentId).update({ data: { remainingLessons: balance, totalLessons: Number(student.totalLessons || 0) + Number(renewal.lessons || 0), updatedAt: nowText() } }); await transaction.collection("lessonLedger").add({ data: { studentId: renewal.studentId, type: "purchase", delta: Number(renewal.lessons), balanceAfter: balance, referenceType: "renewal", referenceId: id, note: `${renewal.name || "课包"}到账`, createdAt: nowText(), operatorId: user._id } }); }); await audit(user, "confirmRenewal", "renewal", id, "paid"); return { ok: true };
}
async function createInvite(user, input) { requireRole(user, ["admin"]); if (!["parent", "coach"].includes(input.role)) throw new Error("邀请角色无效"); if (input.role === "parent") { const student = (await db.collection("students").doc(validId(input.studentId)).get()).data; if (!student) throw new Error("学员不存在"); if (student.ownerParentUserId) throw new Error("该学员已有家长归属；如需更换，请使用“转移家长归属”。"); } const code = String(Math.floor(100000 + Math.random() * 900000)); const expiresAt = Date.now() + 24 * 60 * 60 * 1000; await db.collection("invites").add({ data: { code, role: input.role, studentId: input.studentId || "", classId: input.classId || "", displayName: String(input.displayName || ""), status: "active", expiresAt, createdAt: nowText(), creatorId: user._id } }); return { code, expiresAt }; }
async function claimInvite(user, code) {
  const found = await db.collection("invites").where({ code: String(code || "").trim(), status: "active" }).limit(1).get(); const invite = found.data[0]; if (!invite || Number(invite.expiresAt || 0) < Date.now()) throw new Error("邀请码无效或已过期");
  if (invite.role === "parent") { const activeLinks = await db.collection("parentStudentLinks").where({ studentId: invite.studentId, status: "ACTIVE" }).limit(100).get(); if (activeLinks.data.some((item) => item.parentUserId !== user._id)) throw new Error("该学员存在历史家长归属冲突，需要管理员人工确认"); }
  await db.runTransaction(async (transaction) => { const current = (await transaction.collection("invites").doc(invite._id).get()).data; if (current.status !== "active" || Number(current.expiresAt || 0) < Date.now()) throw new Error("邀请码已经使用"); const update = { role: current.role, name: current.displayName || user.name, updatedAt: nowText() }; if (current.role === "parent") { const student = (await transaction.collection("students").doc(current.studentId).get()).data; if (!student) throw new Error("学员不存在"); if (student.ownerParentUserId && student.ownerParentUserId !== user._id) throw new Error("该学员已经绑定家长账号，请联系俱乐部管理员处理。"); await transaction.collection("students").doc(student._id).update({ data: { ownerParentUserId: user._id, updatedAt: nowText() } }); } if (current.role === "coach") update.classIds = [...new Set([...(user.classIds || []), current.classId].filter(Boolean))]; await transaction.collection("users").doc(user._id).update({ data: update }); await transaction.collection("invites").doc(invite._id).update({ data: { status: "used", usedBy: user._id, usedAt: nowText() } }); }); if (invite.role === "parent") { const ids = (await fetchAll("students", { ownerParentUserId: user._id, status: "active" })).map((item) => item._id); await db.collection("users").doc(user._id).update({ data: { studentIds: ids, updatedAt: nowText() } }); const active = await db.collection("parentStudentLinks").where({ studentId: invite.studentId, status: "ACTIVE" }).limit(100).get(); if (active.data.some((item) => item.parentUserId !== user._id)) throw new Error("该学员存在历史家长归属冲突，需要管理员人工确认"); if (!active.data.some((item) => item.parentUserId === user._id)) await db.collection("parentStudentLinks").add({ data: { parentUserId: user._id, studentId: invite.studentId, relationship: "GUARDIAN", isPrimaryGuardian: true, status: "ACTIVE", createdAt: nowText(), updatedAt: nowText(), source: "PARENT_INVITE" } }); await audit(user, "CLAIM_STUDENT_PARENT_INVITE", "student", invite.studentId, { parentUserId: user._id, inviteId: invite._id }); } return { ok: true, role: invite.role };
}

async function getDashboard(user, input = {}) {
  let students = await listStudents(user); if (user.role === "parent" && input.activeStudentId) { await assertStudentAccess(user, input.activeStudentId); students = students.filter((item) => item.id === input.activeStudentId); } const selectedId = user.role === "parent" ? (students[0] || {}).id : ""; const [classes, sessions, renewals, leaves] = await Promise.all([listClasses(user), listSessions(user, { studentId: selectedId }), listRenewals(user, { studentId: selectedId }), listLeaveRequests(user, { studentId: selectedId })]); const studentIds = students.map((item) => item.id); let todayAttendance = 0;
  if (studentIds.length) { const batches = []; for (let i = 0; i < studentIds.length; i += 100) batches.push(db.collection("attendance").where({ date: todayText(), studentId: command.in(studentIds.slice(i, i + 100)) }).count()); todayAttendance = (await Promise.all(batches)).reduce((sum, item) => sum + item.total, 0); }
  return { role: user.role, studentCount: students.length, classCount: classes.length, lowBalance: students.filter((item) => Number(item.remainingLessons) <= 5).length, pendingRenewals: renewals.filter((item) => item.status === "pending").length, todayAttendance, pendingLeaves: leaves.filter((item) => item.status === "pending").length, recentStudents: [...students].sort((a, b) => Number(a.remainingLessons) - Number(b.remainingLessons)).slice(0, 3), classes, sessions: sessions.slice(0, 4) };
}
async function getOperationsDashboard(user) {
  requireRole(user, ["admin", "coach"]); const [dashboard, leaves, renewals, logs, feedback] = await Promise.all([getDashboard(user), listLeaveRequests(user), listRenewals(user), db.collection("auditLogs").orderBy("createdAt", "desc").limit(30).get(), fetchAll("feedback")]); return { metrics: { students: dashboard.studentCount, sessions: dashboard.sessions.length, classMembers: dashboard.classes.reduce((sum, item) => sum + item.studentCount, 0), pendingEvaluations: dashboard.sessions.filter((session) => !feedback.some((item) => item.sessionId === session.id)).length, pendingLeaves: leaves.filter((item) => item.status === "pending").length, pendingRenewals: renewals.filter((item) => item.status === "pending").length }, alerts: [{ level: "warning", text: "请确认三江秋季场地时段" }, { level: "danger", text: `${dashboard.lowBalance}名学员课时不足5节` }], sessions: dashboard.sessions, auditLogs: logs.data.map(publicDoc) };
}

exports.main = async (event) => {
  try {
    await ensureCollections(); await classService.ensureMigration(); await growthService.ensureDefaults(); await leagueService.ensureDefaults(); await financeService.ensureDefaults(); await trainingService.ensureDefaults(); await coachService.ensureDefaults(); const user = await ensureUser(cloud.getWXContext().OPENID); await familyService.ensureMigration(user); const input = event.data || {}; let data;
    if (classService.handles(event.action)) data = await classService.call(event.action, input, user);
    else if (crmApi.handles(event.action)) data = await crmApi.call(event.action, user, input);
    else if (growthService.handles(event.action)) data = await growthService.call(event.action, input, user);
    else if (leagueService.handles(event.action)) data = await leagueService.call(event.action, input, user);
    else if (familyService.handles(event.action)) data = await familyService.call(event.action, input, user);
    else if (financeService.handles(event.action)) data = await financeService.call(event.action, input, user);
    else if (trainingService.handles(event.action)) data = await trainingService.call(event.action, input, user);
    else if (coachService.handles(event.action)) data = await coachService.call(event.action, input, user);
    else switch (event.action) {
      case "getContext": { const owned = user.role === "parent" ? await allowedStudentIds(user) : []; data = { mode: "cloud", user: { id: user._id, role: user.role, name: user.name }, needsBinding: user.role !== "admin" && user.role === "parent" ? !owned.length : user.role !== "admin" && !(user.classIds || []).length }; break; }
      case "getDashboard": data = await getDashboard(user, input); break;
      case "getOperationsDashboard": data = await getOperationsDashboard(user); break;
      case "listStudents": data = await listStudents(user); break;
      case "getStudent": data = await getStudent(user, input.id); break;
      case "saveStudent": data = await saveStudent(user, input.student || {}); break;
      case "listClasses": data = await listClasses(user); break;
      case "getClass": data = await getClass(user, input.id); break;
      case "saveClass": data = await saveClass(user, input.clubClass || {}); break;
      case "listSessions": data = await listSessions(user, input); break;
      case "getSession": data = await getSession(user, input.id, input.studentId); break;
      case "saveSession": data = await saveSession(user, input.session || {}); break;
      case "enrollSession": data = await enrollSession(user, input); break;
      case "requestLeave": data = await requestLeave(user, input); break;
      case "cancelLeave": data = await cancelLeave(user, input); break;
      case "listLeaveRequests": data = await listLeaveRequests(user, input); break;
      case "reviewLeave": data = await reviewLeave(user, input); break;
      case "getAttendanceSheet": data = await getAttendanceSheet(user, input); break;
      case "submitAttendance": data = await submitAttendance(user, input); break;
      case "getLessonLedger": data = await getLessonLedger(user, input.studentId); break;
      case "listFeedback": data = await listFeedback(user, input); break;
      case "saveFeedback": data = await saveFeedback(user, input); break;
      case "listRenewals": data = await listRenewals(user, input); break;
      case "createRenewal": data = await createRenewal(user, input); break;
      case "confirmRenewal": data = await confirmRenewal(user, input.id); break;
      case "createInvite": data = await createInvite(user, input); break;
      case "claimInvite": data = await claimInvite(user, input.code); break;
      default: throw new Error("未知操作");
    }
    return { success: true, data };
  } catch (error) { console.error(error); return { success: false, message: error.message || "服务异常" }; }
};
