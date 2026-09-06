const assert = require("assert");
const fs = require("fs");
const path = require("path");
const navigation = require("../miniprogram/utils/navigation-config");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
function check(value, message) { assert(value, message); checks += 1; }

const coachHome = navigation.homeEntries("coach");
const parentHome = navigation.homeEntries("parent");
const adminHome = navigation.homeEntries("admin");
check(coachHome.length === 5 && coachHome.length <= 6, "coach home is reduced to five tasks");
check(parentHome.length === 5 && parentHome.length <= 6, "parent home is reduced to five tasks");
check(adminHome.length === 16, "admin home remains unchanged");
check(coachHome.map((item) => item.label).join("|") === "今日教学|我的班级|学员成长|推荐精英队|我的工作", "coach labels are task-oriented");
check(parentHome.map((item) => item.label).join("|") === "我的课程|请假|成长|课时与购课|周日成长联赛", "parent labels are child-oriented");

const coachKeys = new Set(coachHome.map((item) => item.key));
check(!coachKeys.has("coachStudents") && !coachKeys.has("coachAttendance"), "class and teaching absorb student and attendance entry duplication");
check(!coachKeys.has("coachAssessment") && !coachKeys.has("coachWeeklyPlans"), "assessment and weekly plan become secondary actions");
const parentKeys = new Set(parentHome.map((item) => item.key));
check(!parentKeys.has("parentClasses") && !parentKeys.has("parentTimetable"), "parent courses absorbs classes and timetable");
check(!parentKeys.has("parentAssessment"), "parent growth absorbs assessment");
check(!parentKeys.has("parentOrders"), "parent commerce absorbs orders");

const home = read("miniprogram/pages/index/index.wxml");
const teaching = read("miniprogram/pages/coach-workbench/index.wxml");
const courses = read("miniprogram/pages/sessions/index.wxml");
const coursesLogic = read("miniprogram/pages/sessions/index.js");
const growth = read("miniprogram/pages/growth-profile/index.wxml");
const commerce = read("miniprogram/pages/orders/index.wxml");
const leave = read("miniprogram/pages/leave-requests/index.wxml");
check(home.includes("今天要做什么") && home.includes("下一次训练"), "home leads with the next action for both roles");
check(home.includes("俱乐部动态") && home.includes("查看更多"), "news is a compact information section");
check(teaching.includes("开始点名") && teaching.includes("课后记录") && teaching.includes("本周训练计划"), "today teaching contains the complete teaching flow");
check(courses.includes("我的班级") && courses.includes("完整课表") && courses.includes("班级报名"), "parent courses combines class, sessions and timetable access");
check(coursesLogic.includes("全部孩子") && courses.includes("studentChoices"), "parent courses supports all children through its selector model");
check(growth.includes("查看阶段测评") && growth.includes("新增评价"), "growth contains role-appropriate assessment actions");
check(commerce.includes("当前剩余") && commerce.includes("购买课时") && commerce.includes("我的订单"), "commerce combines balance, purchase and orders");
check(leave.includes("最近可请假的课程") && leave.includes("我要请假"), "leave opens with actionable sessions");

console.log(`Role home simplification regression: ${checks} checks passed`);
