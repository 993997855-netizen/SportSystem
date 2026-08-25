const suite=require("./coach-work-suite"); suite.permissions().then((n)=>console.log(`Schedule conflict regression: ${n} checks passed`)).catch((e)=>{console.error(e);process.exitCode=1;});
