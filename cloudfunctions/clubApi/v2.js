const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const command = db.command;

// 上线前替换为公司管理员的真实 OPENID，避免“第一个访问者自动成为管理员”。
const BOOTSTRAP_ADMIN_OPENIDS = ["REPLACE_WITH_NANLIAN_ADMIN_OPENID"];
const COLLECTIONS = ["users", "students", "classes", "sessions", "enrollments", "waitlist", "leaveRequests", "attendance", "lessonLedger", "feedback", "renewals", "invites", "auditLogs"];
const DEDUCTION = { present: 1, absent: 1, leave: 0, sick: 0 };
const PACKAGES = {
  p14: { name: "一周一练", lessons: 14, amount: 1380 },
  p28: { name: "一周两练", lessons: 28, amount: 1980 }
};
let collectionsReady;

function nowText() { return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 16); }
function todayText() { return nowText().slice(0, 10); }
function publicDoc(doc) { if (!doc) return doc; const value = { ...doc, id: doc._id }; delete value._id; delete value.openid; return value; }
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
async function audit(user, action, targetType, targetId, detail) { await db.collection("auditLogs").add({ data: { userId: user._id, role: user.role, action, targetType, targetId, detail: String(detail || ""), createdAt: nowText() } }); }
async function allowedStudentIds(user) {
  if (user.role === "admin") return null;
  if (user.role === "parent") return user.studentIds || [];
  const classes = await fetchByIds("classes", user.classIds || []); return [...new Set(classes.flatMap((item) => item.studentIds || []))];
}
async function assertStudentAccess(user, studentId) { const allowed = await allowedStudentIds(user); if (allowed && !allowed.includes(studentId)) throw new Error("无权访问该学员"); }

