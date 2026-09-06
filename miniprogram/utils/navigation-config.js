const TAB_INTENT_KEY = "nanlianNavigationIntent";

const FEATURES = Object.freeze({
  adminTimetable: { label: "总课表", icon: "表", tone: "blue", route: "/pages/coach-schedule/index", roles: ["admin"], title: "南联课程总表" },
  adminWorkload: { label: "教练课时统计", icon: "时", tone: "orange", route: "/pages/coach-workload/index", roles: ["admin"], title: "教练课时统计" },
  adminCourses: { label: "课程管理", icon: "课", tone: "blue", route: "/pages/sessions/index", roles: ["admin"], title: "课程管理", mode: "manage", tab: true },
  adminPublishSession: { label: "发布课程", icon: "+", tone: "blue", route: "/pages/session-form/index", roles: ["admin"], title: "发布课程" },
  adminCrm: { label: "招生中心", icon: "招", tone: "green", route: "/pages/crm-dashboard/index", roles: ["admin"], title: "招生中心" },
  adminTraining: { label: "训练管理", icon: "训", tone: "green", route: "/pages/research-center/index", roles: ["admin"], title: "训练管理中心" },
  adminGrowth: { label: "成长管理", icon: "长", tone: "green", route: "/pages/students/index", roles: ["admin"], title: "成长管理", mode: "growth", tab: true },
  adminAssessment: { label: "阶段测评", icon: "评", tone: "green", route: "/pages/assessment-rounds/index", roles: ["admin"], title: "阶段测评" },
  adminElite: { label: "精英队选拔", icon: "精", tone: "gold", route: "/pages/elite-selections/index", roles: ["admin"], title: "精英队选拔" },
  adminLeague: { label: "周日成长联赛", icon: "赛", tone: "blue", route: "/pages/league-dashboard/index", roles: ["admin"], title: "南联周日成长联赛" },
  adminClasses: { label: "班级管理", icon: "班", tone: "blue", route: "/pages/classes/index", roles: ["admin"], title: "班级管理" },
  adminStudents: { label: "学员管理", icon: "人", tone: "gold", route: "/pages/students/index", roles: ["admin"], title: "学员管理", mode: "directory", tab: true },
  adminCoaches: { label: "教练管理", icon: "教", tone: "green", route: "/pages/coach-team/index", roles: ["admin"], title: "教练管理" },
  adminPackages: { label: "套餐管理", icon: "套", tone: "orange", route: "/pages/commerce-admin/index", roles: ["admin"], title: "课时套餐管理" },
  adminOrders: { label: "订单管理", icon: "单", tone: "orange", route: "/pages/orders/index", roles: ["admin"], title: "订单管理", mode: "orders" },
  adminPayment: { label: "微信支付状态", icon: "付", tone: "orange", route: "/pages/payment-diagnostics/index", roles: ["admin"], title: "微信支付状态" },
  adminOperations: { label: "运营后台", icon: "管", tone: "navy", route: "/pages/operations/index", roles: ["admin"], title: "南联运营后台" },
  adminAccounts: { label: "账号与管理员", icon: "权", tone: "navy", route: "/pages/account-management/index", roles: ["admin"], title: "账号与管理员" },
  adminLeaves: { label: "请假审批", icon: "假", tone: "navy", route: "/pages/leave-requests/index", roles: ["admin"], title: "请假审批" },
  adminChildProfiles: { label: "孩子资料审核", icon: "审", tone: "gold", route: "/pages/child-profile-requests/index", roles: ["admin"], title: "孩子资料审核" },
  adminNews: { label: "新闻公告", icon: "讯", tone: "navy", route: "/pages/news/index", roles: ["admin"], title: "新闻公告" },

  coachTimetable: { label: "我的课表", icon: "表", tone: "blue", route: "/pages/coach-workbench/index", roles: ["coach"], title: "我的课表" },
  coachClasses: { label: "我的班级", icon: "班", tone: "blue", route: "/pages/classes/index", roles: ["coach"], title: "我的班级" },
  coachStudents: { label: "我的学员", icon: "人", tone: "gold", route: "/pages/students/index", roles: ["coach"], title: "我的学员", mode: "directory", tab: true },
  coachAttendance: { label: "考勤", icon: "勤", tone: "green", route: "/pages/sessions/index", roles: ["coach"], title: "考勤", mode: "attendance", tab: true },
  coachWeeklyPlans: { label: "周训练计划", icon: "周", tone: "gold", route: "/pages/training-cycles/index", roles: ["coach"], title: "周训练计划" },
  coachAssessment: { label: "阶段评价", icon: "评", tone: "green", route: "/pages/assessment-rounds/index", roles: ["coach"], title: "阶段评价" },
  coachGrowth: { label: "成长管理", icon: "长", tone: "green", route: "/pages/students/index", roles: ["coach"], title: "成长管理", mode: "growth", tab: true },
  coachElite: { label: "精英推荐", icon: "精", tone: "gold", route: "/pages/elite-selections/index", roles: ["coach"], title: "精英队推荐" },
  coachWorkload: { label: "我的课时", icon: "时", tone: "orange", route: "/pages/coach-workload/index", roles: ["coach"], title: "我的课时" },
  coachProfile: { label: "我的资料", icon: "我", tone: "green", route: "/pages/coach-team/index", roles: ["coach"], title: "我的资料", mode: "self" },
  coachNews: { label: "新闻动态", icon: "讯", tone: "navy", route: "/pages/news/index", roles: ["coach"], title: "新闻动态" },
  coachNotifications: { label: "通知消息", icon: "知", tone: "navy", route: "/pages/notifications/index", roles: ["coach"], title: "通知消息" },

  parentChildren: { label: "我的孩子", icon: "孩", tone: "gold", route: "/pages/students/index", roles: ["parent"], title: "我的孩子", mode: "children", tab: true },
  parentClasses: { label: "我的班级", icon: "班", tone: "blue", route: "/pages/sessions/index", roles: ["parent"], title: "我的班级", mode: "classes", tab: true },
  parentCourses: { label: "我的课程", icon: "课", tone: "blue", route: "/pages/sessions/index", roles: ["parent"], title: "我的课程", mode: "courses", tab: true },
  parentTimetable: { label: "我的课表", icon: "表", tone: "blue", route: "/pages/family-timetable/index", roles: ["parent"], title: "我的课表" },
  parentLeaves: { label: "请假", icon: "假", tone: "green", route: "/pages/leave-requests/index", roles: ["parent"], title: "我的请假" },
  parentGrowth: { label: "成长档案", icon: "长", tone: "green", route: "/pages/growth-profile/index", roles: ["parent"], title: "成长档案", mode: "growth", requiredParams: ["studentId"] },
  parentAssessment: { label: "阶段测评", icon: "评", tone: "green", route: "/pages/growth-profile/index", roles: ["parent"], title: "阶段测评", mode: "assessment", requiredParams: ["studentId"] },
  parentLeague: { label: "周日成长联赛", icon: "赛", tone: "blue", route: "/pages/league-dashboard/index", roles: ["parent"], title: "南联周日成长联赛" },
  parentEnrollment: { label: "班级报名", icon: "报", tone: "blue", route: "/pages/classes/index", roles: ["parent"], title: "班级报名" },
  parentPackages: { label: "课程套餐", icon: "套", tone: "orange", route: "/pages/orders/index", roles: ["parent"], title: "课程套餐", mode: "purchase" },
  parentOrders: { label: "我的订单", icon: "单", tone: "orange", route: "/pages/orders/index", roles: ["parent"], title: "我的订单", mode: "orders" },
  parentCoaches: { label: "教练员简历", icon: "教", tone: "green", route: "/pages/coach-team/index", roles: ["parent"], title: "南联教练团队" },
  parentNews: { label: "新闻动态", icon: "讯", tone: "navy", route: "/pages/news/index", roles: ["parent"], title: "新闻动态" },
  parentNotifications: { label: "通知消息", icon: "知", tone: "navy", route: "/pages/notifications/index", roles: ["parent"], title: "通知消息" },
  parentAddChild: { label: "添加孩子", icon: "+", tone: "gold", route: "/pages/parent-child-form/index", roles: ["parent"], title: "添加孩子" },
});

