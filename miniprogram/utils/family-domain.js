const ACTIONS = new Set([
  "getFamilyContext",
  "submitChildProfile",
  "listChildProfileRequests",
  "reviewChildProfileRequest",
  "getStudentPrivateProfile",
  "recordIdCardCopy",
  "saveParentStudentLink",
  "updateStudentAvatar",
  "getStudentOwnership",
  "transferStudentParent",
  "checkParentOwnershipConsistency",
]);

const RELATIONSHIPS = ["FATHER", "MOTHER", "GRANDFATHER", "GRANDMOTHER", "GUARDIAN", "OTHER"];
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECKS = "10X98765432";

function normalizeIdCard(value) {
  return String(value || "").trim().toUpperCase();
}

function validateIdCard(value) {
  const id = normalizeIdCard(value);
  if (!/^\d{17}[\dX]$/.test(id)) return false;
  const date = `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  const index = WEIGHTS.reduce((sum, weight, position) => sum + Number(id[position]) * weight, 0) % 11;
  return CHECKS[index] === id[17];
}

function maskIdCard(value) {
  const id = normalizeIdCard(value);
  return id ? `${id.slice(0, 4)}**********${id.slice(-4)}` : "";
}

function ensureUsers(data) {
  if (data.users) return false;
  data.users = [
    { id: "admin", role: "admin", name: "南联管理员", studentIds: [], classIds: [] },
    { id: "parent1", role: "parent", name: "陈女士", studentIds: ["s1"], classIds: [] },
    { id: "parent2", role: "parent", name: "李女士", studentIds: [], classIds: [] },
    { id: "coach1", role: "coach", name: "游导", studentIds: [], classIds: ["c1718", "c1516"] },
  ];
  return true;
}

function activeLinkOwners(data, studentId) {
  return [...new Set((data.parentStudentLinks || [])
    .filter((item) => item.studentId === studentId && item.status === "ACTIVE")
    .map((item) => item.parentUserId)
    .filter(Boolean))];
}

function legacyClaimOwners(data, studentId) {
  const fromUsers = (data.users || [])
    .filter((user) => user.role === "parent" && (user.studentIds || []).includes(studentId))
    .map((user) => user.id);
  return [...new Set([...fromUsers, ...activeLinkOwners(data, studentId)])];
}

function syncUserStudentIds(data, parentUserIds) {
  const targets = parentUserIds ? new Set(parentUserIds.filter(Boolean)) : null;
  (data.users || []).filter((user) => user.role === "parent" && (!targets || targets.has(user.id))).forEach((user) => {
    user.studentIds = data.students.filter((student) => student.ownerParentUserId === user.id).map((student) => student.id);
    user.updatedAt = user.updatedAt || "";
  });
}

function ensure(data, ctx = {}) {
  data.parentStudentLinks = data.parentStudentLinks || [];
  data.studentPrivateProfiles = data.studentPrivateProfiles || [];
  data.childProfileRequests = data.childProfileRequests || [];
  const usersInitialized = ensureUsers(data);
  const now = ctx.stamp ? ctx.stamp() : "2026-08-21 10:00";

  data.students.forEach((student) => {
    const legacy = student.idCardNumber || student.idCard;
    if (legacy && !data.studentPrivateProfiles.some((item) => item.studentId === student.id)) {
      data.studentPrivateProfiles.push({ id: `spp-legacy-${student.id}`, studentId: student.id, idCardNumber: normalizeIdCard(legacy), createdAt: now, updatedAt: now });
    }
    delete student.idCardNumber;
    delete student.idCard;
  });

  if (!data.students.some((item) => item.id === "s-family2")) {
    data.students.push({ id: "s-family2", name: "王小雨", avatarUrl: "/images/nanlian-logo.png", gender: "女", birthDate: "2019-05-12", school: "瓯北中心小学", grade: "一年级", guardianName: "陈女士", guardianPhone: "13800001203", emergencyContact: "陈女士 13800001203", healthNotes: "无", remainingLessons: 25, totalLessons: 28, classIds: ["cinterest"], ownerParentUserId: "parent1", profileStatus: "ACTIVE", status: "active", registrationDate: "2026-03-01" });
  }
  if (!data.students.some((item) => item.id === "s-family3")) {
    data.students.push({ id: "s-family3", name: "王小天", avatarUrl: "", gender: "男", birthDate: "2019-08-18", school: "永嘉三幼", grade: "大班", guardianName: "陈女士", guardianPhone: "13800001203", emergencyContact: "陈女士 13800001203", healthNotes: "无", remainingLessons: 9, totalLessons: 14, classIds: [], ownerParentUserId: "parent1", profileStatus: "ACTIVE", status: "active", registrationDate: "2026-07-01" });
  }

  const demoOwners = { s1: "parent1", "s-family2": "parent1", "s-family3": "parent1" };
  Object.entries(demoOwners).forEach(([studentId, ownerParentUserId]) => {
    const student = data.students.find((item) => item.id === studentId);
    if (student && !student.ownerParentUserId && legacyClaimOwners(data, studentId).length <= 1) student.ownerParentUserId = ownerParentUserId;
  });

  // 旧数据仅在“恰好一个家长声明归属”时迁移；发现多个声明时不自动选边。
  data.students.forEach((student) => {
    if (student.ownerParentUserId) return;
    const claims = legacyClaimOwners(data, student.id);
    if (claims.length === 1) student.ownerParentUserId = claims[0];
  });

  [
    { id: "psl-demo-1", parentUserId: "parent1", studentId: "s1", relationship: "GUARDIAN" },
    { id: "psl-demo-2", parentUserId: "parent1", studentId: "s-family2", relationship: "GUARDIAN" },
    { id: "psl-demo-3", parentUserId: "parent1", studentId: "s-family3", relationship: "GUARDIAN" },
  ].forEach((item) => {
    if (!data.parentStudentLinks.some((row) => row.parentUserId === item.parentUserId && row.studentId === item.studentId && row.status === "ACTIVE")) {
      data.parentStudentLinks.push({ ...item, isPrimaryGuardian: true, status: "ACTIVE", createdAt: now, updatedAt: now });
    }
  });

  if (!data.studentPrivateProfiles.some((item) => item.studentId === "s1")) data.studentPrivateProfiles.push({ id: "spp1", studentId: "s1", idCardNumber: "330327201703180030", createdAt: now, updatedAt: now });
  if (!data.studentPrivateProfiles.some((item) => item.studentId === "s-family2")) data.studentPrivateProfiles.push({ id: "spp2", studentId: "s-family2", idCardNumber: "33032720190512001X", createdAt: now, updatedAt: now });
  const clubClass = data.classes.find((item) => item.id === "cinterest");
  if (clubClass && !clubClass.studentIds.includes("s-family2")) clubClass.studentIds.push("s-family2");
  if (data.classMembers && !data.classMembers.some((item) => item.classId === "cinterest" && item.studentId === "s-family2" && item.status === "ACTIVE")) {
    data.classMembers.push({ id: "cm-family2", classId: "cinterest", studentId: "s-family2", memberType: "REGULAR", status: "ACTIVE", source: "ADMIN_ADD", joinedAt: now, createdAt: now, updatedAt: now });
  }
  if (usersInitialized) syncUserStudentIds(data);
}

function linkedIds(data, parentUserId) {
  return data.students.filter((student) => student.ownerParentUserId === parentUserId && student.status === "active").map((student) => student.id);
}

function safeStudent(data, student) {
  const classIds = (data.classMembers || []).filter((item) => item.studentId === student.id && item.status === "ACTIVE").map((item) => item.classId);
  const classes = data.classes.filter((item) => classIds.includes(item.id));
  const value = { ...student };
  delete value.ownerParentUserId;
  return { ...value, idCardMasked: data.studentPrivateProfiles.some((item) => item.studentId === student.id) ? "身份证：已填写" : "", classIds, classNames: classes.map((item) => item.name).join("、"), primaryClassName: (classes[0] || {}).name || "未分班", initial: (student.name || "学")[0] };
}

function ownershipReport(data) {
  ensureUsers(data);
  const parentUsers = data.users.filter((user) => user.role === "parent");
  const conflicts = [];
  data.students.forEach((student) => {
    const bindings = [];
    parentUsers.forEach((user) => {
      if ((user.studentIds || []).includes(student.id)) bindings.push({ parentUserId: user.id, parentName: user.name, source: "users.studentIds", boundAt: user.updatedAt || user.createdAt || "未知" });
    });
    (data.parentStudentLinks || []).filter((item) => item.studentId === student.id && item.status === "ACTIVE").forEach((item) => {
      const parent = parentUsers.find((user) => user.id === item.parentUserId);
      bindings.push({ parentUserId: item.parentUserId, parentName: (parent || {}).name || "未知家长", source: "parentStudentLinks", boundAt: item.createdAt || "未知" });
    });
    if (student.ownerParentUserId) {
      const parent = parentUsers.find((user) => user.id === student.ownerParentUserId);
      bindings.push({ parentUserId: student.ownerParentUserId, parentName: (parent || {}).name || "未知家长", source: "students.ownerParentUserId", boundAt: student.updatedAt || student.createdAt || "未知" });
    }
    const ownerIds = [...new Set(bindings.map((item) => item.parentUserId).filter(Boolean))];
    if (ownerIds.length > 1) conflicts.push({ code: "DUPLICATE_PARENT_BINDING", studentId: student.id, studentName: student.name, parentUserIds: ownerIds, bindings, resolution: "需要管理员人工确认" });
  });
  return { parentCount: parentUsers.length, studentCount: data.students.length, conflictCount: conflicts.length, hasConflicts: conflicts.length > 0, conflicts, autoFixed: false };
}

function upsertCompatibilityLink(data, parentUserId, studentId, relationship, ctx) {
  const other = (data.parentStudentLinks || []).find((item) => item.studentId === studentId && item.parentUserId !== parentUserId && item.status === "ACTIVE");
  if (other) throw new Error("该学员存在历史家长归属冲突，需要管理员人工确认");
  let link = data.parentStudentLinks.find((item) => item.studentId === studentId && item.parentUserId === parentUserId);
  if (link) Object.assign(link, { relationship: relationship || link.relationship || "GUARDIAN", isPrimaryGuardian: true, status: "ACTIVE", updatedAt: ctx.stamp() });
  else {
    link = { id: ctx.uid("psl"), parentUserId, studentId, relationship: relationship || "GUARDIAN", isPrimaryGuardian: true, status: "ACTIVE", createdAt: ctx.stamp(), updatedAt: ctx.stamp() };
    data.parentStudentLinks.push(link);
  }
  return link;
}

async function call(action, input, ctx) {
  const { data, role, userId } = ctx;
  ensure(data, ctx);
  const admin = () => { if (role !== "admin") throw new Error("仅管理员可执行该操作"); };

  if (action === "getFamilyContext") {
    if (role !== "parent") return { students: [], activeStudentId: "" };
    const students = linkedIds(data, userId).map((id) => data.students.find((item) => item.id === id)).filter(Boolean).map((item) => safeStudent(data, item));
    const requested = input.activeStudentId || "";
    return { students, activeStudentId: students.some((item) => item.id === requested) ? requested : (students[0] || {}).id || "" };
  }

  if (action === "submitChildProfile") {
    if (role !== "parent") throw new Error("仅家长可提交孩子资料");
    const profile = input.profile || {};
    const idCardNumber = normalizeIdCard(profile.idCardNumber);
    const idBirthDate = `${idCardNumber.slice(6, 10)}-${idCardNumber.slice(10, 12)}-${idCardNumber.slice(12, 14)}`;
    if (!profile.avatarUrl || !profile.name || !profile.gender || !profile.birthDate || !profile.school || !profile.grade || !validateIdCard(idCardNumber) || profile.birthDate !== idBirthDate) throw new Error("请完整填写孩子照片和有效身份资料");
    const privateProfile = data.studentPrivateProfiles.find((item) => item.idCardNumber === idCardNumber);
    const duplicateStudent = privateProfile ? data.students.find((item) => item.id === privateProfile.studentId) : data.students.find((item) => item.name === String(profile.name).trim() && item.birthDate === profile.birthDate);
    if (duplicateStudent && duplicateStudent.ownerParentUserId && duplicateStudent.ownerParentUserId !== userId) throw new Error("该学员已经绑定家长账号，请联系俱乐部管理员处理。");
    if (duplicateStudent && duplicateStudent.ownerParentUserId === userId) throw new Error("该学员已经在您的账号中，无需重复添加。");
    if (data.childProfileRequests.some((item) => item.idCardNumber === idCardNumber && item.status === "PENDING_REVIEW")) throw new Error("该资料已提交，请等待管理员审核");
    const item = { id: ctx.uid("cpr"), parentUserId: userId, parentName: ctx.userName, parentMobile: profile.parentMobile || "", name: String(profile.name).trim(), avatarUrl: profile.avatarUrl || "", gender: profile.gender, birthDate: profile.birthDate, idCardNumber, idCardMasked: maskIdCard(idCardNumber), school: profile.school || "", grade: profile.grade || "", remark: profile.remark || "", relationship: profile.relationship || "GUARDIAN", profileStatus: "PENDING_REVIEW", status: "PENDING_REVIEW", duplicateStudentId: duplicateStudent ? duplicateStudent.id : "", createdAt: ctx.stamp(), updatedAt: ctx.stamp() };
    data.childProfileRequests.push(item);
    ctx.audit("submitChildProfile", "childProfileRequest", item.id, { parentUserId: userId, name: item.name, duplicate: Boolean(item.duplicateStudentId) });
    ctx.save();
    return { id: item.id, status: item.status, duplicateFound: Boolean(item.duplicateStudentId), idCardMasked: item.idCardMasked };
  }

  if (action === "listChildProfileRequests") {
    admin();
    return data.childProfileRequests.filter((item) => !input.status || item.status === input.status).map((item) => ({ ...item })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  if (action === "reviewChildProfileRequest") {
    admin();
    const request = data.childProfileRequests.find((item) => item.id === input.id);
    if (!request || request.status !== "PENDING_REVIEW") throw new Error("申请不存在或已处理");
    if (input.decision === "REJECT") {
      Object.assign(request, { status: "REJECTED", profileStatus: "REJECTED", reviewRemark: input.reviewRemark || "资料需修改", reviewedAt: ctx.stamp(), reviewedBy: userId });
      ctx.audit("rejectChildProfile", "childProfileRequest", request.id, { name: request.name });
      ctx.save();
      return { status: request.status };
    }
    let studentId = input.existingStudentId || request.duplicateStudentId;
    let student = studentId ? data.students.find((item) => item.id === studentId) : null;
    if (student && student.ownerParentUserId && student.ownerParentUserId !== request.parentUserId) throw new Error("该学员已经绑定家长账号，请联系俱乐部管理员处理。");
    if (!student) {
      const duplicatePrivate = data.studentPrivateProfiles.find((item) => item.idCardNumber === request.idCardNumber);
      if (duplicatePrivate) throw new Error("身份证对应的学员已存在，禁止重复创建");
      studentId = ctx.uid("s");
      student = { id: studentId, name: request.name, avatarUrl: request.avatarUrl, gender: request.gender, birthDate: request.birthDate, school: request.school, grade: request.grade, guardianName: request.parentName, guardianPhone: request.parentMobile, emergencyContact: `${request.parentName} ${request.parentMobile}`.trim(), healthNotes: request.remark || "无", remainingLessons: 0, totalLessons: 0, classIds: [], ownerParentUserId: request.parentUserId, profileStatus: "ACTIVE", status: "active", registrationDate: ctx.stamp().slice(0, 10), createdAt: ctx.stamp(), updatedAt: ctx.stamp() };
      data.students.push(student);
      data.studentPrivateProfiles.push({ id: ctx.uid("spp"), studentId, idCardNumber: request.idCardNumber, createdAt: ctx.stamp(), updatedAt: ctx.stamp() });
    } else {
      student.ownerParentUserId = request.parentUserId;
      student.updatedAt = ctx.stamp();
    }
    upsertCompatibilityLink(data, request.parentUserId, studentId, request.relationship, ctx);
    syncUserStudentIds(data, [request.parentUserId]);
    Object.assign(request, { status: "ACTIVE", profileStatus: "ACTIVE", studentId, reviewedAt: ctx.stamp(), reviewedBy: userId });
    ctx.audit(request.duplicateStudentId ? "bindExistingStudent" : "approveChildProfile", "childProfileRequest", request.id, { parentUserId: request.parentUserId, studentId });
    ctx.save();
    return { status: request.status, studentId };
  }

  if (action === "getStudentPrivateProfile") {
    admin();
    const profile = data.studentPrivateProfiles.find((item) => item.studentId === input.studentId);
    if (!profile) return { studentId: input.studentId, idCardNumber: "", idCardMasked: "未填写" };
    ctx.audit("VIEW_ID_CARD", "studentPrivateProfile", profile.id, { operatorId: userId, studentId: input.studentId });
    ctx.save();
    return { studentId: input.studentId, idCardNumber: profile.idCardNumber, idCardMasked: maskIdCard(profile.idCardNumber) };
  }

  if (action === "recordIdCardCopy") {
    admin();
    ctx.audit("COPY_ID_CARD", "studentPrivateProfile", input.studentId, { operatorId: userId, studentId: input.studentId });
    ctx.save();
    return { ok: true };
  }

  if (action === "saveParentStudentLink") {
    admin();
    const student = data.students.find((item) => item.id === input.studentId);
    const parent = (data.users || []).find((item) => item.id === input.parentUserId && item.role === "parent");
    if (!student || !parent || !RELATIONSHIPS.includes(input.relationship || "GUARDIAN")) throw new Error("家长归属信息无效");
    if (student.ownerParentUserId && student.ownerParentUserId !== input.parentUserId) throw new Error("该学员已有家长归属，请使用“转移家长归属”操作。");
    student.ownerParentUserId = input.parentUserId;
    student.updatedAt = ctx.stamp();
    const link = upsertCompatibilityLink(data, input.parentUserId, input.studentId, input.relationship, ctx);
    syncUserStudentIds(data, [input.parentUserId]);
    ctx.audit("ASSIGN_STUDENT_PARENT", "student", student.id, { parentUserId: input.parentUserId, operatorId: userId });
    ctx.save();
    return { id: link.id, ownerParentUserId: input.parentUserId };
  }

  if (action === "getStudentOwnership") {
    admin();
    const student = data.students.find((item) => item.id === input.studentId);
    if (!student) throw new Error("学员不存在");
    const parents = (data.users || []).filter((item) => item.role === "parent").map((item) => ({ id: item.id, name: item.name, mobile: item.mobile || "" }));
    return { student: { id: student.id, name: student.name }, ownerParentUserId: student.ownerParentUserId || "", ownerParent: parents.find((item) => item.id === student.ownerParentUserId) || null, parents };
  }

  if (action === "transferStudentParent") {
    admin();
    const student = data.students.find((item) => item.id === input.studentId);
    const nextParent = (data.users || []).find((item) => item.id === input.newParentUserId && item.role === "parent");
    if (!student || !nextParent) throw new Error("学员或目标家长不存在");
    const oldParentUserId = student.ownerParentUserId || "";
    const oldParent = (data.users || []).find((item) => item.id === oldParentUserId);
    if (oldParentUserId === nextParent.id) return { unchanged: true, ownerParentUserId: nextParent.id };
    if (!input.confirmTransfer) return { confirmationRequired: true, message: `该学员当前归属家长：${(oldParent || {}).name || "未绑定"}\n确定要将学员转移至：${nextParent.name}？\n转移以后原家长将无法继续查看该学员资料。`, oldParentUserId, oldParentName: (oldParent || {}).name || "未绑定", newParentUserId: nextParent.id, newParentName: nextParent.name };
    if (!String(input.reason || "").trim()) throw new Error("请填写转移原因");
    (data.parentStudentLinks || []).filter((item) => item.studentId === student.id && item.status === "ACTIVE").forEach((item) => { item.status = "TRANSFERRED"; item.updatedAt = ctx.stamp(); item.transferredBy = userId; });
    student.ownerParentUserId = nextParent.id;
    student.updatedAt = ctx.stamp();
    upsertCompatibilityLink(data, nextParent.id, student.id, input.relationship || "GUARDIAN", ctx);
    syncUserStudentIds(data, [oldParentUserId, nextParent.id]);
    ctx.audit("TRANSFER_STUDENT_PARENT", "student", student.id, { studentId: student.id, oldParentUserId, newParentUserId: nextParent.id, operatorId: userId, reason: String(input.reason).trim() });
    ctx.save();
    return { ok: true, studentId: student.id, oldParentUserId, newParentUserId: nextParent.id };
  }

  if (action === "checkParentOwnershipConsistency") {
    admin();
    return ownershipReport(data);
  }

  if (action === "updateStudentAvatar") {
    if (!["admin", "parent"].includes(role) || role === "parent" && !linkedIds(data, userId).includes(input.studentId)) throw new Error("无权修改头像");
    const student = data.students.find((item) => item.id === input.studentId);
    if (!input.avatarUrl) throw new Error("请上传孩子本人照片");
    student.avatarUrl = input.avatarUrl;
    student.updatedAt = ctx.stamp();
    ctx.audit("UPDATE_STUDENT_AVATAR", "student", student.id, { operatorId: userId });
    ctx.save();
    return { ok: true };
  }

  throw new Error("未知家庭档案操作");
}

module.exports = { handles: (action) => ACTIONS.has(action), ensure, call, linkedIds, ownershipReport, validateIdCard, maskIdCard, normalizeIdCard };