async function listStudents(user) {
  const allowed = await allowedStudentIds(user); if (allowed && !allowed.length) return [];
  const students = allowed === null ? await fetchAll("students", { status: "active" }) : (await fetchByIds("students", allowed)).filter((item) => item.status === "active");
  const classes = await fetchAll("classes", { active: true });
  return students.map((student) => ({ ...publicDoc(student), initial: student.name ? student.name[0] : "学", classNames: classes.filter((item) => (student.classIds || []).includes(item._id)).map((item) => item.name).join("、") }));
}
async function listClasses(user) {
  let classes;
  if (user.role === "admin") classes = await fetchAll("classes", { active: true });
  else if (user.role === "coach") classes = (await fetchByIds("classes", user.classIds || [])).filter((item) => item.active);
  else { const students = await listStudents(user); classes = await fetchByIds("classes", [...new Set(students.flatMap((item) => item.classIds || []))]); }
  return classes.map((item) => ({ ...publicDoc(item), studentCount: (item.studentIds || []).length }));
}
async function getStudent(user, id) {
  await assertStudentAccess(user, id); const student = (await db.collection("students").doc(id).get()).data;
  const [classes, attendance, renewals, feedback, ledger] = await Promise.all([
    fetchByIds("classes", student.classIds || []),
    db.collection("attendance").where({ studentId: id }).orderBy("date", "desc").limit(50).get(),
    user.role === "coach" ? Promise.resolve({ data: [] }) : db.collection("renewals").where({ studentId: id }).orderBy("createdAt", "desc").limit(50).get(),
    db.collection("feedback").where({ studentId: id }).orderBy("createdAt", "desc").limit(50).get(),
    db.collection("lessonLedger").where({ studentId: id }).orderBy("createdAt", "desc").limit(100).get()
  ]);
  return { ...publicDoc(student), initial: student.name ? student.name[0] : "学", classes: classes.map(publicDoc), attendance: attendance.data.map(publicDoc), renewals: renewals.data.map(publicDoc), feedback: feedback.data.map(publicDoc), lessonLedger: ledger.data.map(publicDoc) };
}
async function saveStudent(user, payload) {
  requireRole(user, ["admin"]); const classIds = payload.classIds || [];
  const data = { name: String(payload.name || "").trim(), gender: payload.gender || "男", birthDate: payload.birthDate || "", guardianName: String(payload.guardianName || "").trim(), guardianPhone: String(payload.guardianPhone || ""), emergencyContact: String(payload.emergencyContact || ""), healthNotes: String(payload.healthNotes || ""), classIds, status: "active", updatedAt: nowText() };
  if (!data.name || !data.guardianName || !/^1\d{10}$/.test(data.guardianPhone)) throw new Error("请完整填写学员和家长信息");
  let id = payload.id;
  if (id) await db.collection("students").doc(id).update({ data });
  else { const lessons = Math.max(0, Number(payload.remainingLessons || 0)); const added = await db.collection("students").add({ data: { ...data, remainingLessons: lessons, totalLessons: lessons, createdAt: nowText() } }); id = added._id; if (lessons) await db.collection("lessonLedger").add({ data: { studentId: id, type: "opening", delta: lessons, balanceAfter: lessons, referenceType: "student", referenceId: id, note: "建档期初课时", createdAt: nowText() } }); }
  const classes = await fetchAll("classes", { active: true });
  await Promise.all(classes.map((item) => { const current = item.studentIds || []; const selected = classIds.includes(item._id); const next = selected ? [...new Set([...current, id])] : current.filter((value) => value !== id); if (JSON.stringify(next) === JSON.stringify(current)) return Promise.resolve(); return db.collection("classes").doc(item._id).update({ data: { studentIds: next, updatedAt: nowText() } }); }));
  await audit(user, "saveStudent", "student", id, data.name); return { id };
}
async function getClass(user, id) { requireRole(user, ["admin"]); return publicDoc((await db.collection("classes").doc(id).get()).data); }
async function saveClass(user, payload) {
  requireRole(user, ["admin"]); const data = { name: String(payload.name || "").trim(), group: String(payload.group || ""), coachName: String(payload.coachName || "").trim(), schedule: String(payload.schedule || ""), venue: String(payload.venue || ""), studentIds: payload.studentIds || [], active: true, updatedAt: nowText() };
  if (!data.name || !data.coachName || !data.schedule || !data.venue) throw new Error("班级信息不完整"); let id = payload.id;
  if (id) await db.collection("classes").doc(id).update({ data }); else { const added = await db.collection("classes").add({ data: { ...data, createdAt: nowText() } }); id = added._id; }
  const students = await fetchAll("students", { status: "active" }); await Promise.all(students.map((student) => { const current = student.classIds || []; const selected = data.studentIds.includes(student._id); const next = selected ? [...new Set([...current, id])] : current.filter((value) => value !== id); if (JSON.stringify(next) === JSON.stringify(current)) return Promise.resolve(); return db.collection("students").doc(student._id).update({ data: { classIds: next, updatedAt: nowText() } }); }));
  await audit(user, "saveClass", "class", id, data.name); return { id };
}

