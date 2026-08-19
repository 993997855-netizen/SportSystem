const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const command = db.command;

const COLLECTIONS = ["users", "students", "classes", "attendance", "renewals", "invites"];
const DEDUCTION = { present: 1, leave: 0, sick: 0, absent: 1 };
const PACKAGES = {
  p10: { lessons: 10, amount: 1500 },
  p20: { lessons: 20, amount: 2800 },
  p40: { lessons: 40, amount: 5200 }
};
let collectionsReady;

function nowText() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function publicDoc(doc) {
  if (!doc) return doc;
  const result = { ...doc, id: doc._id };
  delete result._id;
  delete result.openid;
  return result;
}

async function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(COLLECTIONS.map(async (name) => {
      try { await db.createCollection(name); } catch (error) { /* 已存在 */ }
    }));
  }
  await collectionsReady;
}

async function ensureUser(openid) {
  const found = await db.collection("users").where({ openid }).limit(1).get();
  if (found.data.length) return found.data[0];
  const count = await db.collection("users").count();
  const role = count.total === 0 ? "admin" : "parent";
  const user = { openid, role, name: role === "admin" ? "俱乐部管理员" : "待绑定家长", studentIds: [], classIds: [], createdAt: nowText() };
  const added = await db.collection("users").add({ data: user });
  return { ...user, _id: added._id };
}

function requireRole(user, roles) {
  if (!roles.includes(user.role)) throw new Error("没有执行该操作的权限");
}

async function allowedStudentIds(user) {
  if (user.role === "admin") return null;
  if (user.role === "parent") return user.studentIds || [];
  const classIds = user.classIds || [];
  if (!classIds.length) return [];
  const result = await db.collection("classes").where({ _id: command.in(classIds) }).get();
  return [...new Set(result.data.flatMap((item) => item.studentIds || []))];
}

async function listStudents(user) {
  const ids = await allowedStudentIds(user);
  if (ids && !ids.length) return [];
  const result = ids === null
    ? await db.collection("students").where({ status: "active" }).limit(100).get()
    : await db.collection("students").where({ _id: command.in(ids), status: "active" }).limit(100).get();
  const classes = await db.collection("classes").limit(100).get();
  return result.data.map((student) => ({
    ...publicDoc(student),
    initial: student.name ? student.name[0] : "学",
    classNames: classes.data.filter((item) => (student.classIds || []).includes(item._id)).map((item) => item.name).join("、")
  }));
}

async function listClasses(user) {
  let result;
  if (user.role === "admin") result = await db.collection("classes").where({ active: true }).limit(100).get();
  else if (user.role === "coach") {
    const ids = user.classIds || [];
    if (!ids.length) return [];
    result = await db.collection("classes").where({ _id: command.in(ids), active: true }).limit(100).get();
  } else {
    const students = await listStudents(user);
    const ids = [...new Set(students.flatMap((item) => item.classIds || []))];
    if (!ids.length) return [];
    result = await db.collection("classes").where({ _id: command.in(ids), active: true }).limit(100).get();
  }
  return result.data.map((item) => ({ ...publicDoc(item), studentCount: (item.studentIds || []).length }));
}

async function getClass(user, id) {
  requireRole(user, ["admin"]);
  return publicDoc((await db.collection("classes").doc(id).get()).data);
}

async function saveClass(user, payload) {
  requireRole(user, ["admin"]);
  const studentIds = payload.studentIds || [];
  const data = {
    name: String(payload.name || "").trim(), coachName: String(payload.coachName || "").trim(),
    schedule: String(payload.schedule || ""), venue: String(payload.venue || ""),
    studentIds, active: true, updatedAt: nowText()
  };
  if (!data.name || !data.coachName || !data.schedule || !data.venue) throw new Error("班级、教练、时间和场地不能为空");
  let classId = payload.id;
  if (classId) await db.collection("classes").doc(classId).update({ data });
  else {
    const added = await db.collection("classes").add({ data: { ...data, createdAt: nowText() } });
    classId = added._id;
  }
  const students = await db.collection("students").limit(100).get();
  await Promise.all(students.data.map((student) => {
    const current = student.classIds || [];
    const selected = studentIds.includes(student._id);
    const next = selected ? [...new Set([...current, classId])] : current.filter((id) => id !== classId);
    if (next.length === current.length && next.every((id, index) => id === current[index])) return Promise.resolve();
    return db.collection("students").doc(student._id).update({ data: { classIds: next, updatedAt: nowText() } });
  }));
  return { id: classId };
}

