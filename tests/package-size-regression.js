const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const miniRoot = path.join(root, "miniprogram");
const config = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const rules = (config.packOptions || {}).ignore || [];

function normalized(file) { return path.relative(miniRoot, file).split(path.sep).join("/"); }
function ignored(relative) {
  return rules.some((rule) => {
    if (rule.type === "file") return relative === rule.value;
    if (rule.type === "folder") return relative === rule.value || relative.startsWith(`${rule.value}/`);
    if (rule.type === "suffix") return relative.endsWith(rule.value);
    if (rule.type === "prefix") return path.basename(relative).startsWith(rule.value) || relative.startsWith(rule.value);
    return false;
  });
}
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const value = path.join(directory, entry.name);
    return entry.isDirectory() ? files(value) : [value];
  });
}

const sourceFiles = files(miniRoot);
const packedFiles = sourceFiles.filter((file) => !ignored(normalized(file)));
const packedBytes = packedFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const limit = 2 * 1024 * 1024;
const localOnly = ["local-service", "local-domain", "class-domain", "crm-domain", "growth-domain", "league-domain", "family-domain", "coach-profile-domain", "coach-work-domain", "timetable-domain", "training-domain"];

assert(packedBytes < limit, `预计上传包 ${(packedBytes / 1024).toFixed(1)}KB 超过 2MB`);
localOnly.forEach((name) => assert(ignored(`utils/${name}.js`), `${name}.js 应排除出正式上传包`));
const runtimeSources = packedFiles.filter((file) => file.endsWith(".js")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
localOnly.forEach((name) => assert(!runtimeSources.includes(`require(\"./${name}\")`) && !runtimeSources.includes(`require('./${name}')`), `正式运行代码仍引用 ${name}`));

console.log(`Package size regression passed: ${(packedBytes / 1024).toFixed(1)}KB / 2048KB`);
