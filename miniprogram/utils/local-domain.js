const { today } = require("./format");

const STORAGE_KEY = "nanlianClubV2";
const PACKAGES = {
  p14: { name: "一周一练", lessons: 14, amount: 1380 },
  p28: { name: "一周两练", lessons: 28, amount: 1980 }
};
const DEDUCTION = { present: 1, absent: 1, leave: 0, sick: 0 };

function seed() {
  return {
    students: [
      { id: "s1", name: "陈小南", gender: "男", birthDate: "2017-03-18", guardianName: "陈女士", guardianPhone: "13800001203", emergencyContact: "陈先生 13900001203", healthNotes: "无", remainingLessons: 19, totalLessons: 28, classIds: ["c1718"], status: "active" },
      { id: "s2", name: "周子航", gender: "男", birthDate: "2018-11-02", guardianName: "周先生", guardianPhone: "13600009081", emergencyContact: "周女士 13700009081", healthNotes: "左膝旧伤，训练前加强热身", remainingLessons: 4, totalLessons: 28, classIds: ["c1718"], status: "active" },
      { id: "s3", name: "林一诺", gender: "女", birthDate: "2016-07-09", guardianName: "林女士", guardianPhone: "13900006618", emergencyContact: "林先生 13800006618", healthNotes: "无", remainingLessons: 11, totalLessons: 14, classIds: ["c1516"], status: "active" },
      { id: "s4", name: "王奕辰", gender: "男", birthDate: "2019-09-23", guardianName: "王先生", guardianPhone: "13700004329", emergencyContact: "王女士 13600004329", healthNotes: "近期脚踝轻微不适", remainingLessons: 2, totalLessons: 14, classIds: ["cinterest"], status: "active" }
    ],
    classes: [
      { id: "c1718", name: "17/18精英班", group: "丙组梯队", coachName: "游导", coachUserId: "coach1", schedule: "周二/四/六 15:00-17:00", venue: "三江南联球场", studentIds: ["s1", "s2"], active: true },
      { id: "c1516", name: "15/16精英班", group: "乙组梯队", coachName: "游导", coachUserId: "coach1", schedule: "周一/三/五 19:00-20:30", venue: "瓯北中心小学", studentIds: ["s3"], active: true },
      { id: "cinterest", name: "兴趣成长班", group: "基础班", coachName: "王蒋生", coachUserId: "coach2", schedule: "周五 19:00-20:30", venue: "瓯北中心小学", studentIds: ["s4"], active: true }
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
    auditLogs: []
  };
}

function load() {
  let data = wx.getStorageSync(STORAGE_KEY);
  if (!data || !data.sessions || !data.lessonLedger) { data = seed(); save(data); }
  return data;
}
function save(data) { wx.setStorageSync(STORAGE_KEY, data); }
function uid(prefix) { return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`; }
function stamp() { return `${today()} ${new Date().toTimeString().slice(0, 5)}`; }
function assertRole(role, allowed) { if (!allowed.includes(role)) throw new Error("没有执行该操作的权限"); }
function roleClassIds(data, role) { return role === "coach" ? ["c1718", "c1516"] : data.classes.map((item) => item.id); }
function visibleStudents(data, role) {
  if (role === "admin") return data.students;
  if (role === "parent") return data.students.slice(0, 1);
  const ids = roleClassIds(data, role);
  return data.students.filter((student) => (student.classIds || []).some((id) => ids.includes(id)));
}
function canAccessStudent(data, role, studentId) { return visibleStudents(data, role).some((item) => item.id === studentId); }
function booked(data, sessionId) { return data.enrollments.filter((item) => item.sessionId === sessionId && item.status === "booked"); }
function decorateSession(data, session, studentId) {
  const count = booked(data, session.id).length;
  const enrollment = data.enrollments.find((item) => item.sessionId === session.id && item.studentId === studentId && item.status === "booked");
  const waiting = data.waitlist.filter((item) => item.sessionId === session.id && item.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const waitIndex = waiting.findIndex((item) => item.studentId === studentId);
  const leave = data.leaveRequests.find((item) => item.sessionId === session.id && item.studentId === studentId && item.status === "pending");
  return { ...session, enrolledCount: count, remaining: Math.max(0, session.capacity - count), myStatus: leave ? "leave_pending" : enrollment ? "booked" : waitIndex >= 0 ? "waiting" : "none", waitlistPosition: waitIndex >= 0 ? waitIndex + 1 : 0 };
}
function audit(data, role, action, targetType, targetId, detail) { data.auditLogs.unshift({ id: uid("log"), role, action, targetType, targetId, detail, createdAt: stamp() }); }
function appendLedger(data, studentId, delta, type, referenceType, referenceId, note) {
  const student = data.students.find((item) => item.id === studentId);
  if (!student) throw new Error("未找到学员");
  student.remainingLessons = Number(student.remainingLessons || 0) + Number(delta || 0);
  const item = { id: uid("tx"), studentId, type, delta, balanceAfter: student.remainingLessons, referenceType, referenceId, note, createdAt: stamp() };
  data.lessonLedger.unshift(item);
  return item;
}
function promoteWaitlist(data, sessionId) {
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session || booked(data, sessionId).length >= session.capacity) return null;
  const next = data.waitlist.filter((item) => item.sessionId === sessionId && item.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!next) return null;
  next.status = "promoted"; next.promotedAt = stamp();
  data.enrollments.push({ id: uid("e"), sessionId, studentId: next.studentId, status: "booked", source: "waitlist", createdAt: stamp() });
  return next.studentId;
}

async function call(action, input = {}) {
  const data = load();
  const role = input.previewRole || "admin";
  const ownStudentId = visibleStudents(data, role)[0] && visibleStudents(data, role)[0].id;
  switch (action) {
    case "getContext": return { mode: "local", user: { id: `local-${role}`, name: role === "admin" ? "南联管理员" : role === "coach" ? "游导" : "陈女士", role }, needsBinding: false };
    case "getDashboard": {
      const students = visibleStudents(data, role); const ids = students.map((item) => item.id); const classIds = roleClassIds(data, role);
      const parentClassIds = ((students[0] || {}).classIds || []);
      const classes = data.classes.filter((item) => role === "parent" ? parentClassIds.includes(item.id) : classIds.includes(item.id));
      const sessions = data.sessions.filter((item) => item.status === "published" && (role === "parent" || classIds.includes(item.classId))).map((item) => decorateSession(data, item, ownStudentId));
      return { role, studentCount: students.length, classCount: classes.length, lowBalance: students.filter((item) => item.remainingLessons <= 5).length, pendingRenewals: data.renewals.filter((item) => item.status === "pending" && (role === "admin" || ids.includes(item.studentId))).length, todayAttendance: data.attendance.filter((item) => item.date === today() && ids.includes(item.studentId)).length, pendingLeaves: data.leaveRequests.filter((item) => item.status === "pending" && (role === "admin" || ids.includes(item.studentId) || classIds.includes((data.sessions.find((s) => s.id === item.sessionId) || {}).classId))).length, waitlistCount: data.waitlist.filter((item) => item.status === "waiting" && (role !== "parent" || ids.includes(item.studentId))).length, recentStudents: [...students].sort((a, b) => a.remainingLessons - b.remainingLessons).slice(0, 3).map((item) => ({ ...item, initial: item.name[0] })), classes, sessions: sessions.slice(0, 4) };
    }
    case "getOperationsDashboard": {
      assertRole(role, ["admin", "coach"]); const classIds = roleClassIds(data, role);
      const sessions = data.sessions.filter((item) => role === "admin" || classIds.includes(item.classId));
      return { metrics: { students: visibleStudents(data, role).length, sessions: sessions.length, booked: data.enrollments.filter((item) => item.status === "booked" && sessions.some((s) => s.id === item.sessionId)).length, pendingLeaves: data.leaveRequests.filter((item) => item.status === "pending").length, waiting: data.waitlist.filter((item) => item.status === "waiting").length, pendingRenewals: data.renewals.filter((item) => item.status === "pending").length }, alerts: [{ level: "warning", text: "三江秋季周一/三/五场地时段待确认" }, { level: "danger", text: `${data.students.filter((item) => item.remainingLessons <= 5).length}名学员剩余课时不足5节` }, { level: "info", text: "兼职教练证书等级和有效期需要补录" }], sessions: sessions.map((item) => decorateSession(data, item, ownStudentId)), auditLogs: data.auditLogs.slice(0, 20) };
    }
    case "listStudents": return visibleStudents(data, role).map((student) => ({ ...student, initial: student.name[0], classNames: data.classes.filter((item) => (student.classIds || []).includes(item.id)).map((item) => item.name).join("、") }));
    case "getStudent": {
      if (!canAccessStudent(data, role, input.id)) throw new Error("无权查看该学员");
      const student = data.students.find((item) => item.id === input.id);
      return { ...student, initial: student.name[0], classes: data.classes.filter((item) => (student.classIds || []).includes(item.id)), attendance: data.attendance.filter((item) => item.studentId === input.id).sort((a, b) => b.date.localeCompare(a.date)), renewals: role === "coach" ? [] : data.renewals.filter((item) => item.studentId === input.id), feedback: data.feedback.filter((item) => item.studentId === input.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), lessonLedger: data.lessonLedger.filter((item) => item.studentId === input.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    }
    case "saveStudent": {
      assertRole(role, ["admin"]); const payload = input.student || {};
      if (payload.id) { const index = data.students.findIndex((item) => item.id === payload.id); const old = data.students[index]; data.students[index] = { ...old, ...payload, remainingLessons: old.remainingLessons, totalLessons: old.totalLessons }; }
      else {
        const lessons = Math.max(0, Number(payload.remainingLessons || 0)); const studentId = uid("s");
        data.students.push({ ...payload, id: studentId, remainingLessons: lessons, totalLessons: lessons, classIds: payload.classIds || [], status: "active" });
        if (lessons) data.lessonLedger.unshift({ id: uid("tx"), studentId, type: "opening", delta: lessons, balanceAfter: lessons, referenceType: "student", referenceId: studentId, note: "建档期初课时", createdAt: stamp() });
      }
      audit(data, role, "saveStudent", "student", payload.id || "new", payload.name); save(data); return { ok: true };
    }
    case "listClasses": return data.classes.filter((item) => role === "admin" || roleClassIds(data, role).includes(item.id)).map((item) => ({ ...item, studentCount: item.studentIds.length }));
    case "getClass": assertRole(role, ["admin"]); return { ...data.classes.find((item) => item.id === input.id) };
    case "saveClass": {
      assertRole(role, ["admin"]); const payload = input.clubClass; let classId = payload.id;
      if (classId) Object.assign(data.classes.find((item) => item.id === classId), payload); else { classId = uid("c"); data.classes.push({ ...payload, id: classId, active: true, studentIds: payload.studentIds || [] }); }
      data.students.forEach((student) => { const selected = (payload.studentIds || []).includes(student.id); student.classIds = selected ? [...new Set([...(student.classIds || []), classId])] : (student.classIds || []).filter((id) => id !== classId); });
      audit(data, role, "saveClass", "class", classId, payload.name); save(data); return { id: classId };
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
      return { ...result, enrollments: booked(data, session.id).map((item) => ({ ...item, student: data.students.find((s) => s.id === item.studentId) })), waiting: data.waitlist.filter((item) => item.sessionId === session.id && item.status === "waiting").map((item, index) => ({ ...item, position: index + 1, student: data.students.find((s) => s.id === item.studentId) })) };
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
      if (!session || session.status !== "published") throw new Error("课程暂不可报名"); if (session.enrollmentMode === "fixed" && role !== "admin") throw new Error("固定梯队课程由管理员统一排入"); if (student.remainingLessons <= 0) throw new Error("剩余课时不足，请先续费");
      if (data.enrollments.some((item) => item.sessionId === session.id && item.studentId === studentId && item.status === "booked")) return { status: "booked", message: "已报名" };
      if (booked(data, session.id).length >= session.capacity) { if (!data.waitlist.some((item) => item.sessionId === session.id && item.studentId === studentId && item.status === "waiting")) data.waitlist.push({ id: uid("w"), sessionId: session.id, studentId, status: "waiting", createdAt: stamp() }); audit(data, role, "joinWaitlist", "session", session.id, student.name); save(data); return { status: "waiting", message: "名额已满，已加入候补" }; }
      data.enrollments.push({ id: uid("e"), sessionId: session.id, studentId, status: "booked", createdAt: stamp() }); audit(data, role, "enroll", "session", session.id, student.name); save(data); return { status: "booked", message: "报名成功" };
    }
    case "requestLeave": {
      assertRole(role, ["admin", "parent"]); const studentId = input.studentId || ownStudentId;
      if (!canAccessStudent(data, role, studentId)) throw new Error("无权提交该学员请假");
      if (!data.enrollments.some((item) => item.sessionId === input.sessionId && item.studentId === studentId && item.status === "booked")) throw new Error("该学员尚未报名本课程");
      if (data.leaveRequests.some((item) => item.sessionId === input.sessionId && item.studentId === studentId && item.status === "pending")) throw new Error("请假申请已提交");
      const request = { id: uid("l"), sessionId: input.sessionId, studentId, reason: String(input.reason || "家长请假"), status: "pending", createdAt: stamp() }; data.leaveRequests.push(request); audit(data, role, "requestLeave", "leave", request.id, request.reason); save(data); return { ok: true };
    }
    case "listLeaveRequests": {
      const ids = visibleStudents(data, role).map((item) => item.id); const classIds = roleClassIds(data, role);
      return data.leaveRequests.filter((item) => role === "admin" || (role === "parent" ? ids.includes(item.studentId) : classIds.includes((data.sessions.find((s) => s.id === item.sessionId) || {}).classId))).map((item) => ({ ...item, student: data.students.find((s) => s.id === item.studentId), session: data.sessions.find((s) => s.id === item.sessionId) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    case "reviewLeave": {
      assertRole(role, ["admin", "coach"]); const request = data.leaveRequests.find((item) => item.id === input.id); if (!request || request.status !== "pending") throw new Error("申请状态已变化");
      const leaveSession = data.sessions.find((item) => item.id === request.sessionId); if (role === "coach" && (!leaveSession || !roleClassIds(data, role).includes(leaveSession.classId))) throw new Error("无权审批该课程请假");
      request.status = input.approved ? "approved" : "rejected"; request.reviewedAt = stamp(); request.reviewNote = input.note || "";
      let promotedStudentId = null; if (input.approved) { const enrollment = data.enrollments.find((item) => item.sessionId === request.sessionId && item.studentId === request.studentId && item.status === "booked"); if (enrollment) enrollment.status = "leave"; promotedStudentId = promoteWaitlist(data, request.sessionId); }
      audit(data, role, "reviewLeave", "leave", request.id, request.status); save(data); return { ok: true, promotedStudentId };
    }
    case "getAttendanceSheet": {
      assertRole(role, ["admin", "coach"]); let session = input.sessionId ? data.sessions.find((item) => item.id === input.sessionId) : data.sessions.find((item) => item.classId === input.classId && item.date === input.date);
      if (!session) session = { id: `adhoc-${input.classId}-${input.date}`, classId: input.classId, date: input.date, title: (data.classes.find((c) => c.id === input.classId) || {}).name || "临时课程" };
      if (role === "coach" && !roleClassIds(data, role).includes(session.classId)) throw new Error("无权点名该班级");
      const ids = session.id.startsWith("adhoc-") ? (data.classes.find((item) => item.id === session.classId) || {}).studentIds || [] : booked(data, session.id).map((item) => item.studentId);
      return { session, clubClass: data.classes.find((item) => item.id === session.classId), date: session.date, students: ids.map((studentId) => { const student = data.students.find((item) => item.id === studentId); const record = data.attendance.find((item) => item.sessionId === session.id && item.studentId === studentId); return { ...student, initial: student.name[0], attendanceStatus: record ? record.status : "unmarked" }; }) };
    }
    case "submitAttendance": {
      assertRole(role, ["admin", "coach"]); const session = data.sessions.find((item) => item.id === input.sessionId) || { id: input.sessionId || `adhoc-${input.classId}-${input.date}`, classId: input.classId, date: input.date, title: "临时课程" };
      if (role === "coach" && !roleClassIds(data, role).includes(session.classId)) throw new Error("无权点名该班级");
      (input.records || []).forEach((record) => { if (!(record.status in DEDUCTION)) throw new Error("无效出勤状态"); const existing = data.attendance.find((item) => item.sessionId === session.id && item.studentId === record.studentId); const prev = existing ? Number(existing.deductedLessons || 0) : 0; const next = DEDUCTION[record.status]; if (existing) Object.assign(existing, { status: record.status, deductedLessons: next, updatedAt: stamp() }); else data.attendance.push({ id: uid("a"), sessionId: session.id, classId: session.classId, studentId: record.studentId, date: session.date || input.date, status: record.status, deductedLessons: next, createdAt: stamp() }); const delta = prev - next; if (delta) appendLedger(data, record.studentId, delta, delta < 0 ? "attendance" : "attendance_adjustment", "session", session.id, `${session.title}${record.status === "present" ? "到课" : record.status === "absent" ? "缺勤" : "状态校正"}`); });
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
    case "resetDemo": wx.setStorageSync(STORAGE_KEY, seed()); return { ok: true };
    default: throw new Error(`暂不支持操作：${action}`);
  }
}

module.exports = { call, PACKAGES, DEDUCTION };
