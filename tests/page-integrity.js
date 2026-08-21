const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const miniprogramRoot = path.join(projectRoot, "miniprogram");
const app = JSON.parse(fs.readFileSync(path.join(miniprogramRoot, "app.json"), "utf8"));
const pages = [...(app.pages || [])];

for (const subpackage of app.subpackages || app.subPackages || []) {
  for (const page of subpackage.pages || []) {
    pages.push(path.posix.join(subpackage.root, page));
  }
}

const requiredExtensions = [".js", ".json", ".wxml", ".wxss"];
const missing = [];

for (const page of pages) {
  for (const extension of requiredExtensions) {
    const target = path.join(miniprogramRoot, `${page}${extension}`);
    if (!fs.existsSync(target)) missing.push(path.relative(projectRoot, target));
  }
}

console.log(`Registered pages: ${pages.length}`);
console.log(`Missing page files: ${missing.length}`);

if (missing.length) {
  console.error(missing.join("\n"));
  process.exit(1);
}
