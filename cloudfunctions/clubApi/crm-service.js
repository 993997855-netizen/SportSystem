const STATUS_LABELS = {
  NEW: "新线索",
  CONTACTED: "已联系",
  TRIAL_SCHEDULED: "已预约体验课",
  TRIAL_COMPLETED: "已体验",
  INTERESTED: "意向报名",
  WON: "已成交",
  LOST: "未成交",
  PUBLIC: "公海",
};

const TRIAL_STATUS_LABELS = {
  SCHEDULED: "已预约",
  COMPLETED: "已完成",
  NO_SHOW: "未到",
  CANCELLED: "已取消",
};

const SOURCES = ["微信群", "朋友圈", "公众号", "抖音", "视频号", "老学员转介绍", "朋友介绍", "线下活动", "学校合作", "电话咨询", "自然到店", "其他"];
const METHODS = ["电话", "微信", "面谈", "短信", "其他"];
const RESULTS = ["未接通", "已联系", "继续考虑", "预约体验课", "价格咨询", "等待回复", "意向报名", "无意向", "其他"];
const ACTIVE_TRIAL_STATUSES = ["SCHEDULED", "COMPLETED", "NO_SHOW"];
const TRIAL_ATTENDANCE_STATUSES = new Set(["present", "absent", "leave", "sick"]);
const SCORE_KEYS = ["participation", "coordination", "ballSense", "understanding", "enthusiasm"];

