function coachPrincipalId(user) {
  return String((user || {}).coachId || (user || {})._id || "");
}

const COACH_CAPABILITIES = Object.freeze({
  VIEW_OWN_CLASSES: true,
  MANAGE_CLASSES: false,
  VIEW_OWN_STUDENTS: true,
  MANAGE_CLASS_MEMBERS: false,
  VIEW_OWN_SESSIONS: true,
  CREATE_SESSION: false,
  MANAGE_SESSION_SCHEDULE: false,
  ATTENDANCE: true,
  WEEKLY_PLAN: true,
  GROWTH: true,
  ASSESSMENT: true,
  ELITE_RECOMMEND: true,
  ELITE_APPROVE: false,
  CRM: false,
  OPERATIONS: false,
  ORDERS: false,
  PAYMENT: false,
});

function classCoachIds(clubClass) {
  if (!clubClass) return [];
  return [...new Set([
    clubClass.headCoachUserId || clubClass.coachUserId || "",
    ...(clubClass.assistantCoachIds || []),
  ].filter(Boolean))];
}

function sessionCoachIds(session) {
  if (!session) return [];
  const assignments = (session.actualCoachAssignments || []).length
    ? session.actualCoachAssignments
    : session.plannedCoachAssignments || [];
  return [...new Set([
    ...assignments.map((item) => item && item.coachId),
    session.coachUserId || "",
  ].filter(Boolean))];
}

function scopeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function coachStudentView(student) {
  if (!student) return null;
  return {
    id: student._id || student.id || "",
    name: String(student.name || ""),
    avatarUrl: String(student.avatarUrl || ""),
    gender: String(student.gender || ""),
    birthDate: String(student.birthDate || ""),
    ageGroup: String(student.ageGroup || ""),
    school: String(student.school || ""),
    grade: String(student.grade || ""),
    jerseyNumber: String(student.jerseyNumber || ""),
    status: String(student.status || ""),
    initial: String(student.name || "学").slice(0, 1),
  };
}

function coachClassView(clubClass) {
  if (!clubClass) return null;
  const value = {
    id: clubClass.id || clubClass._id || "",
    name: String(clubClass.name || ""),
    classCode: String(clubClass.classCode || ""),
    classType: String(clubClass.classType || "REGULAR"),
    classTypeLabel: String(clubClass.classTypeLabel || ""),
    ageGroup: String(clubClass.ageGroup || ""),
    schedule: String(clubClass.schedule || ""),
    scheduleSlots: clubClass.scheduleSlots || [],
    venue: String(clubClass.venue || ""),
    status: String(clubClass.status || ""),
    headCoachName: String(clubClass.headCoachName || clubClass.coachName || ""),
    assistantCoachName: String(clubClass.assistantCoachName || ""),
    headCoach: clubClass.headCoach || null,
    assistantCoaches: clubClass.assistantCoaches || [],
    studentCount: Number(clubClass.studentCount || 0),
    standardCapacity: Number(clubClass.standardCapacity || 0),
    remainingCapacity: Number(clubClass.remainingCapacity || 0),
    overCapacity: Number(clubClass.overCapacity || 0),
    isFull: Boolean(clubClass.isFull),
    enrollmentLabel: String(clubClass.enrollmentLabel || ""),
  };
  if (Array.isArray(clubClass.members)) value.members = clubClass.members;
  if (clubClass.pendingSelectionCount !== undefined) value.pendingSelectionCount = Number(clubClass.pendingSelectionCount || 0);
  return value;
}

function createCoachScope({ db, fetchAll, fetchByIds }) {
  async function assignedClasses(user, options = {}) {
    if (!user || user.role !== "coach") return [];
    const coachId = coachPrincipalId(user);
    const rows = await fetchAll("classes");
    return rows.filter((item) => classCoachIds(item).includes(coachId)
      && (options.includeInactive || item.status !== "INACTIVE"));
  }

  async function assignedClassIds(user, options) {
    return (await assignedClasses(user, options)).map((item) => item._id);
  }

  async function assertClassAccess(user, classId) {
    if (user.role === "admin") return (await db.collection("classes").doc(classId).get()).data;
    if (user.role !== "coach") throw scopeError("无权访问该班级", "FORBIDDEN");
    const clubClass = (await db.collection("classes").doc(classId).get().catch(() => ({ data: null }))).data;
    if (!clubClass || !classCoachIds(clubClass).includes(coachPrincipalId(user))) {
      throw scopeError("无权访问该班级", "COACH_CLASS_SCOPE_FORBIDDEN");
    }
    return clubClass;
  }

  async function allowedStudentIds(user) {
    const classIds = await assignedClassIds(user);
    if (!classIds.length) return [];
    const memberships = await fetchAll("classMembers", { status: "ACTIVE" });
    return [...new Set(memberships.filter((item) => classIds.includes(item.classId)).map((item) => item.studentId))];
  }

  async function assertStudentAccess(user, studentId) {
    if (user.role === "admin") return true;
    if (user.role !== "coach") throw scopeError("无权访问该学员", "FORBIDDEN");
    const allowed = await allowedStudentIds(user);
    if (!allowed.includes(studentId)) {
      throw scopeError("该学员不在当前教练负责范围内", "COACH_STUDENT_SCOPE_FORBIDDEN");
    }
    return true;
  }

  async function assertSessionAccess(user, sessionOrId) {
    if (user.role === "admin") return typeof sessionOrId === "string"
      ? (await db.collection("sessions").doc(sessionOrId).get()).data
      : sessionOrId;
    if (user.role !== "coach") throw scopeError("无权访问该课程", "FORBIDDEN");
    const session = typeof sessionOrId === "string"
      ? (await db.collection("sessions").doc(sessionOrId).get().catch(() => ({ data: null }))).data
      : sessionOrId;
    if (!session || !sessionCoachIds(session).includes(coachPrincipalId(user))) {
      throw scopeError("无权管理该课程", "COACH_SESSION_SCOPE_FORBIDDEN");
    }
    return session;
  }

  async function scopedStudentClasses(user, studentId) {
    const allowedClassIds = new Set(await assignedClassIds(user));
    const memberships = (await fetchAll("classMembers", { studentId, status: "ACTIVE" }))
      .filter((item) => allowedClassIds.has(item.classId));
    return { memberships, classes: await fetchByIds("classes", memberships.map((item) => item.classId)) };
  }

  return {
    coachPrincipalId,
    assignedClasses,
    assignedClassIds,
    allowedStudentIds,
    assertClassAccess,
    assertStudentAccess,
    assertSessionAccess,
    scopedStudentClasses,
    coachStudentView,
    coachClassView,
  };
}

module.exports = {
  COACH_CAPABILITIES,
  coachPrincipalId,
  classCoachIds,
  sessionCoachIds,
  coachStudentView,
  coachClassView,
  createCoachScope,
};
