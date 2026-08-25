const assert = require("assert");
const fs = require("fs");
const path = require("path");

const storage = {};
global.wx = { getStorageSync(key) { return storage[key]; }, setStorageSync(key, value) { storage[key] = value; } };
const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (action, data = {}) => domain.call(action, { ...data, previewRole: "coach", previewUserId: "coach1" });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function rejects(fn, pattern) {
  let error;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, "expected rejection");
  if (pattern) assert(pattern.test(error.message), error.message);
}

async function run() {
  let checks = 0;
  await admin("resetDemo");
  const data = storage.nanlianClubV2;
  const dashboard = await admin("getLeagueDashboard", { today: "2026-08-23" });
  assert.strictEqual(dashboard.league.leagueType, "GROWTH_LEAGUE"); checks += 1;
  assert.strictEqual(dashboard.rounds.length, 8); checks += 1;
  assert(dashboard.rounds.every((item) => new Date(`${item.date}T12:00:00Z`).getUTCDay() === 0)); checks += 1;
  assert(dashboard.rounds.every((item, index, rows) => !index || item.weekType !== rows[index - 1].weekType)); checks += 1;
  assert.strictEqual(dashboard.teams.filter((item) => item.organizationType === "INTERNAL").length, 3); checks += 1;
  assert.strictEqual(dashboard.teams.filter((item) => item.organizationType === "EXTERNAL").length, 3); checks += 1;

  const league = await admin("createLeague", { name: "PHASE E 回归联赛", leagueType: "GROWTH_LEAGUE_PHASE_E", recurringRule: "SUNDAY_ALTERNATING_WEEK", oddWeekAgeGroups: [2017, 2018], evenWeekAgeGroups: [2015, 2016] });
  assert(league.id); checks += 1;
  const season = await admin("createLeagueSeason", { leagueId: league.id, name: "PHASE E 回归赛季", startDate: "2026-09-01", endDate: "2026-09-30", scheduleMode: "CALENDAR_WEEK", status: "ACTIVE", oddWeekBirthYears: [2017, 2018], evenWeekBirthYears: [2015, 2016], defaultVenueIds: ["三江南联球场"] });
  assert(season.id); checks += 1;
  const generated = await admin("generateLeagueRounds", { seasonId: season.id });
  assert.strictEqual(generated.created, 4); checks += 1;
  const rounds = data.leagueRounds.filter((item) => item.seasonId === season.id);
  assert(rounds.every((item) => item.weekType === (item.weekNumber % 2 ? "ODD" : "EVEN"))); checks += 1;

  const internal = await admin("saveLeagueTeam", { name: "南联回归队", organizationType: "INTERNAL", organizationName: "永嘉南联", birthYearGroup: [2015, 2016], coachUserId: "coach1", classId: "c1516" });
  const external = await admin("saveLeagueTeam", { name: "外部回归队", organizationType: "EXTERNAL", organizationName: "测试学校", birthYearGroup: [2015, 2016] });
  assert(internal.id && external.id); checks += 1;
  await admin("saveLeagueTeamMember", { teamId: internal.id, studentId: "s1", jerseyNumber: 7 });
  assert(data.teamMembers.some((item) => item.teamId === internal.id && item.studentId === "s1")); checks += 1;
  const studentCount = data.students.length;
  const externalPlayer = await admin("saveExternalPlayer", { teamId: external.id, name: "外部测试球员", birthYear: 2016, jerseyNumber: 11 });
  assert(externalPlayer.id); assert.strictEqual(data.students.length, studentCount); checks += 1;

  await admin("registerSeasonTeam", { seasonId: season.id, teamId: internal.id, birthYearGroup: [2015, 2016] });
  await admin("registerSeasonTeam", { seasonId: season.id, teamId: external.id, birthYearGroup: [2015, 2016] });
  const pairResult = await admin("generateRoundRobin", { roundId: rounds[0].id, teamIds: [internal.id, external.id] });
  assert.strictEqual(pairResult.created, 1); checks += 1;
  const match = data.matches.find((item) => item.roundId === rounds[0].id);
  assert(match && match.lessonDeduction === 0); checks += 1;
  await coach("saveMatchSquad", { matchId: match.id, teamId: internal.id, members: [{ memberType: "INTERNAL_STUDENT", studentId: "s1", starter: true, goals: 1 }] });
  await admin("saveMatchSquad", { matchId: match.id, teamId: external.id, members: [{ memberType: "EXTERNAL_PLAYER", externalPlayerId: externalPlayer.id, starter: true }] });
  assert.strictEqual(data.matchSquads.filter((item) => item.matchId === match.id).length, 2); checks += 1;

  const ledgerBefore = JSON.stringify(data.lessonLedger);
  const classMembersBefore = JSON.stringify(data.classMembers);
  const waitlistBefore = JSON.stringify(data.waitlist);
  const growthBefore = data.playerGrowthEvents.length;
  await admin("saveLeagueMatch", { id: match.id, homeScore: 2, awayScore: 1, status: "FINISHED" });
  assert.strictEqual(match.status, "FINISHED"); checks += 1;
  assert(data.playerMatchRecords.some((item) => item.matchId === match.id && item.studentId === "s1")); checks += 1;
  assert(!data.playerMatchRecords.some((item) => item.externalPlayerId === externalPlayer.id)); checks += 1;
  assert.strictEqual(data.playerGrowthEvents.length, growthBefore + 1); checks += 1;
  assert.strictEqual(JSON.stringify(data.lessonLedger), ledgerBefore); checks += 1;
  assert.strictEqual(JSON.stringify(data.classMembers), classMembersBefore); checks += 1;
  assert.strictEqual(JSON.stringify(data.waitlist), waitlistBefore); checks += 1;

  const parentDashboard = await parent("getLeagueDashboard", { today: rounds[0].date, studentId: "s1" });
  assert(parentDashboard.matches.every((item) => data.matchSquads.some((row) => row.matchId === item.id && row.studentId === "s1"))); checks += 1;
  assert(parentDashboard.teams.every((item) => !item.contactMobile && !item.contactName)); checks += 1;
  await rejects(() => parent("getLeagueDashboard", { studentId: "s3" }), /无权/); checks += 1;
  await rejects(() => parent("saveLeagueTeam", { name: "越权球队", birthYearGroup: [2017, 2018] }), /管理员/); checks += 1;
  await rejects(() => coach("saveLeagueMatch", { id: match.id, homeScore: 3, awayScore: 1 }), /管理员/); checks += 1;

  const cloud = read("cloudfunctions/clubApi/league-service.js");
  const v2 = read("cloudfunctions/clubApi/v2.js");
  assert(cloud.includes("allowedStudentIds") && cloud.includes("assertStudentAccess")); checks += 1;
  assert(cloud.includes('lessonDeduction: 0') && !/promoteWaitlist|fillVacancy|collection\("waitlist"\)/.test(cloud)); checks += 1;
  assert(v2.includes("createLeagueService") && v2.includes("leagueService.handles") && v2.includes('"leagueSeasons"') && v2.includes('"externalPlayers"')); checks += 1;

  const app = JSON.parse(read("miniprogram/app.json"));
  const pages = ["pages/league-dashboard/index", "pages/league-season-form/index", "pages/league-round-detail/index", "pages/league-team-form/index", "pages/league-external-player-form/index", "pages/league-squad/index", "pages/league-match-form/index"];
  assert(pages.every((page) => app.pages.includes(page))); checks += 1;
  pages.forEach((page) => ["js", "json", "wxml", "wxss"].forEach((ext) => assert(fs.existsSync(path.join(root, "miniprogram", `${page}.${ext}`)), `${page}.${ext} missing`))); checks += 1;
  assert(read("miniprogram/pages/index/index.wxml").includes("周日成长联赛") && read("miniprogram/pages/operations/index.wxml").includes("周日成长联赛")); checks += 1;

  console.log(`PHASE E Sunday growth league regression: ${checks} checks passed`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
