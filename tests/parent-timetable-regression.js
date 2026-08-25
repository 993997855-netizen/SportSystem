const s=require("./unified-timetable-suite");s.parentTimetable().then(n=>console.log(`Parent timetable regression: ${n} checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
