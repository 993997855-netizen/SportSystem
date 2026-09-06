const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  COACH_CAPABILITIES,
  coachPrincipalId,
  classCoachIds,
  sessionCoachIds,
  coachStudentView,
  coachClassView,
  createCoachScope,
} = require("../cloudfunctions/clubApi/coach-scope");
const navigation = require("../miniprogram/utils/navigation-config");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
function check(value, message) { assert(value, message); checks += 1; }

const collections = {
  classes: [
    { _id: "class-a", name: "A班", status: "ACTIVE", headCoachUserId: "coach-a", assistantCoachIds: [] },
    { _id: "class-b", name: "B班", status: "ACTIVE", headCoachUserId: "coach-b", assistantCoachIds: [] },
    { _id: "class-c", name: "C班", status: "ACTIVE", headCoachUserId: "coach-b", assistantCoachIds: ["coach-a"] },
  ],
  classMembers: [
    { _id: "member-a", classId: "class-a", studentId: "student-a", status: "ACTIVE" },
    { _id: "member-b", classId: "class-b", studentId: "student-b", status: "ACTIVE" },
    { _id: "member-c", classId: "class-c", studentId: "student-c", status: "ACTIVE" },
    { _id: "member-old", classId: "class-a", studentId: "student-old", status: "INACTIVE" },
  ],
  students: [
    { _id: "student-a", name: "甲", avatarUrl: "a.jpg", birthDate: "2017-01-01", school: "一小", guardianName: "甲家长", guardianPhone: "13800000000", remainingLessons: 20, idCardNumber: "secret-a" },
    { _id: "student-b", name: "乙", guardianPhone: "13900000000", remainingLessons: 10 },
    { _id: "student-c", name: "丙", guardianPhone: "13700000000", remainingLessons: 5 },
  ],
  sessions: [
    { _id: "session-a", classId: "class-a", plannedCoachAssignments: [{ coachId: "coach-a", role: "HEAD" }], actualCoachAssignments: [] },
    { _id: "session-b", classId: "class-a", plannedCoachAssignments: [{ coachId: "coach-a", role: "HEAD" }], actualCoachAssignments: [{ coachId: "coach-b", role: "SUBSTITUTE" }] },
  ],
};

const fetchAll = async (name, where) => (collections[name] || []).filter((row) => !where || Object.entries(where).every(([key, value]) => row[key] === value));
const fetchByIds = async (name, ids) => (collections[name] || []).filter((row) => ids.includes(row._id));
const db = { collection: (name) => ({ doc: (id) => ({ get: async () => ({ data: (collections[name] || []).find((row) => row._id === id) || null }) }) }) };
const scope = createCoachScope({ db, fetchAll, fetchByIds });
const coach = { _id: "user-a", coachId: "coach-a", role: "coach", classIds: ["class-b"] };

