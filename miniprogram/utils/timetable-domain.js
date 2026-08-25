const ACTIONS = new Set(["getUnifiedTimetable"]);

function handles(action) { return ACTIONS.has(action); }
function parseRange(value) { const match = String(value || "").match(/(\d{1,2}):(\d{2})\s*[-至~—]\s*(\d{1,2}):(\d{2})/); if (!match) return null; const start = Number(match[1]) * 60 + Number(match[2]), end = Number(match[3]) * 60 + Number(match[4]); return end > start ? { start, end } : null; }
function overlaps(left, right) { const a = parseRange(left.time), b = parseRange(right.time); return Boolean(a && b && a.start < b.end && b.start < a.end); }
function uniqueAssignments(rows) { const seen = new Set(); return (rows || []).filter((row) => row && row.coachId && !seen.has(row.coachId) && seen.add(row.coachId)); }
function effective(session) { return uniqueAssignments((session.actualCoachAssignments || []).length ? session.actualCoachAssignments : session.plannedCoachAssignments); }
function published(session) { return session.publishStatus === "PUBLISHED" || ["published", "COMPLETED", "CANCELLED"].includes(session.status); }
function statusLabel(status) { return status === "COMPLETED" ? "已完成" : status === "CANCELLED" ? "已取消" : status === "DRAFT" ? "草稿" : "未开始"; }
function roleLabel(role) { return role === "HEAD" ? "主教练" : role === "ASSISTANT" ? "助理教练" : role === "SUBSTITUTE" ? "代课" : ""; }
function dateOffset(value, days) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function weekRange(value) { const date = new Date(`${value}T12:00:00Z`), day = date.getUTCDay() || 7; return { startDate: dateOffset(value, 1 - day), endDate: dateOffset(value, 7 - day) }; }
function nameOf(data, coachId) { return ((data.users || []).find((row) => row.id === coachId) || {}).name || "教练"; }
function coachRows(data, session) { return effective(session).map((row) => ({ coachId: row.coachId, name: nameOf(data, row.coachId), role: row.role, roleLabel: roleLabel(row.role) })); }

function conflictIndex(sessions) {
  const map = new Map(sessions.map((row) => [row.id, new Set()])), pairs = { COACH: new Set(), CLASS: new Set(), VENUE: new Set() };
  for (let i = 0; i < sessions.length; i += 1) for (let j = i + 1; j < sessions.length; j += 1) {
    const left = sessions[i], right = sessions[j]; if (left.date !== right.date || left.status === "CANCELLED" || right.status === "CANCELLED" || !overlaps(left, right)) continue;
    const pair = [left.id, right.id].sort().join("|");
    const leftCoaches = new Set(effective(left).map((row) => row.coachId));
    if (effective(right).some((row) => leftCoaches.has(row.coachId))) pairs.COACH.add(pair);
    if (left.classId && left.classId === right.classId) pairs.CLASS.add(pair);
    if ((left.venueId || left.venue) && (left.venueId || left.venue) === (right.venueId || right.venue)) pairs.VENUE.add(pair);
    Object.keys(pairs).forEach((type) => { if (pairs[type].has(pair)) { map.get(left.id).add(type); map.get(right.id).add(type); } });
  }
  return { map, summary: { coach: pairs.COACH.size, class: pairs.CLASS.size, venue: pairs.VENUE.size, total: new Set([...pairs.COACH, ...pairs.CLASS, ...pairs.VENUE]).size } };
}