async function sessionAccess(user, session) { if (user.role === "coach" && !(user.classIds || []).includes(session.classId)) throw new Error("无权管理该课程"); }
async function decorateSession(session, studentId) {
  const [count, enrollment, waiting, leave] = await Promise.all([
    db.collection("enrollments").where({ sessionId: session._id, status: "booked" }).count(),
    studentId ? db.collection("enrollments").where({ sessionId: session._id, studentId, status: "booked" }).limit(1).get() : Promise.resolve({ data: [] }),
    db.collection("waitlist").where({ sessionId: session._id, status: "waiting" }).orderBy("createdAt", "asc").limit(100).get(),
    studentId ? db.collection("leaveRequests").where({ sessionId: session._id, studentId, status: "pending" }).limit(1).get() : Promise.resolve({ data: [] })
  ]);
  const position = studentId ? waiting.data.findIndex((item) => item.studentId === studentId) + 1 : 0;
  return { ...publicDoc(session), enrolledCount: count.total, remaining: Math.max(0, Number(session.capacity || 0) - count.total), myStatus: leave.data.length ? "leave_pending" : enrollment.data.length ? "booked" : position ? "waiting" : "none", waitlistPosition: position };
}
async function listSessions(user, input) {
  let sessions = await fetchAll("sessions"); if (user.role === "parent") sessions = sessions.filter((item) => item.status === "published"); if (user.role === "coach") sessions = sessions.filter((item) => (user.classIds || []).includes(item.classId));
  const studentId = input.studentId || (user.studentIds || [])[0]; const rows = []; for (const session of sessions.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))) rows.push(await decorateSession(session, studentId)); return rows;
}
async function getSession(user, id, studentId) {
  const session = (await db.collection("sessions").doc(validId(id)).get()).data; if (user.role === "parent" && session.status !== "published") throw new Error("课程尚未发布"); await sessionAccess(user, session);
  const decorated = await decorateSession(session, studentId || (user.studentIds || [])[0]); if (user.role === "parent") return decorated;
  const [enrollments, waiting] = await Promise.all([db.collection("enrollments").where({ sessionId: id, status: "booked" }).limit(100).get(), db.collection("waitlist").where({ sessionId: id, status: "waiting" }).orderBy("createdAt", "asc").limit(100).get()]);
  const students = await fetchByIds("students", [...enrollments.data, ...waiting.data].map((item) => item.studentId));
  return { ...decorated, enrollments: enrollments.data.map((item) => ({ ...publicDoc(item), student: publicDoc(students.find((s) => s._id === item.studentId)) })), waiting: waiting.data.map((item, index) => ({ ...publicDoc(item), position: index + 1, student: publicDoc(students.find((s) => s._id === item.studentId)) })) };
}
async function saveSession(user, payload) {
  requireRole(user, ["admin"]); const data = { classId: validId(payload.classId), title: String(payload.title || "").trim(), date: String(payload.date || ""), weekday: String(payload.weekday || ""), time: String(payload.time || ""), venue: String(payload.venue || ""), coachName: String(payload.coachName || ""), focus: String(payload.focus || ""), capacity: Math.max(1, Number(payload.capacity || 20)), enrollmentMode: payload.enrollmentMode || "open", status: payload.status || "published", updatedAt: nowText() };
  if (!data.title || !data.date || !data.time || !data.venue) throw new Error("课程信息不完整"); let id = payload.id;
  if (id) await db.collection("sessions").doc(id).update({ data }); else { const added = await db.collection("sessions").add({ data: { ...data, createdAt: nowText() } }); id = added._id; }
  await audit(user, "saveSession", "session", id, data.title); return { id };
}
async function enrollSession(user, input) {
  requireRole(user, ["admin", "parent"]); const studentId = validId(input.studentId || (user.studentIds || [])[0]); await assertStudentAccess(user, studentId);
  const result = await db.runTransaction(async (transaction) => {
    const session = (await transaction.collection("sessions").doc(validId(input.sessionId)).get()).data; if (session.status !== "published") throw new Error("课程暂不可报名"); if (session.enrollmentMode === "fixed" && user.role !== "admin") throw new Error("固定梯队课程由管理员统一排入"); const student = (await transaction.collection("students").doc(studentId).get()).data; if (Number(student.remainingLessons || 0) <= 0) throw new Error("剩余课时不足，请先续费");
    const duplicate = await transaction.collection("enrollments").where({ sessionId: input.sessionId, studentId, status: "booked" }).limit(1).get(); if (duplicate.data.length) return { status: "booked", message: "已报名" };
    const enrolled = await transaction.collection("enrollments").where({ sessionId: input.sessionId, status: "booked" }).count();
    if (enrolled.total >= Number(session.capacity || 0)) { const waiting = await transaction.collection("waitlist").where({ sessionId: input.sessionId, studentId, status: "waiting" }).limit(1).get(); if (!waiting.data.length) await transaction.collection("waitlist").add({ data: { sessionId: input.sessionId, studentId, status: "waiting", createdAt: nowText() } }); return { status: "waiting", message: "名额已满，已加入候补" }; }
    await transaction.collection("enrollments").add({ data: { sessionId: input.sessionId, studentId, status: "booked", createdAt: nowText(), creatorId: user._id } }); return { status: "booked", message: "报名成功" };
  }); await audit(user, result.status === "waiting" ? "joinWaitlist" : "enroll", "session", input.sessionId, studentId); return result;
}
async function requestLeave(user, input) {
  requireRole(user, ["admin", "parent"]); const studentId = validId(input.studentId || (user.studentIds || [])[0]); await assertStudentAccess(user, studentId);
  const enrollment = await db.collection("enrollments").where({ sessionId: validId(input.sessionId), studentId, status: "booked" }).limit(1).get(); if (!enrollment.data.length) throw new Error("该学员尚未报名"); const duplicate = await db.collection("leaveRequests").where({ sessionId: input.sessionId, studentId, status: "pending" }).limit(1).get(); if (duplicate.data.length) throw new Error("请假申请已提交");
  const added = await db.collection("leaveRequests").add({ data: { sessionId: input.sessionId, studentId, reason: String(input.reason || "家长请假"), status: "pending", createdAt: nowText(), creatorId: user._id } }); await audit(user, "requestLeave", "leave", added._id, input.reason); return { id: added._id };
}
async function listLeaveRequests(user) {
  let rows = await fetchAll("leaveRequests"); if (user.role === "parent") rows = rows.filter((item) => (user.studentIds || []).includes(item.studentId)); if (user.role === "coach") { const sessions = await fetchByIds("sessions", rows.map((item) => item.sessionId)); const allowed = new Set(sessions.filter((item) => (user.classIds || []).includes(item.classId)).map((item) => item._id)); rows = rows.filter((item) => allowed.has(item.sessionId)); }
  const [students, sessions] = await Promise.all([fetchByIds("students", rows.map((item) => item.studentId)), fetchByIds("sessions", rows.map((item) => item.sessionId))]); return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({ ...publicDoc(item), student: publicDoc(students.find((s) => s._id === item.studentId)), session: publicDoc(sessions.find((s) => s._id === item.sessionId)) }));
}
async function promoteWaitlist(sessionId) {
  const next = (await db.collection("waitlist").where({ sessionId, status: "waiting" }).orderBy("createdAt", "asc").limit(1).get()).data[0]; if (!next) return null;
  return db.runTransaction(async (transaction) => { const current = (await transaction.collection("waitlist").doc(next._id).get()).data; if (current.status !== "waiting") return null; await transaction.collection("waitlist").doc(next._id).update({ data: { status: "promoted", promotedAt: nowText() } }); await transaction.collection("enrollments").add({ data: { sessionId, studentId: current.studentId, status: "booked", source: "waitlist", createdAt: nowText() } }); return current.studentId; });
}
async function reviewLeave(user, input) {
  requireRole(user, ["admin", "coach"]); const request = (await db.collection("leaveRequests").doc(validId(input.id)).get()).data; if (request.status !== "pending") throw new Error("申请状态已变化"); const session = (await db.collection("sessions").doc(request.sessionId).get()).data; await sessionAccess(user, session); const status = input.approved ? "approved" : "rejected";
  await db.runTransaction(async (transaction) => { const current = (await transaction.collection("leaveRequests").doc(input.id).get()).data; if (current.status !== "pending") throw new Error("申请状态已变化"); await transaction.collection("leaveRequests").doc(input.id).update({ data: { status, reviewedAt: nowText(), reviewerId: user._id, reviewNote: String(input.note || "") } }); if (input.approved) { const enrollment = await transaction.collection("enrollments").where({ sessionId: request.sessionId, studentId: request.studentId, status: "booked" }).limit(1).get(); if (enrollment.data.length) await transaction.collection("enrollments").doc(enrollment.data[0]._id).update({ data: { status: "leave", updatedAt: nowText() } }); } });
  const promotedStudentId = input.approved ? await promoteWaitlist(request.sessionId) : null; await audit(user, "reviewLeave", "leave", input.id, status); return { ok: true, promotedStudentId };
}

