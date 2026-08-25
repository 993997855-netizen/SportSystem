const assert = require("assert");
const fs = require("fs");
const path = require("path");
const storage = {};
global.wx = { getStorageSync: (key) => storage[key], setStorageSync: (key, value) => { storage[key] = value; } };
const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (action, data = {}, id = "coach1") => domain.call(action, { ...data, previewRole: "coach", previewUserId: id });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });
async function rejects(call, pattern) { let error; try { await call(); } catch (value) { error = value; } assert(error, "应拒绝该操作"); if (pattern) assert(pattern.test(error.message), error.message); }

async function run() {
  await admin("resetDemo"); await admin("getContext"); const data = storage.nanlianClubV2;
  const invariants = { members: JSON.stringify(data.classMembers), waitlist: JSON.stringify(data.waitlist), ledger: JSON.stringify(data.lessonLedger) };

  const created = await admin("saveCurriculum", { curriculum: { name: "回归U9训练大纲", ageGroup: "U9", classType: "REGULAR", objectives: ["控球"], trainingTopics: ["DRIBBLING", "PASSING"], description: "回归测试", sortOrder: 5 } });
  assert(created.id);
  await admin("saveCurriculum", { curriculum: { id: created.id, name: "回归U9修改版", ageGroup: "U9", classType: "REGULAR", objectives: ["控球与传球"], trainingTopics: ["DRIBBLING", "PASSING", "RECEIVING"], description: "已修改", sortOrder: 1 } });
  assert.strictEqual((await admin("listCurriculums"))[0].id, created.id, "排序字段应生效");
  await rejects(() => coach("saveCurriculum", { curriculum: { name: "越权", ageGroup: "U8", trainingTopics: ["PASSING"] } }), /管理员/);
  await admin("setCurriculumStatus", { id: created.id, active: false });
  assert(!(await coach("listCurriculums")).some((item) => item.id === created.id), "教练不可见停用大纲");
  await admin("setCurriculumStatus", { id: created.id, active: true });
  assert((await coach("listCurriculums")).some((item) => item.id === created.id), "恢复后教练可见");

  const plan = await coach("saveWeeklyTrainingPlan", { plan: { classId: "c1718", weekStart: "2026-09-07", weekEnd: "2026-09-13", mainTheme: "1V1进攻", themeKey: "ONE_V_ONE_ATTACK", trainingFocus: ["变向", "加速"], curriculumId: "cur-u8-simple" } });
  assert(plan.id);
  await rejects(() => coach("saveWeeklyTrainingPlan", { plan: { classId: "cu7base", weekStart: "2026-09-07", weekEnd: "2026-09-13", mainTheme: "越权", trainingFocus: ["越权"] } }), /自己负责班级/);
  await coach("saveWeeklyTrainingPlan", { plan: { id: plan.id, classId: "c1718", weekStart: "2026-09-07", weekEnd: "2026-09-13", mainTheme: "1V1进攻", themeKey: "ONE_V_ONE_ATTACK", trainingFocus: ["变向", "加速", "射门"], curriculumId: "cur-u8-simple", meetingNote: "周四增加2V1" } });
  await coach("confirmWeeklyTrainingPlan", { id: plan.id, meetingNote: "周六会议：周四增加2V1" });
  const confirmed = await admin("getWeeklyTrainingPlan", { id: plan.id }); assert.strictEqual(confirmed.status, "CONFIRMED"); assert(confirmed.meetingNote.includes("周六会议"));

  await coach("saveSessionTrainingInfo", { sessionId: "se1", trainingTheme: "1V1变向突破", trainingThemeKey: "ONE_V_ONE_ATTACK", trainingFocus: ["变向", "加速", "突破后的射门"], trainingNote: "内部完成情况", weeklyTrainingPlanId: plan.id });
  const info = await coach("getSessionTrainingInfo", { sessionId: "se1" }); assert.strictEqual(info.trainingFocus, "变向 / 加速 / 突破后的射门"); assert.strictEqual(info.trainingNote, "内部完成情况");
  const parentInfo = await parent("getSessionTrainingInfo", { sessionId: "se1", studentId: "s1" }); assert(parentInfo.trainingFocus.includes("加速")); assert.strictEqual(parentInfo.trainingNote, undefined); assert.strictEqual(parentInfo.weeklyPlan, undefined);
  await rejects(() => parent("getSessionTrainingInfo", { sessionId: "se3", studentId: "s1" }), /不是本课程班级成员/);
  await rejects(() => parent("getSessionTrainingInfo", { sessionId: "se1", studentId: "s3" }), /无权/);
  const publicSession = await parent("getSession", { id: "se1", studentId: "s1" }); assert.strictEqual(publicSession.trainingNote, undefined); assert.strictEqual(publicSession.weeklyTrainingPlanId, undefined);
  const timetable = await coach("getUnifiedTimetable", { startDate: "2026-08-01", endDate: "2026-09-30" }); const item = (timetable.items || []).find((row) => row.sessionId === "se1"); assert(item && (item.trainingTheme === "1V1变向突破" || item.trainingFocus.includes("加速")));

  assert.strictEqual(JSON.stringify(data.classMembers), invariants.members, "训练模块不得修改班级成员");
  assert.strictEqual(JSON.stringify(data.waitlist), invariants.waitlist, "训练模块不得修改历史候补数据");
  assert.strictEqual(JSON.stringify(data.lessonLedger), invariants.ledger, "训练模块不得修改课时流水");

  const app = JSON.parse(fs.readFileSync(path.join(__dirname, "../miniprogram/app.json"), "utf8"));
  ["research-center", "curriculums", "curriculum-form", "training-cycles", "training-plan-detail", "training-execution"].forEach((name) => assert(app.pages.includes(`pages/${name}/index`), `${name} 未注册`));
  const cloudSource = fs.readFileSync(path.join(__dirname, "../cloudfunctions/clubApi/training-service.js"), "utf8"); assert(cloudSource.includes("classMembers")); assert(cloudSource.includes("delete value.meetingNote")); assert(!cloudSource.includes('"getCoachWorkbench"'));
  console.log("PHASE B training regression: 22 checks passed");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