function trainingView(data, session, student, conflictTypes, role, userId) {
  const clubClass = (data.classes || []).find((row) => row.id === session.classId) || {}, coaches = coachRows(data, session), own = coaches.find((row) => row.coachId === userId), leave = student && (data.leaveRequests || []).filter((row) => row.sessionId === session.id && row.studentId === student.id).sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt)))[0], attendance = student && (data.attendance || []).find((row) => row.sessionId === session.id && row.studentId === student.id), leaveStatus = attendance && attendance.status === "leave" || leave && leave.status === "approved" ? "APPROVED" : leave && leave.status === "pending" ? "PENDING" : "";
  const time = String(session.time || ""), parsed = parseRange(time), primary = coaches.find((row) => row.role === "HEAD") || coaches[0] || {};
  return { id: student ? `${session.id}-${student.id}` : session.id, sourceId: session.id, sourceType: "TRAINING", sourceLabel: "训练", sessionId: session.id, studentId: student && student.id || "", studentName: student && student.name || "", date: session.date, weekday: session.weekday || "", startTime: parsed ? time.split(/[-至~—]/)[0].trim() : "", endTime: parsed ? time.split(/[-至~—]/)[1].trim() : "", time, classId: session.classId, className: clubClass.name || session.title, classType: clubClass.classType || "REGULAR", classTypeLabel: clubClass.classType === "ELITE" ? "精英队" : "普通班", venueId: session.venueId || session.venue || "", venue: session.venue || session.venueId || "", coaches, primaryCoach: primary, coachRole: own && own.role || "", coachRoleLabel: own && own.roleLabel || "", isSubstitute: Boolean(own && own.role === "SUBSTITUTE"), originalCoachNames: (session.plannedCoachAssignments || []).filter((row) => !(session.actualCoachAssignments || []).some((actual) => actual.coachId === row.coachId)).map((row) => nameOf(data, row.coachId)), trainingTheme: session.trainingTheme || session.title || "", trainingFocus: session.trainingFocus || session.focus || "", status: session.status, statusLabel: statusLabel(session.status), publishStatus: session.publishStatus || (published(session) ? "PUBLISHED" : "DRAFT"), leaveStatus, leaveLabel: leaveStatus === "APPROVED" ? "已请假 · 本次不扣课时" : leaveStatus === "PENDING" ? "请假待审批" : "", conflictTypes: [...(conflictTypes || [])], hasConflict: Boolean(conflictTypes && conflictTypes.size), editable: role === "admin" };
}

function matchView(data, match, student) {
  const home = (data.teams || []).find((row) => row.id === match.homeTeamId) || {}, away = (data.teams || []).find((row) => row.id === match.awayTeamId) || {}, teamIds = new Set((data.matchSquads || []).filter((row) => row.matchId === match.id && (!student || row.studentId === student.id)).map((row) => row.teamId)), ownTeam = (data.teams || []).find((row) => teamIds.has(row.id)) || home, coachId = ownTeam.coachUserId || "";
  return { id: student ? `${match.id}-${student.id}` : match.id, sourceId: match.id, sourceType: "MATCH", sourceLabel: "比赛", matchId: match.id, studentId: student && student.id || "", studentName: student && student.name || "", date: match.matchDate, weekday: "周日", startTime: match.startTime || "", endTime: match.endTime || "", time: `${match.startTime || "待定"}${match.endTime ? `-${match.endTime}` : ""}`, classId: ownTeam.classId || "", className: "南联周日成长联赛", classType: "MATCH", classTypeLabel: "比赛", venueId: match.venueId || "", venue: match.venueId || "", coaches: coachId ? [{ coachId, name: nameOf(data, coachId), role: "HEAD", roleLabel: "带队教练" }] : [], primaryCoach: coachId ? { coachId, name: nameOf(data, coachId), roleLabel: "带队教练" } : {}, trainingTheme: `${home.name || "主队"} vs ${away.name || "客队"}`, trainingFocus: match.assemblyTime ? `${match.assemblyTime}集合` : "比赛不扣训练课时", status: match.status, statusLabel: match.status === "CANCELLED" ? "已取消" : match.status === "FINISHED" ? "已结束" : "待比赛", publishStatus: "PUBLISHED", leaveStatus: "", leaveLabel: "", conflictTypes: [], hasConflict: false, lessonDeduction: 0 };
}