async function getAttendanceSheet(user, input) {
  requireRole(user, ["admin", "coach"]); const session = (await db.collection("sessions").doc(validId(input.sessionId)).get()).data; await sessionAccess(user, session);
  const enrollments = await db.collection("enrollments").where({ sessionId: input.sessionId, status: "booked" }).limit(100).get(); const students = await fetchByIds("students", enrollments.data.map((item) => item.studentId)); const records = await db.collection("attendance").where({ sessionId: input.sessionId }).limit(100).get();
  return { session: publicDoc(session), date: session.date, students: students.map((student) => { const record = records.data.find((item) => item.studentId === student._id); return { ...publicDoc(student), initial: student.name ? student.name[0] : "学", attendanceStatus: record ? record.status : "unmarked" }; }) };
}
async function submitAttendance(user, input) {
  requireRole(user, ["admin", "coach"]); const session = (await db.collection("sessions").doc(validId(input.sessionId)).get()).data; await sessionAccess(user, session); const enrolled = await db.collection("enrollments").where({ sessionId: input.sessionId, status: "booked" }).limit(100).get(); const allowed = new Set(enrolled.data.map((item) => item.studentId));
  for (const record of input.records || []) {
    if (!allowed.has(record.studentId)) throw new Error("点名名单包含非报名学员"); if (!(record.status in DEDUCTION)) throw new Error("无效出勤状态");
    await db.runTransaction(async (transaction) => { const existing = (await transaction.collection("attendance").where({ sessionId: input.sessionId, studentId: record.studentId }).limit(1).get()).data[0]; const previous = existing ? Number(existing.deductedLessons || 0) : 0; const next = DEDUCTION[record.status]; const delta = previous - next; if (existing) await transaction.collection("attendance").doc(existing._id).update({ data: { status: record.status, deductedLessons: next, updatedAt: nowText(), operatorId: user._id } }); else await transaction.collection("attendance").add({ data: { sessionId: input.sessionId, classId: session.classId, studentId: record.studentId, date: session.date, status: record.status, deductedLessons: next, createdAt: nowText(), operatorId: user._id } }); if (delta) { const student = (await transaction.collection("students").doc(record.studentId).get()).data; const balance = Number(student.remainingLessons || 0) + delta; await transaction.collection("students").doc(record.studentId).update({ data: { remainingLessons: balance, updatedAt: nowText() } }); await transaction.collection("lessonLedger").add({ data: { studentId: record.studentId, type: delta < 0 ? "attendance" : "attendance_adjustment", delta, balanceAfter: balance, referenceType: "session", referenceId: input.sessionId, note: `${session.title} ${record.status}`, createdAt: nowText(), operatorId: user._id } }); } });
  }
  await audit(user, "submitAttendance", "session", input.sessionId, `${(input.records || []).length}人`); return { ok: true };
}
async function getLessonLedger(user, studentId) { await assertStudentAccess(user, studentId); return (await db.collection("lessonLedger").where({ studentId }).orderBy("createdAt", "desc").limit(100).get()).data.map(publicDoc); }
async function listFeedback(user, input) {
  const allowed = await allowedStudentIds(user); let rows = input.studentId ? (await db.collection("feedback").where({ studentId: input.studentId }).orderBy("createdAt", "desc").limit(100).get()).data : await fetchAll("feedback"); if (allowed) rows = rows.filter((item) => allowed.includes(item.studentId)); const [students, sessions] = await Promise.all([fetchByIds("students", rows.map((item) => item.studentId)), fetchByIds("sessions", rows.map((item) => item.sessionId))]); return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({ ...publicDoc(item), student: publicDoc(students.find((s) => s._id === item.studentId)), session: publicDoc(sessions.find((s) => s._id === item.sessionId)) }));
}
async function saveFeedback(user, input) {
  requireRole(user, ["admin", "coach"]); const session = (await db.collection("sessions").doc(validId(input.sessionId)).get()).data; await sessionAccess(user, session); if (user.role === "coach") { const enrolled = await db.collection("enrollments").where({ sessionId: input.sessionId, studentId: input.studentId, status: "booked" }).limit(1).get(); if (!enrolled.data.length) throw new Error("该学员不在课程名单中"); }
  const content = String(input.content || "").trim(); if (!content) throw new Error("请填写训练反馈"); const added = await db.collection("feedback").add({ data: { sessionId: input.sessionId, studentId: validId(input.studentId), coachName: user.name, rating: Math.max(1, Math.min(5, Number(input.rating || 4))), tags: input.tags || [], content, createdAt: nowText(), operatorId: user._id } }); await audit(user, "saveFeedback", "feedback", added._id, input.studentId); return { id: added._id };
}

