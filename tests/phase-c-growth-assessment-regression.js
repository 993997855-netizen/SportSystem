const assert = require("assert");
const fs = require("fs");
const path = require("path");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; }
};

const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (userId, action, data = {}) => domain.call(action, { ...data, previewRole: "coach", previewUserId: userId });
const parent = (userId, action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: userId });
const checks = { profile: 0, assessment: 0, permission: 0, compatibility: 0 };

function check(group, value, message) {
  assert(value, message);
  checks[group] += 1;
}

async function rejects(fn, pattern) {
  let error;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, "expected rejection");
  if (pattern) assert(pattern.test(error.message), error.message);
}

function scores(base) {
  return [
    ["TECHNICAL", "PASSING", "传球"],
    ["TACTICAL", "SPATIAL_AWARENESS", "空间意识"],
    ["ATHLETIC", "COORDINATION", "协调性"],
    ["MATCH", "MATCH_ENGAGEMENT", "比赛投入度"],
    ["DEVELOPMENT", "FOCUS", "训练专注"]
  ].map(([category, metricKey, metricName], index) => ({ category, metricKey, metricName, score: Math.min(5, base + (index % 2)) }));
}

async function completeRound(roundId, base) {
  for (const studentId of ["s1", "s2"]) {
    await coach("coach1", "savePlayerAssessment", {
      roundId,
      studentId,
      scores: scores(base),
      strengths: ["积极投入"],
      developmentAreas: ["接球前观察"],
      coachComment: "按阶段持续进步",
      coachMessage: "保持热爱",
      visibility: "PARENT_VISIBLE",
      complete: true
    });
  }
  return admin("publishAssessmentRound", { id: roundId });
}