function dateOnly(value) { return String(value || "").slice(0, 10); }
function mobile(value) { return String(value || "").replace(/\D/g, ""); }
function addDays(date, days) {
  const value = new Date(`${dateOnly(date)}T12:00:00+08:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}
function ageOf(birthday, now) {
  if (!birthday) return "-";
  const birth = new Date(birthday);
  const current = new Date(now);
  let age = current.getFullYear() - birth.getFullYear();
  if (current.getMonth() < birth.getMonth() || (current.getMonth() === birth.getMonth() && current.getDate() < birth.getDate())) age -= 1;
  return Math.max(0, age);
}

function createCrmService(deps) {
  const { db, command, fetchAll, fetchByIds, publicDoc, nowText, todayText, requireRole, audit, saveStudent, canManageSession } = deps;
  const actions = new Set(["getCrmMeta", "getCrmDashboard", "listLeads", "checkLeadDuplicates", "getLead", "saveLead", "addLeadFollowUp", "assignLead", "moveLeadToPublic", "claimPublicLead", "archiveLead", "listTrials", "getTrial", "createTrial", "cancelTrial", "saveTrialFeedback", "convertLead", "getCrmStats"]);

  async function getDoc(collection, id, message) {
    if (!id) throw new Error(message);
    const result = await db.collection(collection).doc(id).get().catch(() => ({ data: null }));
    if (!result.data) throw new Error(message);
    return result.data;
  }

  function canAccessLead(user, lead, allowPublic = false) {
    return Boolean(lead && (user.role === "admin" || user.role === "coach" && (lead.ownerCoachId === user._id || allowPublic && lead.status === "PUBLIC")));
  }

  async function scopedLeads(user, includePublic = false) {
    let rows = (await fetchAll("leads")).filter((item) => !item.archived);
    if (user.role === "coach") rows = rows.filter((item) => item.ownerCoachId === user._id || includePublic && item.status === "PUBLIC");
    return rows;
  }

  async function coachList() {
    return (await fetchAll("users")).filter((item) => item.role === "coach" && item.active !== false).map((item) => ({ id: item._id, name: item.name || "未命名教练" }));
  }

  async function decorateLead(lead) {
    const [followUps, trials] = await Promise.all([
      db.collection("leadFollowUps").where({ leadId: lead._id }).count(),
      db.collection("trialBookings").where({ leadId: lead._id }).count(),
    ]);
    const next = String(lead.nextFollowUpAt || "");
    const nextDate = dateOnly(next);
    const today = todayText();
    const daysAhead = nextDate ? Math.ceil((new Date(`${nextDate}T00:00:00+08:00`) - new Date(`${today}T00:00:00+08:00`)) / 86400000) : null;
    const overdue = daysAhead !== null && daysAhead < 0 && !["WON", "LOST"].includes(lead.status);
    const dueBucket = daysAhead === null ? "none" : daysAhead < 0 ? "overdue" : daysAhead === 0 ? "today" : daysAhead <= 3 ? "threeDays" : daysAhead <= 7 ? "sevenDays" : "later";
    return { ...publicDoc(lead), age: ageOf(lead.birthday, today), statusLabel: STATUS_LABELS[lead.status] || lead.status, intentionClass: String(lead.intentionLevel || "C").toLowerCase(), overdue, overdueDays: overdue ? Math.abs(daysAhead) : 0, dueBucket, followUpCount: followUps.total, trialCount: trials.total };
  }

  async function getMeta() {
    return { statuses: STATUS_LABELS, trialStatuses: TRIAL_STATUS_LABELS, sources: SOURCES, intentions: ["A", "B", "C"], methods: METHODS, results: RESULTS, coaches: await coachList() };
  }

  async function dashboard(user) {
    const leads = await scopedLeads(user);
    const leadIds = new Set(leads.map((item) => item._id));
    const trials = (await fetchAll("trialBookings")).filter((item) => leadIds.has(item.leadId));
    const completed = trials.filter((item) => item.status === "COMPLETED");
    const won = leads.filter((item) => item.status === "WON");
    const today = todayText();
    const monthKey = today.slice(0, 7);
    const sameDay = (value) => dateOnly(value) === today;
    const sameMonth = (value) => dateOnly(value).slice(0, 7) === monthKey;
    const funnel = ["NEW", "CONTACTED", "TRIAL_SCHEDULED", "TRIAL_COMPLETED", "INTERESTED", "WON"].map((status) => ({ status, label: STATUS_LABELS[status], count: leads.filter((item) => item.status === status).length }));
    funnel.push({ status: "FORMAL", label: "正式学员", count: leads.filter((item) => item.convertedStudentId).length });
    const recent = [];
    for (const item of [...leads].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 5)) recent.push(await decorateLead(item));
    return {
      today: { newLeads: leads.filter((item) => sameDay(item.createdAt)).length, due: leads.filter((item) => sameDay(item.nextFollowUpAt)).length, scheduled: trials.filter((item) => item.status === "SCHEDULED" && sameDay(item.trialDate)).length, trials: completed.filter((item) => sameDay(item.trialDate)).length, won: won.filter((item) => sameDay(item.convertedAt)).length },
      month: { newLeads: leads.filter((item) => sameMonth(item.createdAt)).length, trials: completed.filter((item) => sameMonth(item.trialDate)).length, won: won.filter((item) => sameMonth(item.convertedAt)).length, amount: won.filter((item) => sameMonth(item.convertedAt)).reduce((sum, item) => sum + Number(item.dealAmount || 0), 0), conversionRate: completed.length ? Math.round(won.length / completed.length * 100) : 0 },
      funnel: funnel.map((item) => ({ ...item, width: Math.min(100, Math.max(3, item.count * 12)) })),
      overdue: leads.filter((item) => item.nextFollowUpAt && item.nextFollowUpAt < `${today} 00:00` && !["WON", "LOST"].includes(item.status)).length,
      publicCount: (await fetchAll("leads")).filter((item) => item.status === "PUBLIC" && !item.archived).length,
      recent,
    };
  }

  async function listLeads(user, input) {
    let rows = input.view === "public" ? (await fetchAll("leads", { status: "PUBLIC" })).filter((item) => !item.archived) : await scopedLeads(user);
    if (input.view === "won") rows = rows.filter((item) => item.status === "WON");
    if (input.view === "due") rows = rows.filter((item) => item.nextFollowUpAt && dateOnly(item.nextFollowUpAt) <= addDays(todayText(), 7) && !["WON", "LOST"].includes(item.status));
    if (input.query) { const query = String(input.query).toLowerCase(); rows = rows.filter((item) => [item.childName, item.parentName, item.mobile].some((value) => String(value || "").toLowerCase().includes(query))); }
    ["status", "intentionLevel", "source", "interestedProgram", "ownerCoachId"].forEach((key) => { if (input[key]) rows = rows.filter((item) => item[key] === input[key]); });
    if (input.createdStart) rows = rows.filter((item) => dateOnly(item.createdAt) >= input.createdStart);
    if (input.createdEnd) rows = rows.filter((item) => dateOnly(item.createdAt) <= input.createdEnd);
    const sort = input.sort || "created";
    rows.sort((a, b) => sort === "followed" ? String(b.lastFollowUpAt).localeCompare(String(a.lastFollowUpAt)) : sort === "oldest" ? String(a.lastFollowUpAt || a.createdAt).localeCompare(String(b.lastFollowUpAt || b.createdAt)) : sort === "next" ? String(a.nextFollowUpAt || "9999").localeCompare(String(b.nextFollowUpAt || "9999")) : String(b.createdAt).localeCompare(String(a.createdAt)));
    const result = [];
    for (const row of rows) result.push(await decorateLead(row));
    return result;
  }

  async function getLead(user, id) {
    const lead = await getDoc("leads", id, "线索不存在");
    if (!canAccessLead(user, lead, true)) throw new Error("无权查看该线索");
    const [followUps, trials] = await Promise.all([
      db.collection("leadFollowUps").where({ leadId: id }).orderBy("createdAt", "desc").limit(100).get(),
      db.collection("trialBookings").where({ leadId: id }).orderBy("createdAt", "desc").limit(100).get(),
    ]);
    return { ...(await decorateLead(lead)), followUps: followUps.data.map(publicDoc), trials: trials.data.map((item) => ({ ...publicDoc(item), statusLabel: TRIAL_STATUS_LABELS[item.status] || item.status })) };
  }

  async function duplicateRecords(input) {
    const normalizedMobile = mobile(input.mobile);
    if (!normalizedMobile) return [];
    const [leads, students] = await Promise.all([fetchAll("leads"), fetchAll("students")]);
    return [
      ...leads.filter((item) => item._id !== input.id && mobile(item.mobile) === normalizedMobile).map((item) => ({ type: "lead", id: item._id, name: item.childName, parentName: item.parentName, status: STATUS_LABELS[item.status] || item.status })),
      ...students.filter((item) => mobile(item.guardianPhone) === normalizedMobile).map((item) => ({ type: "student", id: item._id, name: item.name, parentName: item.guardianName, status: "正式学员" })),
    ];
  }

  async function saveLead(user, payload) {
    if (!payload.childName || !payload.parentName || !/^1\d{10}$/.test(mobile(payload.mobile)) || !payload.source) throw new Error("请完整填写必填项");
    let ownerCoachId = user.role === "coach" ? user._id : String(payload.ownerCoachId || "");
    let ownerCoachName = user.role === "coach" ? user.name : "";
    if (ownerCoachId && user.role === "admin") { const coach = await getDoc("users", ownerCoachId, "负责人无效"); if (coach.role !== "coach" || coach.active === false) throw new Error("负责人无效"); ownerCoachName = coach.name || "未命名教练"; }
    const data = { childName: String(payload.childName).trim(), gender: payload.gender || "男", birthday: payload.birthday || "", parentName: String(payload.parentName).trim(), mobile: mobile(payload.mobile), wechat: String(payload.wechat || ""), school: String(payload.school || ""), grade: String(payload.grade || ""), interestedProgram: String(payload.interestedProgram || ""), source: payload.source, sourceDetail: String(payload.sourceDetail || ""), intentionLevel: payload.intentionLevel || "B", ownerCoachId, ownerCoachName, tags: Array.isArray(payload.tags) ? payload.tags : [], remark: String(payload.remark || ""), updatedAt: nowText() };
    let id = payload.id;
    if (id) {
      const current = await getDoc("leads", id, "线索不存在");
      if (!canAccessLead(user, current) || current.status === "PUBLIC") throw new Error("无权修改该线索");
      await db.collection("leads").doc(id).update({ data });
    } else {
      const added = await db.collection("leads").add({ data: { ...data, status: "NEW", trialStatus: "", createdBy: user._id, createdAt: nowText(), convertedStudentId: "", convertedAt: "", archived: false } });
      id = added._id;
    }
    await audit(user, payload.id ? "UPDATE_CRM_LEAD" : "CREATE_CRM_LEAD", "lead", id, { childName: data.childName });
    return { id };
  }

  async function addFollowUp(user, input) {
    const lead = await getDoc("leads", input.leadId, "线索不存在");
    if (!canAccessLead(user, lead) || lead.status === "PUBLIC") throw new Error("无权跟进该线索");
    const content = String(input.content || "").trim();
    if (!content) throw new Error("请填写跟进内容");
    const item = { leadId: lead._id, method: input.method || "电话", result: input.result || "已联系", content, nextFollowUpAt: input.nextFollowUpAt || "", operatorId: user._id, operatorName: user.name, createdAt: nowText() };
    const added = await db.collection("leadFollowUps").add({ data: item });
    let status = lead.status === "NEW" ? "CONTACTED" : lead.status;
    if (input.result === "预约体验课") status = "TRIAL_SCHEDULED";
    if (input.result === "意向报名") status = "INTERESTED";
    if (input.result === "无意向") status = "LOST";
    await db.collection("leads").doc(lead._id).update({ data: { status, lastFollowUpAt: item.createdAt, nextFollowUpAt: item.nextFollowUpAt, updatedAt: nowText() } });
    await audit(user, "ADD_CRM_FOLLOW_UP", "lead", lead._id, { followUpId: added._id, result: item.result });
    return { id: added._id };
  }

  async function assignLead(user, input) {
    requireRole(user, ["admin"]);
    const [lead, coach] = await Promise.all([getDoc("leads", input.id, "线索不存在"), getDoc("users", input.ownerCoachId, "负责人无效")]);
    if (coach.role !== "coach" || coach.active === false) throw new Error("负责人无效");
    await db.collection("leads").doc(lead._id).update({ data: { ownerCoachId: coach._id, ownerCoachName: coach.name || "教练", status: lead.status === "PUBLIC" ? "CONTACTED" : lead.status, updatedAt: nowText() } });
    await audit(user, "ASSIGN_CRM_LEAD", "lead", lead._id, { ownerCoachId: coach._id });
    return { ok: true };
  }

  async function moveToPublic(user, id) {
    requireRole(user, ["admin"]);
    const lead = await getDoc("leads", id, "线索不存在");
    await db.collection("leads").doc(id).update({ data: { ownerCoachId: "", ownerCoachName: "", status: "PUBLIC", updatedAt: nowText() } });
    await audit(user, "MOVE_CRM_LEAD_TO_PUBLIC", "lead", lead._id, {});
    return { ok: true };
  }

  async function claimPublic(user, id) {
    requireRole(user, ["coach"]);
    await db.runTransaction(async (transaction) => {
      const lead = (await transaction.collection("leads").doc(id).get()).data;
      if (!lead || lead.status !== "PUBLIC" || lead.ownerCoachId) throw new Error("该线索已被其他教练领取");
      await transaction.collection("leads").doc(id).update({ data: { ownerCoachId: user._id, ownerCoachName: user.name, status: "CONTACTED", updatedAt: nowText() } });
    });
    await audit(user, "CLAIM_CRM_LEAD", "lead", id, {});
    return { ok: true };
  }

  async function listTrials(user) {
    const leads = await scopedLeads(user);
    const leadIds = new Set(leads.map((item) => item._id));
    return (await fetchAll("trialBookings")).filter((item) => leadIds.has(item.leadId)).sort((a, b) => String(b.trialDate).localeCompare(String(a.trialDate))).map((item) => ({ ...publicDoc(item), statusLabel: TRIAL_STATUS_LABELS[item.status] || item.status, lead: publicDoc(leads.find((lead) => lead._id === item.leadId)) }));
  }

  async function getTrial(user, id) {
    const trial = await getDoc("trialBookings", id, "体验课不存在");
    const lead = await getDoc("leads", trial.leadId, "线索不存在");
    if (!canAccessLead(user, lead)) throw new Error("无权查看体验课");
    return { ...publicDoc(trial), statusLabel: TRIAL_STATUS_LABELS[trial.status] || trial.status, lead: publicDoc(lead) };
  }

  async function createTrial(user, input) {
    const lead = await getDoc("leads", input.leadId, "线索不存在");
    if (!canAccessLead(user, lead) || lead.status === "PUBLIC") throw new Error("无权预约该线索");
    if (!input.sessionId) throw new Error("体验课必须绑定具体课程");
    if (await db.collection("trialBookings").where({ leadId: lead._id, sessionId: input.sessionId, status: "SCHEDULED" }).count().then((item) => item.total)) throw new Error("该学员已预约本节体验课");
    let trialId;
    await db.runTransaction(async (transaction) => {
      const session = (await transaction.collection("sessions").doc(input.sessionId).get()).data;
      if (!session || ["CANCELLED", "COMPLETED"].includes(session.status)) throw new Error("该课程当前不可预约体验课");
      if (user.role === "coach" && canManageSession) await canManageSession(user, session);
      const clubClass = (await transaction.collection("classes").doc(session.classId).get()).data;
      if (!clubClass) throw new Error("课程班级不存在");
      const [formal, trials] = await Promise.all([
        transaction.collection("classMembers").where({ classId: session.classId, status: "ACTIVE" }).count(),
        transaction.collection("trialBookings").where({ sessionId: session._id, status: command.in(ACTIVE_TRIAL_STATUSES) }).count(),
      ]);
      if (formal.total + trials.total >= Number(session.capacity || clubClass.standardCapacity || 20)) throw new Error("本节课程体验课名额已满");
      const coachId = session.coachUserId || clubClass.headCoachUserId || clubClass.coachUserId || lead.ownerCoachId || "";
      const coach = coachId ? (await transaction.collection("users").doc(coachId).get().catch(() => ({ data: null }))).data : null;
      const added = await transaction.collection("trialBookings").add({ data: { leadId: lead._id, studentName: lead.childName, childName: lead.childName, classId: session.classId, className: clubClass.name, sessionId: session._id, coachId, coachName: (coach || {}).name || session.coachName || clubClass.headCoachName || clubClass.coachName || "", venueId: session.venueId || "", venueName: session.venue || clubClass.venue || "", trialDate: session.date, status: "SCHEDULED", attendanceStatus: "unmarked", remark: String(input.remark || ""), createdBy: user._id, createdAt: nowText(), updatedAt: nowText() } });
      trialId = added._id;
      await transaction.collection("leads").doc(lead._id).update({ data: { status: "TRIAL_SCHEDULED", trialStatus: "SCHEDULED", updatedAt: nowText() } });
    });
    await audit(user, "CREATE_TRIAL_BOOKING", "trial", trialId, { leadId: lead._id, sessionId: input.sessionId });
    return { id: trialId };
  }

  async function cancelTrial(user, input) {
    const trial = await getDoc("trialBookings", input.id, "体验课不存在");
    const lead = await getDoc("leads", trial.leadId, "线索不存在");
    if (!canAccessLead(user, lead)) throw new Error("无权取消体验课");
    if (trial.status !== "SCHEDULED") throw new Error("当前体验课不可取消");
    const reason = String(input.reason || "计划调整");
    await db.runTransaction(async (transaction) => {
      const active = await transaction.collection("trialBookings").where({ leadId: lead._id, status: "SCHEDULED" }).count();
      await transaction.collection("trialBookings").doc(trial._id).update({ data: { status: "CANCELLED", cancelReason: reason, updatedAt: nowText() } });
      if (active.total <= 1 && lead.status === "TRIAL_SCHEDULED") await transaction.collection("leads").doc(lead._id).update({ data: { status: "CONTACTED", trialStatus: "CANCELLED", updatedAt: nowText() } });
    });
    await audit(user, "CANCEL_TRIAL_BOOKING", "trial", trial._id, { reason });
    return { ok: true };
  }

  async function saveTrialFeedback(user, input) {
    const trial = await getDoc("trialBookings", input.id, "体验课不存在");
    const lead = await getDoc("leads", trial.leadId, "线索不存在");
    if (!canAccessLead(user, lead)) throw new Error("无权填写体验课反馈");
    const source = input.feedback || {};
    const feedback = { summary: String(source.summary || "").trim() };
    if (!feedback.summary) throw new Error("请填写综合评价");
    SCORE_KEYS.forEach((key) => { const value = Number(source[key]); if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error("体验课评分必须为1至5分"); feedback[key] = value; });
    if (input.recommendedClassId) await getDoc("classes", input.recommendedClassId, "推荐班级不存在");
    const nextFollowUpAt = `${addDays(trial.trialDate || todayText(), 1)} 10:00`;
    await db.runTransaction(async (transaction) => {
      await transaction.collection("trialBookings").doc(trial._id).update({ data: { feedback, recommendedClassId: String(input.recommendedClassId || ""), status: "COMPLETED", attendanceStatus: trial.attendanceStatus === "unmarked" ? "present" : trial.attendanceStatus, feedbackCoachId: user._id, feedbackAt: nowText(), updatedAt: nowText() } });
      await transaction.collection("leads").doc(lead._id).update({ data: { status: lead.status === "WON" ? "WON" : "TRIAL_COMPLETED", trialStatus: "COMPLETED", nextFollowUpAt, updatedAt: nowText() } });
      const existing = await transaction.collection("leadFollowUps").where({ leadId: lead._id, content: "体验课后回访", nextFollowUpAt }).count();
      if (!existing.total) await transaction.collection("leadFollowUps").add({ data: { leadId: lead._id, method: "其他", result: "等待回复", content: "体验课后回访", nextFollowUpAt, operatorId: user._id, operatorName: user.name, createdAt: nowText() } });
    });
    await audit(user, "SAVE_TRIAL_FEEDBACK", "trial", trial._id, { leadId: lead._id, recommendedClassId: input.recommendedClassId || "" });
    return { ok: true, nextFollowUpAt };
  }

  async function convertLead(user, input) {
    requireRole(user, ["admin"]);
    if (!input.avatarUrl) throw new Error("请上传孩子本人照片");
    if ((input.classIds || []).length) throw new Error("转正式学员后请通过班级管理单独编班");
    const lead = await getDoc("leads", input.id, "线索不存在");
    if (lead.convertedStudentId) throw new Error("该线索已经转换");
    const duplicate = (await fetchAll("students")).find((item) => item.status === "active" && (item.crmLeadId === lead._id || item.name === lead.childName && item.birthDate === lead.birthday));
    if (duplicate) return { duplicate: { id: duplicate._id, name: duplicate.name, guardianName: duplicate.guardianName }, requiresManualReview: true };
    const registrationDate = input.registrationDate || todayText();
    const created = await saveStudent(user, { name: lead.childName, avatarUrl: input.avatarUrl, gender: lead.gender, birthDate: lead.birthday, guardianName: lead.parentName, guardianPhone: lead.mobile, emergencyContact: `${lead.parentName} ${lead.mobile}`, healthNotes: lead.remark || "无", remainingLessons: 0, classIds: [], school: lead.school, grade: lead.grade, crmLeadId: lead._id, source: lead.source, registrationDate, recruitmentOwnerId: input.ownerCoachId || lead.ownerCoachId, recruitmentOwnerName: input.ownerCoachName || lead.ownerCoachName, ownerParentUserId: "" });
    await db.collection("leads").doc(lead._id).update({ data: { status: "WON", convertedStudentId: created.id, convertedAt: nowText(), registrationDate, dealAmount: 0, updatedAt: nowText() } });
    await audit(user, "CONVERT_CRM_LEAD_TO_STUDENT", "lead", lead._id, { studentId: created.id, classMemberCreated: false, lessonGranted: 0 });
    return { id: created.id, requiresParentBinding: true, requiresClassAssignment: true };
  }

  async function stats(user, input) {
    requireRole(user, ["admin"]);
    const start = input.start || `${todayText().slice(0, 7)}-01`;
    const end = input.end || todayText();
    const within = (value) => dateOnly(value) >= start && dateOnly(value) <= end;
    const allLeads = await fetchAll("leads");
    const leads = allLeads.filter((item) => within(item.createdAt));
    const trials = (await fetchAll("trialBookings")).filter((item) => item.status === "COMPLETED" && within(item.trialDate));
    const won = allLeads.filter((item) => item.status === "WON" && within(item.convertedAt));
    const channels = SOURCES.map((source) => { const rows = leads.filter((item) => item.source === source); const ids = new Set(rows.map((item) => item._id)); const wins = won.filter((item) => item.source === source); return { source, leads: rows.length, trials: trials.filter((item) => ids.has(item.leadId)).length, won: wins.length, rate: rows.length ? Math.round(wins.length / rows.length * 100) : 0 }; }).filter((item) => item.leads);
    const coaches = (await coachList()).map((coach) => { const rows = leads.filter((item) => item.ownerCoachId === coach.id); const ids = new Set(rows.map((item) => item._id)); const wins = won.filter((item) => item.ownerCoachId === coach.id).length; return { ...coach, leads: rows.length, contacted: rows.filter((item) => item.status !== "NEW").length, trials: trials.filter((item) => ids.has(item.leadId)).length, won: wins, rate: rows.length ? Math.round(wins / rows.length * 100) : 0 }; });
    return { summary: { leads: leads.length, trials: trials.length, won: won.length, rate: trials.length ? Math.round(won.length / trials.length * 100) : 0, amount: won.reduce((sum, item) => sum + Number(item.dealAmount || 0), 0) }, channels, coaches, start, end };
  }

  async function trialCount(sessionId) {
    if (!sessionId) return 0;
    return (await db.collection("trialBookings").where({ sessionId, status: command.in(ACTIVE_TRIAL_STATUSES) }).count()).total;
  }

  async function trialStudents(sessionId) {
    if (!sessionId) return [];
    const rows = (await db.collection("trialBookings").where({ sessionId, status: command.in(ACTIVE_TRIAL_STATUSES) }).limit(100).get()).data;
    return rows.map((item) => ({ id: item._id, trialId: item._id, name: item.childName || item.studentName, initial: (item.childName || item.studentName || "体")[0], attendanceStatus: item.attendanceStatus || "unmarked", isTrial: true, status: item.status }));
  }

  async function applyTrialAttendance(user, sessionId, records) {
    for (const record of records || []) {
      if (!TRIAL_ATTENDANCE_STATUSES.has(record.status)) throw new Error("体验课点名状态无效");
      const trial = await getDoc("trialBookings", record.trialId, "体验课点名记录无效");
      if (trial.sessionId !== sessionId || !ACTIVE_TRIAL_STATUSES.includes(trial.status)) throw new Error("体验课点名记录无效");
      const status = record.status === "absent" ? "NO_SHOW" : trial.status === "NO_SHOW" ? "SCHEDULED" : trial.status;
      await db.collection("trialBookings").doc(trial._id).update({ data: { attendanceStatus: record.status, status, attendanceOperatorId: user._id, attendanceAt: nowText(), updatedAt: nowText() } });
    }
  }

  async function call(action, input, user) {
    requireRole(user, ["admin", "coach"]);
    if (action === "getCrmMeta") return getMeta();
    if (action === "getCrmDashboard") return dashboard(user);
    if (action === "listLeads") return listLeads(user, input);
    if (action === "checkLeadDuplicates") return duplicateRecords(input);
    if (action === "getLead") return getLead(user, input.id);
    if (action === "saveLead") return saveLead(user, input.lead || {});
    if (action === "addLeadFollowUp") return addFollowUp(user, input);
    if (action === "assignLead") return assignLead(user, input);
    if (action === "moveLeadToPublic") return moveToPublic(user, input.id);
    if (action === "claimPublicLead") return claimPublic(user, input.id);
    if (action === "archiveLead") { requireRole(user, ["admin"]); await getDoc("leads", input.id, "线索不存在"); await db.collection("leads").doc(input.id).update({ data: { archived: true, updatedAt: nowText() } }); await audit(user, "ARCHIVE_CRM_LEAD", "lead", input.id, {}); return { ok: true }; }
    if (action === "listTrials") return listTrials(user);
    if (action === "getTrial") return getTrial(user, input.id);
    if (action === "createTrial") return createTrial(user, input);
    if (action === "cancelTrial") return cancelTrial(user, input);
    if (action === "saveTrialFeedback") return saveTrialFeedback(user, input);
    if (action === "convertLead") return convertLead(user, input);
    if (action === "getCrmStats") return stats(user, input);
    throw new Error("未知CRM操作");
  }

  return { handles: (action) => actions.has(action), call, trialCount, trialStudents, applyTrialAttendance };
}

module.exports = { createCrmService, STATUS_LABELS, TRIAL_STATUS_LABELS };