async function listRenewals(user) {
  if (user.role === "coach") return []; let rows = await fetchAll("renewals"); if (user.role === "parent") rows = rows.filter((item) => (user.studentIds || []).includes(item.studentId)); const students = await fetchByIds("students", rows.map((item) => item.studentId)); return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({ ...publicDoc(item), studentName: (students.find((student) => student._id === item.studentId) || {}).name || "" }));
}
async function createRenewal(user, input) { requireRole(user, ["admin", "parent"]); const studentId = input.studentId || (user.studentIds || [])[0]; await assertStudentAccess(user, studentId); const pack = PACKAGES[input.packageId]; if (!pack) throw new Error("续费套餐无效"); const added = await db.collection("renewals").add({ data: { studentId, packageId: input.packageId, ...pack, status: "pending", createdAt: nowText(), creatorId: user._id } }); return { id: added._id }; }
async function confirmRenewal(user, id) {
  requireRole(user, ["admin"]); await db.runTransaction(async (transaction) => { const renewal = (await transaction.collection("renewals").doc(validId(id)).get()).data; if (renewal.status !== "pending") throw new Error("订单状态已变化"); const student = (await transaction.collection("students").doc(renewal.studentId).get()).data; const balance = Number(student.remainingLessons || 0) + Number(renewal.lessons || 0); await transaction.collection("renewals").doc(id).update({ data: { status: "paid", paidAt: nowText(), operatorId: user._id } }); await transaction.collection("students").doc(renewal.studentId).update({ data: { remainingLessons: balance, totalLessons: Number(student.totalLessons || 0) + Number(renewal.lessons || 0), updatedAt: nowText() } }); await transaction.collection("lessonLedger").add({ data: { studentId: renewal.studentId, type: "purchase", delta: Number(renewal.lessons), balanceAfter: balance, referenceType: "renewal", referenceId: id, note: `${renewal.name || "课包"}到账`, createdAt: nowText(), operatorId: user._id } }); }); await audit(user, "confirmRenewal", "renewal", id, "paid"); return { ok: true };
}
async function createInvite(user, input) { requireRole(user, ["admin"]); if (!["parent", "coach"].includes(input.role)) throw new Error("邀请角色无效"); const code = String(Math.floor(100000 + Math.random() * 900000)); const expiresAt = Date.now() + 24 * 60 * 60 * 1000; await db.collection("invites").add({ data: { code, role: input.role, studentId: input.studentId || "", classId: input.classId || "", displayName: String(input.displayName || ""), status: "active", expiresAt, createdAt: nowText(), creatorId: user._id } }); return { code, expiresAt }; }
async function claimInvite(user, code) {
  const found = await db.collection("invites").where({ code: String(code || "").trim(), status: "active" }).limit(1).get(); const invite = found.data[0]; if (!invite || Number(invite.expiresAt || 0) < Date.now()) throw new Error("邀请码无效或已过期");
  await db.runTransaction(async (transaction) => { const current = (await transaction.collection("invites").doc(invite._id).get()).data; if (current.status !== "active" || Number(current.expiresAt || 0) < Date.now()) throw new Error("邀请码已经使用"); const update = { role: current.role, name: current.displayName || user.name, updatedAt: nowText() }; if (current.role === "parent") update.studentIds = [...new Set([...(user.studentIds || []), current.studentId].filter(Boolean))]; if (current.role === "coach") update.classIds = [...new Set([...(user.classIds || []), current.classId].filter(Boolean))]; await transaction.collection("users").doc(user._id).update({ data: update }); await transaction.collection("invites").doc(invite._id).update({ data: { status: "used", usedBy: user._id, usedAt: nowText() } }); }); return { ok: true, role: invite.role };
}