const HOME_FEATURES = Object.freeze({
  admin: ["adminTimetable", "adminCourses", "adminCrm", "adminTraining", "adminGrowth", "adminAssessment", "adminElite", "adminLeague", "adminClasses", "adminStudents", "adminCoaches", "adminPackages", "adminOrders", "adminPayment", "adminNews", "adminOperations"],
  coach: ["coachTimetable", "coachClasses", "coachStudents", "coachAttendance", "coachWeeklyPlans", "coachAssessment", "coachGrowth", "coachElite", "coachWorkload", "coachProfile", "coachNews"],
  parent: ["parentChildren", "parentClasses", "parentCourses", "parentTimetable", "parentLeaves", "parentGrowth", "parentAssessment", "parentLeague", "parentEnrollment", "parentPackages", "parentOrders", "parentCoaches", "parentNews"],
});

const PROFILE_FEATURES = Object.freeze({
  admin: ["adminOperations", "adminTimetable", "adminCourses", "adminClasses", "adminStudents", "adminCoaches", "adminAccounts", "adminPackages", "adminOrders", "adminPayment", "adminLeaves", "adminChildProfiles", "adminNews"],
  coach: ["coachTimetable", "coachClasses", "coachStudents", "coachAttendance", "coachWeeklyPlans", "coachAssessment", "coachGrowth", "coachElite", "coachWorkload", "coachProfile", "coachNotifications", "coachNews"],
  parent: ["parentChildren", "parentClasses", "parentCourses", "parentTimetable", "parentLeaves", "parentGrowth", "parentAssessment", "parentLeague", "parentEnrollment", "parentPackages", "parentOrders", "parentCoaches", "parentNotifications", "parentNews"],
});

