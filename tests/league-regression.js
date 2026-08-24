const assert = require("assert");
const storage = {};
global.wx = { getStorageSync(key) { return storage[key]; }, setStorageSync(key, value) { storage[key] = value; } };
const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (action, data = {}) => domain.call(action, { ...data, previewRole: "coach" });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent" });
async function rejects(fn, pattern) { let error; try { await fn(); } catch (caught) { error = caught; } assert(error, "expected rejection"); if (pattern) assert(pattern.test(error.message), error.message); }

async function run() {
  let checks = 0;
  await admin("resetDemo");
  const dashboard = await admin("getLeagueDashboard", { today: "2026-08-23" });
  assert.strictEqual(dashboard.league.leagueType, "GROWTH_LEAGUE"); checks += 1;
  assert.strictEqual(dashboard.rounds.length, 8); checks += 1;
  assert.strictEqual(dashboard.teams.filter((item) => item.organizationType === "INTERNAL").length, 3); assert.strictEqual(dashboard.teams.filter((item) => item.organizationType === "EXTERNAL").length, 3); checks += 1;
  assert.strictEqual(dashboard.matches.length, 6); checks += 1;
  assert(dashboard.rounds.every((item, index, rows) => !index || item.weekType !== rows[index - 1].weekType)); checks += 1;

  const league = await admin("createLeague", { name: "测试成长联赛", leagueType: "GROWTH_LEAGUE_TEST", recurringRule: "SUNDAY_ALTERNATING_WEEK", oddWeekAgeGroups: [2017, 2018], evenWeekAgeGroups: [2015, 2016] });
  assert(league.id); checks += 1;
  const season = await admin("createLeagueSeason", { leagueId: league.id, name: "回归赛季", startDate: "2026-09-01", endDate: "2026-09-30", scheduleMode: "CALENDAR_WEEK", status: "ACTIVE", oddWeekBirthYears: [2017, 2018], evenWeekBirthYears: [2015, 2016], defaultVenueIds: ["回归球场"] });
  const generated = await admin("generateLeagueRounds", { seasonId: season.id }); assert.strictEqual(generated.created, 4); checks += 1;
  const testRounds = storage.nanlianClubV2.leagueRounds.filter((item) => item.seasonId === season.id); assert(testRounds.every((item) => item.weekType === (item.weekNumber % 2 ? "ODD" : "EVEN"))); checks += 1;
  await admin("updateLeagueRound", { id: testRounds[0].id, birthYears: [2015, 2016], venueId: "手工调整球场", status: "SCHEDULED" }); assert.deepStrictEqual(testRounds[0].birthYears, [2015, 2016]); checks += 1;

  const internal = await admin("saveLeagueTeam", { name: "回归南联队", organizationType: "INTERNAL", organizationName: "永嘉南联", birthYearGroup: [2015, 2016], coachUserId: "coach1" });
  const external = await admin("saveLeagueTeam", { name: "回归外部队", organizationType: "EXTERNAL", organizationName: "测试学校", birthYearGroup: [2015, 2016] });
  assert(internal.id && external.id); checks += 1;
  const studentCount = storage.nanlianClubV2.students.length;
  const externalPlayer = await admin("saveExternalPlayer", { teamId: external.id, name: "外部测试球员", birthYear: 2016, jerseyNumber: 11 });
  assert(externalPlayer.id && storage.nanlianClubV2.students.length === studentCount); checks += 1;
  const mismatch = await admin("registerSeasonTeam", { seasonId: season.id, teamId: external.id, birthYearGroup: [2017, 2018] }); assert(mismatch.confirmationRequired); checks += 1;
  await admin("registerSeasonTeam", { seasonId: season.id, teamId: external.id, birthYearGroup: [2017, 2018], overrideReason: "友谊交流，经管理员确认" }); checks += 1;

  storage.nanlianClubV2.teamMembers.push({ id: "tm-reg-s1", teamId: internal.id, studentId: "s1", memberType: "INTERNAL_STUDENT", status: "ACTIVE" });
  await admin("registerSeasonTeam", { seasonId: season.id, teamId: internal.id, birthYearGroup: [2015, 2016] });
  const other = await admin("saveLeagueTeam", { name: "另一外部队", organizationType: "EXTERNAL", birthYearGroup: [2015, 2016] });
  await admin("registerSeasonTeam", { seasonId: season.id, teamId: other.id, birthYearGroup: [2015, 2016] });
  const pairResult = await admin("generateRoundRobin", { roundId: testRounds[0].id, teamIds: [internal.id, external.id] }); assert.strictEqual(pairResult.created, 1); checks += 1;
  const match = storage.nanlianClubV2.matches.find((item) => item.roundId === testRounds[0].id);
  await coach("saveMatchSquad", { matchId: match.id, teamId: internal.id, members: [{ memberType: "INTERNAL_STUDENT", studentId: "s1", starter: true, goals: 1 }] });
  await admin("saveMatchSquad", { matchId: match.id, teamId: external.id, members: [{ memberType: "EXTERNAL_PLAYER", externalPlayerId: externalPlayer.id, starter: true }] });
  assert.strictEqual(storage.nanlianClubV2.matchSquads.filter((item) => item.matchId === match.id).length, 2); checks += 1;
  const parentDashboard = await parent("getLeagueDashboard"); assert(parentDashboard.matches.every((item) => storage.nanlianClubV2.matchSquads.some((squad) => squad.matchId === item.id && squad.studentId === "s1")) && parentDashboard.teams.every((item) => !item.contactMobile)); checks += 1;
  const ledgerBefore = JSON.stringify(storage.nanlianClubV2.lessonLedger), classesBefore = JSON.stringify(storage.nanlianClubV2.classMembers), waitBefore = JSON.stringify(storage.nanlianClubV2.waitlist), eventBefore = storage.nanlianClubV2.playerGrowthEvents.length;
  await admin("saveLeagueMatch", { id: match.id, homeScore: 2, awayScore: 1, status: "FINISHED" });
  assert(storage.nanlianClubV2.playerMatchRecords.some((item) => item.matchId === match.id && item.studentId === "s1")); checks += 1;
  assert(!storage.nanlianClubV2.playerMatchRecords.some((item) => item.matchId === match.id && item.externalPlayerId === externalPlayer.id) && storage.nanlianClubV2.playerGrowthEvents.length === eventBefore + 1); checks += 1;
  assert.strictEqual(JSON.stringify(storage.nanlianClubV2.lessonLedger), ledgerBefore); assert.strictEqual(JSON.stringify(storage.nanlianClubV2.classMembers), classesBefore); checks += 1;
  assert.strictEqual(JSON.stringify(storage.nanlianClubV2.waitlist), waitBefore); checks += 1;

  await admin("updateLeagueRound", { id: testRounds[1].id, date: "2026-10-04", status: "POSTPONED" }); assert(testRounds[1].originalDate && testRounds[1].newDate === "2026-10-04"); checks += 1;
  await admin("updateLeagueRound", { id: testRounds[2].id, status: "CANCELLED" }); assert.strictEqual(testRounds[2].status, "CANCELLED"); checks += 1;
  await rejects(() => parent("saveLeagueTeam", { name: "越权球队", birthYearGroup: [2017, 2018] }), /管理员/); await rejects(() => coach("saveLeagueMatch", { id: match.id, homeScore: 3, awayScore: 1 }), /管理员/); checks += 1;

  assert.strictEqual(checks, 23);
  console.log("Sunday growth league regression: 23 checks passed");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