async function getDashboard(user) {
  const [students, classes, sessions, renewals, leaves] = await Promise.all([listStudents(user), listClasses(user), listSessions(user, {}), listRenewals(user), listLeaveRequests(user)]); const studentIds = students.map((item) => item.id); let todayAttendance = 0;
  if (studentIds.length) { const batches = []; for (let i = 0; i < studentIds.length; i += 100) batches.push(db.collection("attendance").where({ date: todayText(), studentId: command.in(studentIds.slice(i, i + 100)) }).count()); todayAttendance = (await Promise.all(batches)).reduce((sum, item) => sum + item.total, 0); }
  return { role: user.role, studentCount: students.length, classCount: classes.length, lowBalance: students.filter((item) => Number(item.remainingLessons) <= 5).length, pendingRenewals: renewals.filter((item) => item.status === "pending").length, todayAttendance, pendingLeaves: leaves.filter((item) => item.status === "pending").length, waitlistCount: sessions.reduce((sum, item) => sum + (item.waitlistPosition ? 1 : 0), 0), recentStudents: [...students].sort((a, b) => Number(a.remainingLessons) - Number(b.remainingLessons)).slice(0, 3), classes, sessions: sessions.slice(0, 4) };
}
async function getOperationsDashboard(user) {
  requireRole(user, ["admin", "coach"]); const [dashboard, leaves, renewals, logs, waitingRows] = await Promise.all([getDashboard(user), listLeaveRequests(user), listRenewals(user), db.collection("auditLogs").orderBy("createdAt", "desc").limit(30).get(), fetchAll("waitlist", { status: "waiting" })]); let waiting = waitingRows; if (user.role === "coach") { const sessions = await fetchByIds("sessions", waiting.map((item) => item.sessionId)); const allowed = new Set(sessions.filter((item) => (user.classIds || []).includes(item.classId)).map((item) => item._id)); waiting = waiting.filter((item) => allowed.has(item.sessionId)); } return { metrics: { students: dashboard.studentCount, sessions: dashboard.sessions.length, booked: dashboard.sessions.reduce((sum, item) => sum + item.enrolledCount, 0), pendingLeaves: leaves.filter((item) => item.status === "pending").length, waiting: waiting.length, pendingRenewals: renewals.filter((item) => item.status === "pending").length }, alerts: [{ level: "warning", text: "请确认三江秋季场地时段" }, { level: "danger", text: `${dashboard.lowBalance}名学员课时不足5节` }], sessions: dashboard.sessions, auditLogs: logs.data.map(publicDoc) };
}

