const assert = require("assert");
const fs = require("fs");
const path = require("path");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
};

const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (action, data = {}, userId = "coach1") => domain.call(action, { ...data, previewRole: "coach", previewUserId: userId });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });
let checks = 0;

function check(value, message) { assert(value, message); checks += 1; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); checks += 1; }
async function rejects(fn, pattern) {
  let error;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, "expected action to reject");
  if (pattern) assert(pattern.test(error.message), `unexpected error: ${error.message}`);
  checks += 1;
}

async function run() {
  await admin("resetDemo");
  const data = storage.nanlianClubV2;
  check(data.leads.length >= 15 && data.trialBookings.length >= 5, "CRM demo data should be restorable");
  await rejects(() => parent("getCrmDashboard"), /仅管理员和教练/);

  const created = await admin("saveLead", { lead: { childName: "PHASEA体验小将", gender: "男", birthday: "2018-06-01", parentName: "阶段家长", mobile: "13812345678", school: "瓯北中心小学", grade: "二年级", interestedProgram: "U8基础班", source: "学校合作", intentionLevel: "A", ownerCoachId: "coach1", ownerCoachName: "游导", remark: "PHASE A回归" } });
  check(created.id, "lead creation should return id");
  equal((await coach("getLead", { id: created.id })).childName, "PHASEA体验小将", "assigned coach should access own lead");
  await rejects(() => coach("getLead", { id: created.id }, "coach2"), /无权查看/);

  await admin("addLeadFollowUp", { leadId: created.id, method: "电话", result: "已联系", content: "确认参加体验课", nextFollowUpAt: "2026-08-25 15:00" });
  equal((await admin("getLead", { id: created.id })).status, "CONTACTED", "follow-up should advance NEW to CONTACTED");

  const memberCountBefore = data.classMembers.length;
  const studentCountBefore = data.students.length;
  const ledgerCountBefore = data.lessonLedger.length;
  const waitlistSnapshot = JSON.stringify(data.waitlist || []);
  const booking = await admin("createTrial", { leadId: created.id, sessionId: "se1", remark: "第一节体验课" });
  check(booking.id, "trial booking should return id");
  const trial = await admin("getTrial", { id: booking.id });
  equal(trial.sessionId, "se1", "trial should bind a concrete session");
  equal(trial.classId, "c1718", "trial class should derive from session");
  equal(data.classMembers.length, memberCountBefore, "trial must not create classMember");
  equal(data.students.length, studentCountBefore, "trial must not create student");
  equal(JSON.stringify(data.waitlist || []), waitlistSnapshot, "trial must not create or mutate waitlist");

  const session = await admin("getSession", { id: "se1" });
  check(session.trialStudents.some((item) => item.trialId === booking.id), "session should expose a separate trial roster");
  const sheet = await admin("getAttendanceSheet", { sessionId: "se1" });
  check(sheet.trialStudents.some((item) => item.trialId === booking.id), "attendance should expose trial students separately");

  await admin("submitAttendance", { sessionId: "se1", records: [], trialRecords: [{ trialId: booking.id, status: "present" }] });
  equal((await admin("getTrial", { id: booking.id })).attendanceStatus, "present", "trial attendance should be stored on trial booking");
  equal(data.lessonLedger.length, ledgerCountBefore, "trial attendance must not write lesson ledger");

  await admin("saveTrialFeedback", { id: booking.id, feedback: { participation: 5, coordination: 4, ballSense: 4, understanding: 5, enthusiasm: 5, summary: "参与积极，理解较快，建议进入U8基础班。" }, recommendedClassId: "cu8advanced" });
  const followed = await admin("getLead", { id: created.id });
  equal(followed.status, "TRIAL_COMPLETED", "feedback should complete trial stage");
  check(followed.followUps.some((item) => item.content === "体验课后回访"), "feedback should create next-day follow-up");
  await rejects(() => coach("convertLead", { id: created.id, avatarUrl: "cloud://student-photos/phase-a.jpg", classIds: [] }), /仅管理员/);

  const converted = await admin("convertLead", { id: created.id, avatarUrl: "cloud://student-photos/phase-a.jpg", classIds: [], registrationDate: "2026-08-24", ownerCoachId: "coach1", ownerCoachName: "游导" });
  check(converted.id && converted.requiresClassAssignment, "conversion should create a formal student awaiting class assignment");
  const student = await admin("getStudent", { id: converted.id });
  equal(student.remainingLessons, 0, "conversion must create zero lesson balance");
  equal(student.classIds.length, 0, "conversion must not auto-enroll a class");
  check(!data.classMembers.some((item) => item.studentId === converted.id && item.status === "ACTIVE"), "conversion must not create classMember");
  check(!data.lessonLedger.some((item) => item.studentId === converted.id), "conversion must not write lesson ledger");
  equal(JSON.stringify(data.waitlist || []), waitlistSnapshot, "conversion must not create or mutate waitlist");
  equal((await admin("getLead", { id: created.id })).status, "WON", "converted lead should become WON");

  const second = await admin("saveLead", { lead: { childName: "PHASEA第二小将", gender: "女", birthday: "2019-05-01", parentName: "第二家长", mobile: "13912345678", source: "老学员转介绍", intentionLevel: "B", ownerCoachId: "coach1", ownerCoachName: "游导" } });
  await rejects(() => admin("convertLead", { id: second.id, avatarUrl: "cloud://student-photos/phase-a-2.jpg", classIds: ["cu8advanced"] }), /单独编班/);

  const formalBefore = data.students.find((item) => item.id === "s1").remainingLessons;
  await admin("submitAttendance", { sessionId: "se1", records: [{ studentId: "s1", status: "present" }], trialRecords: [] });
  equal(data.students.find((item) => item.id === "s1").remainingLessons, formalBefore - 1, "formal attendance deduction must remain unchanged");

  const root = path.resolve(__dirname, "..");
  const app = JSON.parse(fs.readFileSync(path.join(root, "miniprogram/app.json"), "utf8"));
  const v2 = fs.readFileSync(path.join(root, "cloudfunctions/clubApi/v2.js"), "utf8");
  const cloudCrm = fs.readFileSync(path.join(root, "cloudfunctions/clubApi/crm-service.js"), "utf8");
  ["crm-dashboard", "leads", "lead-form", "lead-detail", "followup-form", "trials", "trial-form", "trial-feedback", "lead-convert", "crm-stats"].forEach((page) => check(app.pages.includes(`pages/${page}/index`), `page should be registered: ${page}`));
  check(v2.includes('"leads"') && v2.includes('"leadFollowUps"') && v2.includes('"trialBookings"'), "cloud collections should be registered");
  check(v2.includes("crmService.handles") && v2.includes("trialRecords"), "cloud route and trial attendance should be connected");
  check(cloudCrm.includes('collection("classMembers")') && !cloudCrm.includes('collection("lessonLedger")'), "cloud trial capacity should read classMembers without writing lessonLedger");
  check(!/waitlist|promoteWaitlist|fillVacancy/i.test(cloudCrm), "active cloud CRM must contain no waitlist mechanism");
  console.log(`CRM regression: ${checks} checks passed`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
