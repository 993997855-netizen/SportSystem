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

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECKS = "10X98765432";
const RELATIONSHIPS = ["FATHER", "MOTHER", "GRANDFATHER", "GRANDMOTHER", "GUARDIAN", "OTHER"];

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

function createFamilyService({ db, fetchAll, fetchByIds, publicDoc, nowText, requireRole, audit }) {
  async function ownerStudents(parentUserId) {
    return fetchAll("students", { ownerParentUserId: parentUserId, status: "active" });
  }

  async function linkedIds(user) {
    return (await ownerStudents(user._id)).map((item) => item._id);
  }

  async function legacyClaimOwners(studentId) {
    const [users, links] = await Promise.all([fetchAll("users"), fetchAll("parentStudentLinks", { studentId, status: "ACTIVE" })]);
    return [...new Set([
      ...users.filter((item) => item.role === "parent" && (item.studentIds || []).includes(studentId)).map((item) => item._id),
      ...links.map((item) => item.parentUserId),
    ].filter(Boolean))];
  }

  // 仅迁移无歧义旧数据；多个家长同时声明同一学员时保持原状并交由检查报告处理。
  async function ensureMigration(user) {
    if (!user || user.role !== "parent") return;
    for (const studentId of user.studentIds || []) {
      const student = (await db.collection("students").doc(studentId).get().catch(() => ({ data: null }))).data;
      if (!student || student.ownerParentUserId) continue;
      const claimOwners = await legacyClaimOwners(studentId);
      if (claimOwners.length !== 1 || claimOwners[0] !== user._id) continue;
      await db.collection("students").doc(studentId).update({ data: { ownerParentUserId: user._id, updatedAt: nowText(), ownershipMigrationSource: "users.studentIds" } });
      const link = await db.collection("parentStudentLinks").where({ studentId, parentUserId: user._id, status: "ACTIVE" }).limit(1).get();
      if (!link.data.length) await db.collection("parentStudentLinks").add({ data: { parentUserId: user._id, studentId, relationship: "GUARDIAN", isPrimaryGuardian: true, status: "ACTIVE", createdAt: nowText(), updatedAt: nowText(), migrationSource: "users.studentIds" } });
    }
  }

  async function syncUserStudentIds(parentUserId) {
    if (!parentUserId) return;
    const ids = (await ownerStudents(parentUserId)).map((item) => item._id);
    await db.collection("users").doc(parentUserId).update({ data: { studentIds: ids, updatedAt: nowText() } });
  }

  async function safeStudent(student) {
    const [members, privateFound] = await Promise.all([
      fetchAll("classMembers", { studentId: student._id, status: "ACTIVE" }),
      db.collection("studentPrivateProfiles").where({ studentId: student._id }).limit(1).get(),
    ]);
    const classes = await fetchByIds("classes", members.map((item) => item.classId));
    const value = publicDoc(student);
    delete value.ownerParentUserId;
    return { ...value, classIds: members.map((item) => item.classId), classNames: classes.map((item) => item.name).join("、"), primaryClassName: (classes[0] || {}).name || "未分班", idCardMasked: privateFound.data.length ? "身份证：已填写" : "", initial: (student.name || "学")[0] };
  }

  async function upsertCompatibilityLink(parentUserId, studentId, relationship) {
    const active = await fetchAll("parentStudentLinks", { studentId, status: "ACTIVE" });
    if (active.some((item) => item.parentUserId !== parentUserId)) throw new Error("该学员存在历史家长归属冲突，需要管理员人工确认");
    const own = active.find((item) => item.parentUserId === parentUserId);
    if (own) {
      await db.collection("parentStudentLinks").doc(own._id).update({ data: { relationship: relationship || own.relationship || "GUARDIAN", isPrimaryGuardian: true, updatedAt: nowText() } });
      return own._id;
    }
    const added = await db.collection("parentStudentLinks").add({ data: { parentUserId, studentId, relationship: relationship || "GUARDIAN", isPrimaryGuardian: true, status: "ACTIVE", createdAt: nowText(), updatedAt: nowText() } });
    return added._id;
  }

  async function ownershipReport() {
    const [users, students, links] = await Promise.all([fetchAll("users"), fetchAll("students"), fetchAll("parentStudentLinks", { status: "ACTIVE" })]);
    const parents = users.filter((item) => item.role === "parent");
    const conflicts = [];
    students.forEach((student) => {
      const bindings = [];
      parents.forEach((parent) => {
        if ((parent.studentIds || []).includes(student._id)) bindings.push({ parentUserId: parent._id, parentName: parent.name || "未知家长", source: "users.studentIds", boundAt: parent.updatedAt || parent.createdAt || "未知" });
      });
      links.filter((item) => item.studentId === student._id).forEach((item) => {
        const parent = parents.find((row) => row._id === item.parentUserId);
        bindings.push({ parentUserId: item.parentUserId, parentName: (parent || {}).name || "未知家长", source: "parentStudentLinks", boundAt: item.createdAt || "未知" });
      });
      if (student.ownerParentUserId) {
        const parent = parents.find((row) => row._id === student.ownerParentUserId);
        bindings.push({ parentUserId: student.ownerParentUserId, parentName: (parent || {}).name || "未知家长", source: "students.ownerParentUserId", boundAt: student.updatedAt || student.createdAt || "未知" });
      }
      const parentUserIds = [...new Set(bindings.map((item) => item.parentUserId).filter(Boolean))];
      if (parentUserIds.length > 1) conflicts.push({ code: "DUPLICATE_PARENT_BINDING", studentId: student._id, studentName: student.name, parentUserIds, bindings, resolution: "需要管理员人工确认" });
    });
    return { parentCount: parents.length, studentCount: students.length, conflictCount: conflicts.length, hasConflicts: conflicts.length > 0, conflicts, autoFixed: false };
  }

  async function call(action, input, user) {
    if (action === "getFamilyContext") {
      requireRole(user, ["parent"]);
      const rows = [];
      for (const item of await ownerStudents(user._id)) rows.push(await safeStudent(item));
      const requested = input.activeStudentId || "";
      return { students: rows, activeStudentId: rows.some((item) => item.id === requested) ? requested : (rows[0] || {}).id || "" };
    }

    if (action === "submitChildProfile") {
      requireRole(user, ["parent"]);
      const profile = input.profile || {};
      const idCardNumber = normalizeIdCard(profile.idCardNumber);
      const idBirthDate = `${idCardNumber.slice(6, 10)}-${idCardNumber.slice(10, 12)}-${idCardNumber.slice(12, 14)}`;
      if (!profile.avatarUrl || !profile.name || !profile.gender || !profile.birthDate || !profile.school || !profile.grade || !validateIdCard(idCardNumber) || profile.birthDate !== idBirthDate) throw new Error("请完整填写孩子照片和有效身份资料");
      const privateResult = await db.collection("studentPrivateProfiles").where({ idCardNumber }).limit(1).get();
      let duplicateStudent = null;
      if (privateResult.data[0]) duplicateStudent = (await db.collection("students").doc(privateResult.data[0].studentId).get()).data;
      if (!duplicateStudent) duplicateStudent = (await db.collection("students").where({ name: String(profile.name).trim(), birthDate: profile.birthDate }).limit(1).get()).data[0] || null;
      if (duplicateStudent && duplicateStudent.ownerParentUserId && duplicateStudent.ownerParentUserId !== user._id) throw new Error("该学员已经绑定家长账号，请联系俱乐部管理员处理。");
      if (duplicateStudent && duplicateStudent.ownerParentUserId === user._id) throw new Error("该学员已经在您的账号中，无需重复添加。");
      const pending = await db.collection("childProfileRequests").where({ idCardNumber, status: "PENDING_REVIEW" }).limit(1).get();
      if (pending.data.length) throw new Error("该资料已提交，请等待管理员审核");
      const data = { parentUserId: user._id, parentName: user.name, parentMobile: user.mobile || profile.parentMobile || "", name: String(profile.name).trim(), avatarUrl: profile.avatarUrl || "", gender: profile.gender, birthDate: profile.birthDate, idCardNumber, idCardMasked: maskIdCard(idCardNumber), school: profile.school || "", grade: profile.grade || "", remark: profile.remark || "", relationship: profile.relationship || "GUARDIAN", profileStatus: "PENDING_REVIEW", status: "PENDING_REVIEW", duplicateStudentId: duplicateStudent ? duplicateStudent._id : "", createdAt: nowText(), updatedAt: nowText() };
      const added = await db.collection("childProfileRequests").add({ data });
      await audit(user, "submitChildProfile", "childProfileRequest", added._id, { parentUserId: user._id, name: data.name, duplicate: Boolean(data.duplicateStudentId) });
      return { id: added._id, status: data.status, duplicateFound: Boolean(data.duplicateStudentId), idCardMasked: data.idCardMasked };
    }

    if (action === "listChildProfileRequests") {
      requireRole(user, ["admin"]);
      const rows = input.status ? await fetchAll("childProfileRequests", { status: input.status }) : await fetchAll("childProfileRequests");
      return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((item) => ({ ...publicDoc(item), idCardNumber: item.idCardNumber }));
    }

    if (action === "reviewChildProfileRequest") {
      requireRole(user, ["admin"]);
      const request = (await db.collection("childProfileRequests").doc(input.id).get()).data;
      if (!request || request.status !== "PENDING_REVIEW") throw new Error("申请不存在或已处理");
      if (input.decision === "REJECT") {
        await db.collection("childProfileRequests").doc(request._id).update({ data: { status: "REJECTED", profileStatus: "REJECTED", reviewRemark: input.reviewRemark || "资料需修改", reviewedAt: nowText(), reviewedBy: user._id } });
        await audit(user, "rejectChildProfile", "childProfileRequest", request._id, { name: request.name });
        return { status: "REJECTED" };
      }
      let studentId = input.existingStudentId || request.duplicateStudentId;
      let student = studentId ? (await db.collection("students").doc(studentId).get()).data : null;
      if (student && student.ownerParentUserId && student.ownerParentUserId !== request.parentUserId) throw new Error("该学员已经绑定家长账号，请联系俱乐部管理员处理。");
      if (!student) {
        const duplicate = await db.collection("studentPrivateProfiles").where({ idCardNumber: request.idCardNumber }).limit(1).get();
        if (duplicate.data.length) throw new Error("身份证对应的学员已存在，禁止重复创建");
        const now = nowText();
        const added = await db.collection("students").add({ data: { name: request.name, avatarUrl: request.avatarUrl, gender: request.gender, birthDate: request.birthDate, school: request.school, grade: request.grade, guardianName: request.parentName, guardianPhone: request.parentMobile, emergencyContact: `${request.parentName} ${request.parentMobile}`.trim(), healthNotes: request.remark || "无", remainingLessons: 0, totalLessons: 0, classIds: [], ownerParentUserId: request.parentUserId, profileStatus: "ACTIVE", status: "active", registrationDate: now.slice(0, 10), createdAt: now, updatedAt: now } });
        studentId = added._id;
        await db.collection("studentPrivateProfiles").add({ data: { studentId, idCardNumber: request.idCardNumber, createdAt: now, updatedAt: now } });
      } else {
        await db.collection("students").doc(studentId).update({ data: { ownerParentUserId: request.parentUserId, updatedAt: nowText() } });
      }
      await upsertCompatibilityLink(request.parentUserId, studentId, request.relationship);
      await syncUserStudentIds(request.parentUserId);
      await db.collection("childProfileRequests").doc(request._id).update({ data: { status: "ACTIVE", profileStatus: "ACTIVE", studentId, reviewedAt: nowText(), reviewedBy: user._id } });
      await audit(user, request.duplicateStudentId ? "bindExistingStudent" : "approveChildProfile", "childProfileRequest", request._id, { parentUserId: request.parentUserId, studentId });
      return { status: "ACTIVE", studentId };
    }

    if (action === "getStudentPrivateProfile") {
      requireRole(user, ["admin"]);
      const profile = (await db.collection("studentPrivateProfiles").where({ studentId: input.studentId }).limit(1).get()).data[0];
      if (!profile) return { studentId: input.studentId, idCardNumber: "", idCardMasked: "未填写" };
      await audit(user, "VIEW_ID_CARD", "studentPrivateProfile", profile._id, { operatorId: user._id, studentId: input.studentId });
      return { studentId: input.studentId, idCardNumber: profile.idCardNumber, idCardMasked: maskIdCard(profile.idCardNumber) };
    }

    if (action === "recordIdCardCopy") {
      requireRole(user, ["admin"]);
      await audit(user, "COPY_ID_CARD", "studentPrivateProfile", input.studentId, { operatorId: user._id, studentId: input.studentId });
      return { ok: true };
    }

    if (action === "saveParentStudentLink") {
      requireRole(user, ["admin"]);
      if (!RELATIONSHIPS.includes(input.relationship || "GUARDIAN")) throw new Error("家长归属信息无效");
      const [studentResult, parentResult] = await Promise.all([db.collection("students").doc(input.studentId).get(), db.collection("users").doc(input.parentUserId).get()]);
      const student = studentResult.data;
      const parent = parentResult.data;
      if (!student || !parent || parent.role !== "parent") throw new Error("学员或家长不存在");
      if (student.ownerParentUserId && student.ownerParentUserId !== input.parentUserId) throw new Error("该学员已有家长归属，请使用“转移家长归属”操作。");
      await db.collection("students").doc(student._id).update({ data: { ownerParentUserId: input.parentUserId, updatedAt: nowText() } });
      const linkId = await upsertCompatibilityLink(input.parentUserId, student._id, input.relationship);
      await syncUserStudentIds(input.parentUserId);
      await audit(user, "ASSIGN_STUDENT_PARENT", "student", student._id, { parentUserId: input.parentUserId, operatorId: user._id });
      return { id: linkId, ownerParentUserId: input.parentUserId };
    }

    if (action === "getStudentOwnership") {
      requireRole(user, ["admin"]);
      const [studentResult, users] = await Promise.all([db.collection("students").doc(input.studentId).get(), fetchAll("users")]);
      const student = studentResult.data;
      if (!student) throw new Error("学员不存在");
      const parents = users.filter((item) => item.role === "parent").map((item) => ({ id: item._id, name: item.name || "待绑定家长", mobile: item.mobile || "" }));
      return { student: { id: student._id, name: student.name }, ownerParentUserId: student.ownerParentUserId || "", ownerParent: parents.find((item) => item.id === student.ownerParentUserId) || null, parents };
    }

    if (action === "transferStudentParent") {
      requireRole(user, ["admin"]);
      const [studentResult, parentResult] = await Promise.all([db.collection("students").doc(input.studentId).get(), db.collection("users").doc(input.newParentUserId).get()]);
      const student = studentResult.data;
      const nextParent = parentResult.data;
      if (!student || !nextParent || nextParent.role !== "parent") throw new Error("学员或目标家长不存在");
      const oldParentUserId = student.ownerParentUserId || "";
      const oldParent = oldParentUserId ? (await db.collection("users").doc(oldParentUserId).get().catch(() => ({ data: null }))).data : null;
      if (oldParentUserId === nextParent._id) return { unchanged: true, ownerParentUserId: nextParent._id };
      if (!input.confirmTransfer) return { confirmationRequired: true, message: `该学员当前归属家长：${(oldParent || {}).name || "未绑定"}\n确定要将学员转移至：${nextParent.name || "目标家长"}？\n转移以后原家长将无法继续查看该学员资料。`, oldParentUserId, oldParentName: (oldParent || {}).name || "未绑定", newParentUserId: nextParent._id, newParentName: nextParent.name || "目标家长" };
      const reason = String(input.reason || "").trim();
      if (!reason) throw new Error("请填写转移原因");
      const activeLinks = await fetchAll("parentStudentLinks", { studentId: student._id, status: "ACTIVE" });
      for (const link of activeLinks) await db.collection("parentStudentLinks").doc(link._id).update({ data: { status: "TRANSFERRED", transferredBy: user._id, updatedAt: nowText() } });
      await db.collection("students").doc(student._id).update({ data: { ownerParentUserId: nextParent._id, updatedAt: nowText() } });
      await upsertCompatibilityLink(nextParent._id, student._id, input.relationship || "GUARDIAN");
      await Promise.all([syncUserStudentIds(oldParentUserId), syncUserStudentIds(nextParent._id)]);
      await audit(user, "TRANSFER_STUDENT_PARENT", "student", student._id, { studentId: student._id, oldParentUserId, newParentUserId: nextParent._id, operatorId: user._id, reason });
      return { ok: true, studentId: student._id, oldParentUserId, newParentUserId: nextParent._id };
    }

    if (action === "checkParentOwnershipConsistency") {
      requireRole(user, ["admin"]);
      return ownershipReport();
    }

    if (action === "updateStudentAvatar") {
      requireRole(user, ["admin", "parent"]);
      if (user.role === "parent") {
        const student = (await db.collection("students").doc(input.studentId).get()).data;
        if (!student || student.ownerParentUserId !== user._id) throw new Error("无权修改头像");
      }
      if (!input.avatarUrl) throw new Error("请上传孩子本人照片");
      await db.collection("students").doc(input.studentId).update({ data: { avatarUrl: input.avatarUrl, updatedAt: nowText() } });
      await audit(user, "UPDATE_STUDENT_AVATAR", "student", input.studentId, { operatorId: user._id });
      return { ok: true };
    }

    throw new Error("未知家庭档案操作");
  }

  return { handles: (action) => ACTIONS.has(action), ensureMigration, linkedIds, call, ownershipReport };
}

module.exports = { createFamilyService, validateIdCard, maskIdCard };
