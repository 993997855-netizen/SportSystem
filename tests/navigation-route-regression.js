const assert = require("assert");
const fs = require("fs");
const path = require("path");
const navigation = require("../miniprogram/utils/navigation-config");

const root = path.resolve(__dirname, "..");
const mini = path.join(root, "miniprogram");
const app = JSON.parse(fs.readFileSync(path.join(mini, "app.json"), "utf8"));
const registered = new Set(app.pages.map((item) => `/${item}`));
const tabRoutes = new Set((app.tabBar.list || []).map((item) => `/${item.pagePath}`));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
function check(value, message) { assert(value, message); checks += 1; }

const expectedHomeCounts = { admin: 16, coach: 11, parent: 13 };
Object.entries(expectedHomeCounts).forEach(([role, expected]) => {
  const rows = navigation.homeEntries(role);
  check(rows.length === expected, `${role} home entry count must be ${expected}`);
  check(new Set(rows.map((item) => item.key)).size === rows.length, `${role} entry keys are unique`);
  rows.forEach((item) => {
    check(Boolean(item.label && item.title && item.route), `${item.key} has label, title and route`);
    check(item.roles.includes(role), `${item.key} allows ${role}`);
  });
});

Object.entries(navigation.FEATURES).forEach(([key, feature]) => {
  check(registered.has(feature.route), `${key} route is registered: ${feature.route}`);
  ["js", "json", "wxml", "wxss"].forEach((extension) => check(fs.existsSync(path.join(mini, `${feature.route.slice(1)}.${extension}`)), `${key} ${extension} page file exists`));
  check(feature.tab ? tabRoutes.has(feature.route) : !tabRoutes.has(feature.route), `${key} uses the correct navigation type`);
  check((feature.requiredParams || []).every((name) => typeof name === "string" && name), `${key} required params are valid`);
});

const routeFeatures = {};
Object.entries(navigation.FEATURES).forEach(([key, feature]) => { (routeFeatures[feature.route] ||= []).push(key); });
Object.entries(routeFeatures).filter(([, keys]) => keys.length > 1).forEach(([route, keys]) => {
  const allowed = navigation.ROUTE_REUSE_ALLOWLIST[route] || [];
  check(keys.every((key) => allowed.includes(key)), `${route} reuse is explicitly allowlisted`);
  const byRole = {};
  keys.forEach((key) => navigation.FEATURES[key].roles.forEach((role) => { (byRole[role] ||= []).push(navigation.FEATURES[key]); }));
  Object.entries(byRole).filter(([, features]) => features.length > 1).forEach(([role, features]) => {
    const modes = features.map((item) => item.mode || "");
    check(modes.every(Boolean) && new Set(modes).size === modes.length, `${route} ${role} reuse has unique modes`);
  });
});

Object.entries(navigation.ROUTE_REUSE_ALLOWLIST).forEach(([route, keys]) => {
  check(keys.every((key) => navigation.FEATURES[key] && navigation.FEATURES[key].route === route), `${route} allowlist contains only real mappings`);
});

const coachKeys = new Set(navigation.HOME_FEATURES.coach);
["adminOperations", "adminCrm", "adminClasses", "adminCourses", "adminPublishSession"].forEach((key) => check(!coachKeys.has(key), `coach menu excludes ${key}`));
const indexJs = read("miniprogram/pages/index/index.js");
const indexWxml = read("miniprogram/pages/index/index.wxml");
const profileJs = read("miniprogram/pages/profile/index.js");
const operationsJs = read("miniprogram/pages/operations/index.js");
check(indexJs.includes("navigation.homeEntries(context.user.role)"), "home recomputes menu after role load");
check(profileJs.includes("navigation.profileEntries(context.user.role)"), "profile recomputes menu after role load");
check(operationsJs.includes("navigation.operationsEntries()"), "operations uses central navigation entries");
check(indexWxml.includes('data-key="{{item.key}}"') && indexJs.includes("event.currentTarget.dataset.key"), "quick entry dataset uses currentTarget");
check(!indexJs.includes("event.target.dataset"), "quick navigation never reads event.target.dataset");
check(read("miniprogram/pages/coach-team/index.js").includes('selfMode ? "getMyPublicCoach"'), "coach profile entry loads only the signed-in coach public profile");
check(read("cloudfunctions/clubApi/coach-service.js").includes('requireRole(user, ["coach"])'), "coach self-profile API enforces coach role");
check(read("miniprogram/pages/coach-team/index.js").includes("testRoleWithoutCoach"), "test-role coach does not impersonate an arbitrary coach profile");
check(read("miniprogram/pages/growth-profile/index.wxml").includes("viewMode !== 'assessment'"), "parent assessment mode hides non-assessment growth sections");
check(read("miniprogram/pages/elite-selections/index.wxml").includes("从我的班级选择学员推荐"), "coach elite entry exposes the recommendation workflow");

["students", "sessions"].forEach((page) => {
  const source = read(`miniprogram/pages/${page}/index.js`);
  check(source.includes("consumeTabIntent"), `${page} consumes tab navigation intent`);
  check(source.includes("setNavigationBarTitle"), `${page} updates dynamic title`);
  check(source.includes("onTabItemTap"), `${page} clears cached mode on direct tab tap`);
});
["classes", "orders", "coach-team", "growth-profile", "assessment-rounds", "elite-selections", "leave-requests", "coach-workload"].forEach((page) => check(read(`miniprogram/pages/${page}/index.js`).includes("setNavigationBarTitle"), `${page} updates role/mode title`));

const jsFiles = [], routeSourceFiles = [];
function walk(dir) { fs.readdirSync(dir, { withFileTypes: true }).forEach((item) => { const absolute = path.join(dir, item.name); if (item.isDirectory()) walk(absolute); else { if (item.name.endsWith(".js")) jsFiles.push(absolute); if (/\.(js|wxml)$/.test(item.name)) routeSourceFiles.push(absolute); } }); }
walk(mini);
jsFiles.forEach((file) => {
  const source = fs.readFileSync(file, "utf8");
  tabRoutes.forEach((route) => check(!new RegExp(`navigateTo\\s*\\(\\s*\\{[^}]*url\\s*:\\s*[\\\"\\\'\\\`]${route.replace(/\//g, "\\/")}`).test(source), `${path.relative(mini, file)} does not navigateTo tab route ${route}`));
});
routeSourceFiles.forEach((file) => {
  const source = fs.readFileSync(file, "utf8"), literalRoutes = source.match(/\/pages\/[a-zA-Z0-9_-]+\/index/g) || [];
  literalRoutes.forEach((route) => check(registered.has(route), `${path.relative(mini, file)} literal route is registered: ${route}`));
});

const pageFilesMissing = app.pages.filter((page) => !["js", "json", "wxml", "wxss"].every((extension) => fs.existsSync(path.join(mini, `${page}.${extension}`))));
check(pageFilesMissing.length === 0, "all registered pages have complete files");
console.log(`Navigation route regression: ${checks} checks passed`);
console.log(`Home quick entries: ADMIN ${expectedHomeCounts.admin} | COACH ${expectedHomeCounts.coach} | PARENT ${expectedHomeCounts.parent}`);
console.log(`Registered pages: ${app.pages.length}`);
console.log(`Missing page files: ${pageFilesMissing.length}`);