async function getStudent(user, id) {
  const allowed = await allowedStudentIds(user);
  if (allowed && !allowed.includes(id)) throw new Error("无权查看该学员");
  const student = (await db.collection("students").doc(id).get()).data;
  const classIds = student.classIds || [];
  const classes = classIds.length ? (await db.collection("classes").where({ _id: command.in(classIds) }).get()).data.map(publicDoc) : [];
  const attendance = (await db.collection("attendance").where({ studentId: id }).orderBy("date", "desc").limit(30).get()).data.map(publicDoc);
  const renewals = user.role === "coach" ? [] : (await db.collection("renewals").where({ studentId: id }).orderBy("createdAt", "desc").limit(30).get()).data.map(publicDoc);
  return { ...publicDoc(student), initial: student.name ? student.name[0] : "学", classes, attendance, renewals };
}

async function saveStudent(user, payload) {
  requireRole(user, ["admin"]);
  const classIds = payload.classIds || [];
  const data = {
    name: String(payload.name || "").trim(), gender: payload.gender || "男", birthDate: payload.birthDate || "",
    guardianName: String(payload.guardianName || "").trim(), guardianPhone: String(payload.guardianPhone || ""),
    healthNotes: String(payload.healthNotes || ""), classIds, status: "active", updatedAt: nowText()
  };
  if (!data.name || !data.guardianName || !data.guardianPhone) throw new Error("学员、家长和联系电话不能为空");
  if (!/^1\d{10}$/.test(data.guardianPhone)) throw new Error("联系电话格式不正确");
  let studentId = payload.id;
  if (studentId) await db.collection("students").doc(studentId).update({ data });
  else {
    const initialLessons = Math.max(0, Number(payload.remainingLessons || 0));
    const added = await db.collection("students").add({ data: { ...data, remainingLessons: initialLessons, totalLessons: initialLessons, createdAt: nowText() } });
    studentId = added._id;
  }
  const classes = await db.collection("classes").limit(100).get();
  await Promise.all(classes.data.map((item) => {
    const current = item.studentIds || [];
    const shouldContain = classIds.includes(item._id);
    const next = shouldContain ? [...new Set([...current, studentId])] : current.filter((id) => id !== studentId);
    if (next.length === current.length && next.every((id, index) => id === current[index])) return Promise.resolve();
    return db.collection("classes").doc(item._id).update({ data: { studentIds: next, updatedAt: nowText() } });
  }));
  return { id: studentId };
}

async function getAttendanceSheet(user, classId, date) {
  requireRole(user, ["admin", "coach"]);
  if (user.role === "coach" && !(user.classIds || []).includes(classId)) throw new Error("无权点名该班级");
  const clubClass = (await db.collection("classes").doc(classId).get()).data;
  const studentIds = clubClass.studentIds || [];
  const students = studentIds.length ? (await db.collection("students").where({ _id: command.in(studentIds) }).get()).data : [];
  const records = (await db.collection("attendance").where({ classId, date }).get()).data;
  return {
    clubClass: publicDoc(clubClass), date,
    students: students.map((student) => {
      const record = records.find((item) => item.studentId === student._id);
      return { ...publicDoc(student), initial: student.name ? student.name[0] : "学", attendanceStatus: record ? record.status : "unmarked" };
    })
  };
}

async function submitAttendance(user, input) {
  requireRole(user, ["admin", "coach"]);
  if (user.role === "coach" && !(user.classIds || []).includes(input.classId)) throw new Error("无权点名该班级");
  for (const record of input.records || []) {
    if (!(record.status in DEDUCTION)) throw new Error("无效的出勤状态");
    const existingResult = await db.collection("attendance").where({ classId: input.classId, studentId: record.studentId, date: input.date }).limit(1).get();
    const existing = existingResult.data[0];
    const nextDeduction = DEDUCTION[record.status];
    const previousDeduction = existing ? Number(existing.deductedLessons || 0) : 0;
    const delta = previousDeduction - nextDeduction;
    if (existing) await db.collection("attendance").doc(existing._id).update({ data: { status: record.status, deductedLessons: nextDeduction, updatedAt: nowText(), operatorId: user._id } });
    else await db.collection("attendance").add({ data: { classId: input.classId, studentId: record.studentId, date: input.date, status: record.status, deductedLessons: nextDeduction, createdAt: nowText(), operatorId: user._id } });
    if (delta) {
      const student = (await db.collection("students").doc(record.studentId).get()).data;
      await db.collection("students").doc(record.studentId).update({ data: { remainingLessons: Math.max(0, Number(student.remainingLessons || 0) + delta), updatedAt: nowText() } });
    }
  }
  return { ok: true };
}

async function listRenewals(user) {
  if (user.role === "coach") return [];
  let query = db.collection("renewals");
  if (user.role !== "admin") {
    const ids = await allowedStudentIds(user);
    if (!ids.length) return [];
    query = query.where({ studentId: command.in(ids) });
  }
  const result = await query.orderBy("createdAt", "desc").limit(100).get();
  const studentIds = [...new Set(result.data.map((item) => item.studentId))];
  const students = studentIds.length ? (await db.collection("students").where({ _id: command.in(studentIds) }).get()).data : [];
  return result.data.map((item) => ({ ...publicDoc(item), studentName: (students.find((student) => student._id === item.studentId) || {}).name || "" }));
}

