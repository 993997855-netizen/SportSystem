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

async function rejects(fn, pattern) {
  let error;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, "expected action to reject");
  if (pattern) assert(pattern.test(error.message), `unexpected error: ${error.message}`);
}

async function run() {
  await admin("resetDemo");
  const initial = storage.nanlianClubV2;
  assert.strictEqual(initial.leads.length, 15, "demo should include 15 leads");
  assert.strictEqual(initial.trialBookings.length, 5, "demo should include 5 experience bookings");
  assert((await admin("getCrmDashboard")).funnel.some((item) => item.status === "FORMAL"), "funnel should include formal students");
  await rejects(() => parent("getCrmDashboard"), /仅管理员和教练/);

  const duplicate = await admin("checkLeadDuplicates", { mobile: "13800001203" });
  assert(duplicate.some((item) => item.type === "student"), "mobile duplicate should include formal students");

  const created = await admin("saveLead", { lead: { childName: "回归小将", gender: "男", birthday: "2018-06-01", parentName: "回归家长", mobile: "13812345678", wechat: "regression", school: "瓯北中心小学", grade: "二年级", interestedProgram: "17/18精英班", source: "朋友圈", intentionLevel: "A", ownerCoachId: "coach1", ownerCoachName: "游导", remark: "自动化测试" } });
  assert(created.id, "lead creation should return an id");
  assert((await coach("getLead", { id: created.id })).childName === "回归小将", "assigned coach should access own lead");
  await rejects(() => coach("getLead", { id: "l3" }), /无权查看/);

  await admin("addLeadFollowUp", { leadId: created.id, method: "电话", result: "已联系", content: "确认参加体验课", nextFollowUpAt: "2026-08-21 15:00" });
  assert.strictEqual((await admin("getLead", { id: created.id })).status, "CONTACTED");
  const due = await admin("listLeads", { view: "due", sort: "next" });
  assert(due.some((item) => item.id === created.id && item.dueBucket), "due center should classify follow-up buckets");

  storage.nanlianClubV2.sessions.push({ id: "se-crm-full", classId: "cu7base", title: "满员班体验限制", date: "2026-08-21", time: "19:00", venue: "瓯北中心小学", capacity: 20, status: "published" });
  await rejects(() => admin("createTrial", { leadId: created.id, sessionId: "se-crm-full", classId: "cu7base", trialDate: "2026-08-21" }), /名额已满/);
  const booking = await admin("createTrial", { leadId: created.id, sessionId: "se1", classId: "c1718", trialDate: "2026-08-20", coachName: "游导", venueName: "三江南联球场" });
  const session = await admin("getSession", { id: "se1" });
  assert(session.trialCount >= 2 && session.totalCount === session.enrolledCount + session.trialCount, "experience student should occupy capacity separately");
  const ledgerBefore = initial.lessonLedger.length;
  await admin("submitAttendance", { sessionId: "se1", records: [], trialRecords: [{ trialId: booking.id, status: "present" }] });
  assert.strictEqual(storage.nanlianClubV2.lessonLedger.length, ledgerBefore, "experience attendance must not write lesson ledger");
  assert.strictEqual((await admin("getTrial", { id: booking.id })).attendanceStatus, "present");

  await admin("saveTrialFeedback", { id: booking.id, feedback: { attitude: 5, coordination: 4, ballSense: 4, understanding: 5, integration: 4, enthusiasm: 5, summary: "适应良好，建议进入精英班。" }, recommendedClassId: "c1718" });
  const followed = await admin("getLead", { id: created.id });
  assert.strictEqual(followed.status, "TRIAL_COMPLETED");
  assert(followed.followUps.some((item) => item.content === "体验课后回访"), "feedback should create next-day follow-up");

  const converted = await admin("convertLead", { id: created.id, avatarUrl: "cloud://student-photos/crm.jpg", classIds: ["cu8advanced"], productId: "prod14", registrationDate: "2026-08-20", ownerCoachId: "coach1", ownerCoachName: "游导" });
  const student = await admin("getStudent", { id: converted.id });
  assert.strictEqual(student.remainingLessons, 0, "conversion must not grant lessons before payment");
  assert.strictEqual(student.crmLeadId, created.id);
  assert.strictEqual(student.recruitment.source, "朋友圈");
  const firstOrder = await admin("getOrder", { id: converted.orderId });
  assert.strictEqual(firstOrder.status, "PENDING", "conversion should create a pending first order");
  await admin("recordPayment", { orderId: converted.orderId, amount: 1380, transactionRef: "CRM-REGRESSION-PAYMENT", idempotencyKey: "CRM-REGRESSION-PAYMENT" });
  const paidStudent = await admin("getStudent", { id: converted.id });
  assert.strictEqual(paidStudent.remainingLessons, 14, "full payment should grant package lessons");
  assert(paidStudent.lessonLedger.some((item) => item.type === "PACKAGE_PURCHASE" && item.referenceId === converted.orderId && item.delta === 14), "payment should write order-linked package ledger");

  const duplicateLead = await admin("saveLead", { lead: { childName: "陈小南", gender: "男", birthday: "2017-03-18", parentName: "陈女士", mobile: "13800001203", source: "微信群", intentionLevel: "B", ownerCoachId: "coach1", ownerCoachName: "游导" } });
  const duplicateConversion = await admin("convertLead", { id: duplicateLead.id, avatarUrl: "cloud://student-photos/duplicate.jpg", classIds: ["cu8advanced"], productId: "prod14" });
  assert(duplicateConversion.duplicate, "conversion should stop on suspected duplicate");

  await admin("moveLeadToPublic", { id: "l3" });
  await coach("claimPublicLead", { id: "l3" });
  await rejects(() => admin("claimPublicLead", { id: "l3" }), /已被其他教练领取/);

  const formalBefore = storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons;
  await admin("submitAttendance", { sessionId: "se1", records: [{ studentId: "s1", status: "present" }], trialRecords: [] });
  const formalAfter = storage.nanlianClubV2.students.find((item) => item.id === "s1").remainingLessons;
  assert.strictEqual(formalAfter, formalBefore - 1, "formal attendance should retain original deduction semantics");

  const stats = await admin("getCrmStats", { start: "2026-08-01", end: "2026-08-31" });
  assert(stats.summary.leads >= 15 && stats.summary.amount >= 3360, "CRM statistics should aggregate leads and revenue");
  console.log("CRM regression: 21 checks passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