const OPERATIONS_FEATURES = Object.freeze(["adminCrm", "adminTraining", "adminGrowth", "adminAssessment", "adminElite", "adminLeague", "adminPublishSession", "adminCourses", "adminTimetable", "adminWorkload", "adminClasses", "adminStudents", "adminCoaches", "adminAccounts", "adminLeaves", "adminChildProfiles", "adminPackages", "adminOrders", "adminPayment", "adminNews"]);

const ROUTE_REUSE_ALLOWLIST = Object.freeze({
  "/pages/students/index": ["adminGrowth", "adminStudents", "coachStudents", "coachGrowth", "parentChildren"],
  "/pages/sessions/index": ["adminCourses", "coachAttendance", "parentClasses", "parentCourses"],
  "/pages/classes/index": ["adminClasses", "coachClasses", "parentEnrollment"],
  "/pages/coach-team/index": ["adminCoaches", "coachProfile", "parentCoaches"],
  "/pages/orders/index": ["adminOrders", "parentPackages", "parentOrders"],
  "/pages/assessment-rounds/index": ["adminAssessment", "coachAssessment"],
  "/pages/elite-selections/index": ["adminElite", "coachElite"],
  "/pages/league-dashboard/index": ["adminLeague", "parentLeague"],
  "/pages/news/index": ["adminNews", "coachNews", "parentNews"],
  "/pages/leave-requests/index": ["adminLeaves", "parentLeaves"],
  "/pages/growth-profile/index": ["parentGrowth", "parentAssessment"],
  "/pages/coach-workload/index": ["adminWorkload", "coachWorkload"],
  "/pages/notifications/index": ["coachNotifications", "parentNotifications"],
});

function entry(key) { return FEATURES[key] ? { key, ...FEATURES[key] } : null; }
function entries(keys) { return (keys || []).map(entry).filter(Boolean); }
function homeEntries(role) { return entries(HOME_FEATURES[role]); }
function profileEntries(role) { return entries(PROFILE_FEATURES[role]); }
function operationsEntries() { return entries(OPERATIONS_FEATURES); }
function withQuery(route, params = {}) { const query = Object.keys(params).filter((key) => params[key] !== undefined && params[key] !== "").map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join("&"); return query ? `${route}?${query}` : route; }
function assertFeature(key, role, params) { const feature = FEATURES[key]; if (!feature) throw new Error(`未知导航入口：${key}`); if (!feature.roles.includes(role)) throw new Error("当前角色无权使用该入口"); (feature.requiredParams || []).forEach((name) => { if (!params[name]) throw new Error(`导航缺少参数：${name}`); }); return feature; }
function openFeature(key, role, params = {}) {
  const feature = assertFeature(key, role, params);
  const merged = { ...(feature.mode ? { mode: feature.mode } : {}), ...params };
  if (feature.tab) {
    wx.setStorageSync(TAB_INTENT_KEY, { featureKey: key, role, route: feature.route, mode: feature.mode || "", title: feature.title || feature.label, createdAt: Date.now() });
    wx.switchTab({ url: feature.route });
  } else wx.navigateTo({ url: withQuery(feature.route, merged) });
}
function consumeTabIntent(route, role) {
  const intent = wx.getStorageSync(TAB_INTENT_KEY);
  if (!intent) return null;
  if (Date.now() - Number(intent.createdAt || 0) > 30000 || intent.route !== route || intent.role !== role) { wx.removeStorageSync(TAB_INTENT_KEY); return null; }
  wx.removeStorageSync(TAB_INTENT_KEY);
  return intent;
}
function clearTabIntent() { wx.removeStorageSync(TAB_INTENT_KEY); }

module.exports = { FEATURES, HOME_FEATURES, PROFILE_FEATURES, OPERATIONS_FEATURES, ROUTE_REUSE_ALLOWLIST, TAB_INTENT_KEY, entry, entries, homeEntries, profileEntries, operationsEntries, withQuery, openFeature, consumeTabIntent, clearTabIntent };