async function call(action, input, ctx) {
  if (action !== "getUnifiedTimetable") throw new Error("未知统一课表操作");
  const { data, role, userId } = ctx, range = input.startDate && input.endDate ? input : weekRange(input.date || ctx.stamp().slice(0, 10));
  let students = [];
  if (role === "parent") {
    students = (data.students || []).filter((row) => row.ownerParentUserId === userId && row.status === "active");
    if (input.studentId && input.studentId !== "ALL") { if (!students.some((row) => row.id === input.studentId)) throw new Error("无权查看该学员课表"); students = students.filter((row) => row.id === input.studentId); }
    else if (input.studentId !== "ALL") students = students.slice(0, 1);
  }
  let sessions = (data.sessions || []).filter((row) => row.date >= range.startDate && row.date <= range.endDate);
  if (role === "coach") sessions = sessions.filter((row) => effective(row).some((coach) => coach.coachId === userId));
  if (role === "parent") sessions = sessions.filter(published);
  if (input.classType && input.classType !== "ALL") sessions = sessions.filter((row) => (((data.classes || []).find((item) => item.id === row.classId) || {}).classType || "REGULAR") === input.classType);
  if (input.classId) sessions = sessions.filter((row) => row.classId === input.classId);
  if (input.coachId) sessions = sessions.filter((row) => effective(row).some((coach) => coach.coachId === input.coachId));
  if (input.venueId) sessions = sessions.filter((row) => (row.venueId || row.venue) === input.venueId);
  const conflicts = conflictIndex(sessions), items = [];
  if (role === "parent") {
    const active = (data.classMembers || []).filter((row) => row.status === "ACTIVE");
    students.forEach((student) => { const classIds = new Set(active.filter((row) => row.studentId === student.id).map((row) => row.classId)); sessions.filter((row) => classIds.has(row.classId)).forEach((row) => items.push(trainingView(data, row, student, new Set(), role, userId))); });
  } else sessions.forEach((row) => items.push(trainingView(data, row, null, conflicts.map.get(row.id), role, userId)));
  if (input.includeMatches !== false) {
    let matches = (data.matches || []).filter((row) => row.matchDate >= range.startDate && row.matchDate <= range.endDate);
    if (role === "parent") students.forEach((student) => { const ids = new Set((data.matchSquads || []).filter((row) => row.studentId === student.id && row.status !== "INACTIVE").map((row) => row.matchId)); matches.filter((row) => ids.has(row.id)).forEach((row) => items.push(matchView(data, row, student))); });
    else if (role === "coach") { const teamIds = new Set((data.teams || []).filter((row) => row.coachUserId === userId).map((row) => row.id)); matches.filter((row) => teamIds.has(row.homeTeamId) || teamIds.has(row.awayTeamId)).forEach((row) => items.push(matchView(data, row))); }
    else matches.forEach((row) => items.push(matchView(data, row)));
  }
  items.sort((a, b) => `${a.date}${a.startTime}${a.studentName}`.localeCompare(`${b.date}${b.startTime}${b.studentName}`));
  const trainingItems = items.filter((row) => row.sourceType === "TRAINING"), own = role === "coach" ? trainingItems : [];
  return { ...range, role, studentId: input.studentId || (students[0] || {}).id || "", students: role === "parent" ? students.map((row) => ({ id: row.id, name: row.name, avatarUrl: row.avatarUrl || "" })) : [], items, stats: { total: trainingItems.length, matches: items.length - trainingItems.length, head: own.filter((row) => row.coachRole === "HEAD").length, assistant: own.filter((row) => row.coachRole === "ASSISTANT").length, substitute: own.filter((row) => row.coachRole === "SUBSTITUTE").length, completed: trainingItems.filter((row) => row.status === "COMPLETED").length, cancelled: trainingItems.filter((row) => row.status === "CANCELLED").length }, conflicts: role === "admin" ? conflicts.summary : { coach: 0, class: 0, venue: 0, total: 0 }, filters: role === "admin" ? { classes: (data.classes || []).filter((row) => row.status === "ACTIVE").map((row) => ({ id: row.id, name: row.name })), coaches: (data.users || []).filter((row) => row.role === "coach" && row.active !== false).map((row) => ({ id: row.id, name: row.name })), venues: [...new Set((data.sessions || []).map((row) => row.venueId || row.venue).filter(Boolean))].map((name) => ({ id: name, name })) } : {} };
}

module.exports = { ACTIONS, handles, call, weekRange, conflictIndex, published };
