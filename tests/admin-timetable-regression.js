const s=require("./unified-timetable-suite");s.adminTimetable().then(n=>console.log(`Admin timetable regression: ${n} checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
