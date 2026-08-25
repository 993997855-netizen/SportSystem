const s=require("./unified-timetable-suite");s.unified().then(n=>console.log(`Unified timetable regression: ${n} checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
