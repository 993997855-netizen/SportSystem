const ACTIONS = new Set([
  "getLeagueDashboard", "getLeagueMeta", "createLeague", "createLeagueSeason",
  "generateLeagueRounds", "updateLeagueRound", "saveLeagueTeam",
  "saveLeagueTeamMember", "saveExternalPlayer", "registerSeasonTeam",
  "generateRoundRobin", "getLeagueRound", "getLeagueTeamRoster",
  "saveMatchSquad", "saveLeagueMatch", "getLeagueStandings"
]);

function isoWeek(value) {
  const date = new Date(`${value}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function sundays(startDate, endDate) {
  const date = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const rows = [];
  while (date.getUTCDay() !== 0) date.setUTCDate(date.getUTCDate() + 1);
  while (date <= end) {
    rows.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 7);
  }
  return rows;
}

function weekConfig(season, date, roundNo) {
  const weekNumber = isoWeek(date);
  const odd = season.scheduleMode === "SEASON_ROUND" ? roundNo % 2 === 1 : weekNumber % 2 === 1;
  return {
    weekNumber,
    weekType: odd ? "ODD" : "EVEN",
    birthYears: [...(odd ? season.oddWeekBirthYears : season.evenWeekBirthYears)]
  };
}

function sameYears(a, b) {
  return [...(a || [])].map(Number).sort().join(",") === [...(b || [])].map(Number).sort().join(",");
}

function pairs(ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) rows.push([ids[i], ids[j]]);
  }
  return rows;
}

function createLeagueService({
  db, fetchAll, fetchByIds, publicDoc, nowText, todayText, requireRole, audit,
  allowedStudentIds, assertStudentAccess, getCoachReference
}) {
  async function ensureDefaults() {
    const found = await db.collection("leagues").where({ leagueType: "GROWTH_LEAGUE" }).limit(1).get();
    if (found.data.length) return;
    const createdAt = nowText();
    await db.collection("leagues").add({
      data: {
        name: "南联周日成长联赛",
        competitionType: "LEAGUE",
        leagueType: "GROWTH_LEAGUE",
        recurringRule: "SUNDAY_ALTERNATING_WEEK",
        oddWeekAgeGroups: [2017, 2018],
        evenWeekAgeGroups: [2015, 2016],
        defaultMatchDay: 0,
        active: true,
        createdAt,
        updatedAt: createdAt
      }
    });
  }

  async function teamView(id, user) {
    const team = (await db.collection("teams").doc(id).get().catch(() => ({ data: null }))).data;
    if (!team) return {};
    const value = publicDoc(team);
    if (team.coachUserId && getCoachReference) value.coach = await getCoachReference(team.coachUserId, team.coachName);
    if (user.role === "parent") {
      delete value.contactMobile;
      delete value.coachMobile;
      delete value.contactName;
    }
    return value;
  }

  async function parentStudentSet(user, input = {}) {
    if (input.studentId) await assertStudentAccess(user, input.studentId);
    const ids = input.studentId ? [input.studentId] : await allowedStudentIds(user);
    return new Set(ids || []);
  }

  async function calculateStandings(seasonId) {
    const season = (await db.collection("leagueSeasons").doc(seasonId).get()).data;
    const registrations = await fetchAll("seasonTeams", { seasonId, status: "ACTIVE" });
    const teams = await fetchByIds("teams", registrations.map((item) => item.teamId));
    const matches = await fetchAll("matches", { seasonId, status: "FINISHED" });
    const rule = season.pointsRule || { win: 3, draw: 1, loss: 0 };
    const map = {};
    registrations.forEach((item) => {
      const team = teams.find((row) => row._id === item.teamId);
      map[item.teamId] = { teamId: item.teamId, teamName: (team || {}).name || "", played: 0, win: 0, draw: 0, loss: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
    });
    matches.forEach((match) => {
      const home = map[match.homeTeamId];
      const away = map[match.awayTeamId];
      if (!home || !away) return;
      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);
      home.played += 1; away.played += 1;
      home.goalsFor += homeScore; home.goalsAgainst += awayScore;
      away.goalsFor += awayScore; away.goalsAgainst += homeScore;
      if (homeScore > awayScore) { home.win += 1; away.loss += 1; home.points += Number(rule.win); away.points += Number(rule.loss); }
      else if (homeScore < awayScore) { away.win += 1; home.loss += 1; away.points += Number(rule.win); home.points += Number(rule.loss); }
      else { home.draw += 1; away.draw += 1; home.points += Number(rule.draw); away.points += Number(rule.draw); }
    });
    return Object.values(map)
      .map((item) => ({ ...item, goalDifference: item.goalsFor - item.goalsAgainst }))
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
  }

  async function call(action, input, user) {
    if (action === "getLeagueMeta") {
      return {
        scheduleModes: [{ key: "CALENDAR_WEEK", name: "按自然周" }, { key: "SEASON_ROUND", name: "按赛季轮次" }],
        statuses: ["DRAFT", "ACTIVE", "FINISHED", "ARCHIVED"],
        roundStatuses: ["SCHEDULED", "POSTPONED", "CANCELLED", "FINISHED"],
        organizationTypes: ["INTERNAL", "EXTERNAL"]
      };
    }

    if (action === "getLeagueDashboard") {
      const league = (await db.collection("leagues").where({ active: true }).limit(1).get()).data[0];
      if (!league) return { league: null, season: null, rounds: [], teams: [], matches: [], standings: [] };
      const activeSeason = await db.collection("leagueSeasons").where({ leagueId: league._id, status: "ACTIVE" }).limit(1).get();
      const anySeason = activeSeason.data.length ? activeSeason : await db.collection("leagueSeasons").where({ leagueId: league._id }).limit(1).get();
      const season = anySeason.data[0];
      if (!season) return { league: publicDoc(league), season: null, rounds: [], teams: [], matches: [], standings: [] };
      const rounds = (await fetchAll("leagueRounds", { seasonId: season._id })).sort((a, b) => a.date.localeCompare(b.date));
      const nextRound = rounds.find((item) => item.status !== "CANCELLED" && item.date >= (input.today || todayText())) || rounds[0];
      const registrations = await fetchAll("seasonTeams", { seasonId: season._id, status: "ACTIVE" });
      const rawTeams = await fetchByIds("teams", registrations.map((item) => item.teamId));
      let rawMatches = nextRound ? await fetchAll("matches", { roundId: nextRound._id }) : [];
      if (user.role === "parent") {
        const owned = await parentStudentSet(user, input);
        const squads = await fetchAll("matchSquads", { memberType: "INTERNAL_STUDENT" });
        const allowedMatches = new Set(squads.filter((item) => owned.has(item.studentId)).map((item) => item.matchId));
        rawMatches = rawMatches.filter((item) => allowedMatches.has(item._id));
      }
      const teams = [];
      for (const team of rawTeams) teams.push(await teamView(team._id, user));
      const matches = [];
      for (const item of rawMatches.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))) {
        matches.push({ ...publicDoc(item), homeTeam: await teamView(item.homeTeamId, user), awayTeam: await teamView(item.awayTeamId, user) });
      }
      return {
        league: publicDoc(league),
        season: publicDoc(season),
        nextRound: publicDoc(nextRound),
        rounds: rounds.map(publicDoc),
        teams,
        matches,
        standings: await calculateStandings(season._id),
        standingsVisible: user.role !== "parent" || Boolean(season.standingsEnabled)
      };
    }

    if (action === "createLeague") {
      requireRole(user, ["admin"]);
      const now = nowText();
      const added = await db.collection("leagues").add({ data: { ...input, competitionType: "LEAGUE", active: input.active !== false, createdAt: now, updatedAt: now } });
      await audit(user, "createLeague", "league", added._id, input.name);
      return { id: added._id };
    }

    if (action === "createLeagueSeason") {
      requireRole(user, ["admin"]);
      const league = (await db.collection("leagues").doc(input.leagueId).get()).data;
      if (!league || !input.name || !input.startDate || !input.endDate || input.startDate > input.endDate) throw new Error("赛季信息不完整");
      const now = nowText();
      const added = await db.collection("leagueSeasons").add({
        data: {
          ...input,
          oddWeekBirthYears: (input.oddWeekBirthYears || league.oddWeekAgeGroups).map(Number),
          evenWeekBirthYears: (input.evenWeekBirthYears || league.evenWeekAgeGroups).map(Number),
          scheduleMode: input.scheduleMode || "CALENDAR_WEEK",
          standingsEnabled: Boolean(input.standingsEnabled),
          pointsRule: input.pointsRule || { win: 3, draw: 1, loss: 0 },
          status: input.status || "DRAFT",
          createdBy: user._id,
          createdAt: now,
          updatedAt: now
        }
      });
      await audit(user, "createLeagueSeason", "leagueSeason", added._id, input.name);
      return { id: added._id };
    }

    if (action === "generateLeagueRounds") {
      requireRole(user, ["admin"]);
      const season = (await db.collection("leagueSeasons").doc(input.seasonId).get()).data;
      if (!season) throw new Error("赛季不存在");
      const existing = await fetchAll("leagueRounds", { seasonId: input.seasonId });
      if (existing.length && !input.confirmRegenerate) return { confirmationRequired: true, existing: existing.length };
      let count = 0;
      for (const [index, date] of sundays(season.startDate, season.endDate).entries()) {
        if (existing.some((item) => item.date === date)) continue;
        await db.collection("leagueRounds").add({ data: { seasonId: season._id, roundNo: index + 1, date, ...weekConfig(season, date, index + 1), venueId: (season.defaultVenueIds || [])[0] || "", status: "SCHEDULED", remark: "", createdAt: nowText() } });
        count += 1;
      }
      await audit(user, "generateLeagueRounds", "leagueSeason", season._id, `${count}轮`);
      return { created: count };
    }

    if (action === "updateLeagueRound") {
      requireRole(user, ["admin"]);
      const item = (await db.collection("leagueRounds").doc(input.id).get()).data;
      if (!item) throw new Error("轮次不存在");
      const update = { birthYears: input.birthYears || item.birthYears, venueId: input.venueId === undefined ? item.venueId : input.venueId, status: input.status || item.status, remark: input.remark === undefined ? item.remark : input.remark, updatedAt: nowText() };
      if (input.status === "POSTPONED" && input.date && input.date !== item.date) Object.assign(update, { originalDate: item.originalDate || item.date, newDate: input.date, date: input.date });
      await db.collection("leagueRounds").doc(item._id).update({ data: update });
      if (update.date) {
        const matches = await fetchAll("matches", { roundId: item._id });
        for (const match of matches) await db.collection("matches").doc(match._id).update({ data: { matchDate: update.date, updatedAt: nowText() } });
      }
      await audit(user, input.status === "POSTPONED" ? "postponeLeagueRound" : input.status === "CANCELLED" ? "cancelLeagueRound" : "updateLeagueRound", "leagueRound", item._id, update);
      return { ok: true };
    }

    if (action === "saveLeagueTeam") {
      requireRole(user, ["admin"]);
      const update = { ...input, birthYearGroup: (input.birthYearGroup || []).map(Number), organizationType: input.organizationType || "EXTERNAL", updatedAt: nowText() };
      delete update.id;
      if (!update.name || !update.birthYearGroup.length) throw new Error("球队信息不完整");
      let id = input.id;
      if (id) await db.collection("teams").doc(id).update({ data: update });
      else { const added = await db.collection("teams").add({ data: { ...update, createdAt: nowText() } }); id = added._id; }
      await audit(user, input.id ? "updateLeagueTeam" : "createLeagueTeam", "team", id, input.name);
      return { id };
    }

    if (action === "saveLeagueTeamMember") {
      requireRole(user, ["admin", "coach"]);
      const team = (await db.collection("teams").doc(input.teamId).get()).data;
      const student = (await db.collection("students").doc(input.studentId).get()).data;
      if (!team || team.organizationType !== "INTERNAL" || !student || student.status !== "active") throw new Error("内部球队成员信息无效");
      if (user.role === "coach" && team.coachUserId !== user._id) throw new Error("只能管理自己负责的球队");
      const duplicate = (await db.collection("teamMembers").where({ teamId: team._id, studentId: student._id, status: "ACTIVE" }).limit(1).get()).data[0];
      if (duplicate) return { id: duplicate._id, duplicate: true };
      const added = await db.collection("teamMembers").add({ data: { teamId: team._id, studentId: student._id, memberType: "INTERNAL_STUDENT", jerseyNumber: input.jerseyNumber || "", status: "ACTIVE", createdAt: nowText() } });
      await audit(user, "saveLeagueTeamMember", "teamMember", added._id, { teamId: team._id, studentId: student._id });
      return { id: added._id };
    }

    if (action === "saveExternalPlayer") {
      requireRole(user, ["admin"]);
      const team = (await db.collection("teams").doc(input.teamId).get()).data;
      if (!team || team.organizationType !== "EXTERNAL") throw new Error("只能为外部球队录入外部球员");
      const data = { ...input, birthYear: Number(input.birthYear), updatedAt: nowText() };
      delete data.id;
      if (!data.name || !data.birthYear) throw new Error("球员必要信息不完整");
      let id = input.id;
      if (id) await db.collection("externalPlayers").doc(id).update({ data });
      else { const added = await db.collection("externalPlayers").add({ data: { ...data, createdAt: nowText() } }); id = added._id; }
      await audit(user, input.id ? "updateExternalPlayer" : "createExternalPlayer", "externalPlayer", id, { teamId: input.teamId, name: input.name });
      return { id };
    }

    if (action === "registerSeasonTeam") {
      requireRole(user, ["admin"]);
      const team = (await db.collection("teams").doc(input.teamId).get()).data;
      if (!team) throw new Error("球队不存在");
      const target = (input.birthYearGroup || team.birthYearGroup || []).map(Number);
      if (!sameYears(team.birthYearGroup, target) && !input.overrideReason) return { confirmationRequired: true, message: "球队年龄组与赛季报名组别不一致" };
      const duplicate = (await db.collection("seasonTeams").where({ seasonId: input.seasonId, teamId: team._id, status: "ACTIVE" }).limit(1).get()).data[0];
      if (duplicate) return { id: duplicate._id, duplicate: true };
      const added = await db.collection("seasonTeams").add({ data: { seasonId: input.seasonId, teamId: team._id, birthYearGroup: target, status: "ACTIVE", overrideReason: input.overrideReason || "", createdAt: nowText() } });
      await audit(user, "registerSeasonTeam", "seasonTeam", added._id, { teamId: team._id, overrideReason: input.overrideReason || "" });
      return { id: added._id };
    }

    if (action === "generateRoundRobin") {
      requireRole(user, ["admin"]);
      const round = (await db.collection("leagueRounds").doc(input.roundId).get()).data;
      if (!round) throw new Error("轮次不存在");
      const registrations = await fetchAll("seasonTeams", { seasonId: round.seasonId, status: "ACTIVE" });
      const ids = input.teamIds && input.teamIds.length ? input.teamIds : registrations.filter((item) => sameYears(item.birthYearGroup, round.birthYears)).map((item) => item.teamId);
      const existing = await fetchAll("matches", { roundId: round._id });
      const season = (await db.collection("leagueSeasons").doc(round.seasonId).get()).data;
      let count = 0;
      for (const [index, pair] of pairs(ids).entries()) {
        const key = [...pair].sort().join(",");
        if (existing.some((item) => [item.homeTeamId, item.awayTeamId].sort().join(",") === key)) continue;
        await db.collection("matches").add({ data: { leagueId: season.leagueId, seasonId: round.seasonId, roundId: round._id, homeTeamId: pair[0], awayTeamId: pair[1], matchDate: round.date, startTime: `${String(9 + index).padStart(2, "0")}:00`, venueId: round.venueId, status: "SCHEDULED", homeScore: null, awayScore: null, lessonDeduction: 0, createdAt: nowText() } });
        count += 1;
      }
      await audit(user, "generateRoundRobin", "leagueRound", round._id, `${count}场`);
      return { created: count };
    }

    if (action === "getLeagueRound") {
      const round = (await db.collection("leagueRounds").doc(input.id).get()).data;
      if (!round) throw new Error("轮次不存在");
      let matches = await fetchAll("matches", { roundId: round._id });
      if (user.role === "parent") {
        const owned = await parentStudentSet(user, input);
        const squads = await fetchAll("matchSquads", { memberType: "INTERNAL_STUDENT" });
        const allowedMatches = new Set(squads.filter((item) => owned.has(item.studentId)).map((item) => item.matchId));
        matches = matches.filter((item) => allowedMatches.has(item._id));
      }
      const result = [];
      for (const item of matches.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))) {
        result.push({ ...publicDoc(item), homeTeam: await teamView(item.homeTeamId, user), awayTeam: await teamView(item.awayTeamId, user), squads: user.role === "parent" ? [] : (await fetchAll("matchSquads", { matchId: item._id })).map(publicDoc) });
      }
      return { round: publicDoc(round), matches: result };
    }

    if (action === "getLeagueTeamRoster") {
      requireRole(user, ["admin", "coach"]);
      const team = (await db.collection("teams").doc(input.teamId).get()).data;
      if (!team) throw new Error("球队不存在");
      if (user.role === "coach" && (team.organizationType !== "INTERNAL" || team.coachUserId !== user._id)) throw new Error("只能管理自己负责的球队");
      const squads = await fetchAll("matchSquads", { matchId: input.matchId, teamId: team._id });
      const selected = new Set(squads.map((item) => item.studentId || item.externalPlayerId));
      let members;
      if (team.organizationType === "INTERNAL") {
        const links = await fetchAll("teamMembers", { teamId: team._id, status: "ACTIVE" });
        const students = await fetchByIds("students", links.map((item) => item.studentId));
        members = links.map((item) => ({ ...publicDoc(item), memberId: item.studentId, name: (students.find((row) => row._id === item.studentId) || {}).name || "", avatarUrl: (students.find((row) => row._id === item.studentId) || {}).avatarUrl || "", memberType: "INTERNAL_STUDENT", selected: selected.has(item.studentId) }));
      } else {
        members = (await fetchAll("externalPlayers", { teamId: team._id })).map((item) => ({ ...publicDoc(item), memberId: item._id, memberType: "EXTERNAL_PLAYER", selected: selected.has(item._id) }));
      }
      return { team: await teamView(team._id, user), members };
    }

    if (action === "saveMatchSquad") {
      requireRole(user, ["admin", "coach"]);
      const match = (await db.collection("matches").doc(input.matchId).get()).data;
      const team = (await db.collection("teams").doc(input.teamId).get()).data;
      if (!match || !team || ![match.homeTeamId, match.awayTeamId].includes(team._id)) throw new Error("比赛名单信息无效");
      if (user.role === "coach" && (team.organizationType !== "INTERNAL" || team.coachUserId !== user._id)) throw new Error("只能管理自己负责的内部球队");
      const prepared = [];
      for (const member of input.members || []) {
        const internal = member.memberType === "INTERNAL_STUDENT";
        if (internal === Boolean(member.externalPlayerId) || internal !== Boolean(member.studentId)) throw new Error("名单成员类型与身份不匹配");
        if (internal && !(await db.collection("teamMembers").where({ teamId: team._id, studentId: member.studentId, status: "ACTIVE" }).limit(1).get()).data.length) throw new Error("内部球员不属于该比赛队");
        if (!internal && !(await db.collection("externalPlayers").where({ teamId: team._id, _id: member.externalPlayerId }).limit(1).get()).data.length) throw new Error("外部球员不属于该队");
        prepared.push({ ...member, matchId: match._id, teamId: team._id, studentId: member.studentId || "", externalPlayerId: member.externalPlayerId || "", goals: Number(member.goals || 0), assists: Number(member.assists || 0), status: "ACTIVE", createdAt: nowText() });
      }
      const old = await fetchAll("matchSquads", { matchId: match._id, teamId: team._id });
      for (const item of old) await db.collection("matchSquads").doc(item._id).remove();
      for (const member of prepared) await db.collection("matchSquads").add({ data: member });
      await audit(user, "saveMatchSquad", "match", match._id, { teamId: team._id, count: prepared.length });
      return { added: prepared.length };
    }

    if (action === "saveLeagueMatch") {
      requireRole(user, ["admin"]);
      const match = (await db.collection("matches").doc(input.id).get()).data;
      if (!match) throw new Error("比赛不存在");
      const wasFinished = match.status === "FINISHED";
      const update = { startTime: input.startTime || match.startTime, venueId: input.venueId || match.venueId, homeScore: Number(input.homeScore), awayScore: Number(input.awayScore), status: input.status || "FINISHED", lessonDeduction: 0, updatedAt: nowText() };
      await db.collection("matches").doc(match._id).update({ data: update });
      if (update.status === "FINISHED") {
        const squads = await fetchAll("matchSquads", { matchId: match._id, memberType: "INTERNAL_STUDENT" });
        for (const squad of squads) {
          const existing = await db.collection("playerMatchRecords").where({ matchId: match._id, studentId: squad.studentId }).limit(1).get();
          if (existing.data.length) continue;
          const own = await teamView(squad.teamId, user);
          const opponent = await teamView(squad.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId, user);
          await db.collection("playerMatchRecords").add({ data: { studentId: squad.studentId, matchId: match._id, matchDate: match.matchDate, opponent: opponent.name || "", teamName: own.name || "南联", position: squad.position || "", minutesPlayed: Number(squad.minutesPlayed || 0), goals: Number(squad.goals || 0), assists: Number(squad.assists || 0), coachRating: Number(squad.coachRating || 3), coachComment: squad.coachComment || "参加南联周日成长联赛", visibility: "PARENT_VISIBLE", source: "GROWTH_LEAGUE", createdBy: user._id, createdAt: nowText(), updatedAt: nowText() } });
          await db.collection("playerGrowthEvents").add({ data: { studentId: squad.studentId, eventType: "MATCH", sourceId: match._id, title: "参加南联周日成长联赛", description: `${own.name || "南联"} 对阵 ${opponent.name || "对手"}`, eventDate: match.matchDate, visibility: "PARENT_VISIBLE", createdBy: user._id, createdAt: nowText() } });
        }
      }
      await audit(user, wasFinished ? "updateLeagueScore" : "finishLeagueMatch", "match", match._id, { homeScore: update.homeScore, awayScore: update.awayScore, lessonDelta: 0 });
      return { ok: true };
    }

    if (action === "getLeagueStandings") {
      const season = (await db.collection("leagueSeasons").doc(input.seasonId).get()).data;
      if (!season) throw new Error("赛季不存在");
      if (user.role === "parent" && !season.standingsEnabled) throw new Error("本赛季未对家长开放积分榜");
      return calculateStandings(input.seasonId);
    }

    throw new Error("未知成长联赛操作");
  }

  return { handles: (action) => ACTIONS.has(action), ensureDefaults, call };
}

module.exports = { createLeagueService, isoWeek, sundays, weekConfig };
