const assert = require("assert");
const fs = require("fs");
const path = require("path");

const storage = {};
global.wx = { getStorageSync(key) { return storage[key]; }, setStorageSync(key, value) { storage[key] = value; } };
const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (userId, action, data = {}) => domain.call(action, { ...data, previewRole: "coach", previewUserId: userId });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });
let checks = 0;

function check(value, message) { assert(value, message); checks += 1; }
async function rejects(fn, pattern) { let error; try { await fn(); } catch (caught) { error = caught; } assert(error, "expected rejection"); if (pattern) assert(pattern.test(error.message), error.message); checks += 1; }
function activeMember(data, classId, studentId) { return data.classMembers.find((item) => item.classId === classId && item.studentId === studentId && item.status === "ACTIVE"); }

async function run() {
  await admin("resetDemo");
  await admin("getContext");
  const data = storage.nanlianClubV2;
  const snapshots = { waitlist: JSON.stringify(data.waitlist), attendance: JSON.stringify(data.attendance), ledger: JSON.stringify(data.lessonLedger) };

  const meta = await coach("coach2", "getClassMeta");
  check(meta.eliteClasses.some((item) => item.id === "c1516") && meta.regularClasses.some((item) => item.id === "cu7base"), "class meta separates regular and elite classes");
  await rejects(() => parent("joinClass", { classId: "c1516", studentId: "s1" }), /精英队/);
  await rejects(() => parent("listEliteSelections"), /无权/);
  await rejects(() => coach("coach3", "recommendElite", { studentId: "s5", fromClassId: "cu7base", targetEliteClassId: "c1516", recommendationReason: "越权测试" }), /无权|只能推荐/);

  const growth = await coach("coach2", "getEliteGrowthSummary", { studentId: "s5" });
  check(growth && growth.attendance && Array.isArray(growth.trends) && Array.isArray(growth.recentFeedback), "authorized coach receives growth reference");
  const memberCountBefore = data.classMembers.length;
  const recommendation = await coach("coach2", "recommendElite", { studentId: "s5", fromClassId: "cu7base", targetEliteClassId: "c1516", recommendationReason: "训练投入稳定，建议进入精英队继续观察" });
  check(recommendation.status === "PENDING", "coach recommendation enters PENDING status");
  check(data.classMembers.length === memberCountBefore, "recommendation alone never creates classMember");
  await rejects(() => coach("coach2", "reviewEliteSelection", { id: recommendation.id, approved: true }), /管理员/);
  await rejects(() => coach("coach2", "recommendElite", { studentId: "s5", fromClassId: "cu7base", targetEliteClassId: "c1516", recommendationReason: "重复推荐" }), /待审核/);

  const pending = await admin("listEliteSelections");
  check(pending.some((item) => item.id === recommendation.id && item.status === "PENDING" && item.student.id === "s5"), "admin sees complete recommendation record");
  const approved = await admin("reviewEliteSelection", { id: recommendation.id, approved: true, reviewRemark: "同意入队", confirmCapacity: true });
  check(approved.status === "APPROVED", "admin can approve recommendation");
  check(Boolean(activeMember(data, "c1516", "s5")), "approval creates ACTIVE elite classMember");
  check(Boolean(activeMember(data, "cu7base", "s5")), "keepSource defaults to retaining regular class membership");
  const promotedMember = activeMember(data, "c1516", "s5");
  check(promotedMember.source === "ELITE_PROMOTION" && promotedMember.selectionId === recommendation.id, "elite membership retains selection source linkage");
  check(data.playerGrowthEvents.some((item) => item.studentId === "s5" && item.eventType === "ELITE_PROMOTION" && item.sourceId === "c1516"), "approval writes growth timeline event");

  const rejectedRecommendation = await coach("coach2", "recommendElite", { studentId: "s6", fromClassId: "cu7base", targetEliteClassId: "c1516", recommendationReason: "进入观察名单" });
  const rejected = await admin("reviewEliteSelection", { id: rejectedRecommendation.id, approved: false, reviewRemark: "继续基础班训练" });
  check(rejected.status === "REJECTED" && !activeMember(data, "c1516", "s6"), "rejected recommendation never adds elite membership");

  const exitRecommendation = await coach("coach2", "recommendElite", { studentId: "s7", fromClassId: "cu7base", targetEliteClassId: "c1516", recommendationReason: "同年龄梯队调整" });
  await admin("reviewEliteSelection", { id: exitRecommendation.id, approved: true, keepSource: false, reviewRemark: "转入精英队", confirmCapacity: true });
  check(Boolean(activeMember(data, "c1516", "s7")), "approval with keepSource false still adds elite membership");
  check(!activeMember(data, "cu7base", "s7") && data.classMembers.some((item) => item.classId === "cu7base" && item.studentId === "s7" && item.status === "INACTIVE"), "administrator can explicitly exit original regular class");

  check(JSON.stringify(data.waitlist) === snapshots.waitlist, "elite selection never creates or changes waitlist");
  check(JSON.stringify(data.attendance) === snapshots.attendance && JSON.stringify(data.lessonLedger) === snapshots.ledger, "elite selection does not alter attendance or lesson ledger");
  check(!data.auditLogs.some((item) => /auto.*elite|elite.*auto/i.test(item.action)), "no automatic elite promotion action exists");

  const app = JSON.parse(fs.readFileSync(path.join(__dirname, "../miniprogram/app.json"), "utf8"));
  check(["pages/elite-selections/index", "pages/elite-action/index"].every((item) => app.pages.includes(item)), "elite selection pages are registered");
  const cloud = fs.readFileSync(path.join(__dirname, "../cloudfunctions/clubApi/class-service.js"), "utf8");
  const v2 = fs.readFileSync(path.join(__dirname, "../cloudfunctions/clubApi/v2.js"), "utf8");
  check(["recommendElite", "reviewEliteSelection", "promoteToElite"].every((action) => cloud.includes(`\"${action}\"`)) && v2.includes('"eliteSelections"'), "cloud routes actions and creates eliteSelections collection");
  check(!cloud.includes("promoteWaitlist") && !cloud.includes("fillVacancy") && !cloud.includes('collection("waitlist")'), "elite cloud flow contains no waitlist mechanism");

  assert.strictEqual(checks, 24);
  console.log("PHASE D elite selection regression: 24 checks passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
