const s=require("./unified-timetable-suite");s.coachTimetable().then(n=>console.log(`Coach timetable regression: ${n} checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
