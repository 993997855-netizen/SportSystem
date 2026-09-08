const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let calls = 0;

global.getCurrentPages = () => [];
global.wx = {
  cloud: {
    callFunction: async ({ data }) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { result: { success: true, data: { action: data.action, sequence: calls } } };
    },
  },
  showToast() {},
  reLaunch() {},
};

const api = require("../miniprogram/utils/api");

(async () => {
  const [first, second] = await Promise.all([
    api.call("getContext", { b: 2, a: 1 }),
    api.call("getContext", { a: 1, b: 2 }),
  ]);
  assert.strictEqual(calls, 1, "相同并发读取必须合并为一次云函数请求");
  assert.deepStrictEqual(first, second, "合并请求必须返回同一份结果");

  await api.call("getContext", { a: 1, b: 2 });
  assert.strictEqual(calls, 1, "短时间重复读取必须命中内存缓存");

  await api.call("getContext", { a: 1, b: 2 }, { force: true });
  assert.strictEqual(calls, 2, "主动刷新必须绕过短时缓存");

  await api.call("saveStudent", { id: "s1" });
  await api.call("getContext", { a: 1, b: 2 });
  assert.strictEqual(calls, 4, "写操作成功后必须使读取缓存失效");

  api.clearCache("getContext");
  await api.call("getContext", { a: 1, b: 2 });
  assert.strictEqual(calls, 5, "指定接口缓存必须可以手动清理");

  const home = read("miniprogram/pages/index/index.js");
  assert(home.includes("Promise.all([") && home.includes('api.call("getDashboard"') && home.includes('api.call("getUnifiedTimetable"'), "首页核心数据必须并行加载");
  assert(home.includes("hasLoaded") && read("miniprogram/pages/sessions/index.js").includes("hasLoaded"), "Tab返回时必须保留已有内容而非反复白屏");
  assert(read("miniprogram/pages/students/index.wxml").includes("lazy-load=\"{{true}}\""), "长列表头像必须延迟加载");
  assert(read("cloudfunctions/clubApi/v2.js").includes("mapLimit(sorted, 6"), "课程列表云端装饰必须限制并发执行");
  assert(read("cloudfunctions/clubApi/timetable-service.js").includes("trainingJobs") && read("cloudfunctions/clubApi/timetable-service.js").includes("referenceCache"), "统一课表必须并行生成并复用教练引用");

  console.log("Performance regression: 12 checks passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
