const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; }
};

const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (action, data = {}) => domain.call(action, { ...data, previewRole: "coach" });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });
const otherParent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent2" });

async function rejects(fn, pattern) {
  let error;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, "expected rejection");
  if (pattern) assert(pattern.test(error.message), error.message);
}

async function run() {
  await admin("resetDemo");
  let checks = 0;

  const family = await parent("getFamilyContext");
  assert(family.students.some((item) => item.avatarUrl) && family.students.some((item) => !item.avatarUrl));
  checks += 1;

  await rejects(() => parent("submitChildProfile", { profile: { name: "无照片学员", gender: "男", birthDate: "2020-01-01", idCardNumber: "330327202001010015", school: "永嘉三幼", grade: "中班" } }), /照片/);
  checks += 1;

  const photo = "cloud://student-photos/internal/2026-08-21/new-child.jpg";
  const request = await parent("submitChildProfile", { profile: { avatarUrl: photo, name: "照片回归学员", gender: "男", birthDate: "2020-01-01", idCardNumber: "330327202001010015", school: "永嘉三幼", grade: "中班" } });
  const approved = await admin("reviewChildProfileRequest", { id: request.id, decision: "APPROVE" });
  assert.strictEqual(storage.nanlianClubV2.students.find((item) => item.id === approved.studentId).avatarUrl, photo);
  checks += 1;

  const refreshedFamily = await parent("getFamilyContext", { activeStudentId: approved.studentId });
  assert.strictEqual(refreshedFamily.students.find((item) => item.id === approved.studentId).avatarUrl, photo);
  checks += 1;

  const adminStudents = await admin("listStudents");
  assert(adminStudents.find((item) => item.id === "s1").avatarUrl);
  checks += 1;

  const classDetail = await admin("getClassDetail", { id: "c1718" });
  assert(classDetail.members.find((item) => item.student.id === "s1").student.avatarUrl);
  checks += 1;

  const attendance = await coach("getAttendanceSheet", { sessionId: "se1" });
  assert(attendance.students.find((item) => item.id === "s1").avatarUrl);
  checks += 1;

  const growth = await parent("getGrowthProfile", { studentId: "s1" });
  assert(growth.student.avatarUrl);
  checks += 1;

  const roster = await admin("getLeagueTeamRoster", { matchId: "lm1", teamId: "tm-nl17" });
  assert(roster.members.find((item) => item.memberId === "s1").avatarUrl);
  checks += 1;

  const parentPhoto = "cloud://student-photos/internal/2026-08-21/parent-replaced.jpg";
  await parent("updateStudentAvatar", { studentId: "s1", avatarUrl: parentPhoto });
  assert.strictEqual((await parent("getStudent", { id: "s1" })).avatarUrl, parentPhoto);
  checks += 1;

  const adminPhoto = "cloud://student-photos/internal/2026-08-21/admin-replaced.jpg";
  await admin("updateStudentAvatar", { studentId: "s1", avatarUrl: adminPhoto });
  assert.strictEqual((await admin("getStudent", { id: "s1" })).avatarUrl, adminPhoto);
  assert(storage.nanlianClubV2.auditLogs.some((item) => item.action === "UPDATE_STUDENT_AVATAR" && item.targetId === "s1"));
  checks += 1;

  await rejects(() => otherParent("getStudent", { id: "s1" }), /无权/);
  await rejects(() => otherParent("updateStudentAvatar", { studentId: "s1", avatarUrl: "cloud://forbidden.jpg" }), /无权/);
  checks += 1;

  assert.strictEqual(refreshedFamily.students.find((item) => item.id === "s-family3").avatarUrl, "");
  assert(!storage.nanlianClubV2.students.some((item) => String(item.avatarUrl || "").startsWith("data:image/")));
  checks += 1;

  assert.strictEqual(checks, 13);
  console.log("Student photo regression: 13 checks passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
