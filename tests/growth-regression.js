const assert = require("assert");

const storage = {};
global.wx = { getStorageSync(key) { return storage[key]; }, setStorageSync(key, value) { storage[key] = value; } };
const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (action, data = {}) => domain.call(action, { ...data, previewRole: "coach" });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent" });
const checks = { profile: 0, assessment: 0, permission: 0, elite: 0 };
function check(group, value, message) { assert(value, message); checks[group] += 1; }
async function rejects(fn, pattern) { let error; try { await fn(); } catch (caught) { error = caught; } assert(error, "expected rejection"); if (pattern) assert(pattern.test(error.message), error.message); return error; }

async function run() {
  await admin("resetDemo");
  const demo = await admin("getGrowthProfile", { studentId: "s-growth" });
  check("profile", demo.student.name === "王小明" && demo.student.classNames.length === 2, "demo player should belong to regular and elite teams");
  check("profile", demo.assessments.length === 3, "three historical assessments required");
  check("profile", demo.trends.map((item) => item.date).join(",") === "2026-03-20,2026-06-20,2026-08-18", "trend must sort by assessmentDate");
  check("profile", demo.trends[0].overall < demo.trends[1].overall && demo.trends[1].overall < demo.trends[2].overall, "overall trend should improve");
  check("profile", demo.comparisons.length === 5 && demo.latestAssessment.categoryRows.length === 5, "radar must use five categories");
  check("profile", demo.feedback.length >= 3 && demo.matches.length >= 2 && demo.events.some((item) => item.eventType === "ELITE_PROMOTION"), "demo timeline should be complete");
  check("profile", demo.events.every((item, index, rows) => !index || String(rows[index - 1].eventDate) >= String(item.eventDate)), "timeline must sort newest first");

  await rejects(() => parent("getGrowthProfile", { studentId: "s-growth" }), /无权/); check("permission", true, "parent cannot change studentId to another child");
  const coachDemo = await coach("getGrowthProfile", { studentId: "s-growth" }); check("permission", coachDemo.student.id === "s-growth", "authorized coach can access player");
  await rejects(() => parent("listAssessmentTemplates"), /无权/); check("permission", true, "parent cannot enter assessment workspace");

  const meta = await admin("getGrowthMeta");
  const createdTemplate = await admin("saveAssessmentTemplate", { template: { name: "回归测评模板", ageGroup: "U7-U8", assessmentType: "STAGE", categoryWeights: { TECHNICAL: 50, DEVELOPMENT: 50 }, dimensions: [{ category: "TECHNICAL", metricKey: "PASSING", metricName: "传球", weight: 50, enabled: true }, { category: "DEVELOPMENT", metricKey: "FOCUS", metricName: "训练专注", weight: 50, enabled: true }], active: true } });
  check("assessment", Boolean(createdTemplate.id), "admin can create template");

  storage.nanlianClubV2.classes.push({ id: "c-growth-test", name: "成长回归班", classType: "REGULAR", ageGroup: "U7-U8", standardCapacity: 10, status: "ACTIVE", active: true, studentIds: ["s1"] });
  storage.nanlianClubV2.classMembers.push({ id: "cm-growth-test", classId: "c-growth-test", studentId: "s1", memberType: "REGULAR", status: "ACTIVE", joinedAt: "2026-08-01 10:00", source: "ADMIN_ADD" });
  const round = await admin("createAssessmentRound", { name: "成长回归阶段测评", classId: "c-growth-test", assessmentTemplateId: createdTemplate.id, assessmentDate: "2026-09-20", coachName: "游导" });
  check("assessment", Boolean(round.id), "admin can create assessment round");
  const roundDetail = await admin("getAssessmentRound", { id: round.id }); check("assessment", roundDetail.expected === 1 && roundDetail.completed === 0, "round roster uses active classMembers");
  const scores = [{ category: "TECHNICAL", metricKey: "PASSING", metricName: "传球", score: 4 }, { category: "DEVELOPMENT", metricKey: "FOCUS", metricName: "训练专注", score: 3 }];
  const draft = await admin("savePlayerAssessment", { roundId: round.id, studentId: "s1", scores, strengths: ["传球"], developmentAreas: ["专注"], coachComment: "继续提升", visibility: "PARENT_VISIBLE", complete: false });
  check("assessment", draft.status === "DRAFT" && draft.overallScore === 3.5, "draft and weighted score should be correct");
  await rejects(() => admin("publishAssessmentRound", { id: round.id }), /尚未完成/); check("assessment", true, "unfinished round cannot publish");
  const completed = await admin("savePlayerAssessment", { roundId: round.id, studentId: "s1", scores, strengths: ["传球"], developmentAreas: ["专注"], coachComment: "继续提升", coachMessage: "保持热爱", visibility: "PARENT_VISIBLE", complete: true });
  check("assessment", completed.status === "COMPLETED", "assessment can complete");
  const countBeforePublish = storage.nanlianClubV2.playerAssessments.length;
  const published = await admin("publishAssessmentRound", { id: round.id }); check("assessment", published.published === 1, "admin can publish completed round");
  const parentProfile = await parent("getGrowthProfile", { studentId: "s1" });
  check("permission", parentProfile.assessments.some((item) => item.roundId === round.id), "parent can see own published parent-visible assessment");
  check("assessment", storage.nanlianClubV2.playerAssessments.length === countBeforePublish, "publishing must not overwrite or duplicate history");

  const roster = await coach("getSessionEvaluationRoster", { sessionId: "se1" });
  check("profile", roster.students.length === 2 && roster.students.every((item) => ["s1", "s2"].includes(item.id)), "daily evaluation roster uses fixed class members");
  await coach("batchAddTrainingTag", { sessionId: "se1", studentIds: ["s1", "s2"], tag: "1V1表现积极" });
  check("profile", storage.nanlianClubV2.feedback.filter((item) => item.sessionId === "se1" && ["s1", "s2"].includes(item.studentId) && item.tags.includes("1V1表现积极")).length === 2, "batch tag should apply to selected members");
  await coach("saveTrainingEvaluation", { sessionId: "se1", studentId: "s1", trainingStatus: 4, tags: ["积极主动"], highlights: "控球稳定", developmentAreas: "弱势脚", coachComment: "表现良好", visibility: "STAFF_ONLY" });
  const parentHidden = await parent("getGrowthProfile", { studentId: "s1" }); check("permission", !parentHidden.feedback.some((item) => item.content === "表现良好"), "staff-only feedback must stay hidden from parent");
  await coach("saveMatchRecord", { studentId: "s1", matchDate: "2026-09-01", opponent: "回归对手", teamName: "南联U8", position: "后卫", minutesPlayed: 40, goals: 0, assists: 0, coachRating: 4, coachComment: "防守稳定", visibility: "PARENT_VISIBLE" });
  check("profile", (await parent("getGrowthProfile", { studentId: "s1" })).matches.some((item) => item.opponent === "回归对手"), "parent-visible match should appear");

  const beforeEvents = storage.nanlianClubV2.playerGrowthEvents.length;
  await admin("promoteToElite", { studentId: "s4", fromClassId: "cinterest", targetEliteClassId: "c1516", reason: "结合成长档案人工确认", keepSource: true, confirmCapacity: true });
  check("elite", storage.nanlianClubV2.playerGrowthEvents.length === beforeEvents + 1, "elite promotion should create growth event");
  check("elite", storage.nanlianClubV2.eliteSelections.some((item) => item.studentId === "s4" && item.status === "APPROVED"), "human elite selection remains authoritative");
  check("elite", !storage.nanlianClubV2.auditLogs.some((item) => /auto.*elite/i.test(item.action)), "no automatic elite promotion action exists");
  const summary = await coach("getEliteGrowthSummary", { studentId: "s-growth" }); check("elite", summary.latestAssessment && summary.trends.length === 3 && summary.matches.length >= 2, "elite page receives growth reference");
  check("assessment", meta.templates.length >= 2, "default age-group templates should exist");

  assert.strictEqual(checks.profile, 10);
  assert.strictEqual(checks.assessment, 9);
  assert.strictEqual(checks.permission, 5);
  assert.strictEqual(checks.elite, 4);
  console.log("Growth profile regression: 10 checks passed");
  console.log("Assessment regression: 9 checks passed");
  console.log("Permission regression: 5 checks passed");
  console.log("Elite integration regression: 4 checks passed");
  console.log(`Growth V4 regression: ${Object.values(checks).reduce((sum, value) => sum + value, 0)} checks passed`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
