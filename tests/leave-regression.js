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
const checks = { leave: 0, attendance: 0, ledger: 0 };

function check(group, value, message) { assert(value, message); checks[group] += 1; }
async function rejects(fn, pattern) { let error; try { await fn(); } catch (caught) { error = caught; } assert(error, "expected action to reject"); if (pattern) assert(pattern.test(error.message), `unexpected error: ${error.message}`); return error; }

async function run() {
  await admin("resetDemo");
  const beforeClass = await admin("getClassDetail", { id: "c1718" });
  const beforeSession = await admin("getSession", { id: "se1" });
  const beforeBalance = storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons;
  const beforeLedger = storage.nanlianClubV2.lessonLedger.length;
  const beforeSelections = JSON.stringify(storage.nanlianClubV2.eliteSelections);
  storage.nanlianClubV2.waitlist.push({ id: "w-se1-history", sessionId: "se1", studentId: "s4", status: "waiting", createdAt: "2026-08-19 12:00" });

  const requested = await parent("requestLeave", { sessionId: "se1", studentId: "s1", reason: "家庭安排" });
  const pending = storage.nanlianClubV2.leaveRequests.find((item) => item.id === requested.id);
  check("leave", pending.status === "pending" && pending.classId === "c1718" && pending.submittedAt, "request should bind student/session/class and submittedAt");
  check("attendance", !storage.nanlianClubV2.attendance.some((item) => item.sessionId === "se1" && item.studentId === "s1"), "pending leave must not change attendance");
  check("ledger", storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons === beforeBalance && storage.nanlianClubV2.lessonLedger.length === beforeLedger, "pending leave must not change lessons");
  check("leave", storage.nanlianClubV2.enrollments.some((item) => item.sessionId === "se1" && item.studentId === "s1" && item.status === "booked"), "pending leave must retain enrollment");

  const approved = await admin("reviewLeave", { id: requested.id, approved: true, note: "同意请假" });
  const leaveAttendance = storage.nanlianClubV2.attendance.find((item) => item.sessionId === "se1" && item.studentId === "s1");
  check("leave", approved.status === "approved" && !approved.idempotent, "first approval should succeed");
  check("attendance", leaveAttendance.status === "leave" && leaveAttendance.deductedLessons === 0 && leaveAttendance.source === "LEAVE_APPROVAL", "approval should create LEAVE attendance");
  check("ledger", storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons === beforeBalance && storage.nanlianClubV2.lessonLedger.length === beforeLedger, "clean leave should deduct zero without fake ledger");
  check("leave", storage.nanlianClubV2.enrollments.some((item) => item.sessionId === "se1" && item.studentId === "s1" && item.status === "booked"), "approved leave must retain session enrollment");
  check("leave", (await admin("getClassDetail", { id: "c1718" })).studentCount === beforeClass.studentCount, "approved leave must not change class members");
  check("leave", JSON.stringify(storage.nanlianClubV2.eliteSelections) === beforeSelections, "elite selection history must remain unchanged");
  check("leave", storage.nanlianClubV2.waitlist.find((item) => item.id === "w-se1-history").status === "waiting" && !storage.nanlianClubV2.enrollments.some((item) => item.studentId === "s4" && item.sessionId === "se1"), "historical waitlist must not be promoted");
  const afterSession = await admin("getSession", { id: "se1" });
  check("leave", afterSession.enrolledCount === beforeSession.enrolledCount && afterSession.remaining === beforeSession.remaining, "leave must not release capacity");
  check("attendance", afterSession.attendanceStats.expected === beforeSession.enrolledCount && afterSession.attendanceStats.leave === 1, "session stats should separate expected and leave");
  const sheet = await admin("getAttendanceSheet", { sessionId: "se1" });
  const sheetStudent = sheet.students.find((item) => item.id === "s1");
  check("attendance", sheet.students.length === beforeSession.enrolledCount && sheetStudent.attendanceStatus === "leave" && sheetStudent.leaveLocked, "approved student should remain visible and locked as leave");
  check("leave", (await parent("getSession", { id: "se1", studentId: "s1" })).myStatus === "leave_approved", "parent session should show approved leave");

  const ledgerAfterApproval = storage.nanlianClubV2.lessonLedger.length;
  const balanceAfterApproval = storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons;
  const repeated = await admin("reviewLeave", { id: requested.id, approved: true });
  check("leave", repeated.idempotent === true, "repeated approval should be idempotent");
  check("ledger", storage.nanlianClubV2.lessonLedger.length === ledgerAfterApproval && storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons === balanceAfterApproval, "repeated approval must not refund twice");
  await admin("submitAttendance", { sessionId: "se1", records: [{ studentId: "s1", status: "leave" }], trialRecords: [] });
  check("attendance", storage.nanlianClubV2.attendance.find((item) => item.sessionId === "se1" && item.studentId === "s1").source === "LEAVE_APPROVAL", "saving the roster must retain approved-leave source metadata");
  await rejects(() => parent("cancelLeave", { id: requested.id }), /联系俱乐部管理员/); check("leave", true, "parent cannot cancel approved leave");
  await rejects(() => coach("reviewLeave", { id: "l1", approved: true }), /权限/); check("leave", true, "coach cannot approve leave");

  await admin("reviewLeave", { id: "l1", approved: false });
  check("leave", storage.nanlianClubV2.leaveRequests.find((item) => item.id === "l1").status === "rejected", "admin can reject pending leave");
  check("attendance", !storage.nanlianClubV2.attendance.some((item) => item.sessionId === "se1" && item.studentId === "s2"), "rejection must not create ABSENT attendance");

  storage.nanlianClubV2.sessions.push({ id: "se-next", classId: "c1718", title: "下一次精英队训练", date: "2026-08-27", time: "18:00-19:30", venue: "三江南联球场", coachName: "游导", capacity: 20, status: "published", enrollmentMode: "fixed" });
  storage.nanlianClubV2.enrollments.push({ id: "e-next", sessionId: "se-next", studentId: "s1", status: "booked", createdAt: "2026-08-20 12:00" });
  const nextSheet = await admin("getAttendanceSheet", { sessionId: "se-next" });
  check("attendance", nextSheet.students.some((item) => item.id === "s1" && item.attendanceStatus === "unmarked"), "next session should include student as unmarked");
  const nextRequest = await parent("requestLeave", { sessionId: "se-next", studentId: "s1", reason: "临时安排" });
  await parent("cancelLeave", { id: nextRequest.id });
  check("leave", storage.nanlianClubV2.leaveRequests.find((item) => item.id === nextRequest.id).status === "cancelled", "parent can cancel pending leave");
  check("attendance", !storage.nanlianClubV2.attendance.some((item) => item.sessionId === "se-next" && item.studentId === "s1"), "cancelled pending leave must not change attendance");

  await admin("resetDemo");
  const original = storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons;
  await admin("submitAttendance", { sessionId: "se1", records: [{ studentId: "s1", status: "absent" }], trialRecords: [] });
  check("attendance", storage.nanlianClubV2.attendance.find((item) => item.sessionId === "se1" && item.studentId === "s1").status === "absent", "coach/admin can mark absent");
  check("ledger", storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons === original - 1, "absent should deduct one lesson");
  const correctionRequest = await parent("requestLeave", { sessionId: "se1", studentId: "s1", reason: "已提前请假" });
  const correction = await admin("reviewLeave", { id: correctionRequest.id, approved: true });
  check("attendance", storage.nanlianClubV2.attendance.find((item) => item.sessionId === "se1" && item.studentId === "s1").status === "leave", "approval should correct ABSENT to LEAVE");
  check("ledger", correction.lessonDelta === 1 && storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons === original, "approval should refund one lesson");
  check("ledger", storage.nanlianClubV2.lessonLedger.some((item) => item.studentId === "s1" && item.type === "leave_correction" && item.delta === 1), "refund must be recorded in lessonLedger");
  const correctedLedgerLength = storage.nanlianClubV2.lessonLedger.length;
  await admin("reviewLeave", { id: correctionRequest.id, approved: true });
  check("ledger", storage.nanlianClubV2.lessonLedger.length === correctedLedgerLength, "repeated corrected approval must not create another ledger row");
  await rejects(() => admin("submitAttendance", { sessionId: "se1", records: [{ studentId: "s1", status: "absent" }], trialRecords: [] }), /需要确认/); check("attendance", true, "approved leave cannot be overwritten without confirmation");
  await admin("submitAttendance", { sessionId: "se1", records: [{ studentId: "s1", status: "absent", overrideApprovedLeave: true }], trialRecords: [] });
  check("attendance", storage.nanlianClubV2.attendance.find((item) => item.sessionId === "se1" && item.studentId === "s1").status === "absent", "confirmed correction can override leave");
  check("ledger", storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons === original - 1, "confirmed override should recalculate lessons through ledger");
  check("leave", storage.nanlianClubV2.auditLogs.some((item) => item.action === "overrideApprovedLeaveAttendance"), "leave override should write audit log");

  await admin("resetDemo");
  const presentOriginal = storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons;
  await admin("submitAttendance", { sessionId: "se1", records: [{ studentId: "s1", status: "present" }, { studentId: "s2", status: "sick" }], trialRecords: [] });
  check("attendance", storage.nanlianClubV2.attendance.find((item) => item.sessionId === "se1" && item.studentId === "s1").status === "present", "coach/admin can mark present");
  check("ledger", storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons === presentOriginal - 1, "present should deduct one lesson");
  check("attendance", storage.nanlianClubV2.attendance.find((item) => item.sessionId === "se1" && item.studentId === "s2").status === "sick", "injured status should be retained");
  check("ledger", storage.nanlianClubV2.students.find((item) => item.id === "s2").remainingLessons === 4, "injured status should deduct zero lessons");
  const presentRequest = await parent("requestLeave", { sessionId: "se1", studentId: "s1", reason: "补交请假证明" });
  const presentCorrection = await admin("reviewLeave", { id: presentRequest.id, approved: true });
  check("attendance", storage.nanlianClubV2.attendance.find((item) => item.sessionId === "se1" && item.studentId === "s1").status === "leave", "approval should correct PRESENT to LEAVE");
  check("ledger", presentCorrection.lessonDelta === 1 && storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons === presentOriginal, "PRESENT to LEAVE should refund exactly one lesson");
  const presentSession = await admin("getSession", { id: "se1" });
  check("attendance", presentSession.attendanceStats.leave === 1 && presentSession.attendanceStats.injured === 1 && presentSession.attendanceStats.unmarked === presentSession.enrolledCount - 2, "session stats should count leave, injured and unmarked separately");

  console.log(`Leave regression: ${checks.leave} checks passed`);
  console.log(`Attendance regression: ${checks.attendance} checks passed`);
  console.log(`Lesson ledger regression: ${checks.ledger} checks passed`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