(async () => {
  check(coachPrincipalId(coach) === "coach-a", "canonical coachId wins over user id");
  check(classCoachIds(collections.classes[0]).includes("coach-a"), "head coach is recognized");
  check(classCoachIds(collections.classes[2]).includes("coach-a"), "assistant coach is recognized");
  check(!classCoachIds(collections.classes[1]).includes("coach-a"), "other coach class is excluded");
  check(sessionCoachIds(collections.sessions[0]).includes("coach-a"), "planned assignment applies when actual is empty");
  check(sessionCoachIds(collections.sessions[1]).includes("coach-b") && !sessionCoachIds(collections.sessions[1]).includes("coach-a"), "actual assignment overrides planned assignment");

  const assigned = await scope.assignedClassIds(coach);
  check(assigned.includes("class-a") && assigned.includes("class-c"), "coach receives head and assistant classes");
  check(!assigned.includes("class-b"), "forged users.classIds cannot grant another class");
  const students = await scope.allowedStudentIds(coach);
  check(students.includes("student-a") && students.includes("student-c"), "ACTIVE members of assigned classes are visible");
  check(!students.includes("student-b"), "student in another coach class is hidden");
  check(!students.includes("student-old"), "INACTIVE membership grants no current access");
  await scope.assertClassAccess(coach, "class-a"); checks += 1;
  await assert.rejects(() => scope.assertClassAccess(coach, "class-b"), (error) => error.code === "COACH_CLASS_SCOPE_FORBIDDEN"); checks += 1;
  await scope.assertStudentAccess(coach, "student-a"); checks += 1;
  await assert.rejects(() => scope.assertStudentAccess(coach, "student-b"), (error) => error.code === "COACH_STUDENT_SCOPE_FORBIDDEN"); checks += 1;
  await scope.assertSessionAccess(coach, "session-a"); checks += 1;
  await assert.rejects(() => scope.assertSessionAccess(coach, "session-b"), (error) => error.code === "COACH_SESSION_SCOPE_FORBIDDEN"); checks += 1;

  const studentView = coachStudentView(collections.students[0]);
  check(studentView.name === "甲" && studentView.school === "一小", "coach student whitelist keeps work identity fields");
  check(!("guardianPhone" in studentView) && !("guardianName" in studentView), "guardian identity is removed");
  check(!("remainingLessons" in studentView), "lesson balance is removed");
  check(!("idCardNumber" in studentView), "identity number is removed");
  const classView = coachClassView({ ...collections.classes[0], id: "class-a", classCode: "NLA", classTypeLabel: "普通班", studentIds: ["student-a"], remark: "internal", studentCount: 1 });
  check(classView.name === "A班" && classView.studentCount === 1, "coach class whitelist keeps operational fields");
  check(!("studentIds" in classView) && !("remark" in classView), "raw class links and internal remark are removed");

  const cloud = read("cloudfunctions/clubApi/v2.js");
  const home = read("miniprogram/pages/index/index.wxml");
  const profile = read("miniprogram/pages/profile/index.wxml");
  const studentDetail = read("miniprogram/pages/student-detail/index.wxml");
  const workload = read("cloudfunctions/clubApi/coach-work-service.js");
  const timetable = read("cloudfunctions/clubApi/timetable-service.js");
  const league = read("cloudfunctions/clubApi/league-service.js");
  const growth = read("cloudfunctions/clubApi/growth-service.js");
  check(cloud.includes("COACH_CRM_FORBIDDEN"), "cloud denies coach CRM actions");
  check(cloud.includes("COACH_FINANCIAL_FORBIDDEN"), "cloud denies coach financial actions");
  check(cloud.includes("COACH_MANAGEMENT_FORBIDDEN"), "cloud denies coach class, enrollment and scheduling management actions");
  check(COACH_CAPABILITIES.VIEW_OWN_CLASSES && !COACH_CAPABILITIES.MANAGE_CLASSES && COACH_CAPABILITIES.ELITE_RECOMMEND && !COACH_CAPABILITIES.ELITE_APPROVE, "central coach capabilities describe read-only class and recommend-only elite access");
  check(cloud.includes('requireRole(user, ["admin"]); const previous') && cloud.includes("async function saveClass"), "class creation and settings are admin-only");
  const coachHome = navigation.homeEntries("coach"), coachProfile = navigation.profileEntries("coach");
  check(home.includes("wx:for=\"{{quickEntries}}\"") && !coachHome.some((item) => item.key === "adminCrm") && ["coachElite", "coachWorkload"].every((key) => coachHome.some((item) => item.key === key)), "coach home hides CRM and keeps approved work entries");
  check(profile.includes("wx:for=\"{{menuEntries}}\"") && !coachProfile.some((item) => item.key === "adminOperations"), "operations entry is excluded from coach profile");
  check(studentDetail.includes("role !== 'coach'") && studentDetail.includes("剩余课时"), "coach UI hides lesson balance and ledger");
  check(workload.includes("[principal(user)]") && workload.includes("incomeAvailable: false"), "coach workload ignores requested coachId and does not invent income");
  check(timetable.includes('user.role === "admin" && input.coachId'), "coach timetable ignores external coachId filter");
  check(league.includes("team.coachUserId !== principal(user)"), "league management uses canonical assigned coach");
  check(growth.includes("不能修改其他教练创建的训练评价"), "coach cannot overwrite another coach evaluation");
  check(cloud.includes('user.role === "coach" ? [] : await crmService.trialStudents'), "trial CRM roster is removed from coach session detail");

  console.log(`Coach permission regression: ${checks} checks passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
