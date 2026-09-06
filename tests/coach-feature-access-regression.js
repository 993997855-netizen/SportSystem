const assert = require("assert");
const fs = require("fs");
const path = require("path");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
};

const domain = require("../miniprogram/utils/local-domain");
const navigation = require("../miniprogram/utils/navigation-config");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const admin = (action, input = {}) => domain.call(action, { ...input, previewRole: "admin", previewUserId: "admin1" });
const coach = (coachId, action, input = {}) => domain.call(action, { ...input, previewRole: "coach", previewUserId: coachId });
const parent = (action, input = {}) => domain.call(action, { ...input, previewRole: "parent", previewUserId: "parent1" });

let checks = 0;
function check(value, message) { assert(value, message); checks += 1; }
async function rejects(call, pattern) {
  let error;
  try { await call(); } catch (caught) { error = caught; }
  check(Boolean(error), "expected action to be rejected");
  if (pattern) check(pattern.test(error.message), `unexpected error: ${error.message}`);
}

(async () => {
  await admin("resetDemo");
  await admin("getContext");
  const data = storage.nanlianClubV2;
  const ownClass = data.classes.find((item) => item.id === "cu7base");
  const otherClass = data.classes.find((item) => item.id === "c1718");
  const ownMember = data.classMembers.find((item) => item.classId === "cu7base" && item.status === "ACTIVE");
  const otherMember = data.classMembers.find((item) => item.classId === "c1718" && item.status === "ACTIVE");
  check(Boolean(ownClass && otherClass && ownMember && otherMember), "permission fixture is available");

  const home = read("miniprogram/pages/index/index.wxml");
  const profile = read("miniprogram/pages/profile/index.wxml");
  const classes = read("miniprogram/pages/classes/index.wxml");
  const classDetail = read("miniprogram/pages/class-detail/index.wxml");
  const sessions = read("miniprogram/pages/sessions/index.wxml");
  const sessionDetail = read("miniprogram/pages/session-detail/index.wxml");
  const eliteForm = read("miniprogram/pages/elite-action/index.wxml");
  const cloud = read("cloudfunctions/clubApi/v2.js");
  const classService = read("cloudfunctions/clubApi/class-service.js");

  const coachHome = navigation.homeEntries("coach");
  check(!coachHome.some((item) => ["我的招生", "运营后台", "班级管理", "课程管理"].includes(item.label)), "coach home has no recruitment or management entry");
  check(navigation.FEATURES.adminCrm.roles.length === 1 && navigation.FEATURES.adminCrm.roles[0] === "admin", "CRM entry is admin-only");
  check(navigation.FEATURES.adminOperations.roles.length === 1 && navigation.FEATURES.adminOperations.roles[0] === "admin", "operations entry is admin-only");
  check(navigation.profileEntries("coach").every((item) => item.key !== "adminOperations"), "profile operations entry is excluded from coach");
  check(["coachElite", "coachWorkload", "coachAttendance"].every((key) => coachHome.some((item) => item.key === key)), "coach home retains elite, workload and attendance entries");
  check(!coachHome.some((item) => item.key === "coachCurriculums"), "coach home no longer exposes redundant curriculum entry");
  check(home.includes("wx:for=\"{{quickEntries}}\"") && profile.includes("wx:for=\"{{menuEntries}}\""), "home and profile use role-scoped navigation configuration");
  check(classes.includes("wx:if=\"{{role === 'admin'}}\"") && classes.includes("创建班级"), "class creation button is admin-only");
  check(classDetail.includes("wx:if=\"{{role === 'admin'}}\"") && classDetail.includes("+ 添加学员"), "class member controls are admin-only");
  check(sessions.includes("floating-add-button wx:if=\"{{role === 'admin'}}\""), "session creation button is admin-only");
  check(sessionDetail.includes("role === 'admin' && session.status !== 'COMPLETED'") && sessionDetail.includes("role === 'admin' && session.status !== 'CANCELLED'"), "session state and cancellation controls are admin-only");
  check(eliteForm.includes("训练表现") && eliteForm.includes("技术表现") && eliteForm.includes("比赛表现"), "elite recommendation accepts observation fields");
  check(cloud.includes("COACH_MANAGEMENT_FORBIDDEN") && cloud.includes("COACH_ADMIN_ONLY_ACTIONS"), "cloud has centralized coach management denial");
  check(classService.includes("COACH_ELITE_RECOMMEND_FORBIDDEN"), "elite recommendation has dedicated scope error code");

  const classPayload = { id: ownClass.id, name: ownClass.name, classType: ownClass.classType, ageGroup: ownClass.ageGroup, standardCapacity: ownClass.standardCapacity, headCoachUserId: ownClass.headCoachUserId, schedule: ownClass.schedule, venue: ownClass.venue, status: ownClass.status };
  await rejects(() => coach("coach2", "saveClass", { clubClass: { ...classPayload, id: undefined, name: "教练新班" } }), /权限/);
  await rejects(() => coach("coach2", "saveClass", { clubClass: { ...classPayload, name: "教练改名" } }), /权限/);
  await rejects(() => coach("coach2", "addClassMember", { classId: ownClass.id, studentId: otherMember.studentId, confirmCapacity: true }), /管理员/);
  await rejects(() => coach("coach2", "removeClassMember", { memberId: ownMember.id }), /管理员/);
  await rejects(() => coach("coach2", "transferClassMember", { memberId: ownMember.id, targetClassId: otherClass.id }), /管理员/);
  await rejects(() => coach("coach2", "joinClass", { classId: ownClass.id, studentId: ownMember.studentId }), /家长/);

  const sessionPayload = { classId: ownClass.id, title: "权限测试课", date: "2026-09-20", weekday: "周日", time: "18:00-19:30", venue: "权限测试场地", focus: "测试", capacity: 20, status: "published" };
  await rejects(() => coach("coach2", "saveSession", { session: sessionPayload }), /权限/);
  const created = await admin("saveSession", { session: sessionPayload });
  check(Boolean(created.id), "admin can create session schedule");
  await rejects(() => coach("coach2", "saveSession", { session: { ...sessionPayload, id: created.id, time: "19:30-21:00" } }), /权限/);
  await rejects(() => coach("coach2", "saveSession", { session: { ...sessionPayload, id: created.id, venue: "其他场地" } }), /权限/);
  await rejects(() => coach("coach2", "saveSession", { session: { ...sessionPayload, id: created.id, plannedCoachAssignments: [{ coachId: "coach1", role: "HEAD" }] } }), /权限/);
  await rejects(() => coach("coach2", "completeSession", { sessionId: created.id }), /管理员/);
  const ownSessions = await coach("coach2", "listSessions");
  check(ownSessions.some((item) => item.id === created.id), "coach can view own assigned session");
  const otherSessions = await coach("coach3", "listSessions");
  check(!otherSessions.some((item) => item.id === created.id), "other coach cannot view session");

  const recommendation = await coach("coach2", "recommendElite", { studentId: ownMember.studentId, fromClassId: ownClass.id, targetEliteClassId: "c1516", recommendationReason: "训练稳定", trainingPerformance: "投入", technicalPerformance: "控球进步", matchPerformance: "敢于对抗" });
  check(recommendation.status === "PENDING", "coach can submit elite recommendation for own active member");
  const ownRecommendations = await coach("coach2", "listEliteSelections");
  check(ownRecommendations.some((item) => item.id === recommendation.id), "coach sees own recommendation");
  check(!(await coach("coach3", "listEliteSelections")).some((item) => item.id === recommendation.id), "other coach cannot see recommendation");
  await rejects(() => coach("coach2", "recommendElite", { studentId: otherMember.studentId, fromClassId: otherClass.id, targetEliteClassId: "c1516", recommendationReason: "越权" }), /只能推荐|无权/);
  await rejects(() => coach("coach2", "reviewEliteSelection", { id: recommendation.id, approved: true }), /管理员/);
  const reviewed = await admin("reviewEliteSelection", { id: recommendation.id, approved: false, reviewRemark: "继续观察" });
  check(reviewed.status === "REJECTED", "admin retains elite review authority");

  const parentJoin = await parent("joinClass", { classId: "cinterest", studentId: "s1" });
  check(["ACTIVE", "FULL"].includes(parentJoin.status), "parent class signup rule remains available");

  console.log(`Coach feature access regression: ${checks} checks passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