exports.main = async (event) => {
  try {
    await ensureCollections(); const user = await ensureUser(cloud.getWXContext().OPENID); const input = event.data || {}; let data;
    switch (event.action) {
      case "getContext": data = { mode: "cloud", user: { id: user._id, role: user.role, name: user.name }, needsBinding: user.role !== "admin" && !(user.studentIds || []).length && !(user.classIds || []).length }; break;
      case "getDashboard": data = await getDashboard(user); break;
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
      case "listLeaveRequests": data = await listLeaveRequests(user); break;
      case "reviewLeave": data = await reviewLeave(user, input); break;
      case "getAttendanceSheet": data = await getAttendanceSheet(user, input); break;
      case "submitAttendance": data = await submitAttendance(user, input); break;
      case "getLessonLedger": data = await getLessonLedger(user, input.studentId); break;
      case "listFeedback": data = await listFeedback(user, input); break;
      case "saveFeedback": data = await saveFeedback(user, input); break;
      case "listRenewals": data = await listRenewals(user); break;
      case "createRenewal": data = await createRenewal(user, input); break;
      case "confirmRenewal": data = await confirmRenewal(user, input.id); break;
      case "createInvite": data = await createInvite(user, input); break;
      case "claimInvite": data = await claimInvite(user, input.code); break;
      default: throw new Error("未知操作");
    }
    return { success: true, data };
  } catch (error) { console.error(error); return { success: false, message: error.message || "服务异常" }; }
};