async function run() {
  await admin("resetDemo");
  await admin("getContext");
  const data = storage.nanlianClubV2;
  const businessSnapshot = JSON.stringify({
    classMembers: data.classMembers,
    waitlist: data.waitlist,
    lessonLedger: data.lessonLedger
  });

  const activeStudents = data.students.filter((item) => item.status === "active");
  for (const student of activeStudents) {
    const profile = await admin("getGrowthProfile", { studentId: student.id });
    assert.strictEqual(profile.student.id, student.id);
  }
  check("profile", activeStudents.length > 0, "every active student receives a computed growth profile");

  const meta = await admin("getGrowthMeta");
  check("profile", Object.keys(meta.categories).join(",") === "TECHNICAL,TACTICAL,ATHLETIC,MATCH,DEVELOPMENT", "growth model must expose exactly five top dimensions");
  check("profile", Object.keys(meta.scoreLabels).join(",") === "1,2,3,4,5", "score labels must cover levels 1-5");

  const template = await admin("saveAssessmentTemplate", {
    template: {
      name: "PHASE C 五维回归模板",
      ageGroup: "U7-U8",
      assessmentType: "STAGE",
      categoryWeights: { TECHNICAL: 20, TACTICAL: 20, ATHLETIC: 20, MATCH: 20, DEVELOPMENT: 20 },
      dimensions: scores(3).map(({ score, ...item }) => ({ ...item, weight: 20, enabled: true })),
      active: true
    }
  });
  check("assessment", Boolean(template.id), "admin can create a five-dimension template");

  const firstRound = await admin("createAssessmentRound", { name: "PHASE C 第一阶段", classId: "c1718", assessmentTemplateId: template.id, assessmentDate: "2026-09-10", coachId: "coach1", coachName: "游导" });
  const secondRound = await admin("createAssessmentRound", { name: "PHASE C 第二阶段", classId: "c1718", assessmentTemplateId: template.id, assessmentDate: "2026-10-10", coachId: "coach1", coachName: "游导" });
  check("assessment", firstRound.id !== secondRound.id, "different assessment rounds must have independent IDs");

  const firstRoster = await coach("coach1", "getAssessmentRound", { id: firstRound.id });
  check("assessment", firstRoster.expected === 2 && firstRoster.students.every((item) => ["s1", "s2"].includes(item.id)), "round roster uses ACTIVE classMembers");
  await completeRound(firstRound.id, 3);
  const firstAssessment = { ...data.playerAssessments.find((item) => item.roundId === firstRound.id && item.studentId === "s1") };
  await completeRound(secondRound.id, 4);
  check("assessment", data.playerAssessments.filter((item) => [firstRound.id, secondRound.id].includes(item.roundId)).length === 4, "two rounds retain four independent student assessments");
  check("assessment", JSON.stringify(data.playerAssessments.find((item) => item.id === firstAssessment.id).scores) === JSON.stringify(firstAssessment.scores), "later rounds do not overwrite prior scores");

  const parentProfile = await parent("parent1", "getGrowthProfile", { studentId: "s1" });
  const phaseTrends = parentProfile.trends.filter((item) => ["2026-09-10", "2026-10-10"].includes(item.date));
  check("profile", phaseTrends.map((item) => item.date).join(",") === "2026-09-10,2026-10-10", "trend data is chronological");
  check("profile", phaseTrends[1].overall > phaseTrends[0].overall, "trend reflects the student's own improvement");
  check("profile", parentProfile.latestAssessment.categoryRows.length === 5 && parentProfile.comparisons.length === 5, "radar and comparison only use five dimensions");
  check("profile", !Object.keys(parentProfile).some((key) => /rank|ranking/i.test(key)), "growth profile exposes no public ranking");

  await rejects(() => parent("parent1", "getGrowthProfile", { studentId: "s2" }), /无权/);
  check("permission", true, "parent cannot read another parent's child by changing studentId");
  await rejects(() => coach("coach3", "getGrowthProfile", { studentId: "s1" }), /无权/);
  check("permission", true, "unauthorized coach cannot read another class's student");
  await rejects(() => coach("coach3", "savePlayerAssessment", { roundId: firstRound.id, studentId: "s1", scores: scores(5), complete: true }), /无权/);
  check("permission", true, "unauthorized coach cannot write another class's assessment");
  check("permission", (await coach("coach1", "getGrowthProfile", { studentId: "s1" })).student.id === "s1", "authorized coach can read assigned student");

  const assessmentCount = data.playerAssessments.length;
  await coach("coach1", "saveTrainingEvaluation", { sessionId: "se1", studentId: "s1", trainingStatus: 4, tags: ["积极主动"], highlights: "训练投入", developmentAreas: "弱势脚", coachComment: "内部训练记录", visibility: "STAFF_ONLY" });
  check("assessment", data.playerAssessments.length === assessmentCount, "daily evaluation remains separate from stage assessment history");
  check("permission", !(await parent("parent1", "getGrowthProfile", { studentId: "s1" })).feedback.some((item) => item.content === "内部训练记录"), "STAFF_ONLY daily notes are hidden from parents");

  const s1 = data.students.find((item) => item.id === "s1");
  s1.idCard = "SHOULD_NOT_LEAK";
  s1.idCardNumber = "330327201703180030";
  s1.privateProfile = { idCardNumber: "SHOULD_NOT_LEAK" };
  const safeProfile = await parent("parent1", "getGrowthProfile", { studentId: "s1" });
  check("permission", !("idCard" in safeProfile.student) && !("idCardNumber" in safeProfile.student) && !("privateProfile" in safeProfile.student), "growth API strips misplaced identity fields defensively");
  check("permission", !JSON.stringify(safeProfile).includes("330327201703180030"), "private identity data never appears in parent growth response");

  const afterBusiness = JSON.stringify({ classMembers: data.classMembers, waitlist: data.waitlist, lessonLedger: data.lessonLedger });
  check("compatibility", afterBusiness === businessSnapshot, "PHASE C does not alter class membership, waitlist, or lesson ledger");
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, "../miniprogram/app.json"), "utf8"));
  const requiredPages = ["pages/growth-profile/index", "pages/assessment-rounds/index", "pages/assessment-round-form/index", "pages/assessment-round-detail/index", "pages/assessment-form/index", "pages/training-evaluation/index"];
  check("compatibility", requiredPages.every((page) => app.pages.includes(page)), "all PHASE C pages are registered");
  const cloud = fs.readFileSync(path.join(__dirname, "../cloudfunctions/clubApi/growth-service.js"), "utf8");
  check("compatibility", cloud.includes("assertStudentAccess(user, studentId)") && cloud.includes('status: "ACTIVE"'), "cloud permissions use authoritative parent ownership and ACTIVE class membership");
  check("compatibility", !cloud.includes("studentPrivateProfiles"), "growth cloud service never reads the private identity collection");

  console.log(`Growth profile regression: ${checks.profile} checks passed`);
  console.log(`Assessment regression: ${checks.assessment} checks passed`);
  console.log(`PHASE C permission regression: ${checks.permission} checks passed`);
  console.log(`Compatibility regression: ${checks.compatibility} checks passed`);
  console.log(`PHASE C growth & assessment regression: ${Object.values(checks).reduce((sum, value) => sum + value, 0)} checks passed`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