async function createRenewal(user, input) {
  requireRole(user, ["admin", "parent"]);
  const allowed = await allowedStudentIds(user);
  if (allowed && !allowed.includes(input.studentId)) throw new Error("无权为该学员续费");
  const pack = PACKAGES[input.packageId];
  if (!pack) throw new Error("续费套餐无效");
  await db.collection("renewals").add({ data: { studentId: input.studentId, packageId: input.packageId, lessons: pack.lessons, amount: pack.amount, status: "pending", createdAt: nowText(), creatorId: user._id } });
  return { ok: true };
}

async function confirmRenewal(user, id) {
  requireRole(user, ["admin"]);
  const renewal = (await db.collection("renewals").doc(id).get()).data;
  if (renewal.status !== "pending") throw new Error("订单已经处理");
  const updated = await db.collection("renewals").where({ _id: id, status: "pending" }).update({ data: { status: "paid", paidAt: nowText(), operatorId: user._id } });
  if (!updated.stats || updated.stats.updated !== 1) throw new Error("订单已经被其他人处理");
  await db.collection("students").doc(renewal.studentId).update({ data: { remainingLessons: command.inc(Number(renewal.lessons)), totalLessons: command.inc(Number(renewal.lessons)), updatedAt: nowText() } });
  return { ok: true };
}

async function createInvite(user, input) {
  requireRole(user, ["admin"]);
  if (!["parent", "coach"].includes(input.role)) throw new Error("无效的邀请角色");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const invite = { code, role: input.role, studentId: input.studentId || "", classId: input.classId || "", displayName: String(input.displayName || ""), status: "active", createdAt: nowText(), creatorId: user._id };
  await db.collection("invites").add({ data: invite });
  return { code };
}

async function claimInvite(user, code) {
  const result = await db.collection("invites").where({ code: String(code || "").trim(), status: "active" }).limit(1).get();
  const invite = result.data[0];
  if (!invite) throw new Error("邀请码无效或已经使用");
  const update = { role: invite.role, name: invite.displayName || user.name, updatedAt: nowText() };
  if (invite.role === "parent") update.studentIds = [...new Set([...(user.studentIds || []), invite.studentId].filter(Boolean))];
  if (invite.role === "coach") update.classIds = [...new Set([...(user.classIds || []), invite.classId].filter(Boolean))];
  await db.collection("users").doc(user._id).update({ data: update });
  await db.collection("invites").doc(invite._id).update({ data: { status: "used", usedBy: user._id, usedAt: nowText() } });
  return { ok: true, role: invite.role };
}

async function getDashboard(user) {
  const students = await listStudents(user);
  const classes = await listClasses(user);
  const renewals = await listRenewals(user);
  const today = nowText().slice(0, 10);
  const ids = students.map((item) => item.id);
  let todayAttendance = 0;
  if (ids.length) todayAttendance = (await db.collection("attendance").where({ date: today, studentId: command.in(ids) }).count()).total;
  const attention = [...students].sort((a, b) => Number(a.remainingLessons) - Number(b.remainingLessons)).slice(0, 3);
  return { role: user.role, studentCount: students.length, classCount: classes.length, lowBalance: students.filter((item) => Number(item.remainingLessons) <= 5).length, pendingRenewals: renewals.filter((item) => item.status === "pending").length, todayAttendance, recentStudents: attention, classes };
}

exports.main = async (event) => {
  try {
    await ensureCollections();
    const openid = cloud.getWXContext().OPENID;
    const user = await ensureUser(openid);
    const input = event.data || {};
    let data;
    switch (event.action) {
      case "getContext": data = { mode: "cloud", user: { id: user._id, role: user.role, name: user.name }, needsBinding: user.role !== "admin" && !(user.studentIds || []).length && !(user.classIds || []).length }; break;
      case "getDashboard": data = await getDashboard(user); break;
      case "listStudents": data = await listStudents(user); break;
      case "getStudent": data = await getStudent(user, input.id); break;
      case "saveStudent": data = await saveStudent(user, input.student); break;
      case "listClasses": data = await listClasses(user); break;
      case "getClass": data = await getClass(user, input.id); break;
      case "saveClass": data = await saveClass(user, input.clubClass); break;
      case "getAttendanceSheet": data = await getAttendanceSheet(user, input.classId, input.date); break;
      case "submitAttendance": data = await submitAttendance(user, input); break;
      case "listRenewals": data = await listRenewals(user); break;
      case "createRenewal": data = await createRenewal(user, input); break;
      case "confirmRenewal": data = await confirmRenewal(user, input.id); break;
      case "createInvite": data = await createInvite(user, input); break;
      case "claimInvite": data = await claimInvite(user, input.code); break;
      default: throw new Error("未知操作");
    }
    return { success: true, data };
  } catch (error) {
    console.error(error);
    return { success: false, message: error.message || "服务异常" };
  }
};
