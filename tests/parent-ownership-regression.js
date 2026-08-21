const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
};

const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const parentA = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });
const parentB = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent2" });

async function rejects(fn, pattern) {
  let error;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, "expected rejection");
  if (pattern) assert(pattern.test(error.message), error.message);
}

async function addAndApprove(parent, profile) {
  const submitted = await parent("submitChildProfile", { profile });
  assert.strictEqual(submitted.status, "PENDING_REVIEW");
  return admin("reviewChildProfileRequest", { id: submitted.id, decision: "APPROVE" });
}

async function run() {
  await admin("resetDemo");
  let checks = 0;

  const initialFamily = await parentA("getFamilyContext");
  const studentA = await addAndApprove(parentA, { avatarUrl: "cloud://student-photos/a.jpg", name: "唯一归属甲", gender: "男", birthDate: "2020-01-02", idCardNumber: "330327202001020010", school: "永嘉三幼", grade: "中班" });
  assert.strictEqual(storage.nanlianClubV2.students.find((item) => item.id === studentA.studentId).ownerParentUserId, "parent1");
  checks += 1;

  const studentB = await addAndApprove(parentA, { avatarUrl: "cloud://student-photos/b.jpg", name: "唯一归属乙", gender: "女", birthDate: "2020-02-03", idCardNumber: "330327202002030026", school: "永嘉三幼", grade: "中班" });
  const familyAfter = await parentA("getFamilyContext");
  assert.strictEqual(familyAfter.students.length, initialFamily.students.length + 2);
  assert(familyAfter.students.some((item) => item.id === studentA.studentId) && familyAfter.students.some((item) => item.id === studentB.studentId));
  checks += 1;

  await rejects(() => admin("saveParentStudentLink", { parentUserId: "parent2", studentId: studentA.studentId, relationship: "GUARDIAN" }), /转移家长归属/);
  assert.strictEqual(storage.nanlianClubV2.students.find((item) => item.id === studentA.studentId).ownerParentUserId, "parent1");
  checks += 1;

  await rejects(() => parentB("submitChildProfile", { profile: { avatarUrl: "cloud://student-photos/duplicate.jpg", name: "唯一归属甲", gender: "男", birthDate: "2020-01-02", idCardNumber: "330327202001020010", school: "永嘉三幼", grade: "中班" } }), /已经绑定家长账号/);
  assert.strictEqual(storage.nanlianClubV2.students.filter((item) => item.name === "唯一归属甲").length, 1);
  checks += 1;

  const preview = await admin("transferStudentParent", { studentId: studentA.studentId, newParentUserId: "parent2" });
  assert(preview.confirmationRequired && /原家长将无法/.test(preview.message));
  checks += 1;

  const transferred = await admin("transferStudentParent", { studentId: studentA.studentId, newParentUserId: "parent2", confirmTransfer: true, reason: "监护账号调整" });
  assert(transferred.ok);
  assert.strictEqual(storage.nanlianClubV2.students.find((item) => item.id === studentA.studentId).ownerParentUserId, "parent2");
  assert(!storage.nanlianClubV2.users.find((item) => item.id === "parent1").studentIds.includes(studentA.studentId));
  assert(storage.nanlianClubV2.users.find((item) => item.id === "parent2").studentIds.includes(studentA.studentId));
  checks += 1;

  await rejects(() => parentA("getStudent", { id: studentA.studentId }), /无权/);
  await rejects(() => parentA("getGrowthProfile", { studentId: studentA.studentId }), /无权/);
  const parentBStudent = await parentB("getStudent", { id: studentA.studentId });
  assert.strictEqual(parentBStudent.id, studentA.studentId);
  checks += 1;

  await rejects(() => parentA("getLessonLedger", { studentId: studentA.studentId }), /无权/);
  await rejects(() => parentA("listSessions", { studentId: studentA.studentId }), /无权/);
  checks += 1;

  const transferAudit = storage.nanlianClubV2.auditLogs.find((item) => item.action === "TRANSFER_STUDENT_PARENT" && item.studentId === studentA.studentId);
  assert(transferAudit && transferAudit.oldParentUserId === "parent1" && transferAudit.newParentUserId === "parent2" && transferAudit.reason === "监护账号调整");
  checks += 1;

  const activeLinks = storage.nanlianClubV2.parentStudentLinks.filter((item) => item.studentId === studentA.studentId && item.status === "ACTIVE");
  assert.strictEqual(activeLinks.length, 1);
  assert.strictEqual(activeLinks[0].parentUserId, "parent2");
  checks += 1;

  const cleanReport = await admin("checkParentOwnershipConsistency");
  assert.strictEqual(cleanReport.conflictCount, 0);
  assert.strictEqual(cleanReport.autoFixed, false);
  checks += 1;

  const oldParent = storage.nanlianClubV2.users.find((item) => item.id === "parent1");
  oldParent.studentIds.push(studentA.studentId);
  const conflictReport = await admin("checkParentOwnershipConsistency");
  assert.strictEqual(conflictReport.conflictCount, 1);
  assert.strictEqual(conflictReport.conflicts[0].code, "DUPLICATE_PARENT_BINDING");
  assert.strictEqual(conflictReport.conflicts[0].resolution, "需要管理员人工确认");
  assert(oldParent.studentIds.includes(studentA.studentId), "检查器不得自动删除历史冲突");
  checks += 1;

  assert.strictEqual(checks, 12);
  console.log("Parent ownership regression: 12 checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
