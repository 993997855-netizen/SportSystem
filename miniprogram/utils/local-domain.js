const { today } = require("./format");
const crm = require("./crm-domain");
const classesV3 = require("./class-domain");

const STORAGE_KEY = "nanlianClubV2";
const PACKAGES = {
  p14: { name: "一周一练", lessons: 14, amount: 1380 },
  p28: { name: "一周两练", lessons: 28, amount: 1980 }
};
const DEDUCTION = { present: 1, absent: 1, leave: 0, sick: 0 };

function seed() {
  const demoStudents = Array.from({ length: 18 }, (_, index) => {
    const number = index + 5;
    return { id: `s${number}`, name: `U7演示学员${String(index + 1).padStart(2, "0")}`, gender: index % 3 === 0 ? "女" : "男", birthDate: `2017-${String(index % 12 + 1).padStart(2, "0")}-15`, guardianName: `家长${index + 1}`, guardianPhone: `1350000${String(index + 1).padStart(4, "0")}`, emergencyContact: `家长${index + 1} 1350000${String(index + 1).padStart(4, "0")}`, healthNotes: "无", remainingLessons: 14, totalLessons: 14, classIds: ["cu7base"], status: "active" };
  });
  const fullU7MemberIds = ["s1", "s2", ...demoStudents.map((item) => item.id)];
  return {
    students: [
      { id: "s1", name: "陈小南", gender: "男", birthDate: "2017-03-18", guardianName: "陈女士", guardianPhone: "13800001203", emergencyContact: "陈先生 13900001203", healthNotes: "无", remainingLessons: 19, totalLessons: 28, classIds: ["cu7base", "c1718"], status: "active" },
      { id: "s2", name: "周子航", gender: "男", birthDate: "2017-11-02", guardianName: "周先生", guardianPhone: "13600009081", emergencyContact: "周女士 13700009081", healthNotes: "左膝旧伤，训练前加强热身", remainingLessons: 4, totalLessons: 28, classIds: ["cu7base", "c1718"], status: "active" },
      { id: "s3", name: "林一诺", gender: "女", birthDate: "2016-07-09", guardianName: "林女士", guardianPhone: "13900006618", emergencyContact: "林先生 13800006618", healthNotes: "无", remainingLessons: 11, totalLessons: 14, classIds: ["cu8advanced", "c1516"], status: "active" },
      { id: "s4", name: "王奕辰", gender: "男", birthDate: "2019-09-23", guardianName: "王先生", guardianPhone: "13700004329", emergencyContact: "王女士 13600004329", healthNotes: "近期脚踝轻微不适", remainingLessons: 2, totalLessons: 14, classIds: ["cinterest"], status: "active" }
      , ...demoStudents
    ],
    classes: [
      { id: "cinterest", name: "U6启蒙班", classType: "REGULAR", ageGroup: "U6 / 2019-2020", standardCapacity: 16, group: "启蒙班", headCoachName: "王蒋生", coachName: "王蒋生", assistantCoachName: "", coachUserId: "coach2", schedule: "周五 19:00-20:30", venue: "瓯北中心小学", status: "ACTIVE", remark: "兴趣启蒙与球感培养", studentIds: ["s4"], active: true },
      { id: "cu7base", name: "U7基础班", classType: "REGULAR", ageGroup: "U7 / 2017", standardCapacity: 20, group: "基础班", headCoachName: "王蒋生", coachName: "王蒋生", assistantCoachName: "张教练", coachUserId: "coach2", schedule: "周三 19:00-20:30", venue: "瓯北中心小学", status: "ACTIVE", remark: "演示满员普通班", studentIds: fullU7MemberIds, active: true },
      { id: "cu8advanced", name: "U8提高班", classType: "REGULAR", ageGroup: "U8 / 2016", standardCapacity: 20, group: "提高班", headCoachName: "游导", coachName: "游导", assistantCoachName: "王蒋生", coachUserId: "coach1", schedule: "周一/三 19:00-20:30", venue: "瓯北中心小学", status: "ACTIVE", remark: "技术提高与比赛衔接", studentIds: ["s3"], active: true },
      { id: "c1718", name: "U7精英队", classType: "ELITE", ageGroup: "U7 / 2017", standardCapacity: 18, group: "丙组梯队", headCoachName: "游导", coachName: "游导", assistantCoachName: "王蒋生", coachUserId: "coach1", schedule: "周二/四/六 15:00-17:00", venue: "三江南联球场", status: "ACTIVE", remark: "俱乐部选拔制", studentIds: ["s1", "s2"], active: true },
      { id: "c1516", name: "U8精英队", classType: "ELITE", ageGroup: "U8 / 2016", standardCapacity: 18, group: "乙组梯队", headCoachName: "游导", coachName: "游导", assistantCoachName: "", coachUserId: "coach1", schedule: "周一/三/五 19:00-20:30", venue: "瓯北中心小学", status: "ACTIVE", remark: "俱乐部选拔制", studentIds: ["s3"], active: true }
    ],
    sessions: [
      { id: "se1", classId: "c1718", title: "17/18精英班", date: "2026-08-20", weekday: "周四", time: "15:00-17:00", venue: "三江南联球场", coachName: "游导", focus: "一对一突破与攻防转换", capacity: 20, status: "published", enrollmentMode: "open" },
      { id: "se2", classId: "cinterest", title: "兴趣成长班", date: "2026-08-21", weekday: "周五", time: "19:00-20:30", venue: "瓯北中心小学", coachName: "王蒋生", focus: "球感、运球与小场比赛", capacity: 2, status: "published", enrollmentMode: "open" },
      { id: "se3", classId: "c1516", title: "15/16精英班", date: "2026-08-22", weekday: "周六", time: "09:00-11:00", venue: "瓯北中心小学", coachName: "游导", focus: "高压下的接应与传控", capacity: 18, status: "published", enrollmentMode: "fixed" }
    ],
    enrollments: [
      { id: "e1", sessionId: "se1", studentId: "s1", status: "booked", createdAt: "2026-08-18 10:00" },
      { id: "e2", sessionId: "se1", studentId: "s2", status: "booked", createdAt: "2026-08-18 10:10" },
      { id: "e3", sessionId: "se2", studentId: "s3", status: "booked", createdAt: "2026-08-18 11:00" },
      { id: "e4", sessionId: "se2", studentId: "s4", status: "booked", createdAt: "2026-08-18 11:10" },
      { id: "e5", sessionId: "se3", studentId: "s3", status: "booked", createdAt: "2026-08-18 12:00" }
    ],
    waitlist: [{ id: "w1", sessionId: "se2", studentId: "s1", status: "waiting", createdAt: "2026-08-18 12:20" }],
    leaveRequests: [{ id: "l1", sessionId: "se1", studentId: "s2", reason: "家庭安排冲突", status: "pending", createdAt: "2026-08-19 09:20" }],
    attendance: [
      { id: "a1", sessionId: "history1", classId: "c1718", studentId: "s1", date: "2026-08-18", status: "present", deductedLessons: 1 },
      { id: "a2", sessionId: "history1", classId: "c1718", studentId: "s2", date: "2026-08-18", status: "leave", deductedLessons: 0 }
    ],
    lessonLedger: [
      { id: "tx1", studentId: "s1", type: "purchase", delta: 28, balanceAfter: 28, referenceType: "renewal", referenceId: "seed1", note: "暑期一周两练课包", createdAt: "2026-07-01 10:00" },
      { id: "tx2", studentId: "s1", type: "attendance", delta: -1, balanceAfter: 19, referenceType: "attendance", referenceId: "a1", note: "17/18精英班到课", createdAt: "2026-08-18 17:10" },
      { id: "tx3", studentId: "s2", type: "purchase", delta: 28, balanceAfter: 28, referenceType: "renewal", referenceId: "seed2", note: "暑期一周两练课包", createdAt: "2026-07-01 10:05" }
    ],
    feedback: [{ id: "f1", sessionId: "history1", studentId: "s1", coachName: "游导", rating: 4, tags: ["突破积极", "第一脚进步"], content: "敢于向前突破，下一阶段重点观察突破后的抬头和传球时机。", createdAt: "2026-08-18 18:00" }],
    renewals: [{ id: "r1", studentId: "s4", packageId: "p28", lessons: 28, amount: 1980, status: "pending", createdAt: "2026-08-18 14:20" }],
    eliteSelections: [
      { id: "es-pending", studentId: "s4", fromClassId: "cinterest", targetEliteClassId: "c1718", recommendationSource: "COACH_RECOMMENDATION", recommendedBy: "coach2", recommenderName: "王蒋生", recommendationReason: "训练态度积极，球感进步明显，建议跟训观察。", status: "PENDING", createdAt: "2026-08-19 10:00", updatedAt: "2026-08-19 10:00" },
      { id: "es-approved", studentId: "s1", fromClassId: "cu7base", targetEliteClassId: "c1718", recommendationSource: "COACH_RECOMMENDATION", recommendedBy: "coach1", recommenderName: "游导", recommendationReason: "1V1突破能力突出，比赛表现稳定。", status: "APPROVED", reviewedBy: "admin", reviewRemark: "同意入选并保留普通班", createdAt: "2026-08-10 10:00", reviewedAt: "2026-08-11 09:00", updatedAt: "2026-08-11 09:00" },
      { id: "es-rejected", studentId: "s3", fromClassId: "cu8advanced", targetEliteClassId: "c1516", recommendationSource: "COACH_RECOMMENDATION", recommendedBy: "coach1", recommenderName: "游导", recommendationReason: "建议进入精英队观察。", status: "REJECTED", reviewedBy: "admin", reviewRemark: "先继续提高班训练一个阶段", createdAt: "2026-08-08 10:00", reviewedAt: "2026-08-09 09:00", updatedAt: "2026-08-09 09:00" }
    ],
    auditLogs: []
  };
}

