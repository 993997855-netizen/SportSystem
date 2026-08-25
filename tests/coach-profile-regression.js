const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; }
};

const domain = require("../miniprogram/utils/local-domain");
const { PUBLIC_KEYS } = require("../miniprogram/utils/coach-profile-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });

async function rejects(fn, pattern) {
  let error;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, "expected rejection");
  if (pattern) assert(pattern.test(error.message), error.message);
}

async function run() {
  await admin("resetDemo");
  let checks = 0;

  const publicRows = await parent("listPublicCoaches");
  assert(publicRows.length >= 2);
  checks += 1;

  const coach = await parent("getPublicCoach", { id: "coach-profile-you" });
  assert.deepStrictEqual(Object.keys(coach).sort(), [...PUBLIC_KEYS].sort());
  checks += 1;

  assert.strictEqual(coach.specialties.length, 3);
  assert(!coach.specialties.includes("梯队建设"));
  checks += 1;

  assert(coach.mainCertificates.includes("中国足协B级教练员"));
  assert(!coach.mainCertificates.includes("俱乐部内部教研认证"));
  checks += 1;

  assert.strictEqual(coach.shortBio.length <= 120, true);
  assert.strictEqual(coach.internalNote, undefined);
  assert.strictEqual(coach.bio, undefined);
  assert.strictEqual(coach.careerHistory, undefined);
  checks += 1;

  const full = await admin("getCoachProfile", { id: "coach-profile-you" });
  assert(full.internalNote && full.bio && full.careerHistory.length === 3);
  assert(full.certificates.some((item) => item.visibility === "INTERNAL"));
  checks += 1;

  await rejects(() => parent("getCoachProfile", { id: "coach-profile-you" }), /权限/);
  checks += 1;

  const created = await admin("saveCoachProfile", { coach: { avatarUrl: "/images/avatar.png", name: "测试教练", publicTitle: "U7基础班教练", coachingYears: 5, highestCertificate: "中国足协D级教练员", certificates: [{ name: "中国足协D级教练员", visibility: "PUBLIC" }, { name: "内部岗位培训", visibility: "INTERNAL" }], currentClasses: ["U7基础班", "U8基础班", "U8精英队", "U9精英队"], specialties: ["1V1", "传接球", "比赛指导", "守门训练"], shortBio: "长期参与青少年足球训练，注重孩子的基本技术、比赛观察和训练兴趣，帮助球员在真实比赛中主动解决问题。", bio: "管理员保留的完整详细介绍。", careerHistory: ["2019-2022 基础班教练", "2023至今 精英队教练"], footballHistory: ["成人队球员"], honors: ["内部荣誉"], internalNote: "内部绩效备注", isPublic: true, active: true } });
  const createdPublic = await parent("getPublicCoach", { id: created.id });
  assert.strictEqual(createdPublic.specialties.length, 3);
  assert.strictEqual(createdPublic.currentClasses.length, 4);
  assert.strictEqual(createdPublic.internalNote, undefined);
  checks += 1;

  await rejects(() => admin("saveCoachProfile", { coach: { ...full, shortBio: "长".repeat(121) } }), /120字/);
  checks += 1;

  await admin("saveCoachProfile", { coach: { ...(await admin("getCoachProfile", { id: created.id })), isPublic: false } });
  await rejects(() => parent("getPublicCoach", { id: created.id }), /未公开/);
  assert(!(await parent("listPublicCoaches")).some((item) => item.coachId === created.id));
  checks += 1;

  assert.strictEqual(checks, 10);
  console.log("Coach profile regression: 10 checks passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
