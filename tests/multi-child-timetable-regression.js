const s=require("./unified-timetable-suite");s.multiChild().then(n=>console.log(`Multi-child timetable regression: ${n} checks passed`)).catch(e=>{console.error(e);process.exitCode=1;});