function load() {
  let data = wx.getStorageSync(STORAGE_KEY);
  if (!data || !data.sessions || !data.lessonLedger) { data = seed(); save(data); }
  if (!data.leads) { crm.ensure(data, today()); save(data); }
  classesV3.ensure(data, { uid, stamp });
  save(data);
  return data;
}
function save(data) { wx.setStorageSync(STORAGE_KEY, data); }
function uid(prefix) { return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`; }
function stamp() { return `${today()} ${new Date().toTimeString().slice(0, 5)}`; }
function assertRole(role, allowed) { if (!allowed.includes(role)) throw new Error("没有执行该操作的权限"); }
function roleClassIds(data, role) { return role === "coach" ? ["c1718", "c1516", "cu7base", "cu8advanced"] : data.classes.map((item) => item.id); }
function visibleStudents(data, role) {
  if (role === "admin") return data.students;
  if (role === "parent") return data.students.slice(0, 1);
  const ids = roleClassIds(data, role);
  return data.students.filter((student) => classesV3.activeClassIds(data, student.id).some((id) => ids.includes(id)));
}
function canAccessStudent(data, role, studentId) { return visibleStudents(data, role).some((item) => item.id === studentId); }
function booked(data, sessionId) { return data.enrollments.filter((item) => item.sessionId === sessionId && item.status === "booked"); }
function decorateSession(data, session, studentId) {
  const count = booked(data, session.id).length;
  const trials = crm.trialCount(data, session.id);
  const clubClass = data.classes.find((item) => item.id === session.classId);
  const enrollment = data.enrollments.find((item) => item.sessionId === session.id && item.studentId === studentId && item.status === "booked");
  const waiting = data.waitlist.filter((item) => item.sessionId === session.id && item.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const waitIndex = waiting.findIndex((item) => item.studentId === studentId);
  const leave = data.leaveRequests.filter((item) => item.sessionId === session.id && item.studentId === studentId).sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt)))[0];
  const records = data.attendance.filter((item) => item.sessionId === session.id && booked(data, session.id).some((row) => row.studentId === item.studentId));
  const attendanceStats = { expected: count, present: 0, leave: 0, injured: 0, absent: 0, unmarked: count };
  records.forEach((record) => { const key = record.status === "sick" ? "injured" : record.status; if (key in attendanceStats && key !== "expected" && key !== "unmarked") { attendanceStats[key] += 1; attendanceStats.unmarked = Math.max(0, attendanceStats.unmarked - 1); } });
  const leaveStatus = leave && leave.status === "pending" ? "leave_pending" : leave && leave.status === "approved" ? "leave_approved" : leave && leave.status === "rejected" ? "leave_rejected" : "";
  return { ...session, classType: (clubClass || {}).classType || "REGULAR", classTypeLabel: classesV3.CLASS_TYPES[(clubClass || {}).classType] || "普通班", enrolledCount: count, trialCount: trials, totalCount: count + trials, remaining: Math.max(0, session.capacity - count - trials), isFull: count + trials >= Number(session.capacity || 0), attendanceStats, myStatus: leaveStatus || (enrollment ? "booked" : waitIndex >= 0 ? "waiting_history" : "none"), leaveRequestId: leave ? leave.id : "", waitlistPosition: waitIndex >= 0 ? waitIndex + 1 : 0 };
}
function audit(data, role, action, targetType, targetId, detail) { const fields = detail && typeof detail === "object" ? detail : { detail: String(detail || "") }; data.auditLogs.unshift({ id: uid("log"), role, action, targetType, targetId, ...fields, createdAt: stamp() }); }
function appendLedger(data, studentId, delta, type, referenceType, referenceId, note) {
  const student = data.students.find((item) => item.id === studentId);
  if (!student) throw new Error("未找到学员");
  student.remainingLessons = Number(student.remainingLessons || 0) + Number(delta || 0);
  const item = { id: uid("tx"), studentId, type, delta, balanceAfter: student.remainingLessons, referenceType, referenceId, note, createdAt: stamp() };
  data.lessonLedger.unshift(item);
  return item;
}
function applyAttendanceRecord(data, session, studentId, status, context = {}) {
  if (!(status in DEDUCTION)) throw new Error("无效出勤状态");
  const existing = data.attendance.find((item) => item.sessionId === session.id && item.studentId === studentId);
  const oldStatus = existing ? existing.status : "unmarked";
  const previous = existing ? Number(existing.deductedLessons || 0) : 0;
  const next = DEDUCTION[status];
  const updatedAt = stamp();
  if (existing) Object.assign(existing, { status, deductedLessons: next, source: context.source || existing.source || "ATTENDANCE", leaveRequestId: context.leaveRequestId || existing.leaveRequestId || "", operatorId: context.operatorId || existing.operatorId || "", updatedAt });
  else data.attendance.push({ id: uid("a"), sessionId: session.id, classId: session.classId, studentId, date: session.date || context.date, status, deductedLessons: next, source: context.source || "ATTENDANCE", leaveRequestId: context.leaveRequestId || "", operatorId: context.operatorId || "", createdAt: updatedAt, updatedAt });
  const lessonDelta = previous - next;
  if (lessonDelta) appendLedger(data, studentId, lessonDelta, context.ledgerType || (lessonDelta < 0 ? "attendance" : "attendance_adjustment"), "session", session.id, context.note || `${session.title}${status === "present" ? "到课" : status === "absent" ? "缺勤" : "状态校正"}`);
  return { oldStatus, newStatus: status, lessonDelta };
}
function saveStudentRecord(data, payload) {
  let studentId = payload.id;
  if (studentId) { const index = data.students.findIndex((item) => item.id === studentId); if (index < 0) throw new Error("学员不存在"); const old = data.students[index]; data.students[index] = { ...old, ...payload, remainingLessons: old.remainingLessons, totalLessons: old.totalLessons }; }
  else { const lessons = Math.max(0, Number(payload.remainingLessons || 0)); studentId = uid("s"); data.students.push({ ...payload, id: studentId, remainingLessons: lessons, totalLessons: lessons, classIds: payload.classIds || [], status: "active" }); if (lessons) data.lessonLedger.unshift({ id: uid("tx"), studentId, type: "opening", delta: lessons, balanceAfter: lessons, referenceType: "student", referenceId: studentId, note: "建档期初课时", createdAt: stamp() }); }
  return { id: studentId };
}
function promoteWaitlist(data, sessionId) {
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session || booked(data, sessionId).length + crm.trialCount(data, sessionId) >= session.capacity) return null;
  const next = data.waitlist.filter((item) => item.sessionId === sessionId && item.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!next) return null;
  next.status = "promoted"; next.promotedAt = stamp();
  data.enrollments.push({ id: uid("e"), sessionId, studentId: next.studentId, status: "booked", source: "waitlist", createdAt: stamp() });
  return next.studentId;
}

async function call(action, input = {}) {
  const data = load();
  const role = input.previewRole || "admin";
  const userId = role === "admin" ? "admin" : role === "coach" ? "coach1" : "parent1";
  const userName = role === "admin" ? "南联管理员" : role === "coach" ? "游导" : "陈女士";
  const ownStudentId = visibleStudents(data, role)[0] && visibleStudents(data, role)[0].id;
  const classContext = { data, role, userId, userName, uid, stamp, canAccessStudent: (studentId) => canAccessStudent(data, role, studentId), audit: (nextAction, targetType, targetId, detail) => audit(data, role, nextAction, targetType, targetId, detail), save: () => save(data) };
  if (classesV3.handles(action)) return classesV3.call(action, input, classContext);
  if (crm.handles(action)) return crm.call(action, input, { data, role, userId, userName, today: today(), uid, stamp, audit, save, packages: PACKAGES, createStudent: async (student) => { const classIds = student.classIds || []; const result = saveStudentRecord(data, { ...student, classIds: [] }); for (const classId of classIds) await classesV3.call("addClassMember", { classId, studentId: result.id, source: "ADMIN_ADD", confirmCapacity: true, remark: "CRM转正式学员编班" }, classContext); return result; } });
  switch (action) {
    case "getContext": return { mode: "local", user: { id: userId, name: userName, role }, needsBinding: false };
    case "getDashboard": {
      const students = visibleStudents(data, role); const ids = students.map((item) => item.id); const classIds = roleClassIds(data, role);
      const parentClassIds = students[0] ? classesV3.activeClassIds(data, students[0].id) : [];
      const classes = data.classes.filter((item) => role === "parent" ? parentClassIds.includes(item.id) : classIds.includes(item.id));
      const sessions = data.sessions.filter((item) => item.status === "published" && (role === "parent" || classIds.includes(item.classId))).map((item) => decorateSession(data, item, ownStudentId));
      return { role, studentCount: students.length, classCount: classes.length, lowBalance: students.filter((item) => item.remainingLessons <= 5).length, pendingRenewals: data.renewals.filter((item) => item.status === "pending" && (role === "admin" || ids.includes(item.studentId))).length, todayAttendance: data.attendance.filter((item) => item.date === today() && ids.includes(item.studentId)).length, pendingLeaves: data.leaveRequests.filter((item) => item.status === "pending" && (role === "admin" || ids.includes(item.studentId) || classIds.includes((data.sessions.find((s) => s.id === item.sessionId) || {}).classId))).length, waitlistCount: data.waitlist.filter((item) => item.status === "waiting" && (role !== "parent" || ids.includes(item.studentId))).length, recentStudents: [...students].sort((a, b) => a.remainingLessons - b.remainingLessons).slice(0, 3).map((item) => ({ ...item, initial: item.name[0] })), classes, sessions: sessions.slice(0, 4) };
    }
    case "getOperationsDashboard": {
      assertRole(role, ["admin", "coach"]); const classIds = roleClassIds(data, role);
      const sessions = data.sessions.filter((item) => role === "admin" || classIds.includes(item.classId));
      return { metrics: { students: visibleStudents(data, role).length, sessions: sessions.length, booked: data.enrollments.filter((item) => item.status === "booked" && sessions.some((s) => s.id === item.sessionId)).length, pendingLeaves: data.leaveRequests.filter((item) => item.status === "pending").length, waiting: data.waitlist.filter((item) => item.status === "waiting").length, pendingRenewals: data.renewals.filter((item) => item.status === "pending").length }, alerts: [{ level: "warning", text: "三江秋季周一/三/五场地时段待确认" }, { level: "danger", text: `${data.students.filter((item) => item.remainingLessons <= 5).length}名学员剩余课时不足5节` }, { level: "info", text: "兼职教练证书等级和有效期需要补录" }], sessions: sessions.map((item) => decorateSession(data, item, ownStudentId)), auditLogs: data.auditLogs.slice(0, 20) };
    }
    case "listStudents": return visibleStudents(data, role).map((student) => ({ ...student, classIds: classesV3.activeClassIds(data, student.id), initial: student.name[0], classNames: data.classes.filter((item) => classesV3.activeClassIds(data, student.id).includes(item.id)).map((item) => item.name).join("、") }));
    case "getStudent": {
      if (!canAccessStudent(data, role, input.id)) throw new Error("无权查看该学员");
      const student = data.students.find((item) => item.id === input.id);
      const lead = data.leads.find((item) => item.id === student.crmLeadId || item.convertedStudentId === student.id); const trial = lead && data.trialBookings.filter((item) => item.leadId === lead.id).sort((a, b) => b.trialDate.localeCompare(a.trialDate))[0];
      const activeIds = classesV3.activeClassIds(data, student.id); const selections = (data.eliteSelections || []).filter((item) => item.studentId === student.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const latestSelection = selections[0]; const recommendationStatus = !latestSelection ? "NONE" : latestSelection.status === "APPROVED" ? "SELECTED" : latestSelection.status === "PENDING" ? "RECOMMENDED" : "WATCH";
      return { ...student, classIds: activeIds, initial: student.name[0], classes: data.classes.filter((item) => activeIds.includes(item.id)).map((item) => classesV3.decorateClass(data, item)), eliteSelections: selections.map((item) => ({ ...item, targetClass: data.classes.find((clubClass) => clubClass.id === item.targetEliteClassId), statusLabel: classesV3.SELECTION_STATUS[item.status] || item.status })), eliteRecommendationStatus: recommendationStatus, attendance: data.attendance.filter((item) => item.studentId === input.id).sort((a, b) => b.date.localeCompare(a.date)), renewals: role === "coach" ? [] : data.renewals.filter((item) => item.studentId === input.id), feedback: data.feedback.filter((item) => item.studentId === input.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), lessonLedger: data.lessonLedger.filter((item) => item.studentId === input.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), recruitment: lead ? { source: lead.source, ownerCoachName: lead.ownerCoachName, firstContactAt: lead.createdAt, trialDate: (trial || {}).trialDate || "", trialCoachName: (trial || {}).coachName || "", trialFeedback: ((trial || {}).feedback || {}).summary || "", convertedAt: lead.convertedAt } : null };
    }
    case "saveStudent": {
      assertRole(role, ["admin"]); const payload = input.student || {};
      const result = saveStudentRecord(data, payload); audit(data, role, "saveStudent", "student", result.id, payload.name); save(data); return { ok: true, id: result.id };
    }
    case "listClasses": {
      return data.classes.filter((item) => item.status === "ACTIVE" && (role === "admin" || role === "parent" || roleClassIds(data, role).includes(item.id))).map((item) => classesV3.decorateClass(data, item));
    }
    case "getClass": assertRole(role, ["admin"]); return classesV3.decorateClass(data, data.classes.find((item) => item.id === input.id));
    case "saveClass": {
      assertRole(role, ["admin"]); const payload = input.clubClass; let classId = payload.id;
      const normalized = { ...payload, classType: payload.classType === "ELITE" ? "ELITE" : "REGULAR", ageGroup: String(payload.ageGroup || "").trim(), standardCapacity: Math.max(1, Number(payload.standardCapacity || 20)), headCoachName: String(payload.headCoachName || payload.coachName || "").trim(), coachName: String(payload.headCoachName || payload.coachName || "").trim(), assistantCoachName: String(payload.assistantCoachName || "").trim(), schedule: String(payload.schedule || "").trim(), venue: String(payload.venue || "").trim(), status: payload.status === "INACTIVE" ? "INACTIVE" : "ACTIVE", active: payload.status !== "INACTIVE", remark: String(payload.remark || "").trim() };
      if (!normalized.name || !normalized.ageGroup || !normalized.headCoachName || !normalized.schedule || !normalized.venue) throw new Error("请完整填写班级信息");
      const previous = classId && data.classes.find((item) => item.id === classId); const previousType = previous && previous.classType; const isNew = !classId; if (classId) Object.assign(previous, normalized); else { classId = uid("c"); data.classes.push({ ...normalized, id: classId, studentIds: [] }); }
      audit(data, role, previousType && previousType !== normalized.classType ? "changeClassType" : isNew ? "createClass" : "saveClass", "class", classId, { operator: userId, toClassId: classId, reason: normalized.name }); save(data); return { id: classId };
    }
    case "listSessions": {
      const studentId = input.studentId || ownStudentId;
      return data.sessions.filter((item) => (item.status === "published" || role !== "parent") && (role !== "coach" || roleClassIds(data, role).includes(item.classId))).map((item) => decorateSession(data, item, studentId));
    }
    case "getSession": {
      const session = data.sessions.find((item) => item.id === input.id); if (!session) throw new Error("课程不存在");
      if (role === "parent" && session.status !== "published") throw new Error("课程尚未发布");
      if (role === "coach" && !roleClassIds(data, role).includes(session.classId)) throw new Error("无权查看该课程");
      const studentId = input.studentId || ownStudentId; const result = decorateSession(data, session, studentId);
      return { ...result, enrollments: booked(data, session.id).map((item) => ({ ...item, attendanceStatus: (data.attendance.find((record) => record.sessionId === session.id && record.studentId === item.studentId) || {}).status || "unmarked", student: data.students.find((s) => s.id === item.studentId) })), waiting: data.waitlist.filter((item) => item.sessionId === session.id && item.status === "waiting").map((item, index) => ({ ...item, position: index + 1, student: data.students.find((s) => s.id === item.studentId) })) };
    }
    case "saveSession": {
      assertRole(role, ["admin"]); const payload = input.session || {}; if (!payload.title || !payload.date || !payload.time || !payload.venue) throw new Error("课程信息不完整");
      if (payload.id) Object.assign(data.sessions.find((item) => item.id === payload.id), payload); else data.sessions.push({ ...payload, id: uid("se"), status: payload.status || "published", capacity: Number(payload.capacity || 20) });
      audit(data, role, "saveSession", "session", payload.id || "new", payload.title); save(data); return { ok: true };
    }
    case "enrollSession": {
      assertRole(role, ["admin", "parent"]); const studentId = input.studentId || ownStudentId;
      if (!canAccessStudent(data, role, studentId)) throw new Error("无权为该学员报名");
      const session = data.sessions.find((item) => item.id === input.sessionId); const student = data.students.find((item) => item.id === studentId);
      if (!session || session.status !== "published") throw new Error("课程暂不可报名"); const sessionClass = data.classes.find((item) => item.id === session.classId); if (role === "parent" && sessionClass && sessionClass.classType === "ELITE") throw new Error("精英队课程实行俱乐部选拔制"); if (session.enrollmentMode === "fixed" && role !== "admin") throw new Error("固定梯队课程由管理员统一排入"); if (role === "parent" && sessionClass && !classesV3.activeMembers(data, sessionClass.id).some((item) => item.studentId === studentId)) throw new Error("该学员尚未加入本班"); if (student.remainingLessons <= 0) throw new Error("剩余课时不足，请先续费");
      if (data.enrollments.some((item) => item.sessionId === session.id && item.studentId === studentId && item.status === "booked")) return { status: "booked", message: "已报名" };
      if (booked(data, session.id).length + crm.trialCount(data, session.id) >= session.capacity && role !== "admin") return { status: "full", message: "本节课程已满" };
      data.enrollments.push({ id: uid("e"), sessionId: session.id, studentId, status: "booked", createdAt: stamp() }); audit(data, role, "enroll", "session", session.id, student.name); save(data); return { status: "booked", message: "报名成功" };
    }
    case "requestLeave": {
      assertRole(role, ["admin", "parent"]); const studentId = input.studentId || ownStudentId;
      if (!canAccessStudent(data, role, studentId)) throw new Error("无权提交该学员请假");
      const leaveSession = data.sessions.find((item) => item.id === input.sessionId); if (!leaveSession || !data.enrollments.some((item) => item.sessionId === input.sessionId && item.studentId === studentId && item.status === "booked")) throw new Error("该学员尚未报名本课程");
      if (data.leaveRequests.some((item) => item.sessionId === input.sessionId && item.studentId === studentId && item.status === "pending")) throw new Error("请假申请已提交"); if (data.leaveRequests.some((item) => item.sessionId === input.sessionId && item.studentId === studentId && item.status === "approved")) throw new Error("该课程请假已经批准");
      const submittedAt = stamp(); const request = { id: uid("l"), sessionId: input.sessionId, classId: leaveSession.classId, studentId, reason: String(input.reason || "家长请假"), status: "pending", submittedAt, createdAt: submittedAt, creatorId: userId }; data.leaveRequests.push(request); audit(data, role, "requestLeave", "leave", request.id, { studentId, sessionId: request.sessionId, leaveRequestId: request.id, operator: userId, oldStatus: "NONE", newStatus: "pending", lessonDelta: 0 }); save(data); return { ok: true, id: request.id };
    }
    case "cancelLeave": {
      assertRole(role, ["admin", "parent"]); const request = data.leaveRequests.find((item) => item.id === input.id); if (!request) throw new Error("请假申请不存在"); if (!canAccessStudent(data, role, request.studentId)) throw new Error("无权撤销该请假");
      if (request.status === "cancelled") return { ok: true, status: "cancelled", idempotent: true }; if (request.status === "approved") throw new Error("已批准请假请联系俱乐部管理员处理"); if (request.status !== "pending") throw new Error("当前请假状态不可撤销");
      request.status = "cancelled"; request.cancelledAt = stamp(); request.cancelledBy = userId; audit(data, role, "cancelLeave", "leave", request.id, { studentId: request.studentId, sessionId: request.sessionId, leaveRequestId: request.id, operator: userId, oldStatus: "pending", newStatus: "cancelled", lessonDelta: 0 }); save(data); return { ok: true, status: "cancelled" };
    }
    case "listLeaveRequests": {
      const ids = visibleStudents(data, role).map((item) => item.id); const classIds = roleClassIds(data, role);
      return data.leaveRequests.filter((item) => role === "admin" || (role === "parent" ? ids.includes(item.studentId) : classIds.includes((data.sessions.find((s) => s.id === item.sessionId) || {}).classId))).map((item) => { const session = data.sessions.find((s) => s.id === item.sessionId); return { ...item, submittedAt: item.submittedAt || item.createdAt, student: data.students.find((s) => s.id === item.studentId), session, clubClass: data.classes.find((clubClass) => clubClass.id === (item.classId || (session || {}).classId)) }; }).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    }
    case "reviewLeave": {
      assertRole(role, ["admin"]); const request = data.leaveRequests.find((item) => item.id === input.id); if (!request) throw new Error("请假申请不存在"); const status = input.approved ? "approved" : "rejected";
      if (request.status === status) return { ok: true, status, idempotent: true, lessonDelta: 0, promotedStudentId: null }; if (request.status !== "pending") throw new Error("申请状态已变化");
      const leaveSession = data.sessions.find((item) => item.id === request.sessionId); if (!leaveSession) throw new Error("课程不存在"); let correction = { oldStatus: "unmarked", newStatus: "unmarked", lessonDelta: 0 };
      if (input.approved) correction = applyAttendanceRecord(data, leaveSession, request.studentId, "leave", { source: "LEAVE_APPROVAL", leaveRequestId: request.id, operatorId: userId, ledgerType: "leave_correction", note: `${leaveSession.title}请假审批课时返还` });
      request.status = status; request.reviewedAt = stamp(); request.reviewerId = userId; request.reviewNote = input.note || "";
      audit(data, role, input.approved ? "approveLeave" : "rejectLeave", "leave", request.id, { studentId: request.studentId, sessionId: request.sessionId, leaveRequestId: request.id, operator: userId, oldStatus: "pending", newStatus: status, attendanceOldStatus: correction.oldStatus, attendanceNewStatus: correction.newStatus, lessonDelta: correction.lessonDelta });
      if (correction.lessonDelta) audit(data, role, "leaveLessonCorrection", "student", request.studentId, { studentId: request.studentId, sessionId: request.sessionId, leaveRequestId: request.id, operator: userId, oldStatus: correction.oldStatus, newStatus: "leave", lessonDelta: correction.lessonDelta });
      save(data); return { ok: true, status, idempotent: false, lessonDelta: correction.lessonDelta, promotedStudentId: null };
    }
    case "getAttendanceSheet": {
      assertRole(role, ["admin", "coach"]); let session = input.sessionId ? data.sessions.find((item) => item.id === input.sessionId) : data.sessions.find((item) => item.classId === input.classId && item.date === input.date);
      if (!session) session = { id: `adhoc-${input.classId}-${input.date}`, classId: input.classId, date: input.date, title: (data.classes.find((c) => c.id === input.classId) || {}).name || "临时课程" };
      if (role === "coach" && !roleClassIds(data, role).includes(session.classId)) throw new Error("无权点名该班级");
      const ids = session.id.startsWith("adhoc-") ? (data.classes.find((item) => item.id === session.classId) || {}).studentIds || [] : booked(data, session.id).map((item) => item.studentId);
      const trialStudents = data.trialBookings.filter((item) => item.sessionId === session.id && ["SCHEDULED", "COMPLETED", "NO_SHOW"].includes(item.status)).map((item) => ({ id: item.id, trialId: item.id, name: item.childName, initial: item.childName[0], attendanceStatus: item.attendanceStatus || "unmarked", isTrial: true }));
      return { session, clubClass: data.classes.find((item) => item.id === session.classId), date: session.date, students: ids.map((studentId) => { const student = data.students.find((item) => item.id === studentId); const record = data.attendance.find((item) => item.sessionId === session.id && item.studentId === studentId); const approvedLeave = data.leaveRequests.find((item) => item.sessionId === session.id && item.studentId === studentId && item.status === "approved"); const attendanceStatus = record ? record.status : "unmarked"; return { ...student, initial: student.name[0], attendanceStatus, leaveApproved: Boolean(approvedLeave), leaveRequestId: approvedLeave ? approvedLeave.id : "", leaveLocked: Boolean(approvedLeave && attendanceStatus === "leave"), leaveOverride: Boolean(approvedLeave && attendanceStatus !== "leave") }; }), trialStudents };
    }
    case "submitAttendance": {
      assertRole(role, ["admin", "coach"]); const session = data.sessions.find((item) => item.id === input.sessionId) || { id: input.sessionId || `adhoc-${input.classId}-${input.date}`, classId: input.classId, date: input.date, title: "临时课程" };
      if (role === "coach" && !roleClassIds(data, role).includes(session.classId)) throw new Error("无权点名该班级");
      const allowedIds = session.id.startsWith("adhoc-") ? (data.classes.find((item) => item.id === session.classId) || {}).studentIds || [] : booked(data, session.id).map((item) => item.studentId); const allowed = new Set(allowedIds);
      (input.records || []).forEach((record) => { if (!allowed.has(record.studentId)) throw new Error("点名名单包含非报名学员"); const approvedLeave = data.leaveRequests.find((item) => item.sessionId === session.id && item.studentId === record.studentId && item.status === "approved"); if (approvedLeave && record.status !== "leave" && !record.overrideApprovedLeave) throw new Error("已批准请假，修改状态前需要确认"); const correction = applyAttendanceRecord(data, session, record.studentId, record.status, { operatorId: userId, source: approvedLeave ? (record.status === "leave" ? "LEAVE_APPROVAL" : "LEAVE_ADMIN_OVERRIDE") : "ATTENDANCE", leaveRequestId: approvedLeave ? approvedLeave.id : "" }); if (approvedLeave && record.status !== "leave") audit(data, role, "overrideApprovedLeaveAttendance", "attendance", record.studentId, { studentId: record.studentId, sessionId: session.id, leaveRequestId: approvedLeave.id, operator: userId, oldStatus: correction.oldStatus, newStatus: correction.newStatus, lessonDelta: correction.lessonDelta }); });
      crm.applyTrialAttendance(data, session.id, input.trialRecords, { today: today(), stamp });
      audit(data, role, "submitAttendance", "session", session.id, `${(input.records || []).length}人`); save(data); return { ok: true };
    }
    case "getLessonLedger": { if (!canAccessStudent(data, role, input.studentId)) throw new Error("无权查看课时"); return data.lessonLedger.filter((item) => item.studentId === input.studentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
    case "listFeedback": { const ids = visibleStudents(data, role).map((item) => item.id); return data.feedback.filter((item) => !input.studentId ? ids.includes(item.studentId) : item.studentId === input.studentId && ids.includes(item.studentId)).map((item) => ({ ...item, student: data.students.find((s) => s.id === item.studentId), session: data.sessions.find((s) => s.id === item.sessionId) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
    case "saveFeedback": {
      assertRole(role, ["admin", "coach"]); const session = data.sessions.find((item) => item.id === input.sessionId);
      if (!session) throw new Error("课程不存在"); if (role === "coach" && !roleClassIds(data, role).includes(session.classId)) throw new Error("无权反馈该课程");
      if (role === "coach" && !booked(data, session.id).some((item) => item.studentId === input.studentId)) throw new Error("该学员不在课程名单中");
      const item = { id: uid("f"), sessionId: input.sessionId, studentId: input.studentId, coachName: role === "coach" ? "游导" : "南联教练组", rating: Number(input.rating || 4), tags: input.tags || [], content: String(input.content || ""), createdAt: stamp() }; if (!item.content) throw new Error("请填写训练反馈"); data.feedback.unshift(item); audit(data, role, "saveFeedback", "student", item.studentId, item.content.slice(0, 30)); save(data); return { ok: true };
    }
    case "listRenewals": { const ids = visibleStudents(data, role).map((item) => item.id); if (role === "coach") return []; return data.renewals.filter((item) => role === "admin" || ids.includes(item.studentId)).map((item) => ({ ...item, studentName: (data.students.find((s) => s.id === item.studentId) || {}).name || "" })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
    case "createRenewal": { assertRole(role, ["admin", "parent"]); const studentId = input.studentId || ownStudentId; if (!canAccessStudent(data, role, studentId)) throw new Error("无权续费"); const pack = PACKAGES[input.packageId]; if (!pack) throw new Error("续费套餐无效"); data.renewals.push({ id: uid("r"), studentId, packageId: input.packageId, ...pack, status: "pending", createdAt: stamp() }); save(data); return { ok: true }; }
    case "confirmRenewal": { assertRole(role, ["admin"]); const renewal = data.renewals.find((item) => item.id === input.id); if (!renewal || renewal.status !== "pending") throw new Error("订单状态已变化"); renewal.status = "paid"; renewal.paidAt = stamp(); const student = data.students.find((item) => item.id === renewal.studentId); student.totalLessons += renewal.lessons; appendLedger(data, renewal.studentId, renewal.lessons, "purchase", "renewal", renewal.id, `${renewal.name || "课包"}到账`); audit(data, role, "confirmRenewal", "renewal", renewal.id, `${renewal.amount}元`); save(data); return { ok: true }; }
    case "createInvite": assertRole(role, ["admin"]); return { code: "演示模式" };
    case "claimInvite": return { ok: true };
    case "resetDemo": { const demo = seed(); crm.ensure(demo, today()); wx.setStorageSync(STORAGE_KEY, demo); return { ok: true }; }
    default: throw new Error(`暂不支持操作：${action}`);
  }
}

module.exports = { call, PACKAGES, DEDUCTION };
