const suite=require("./coach-work-suite"); suite.workload().then((n)=>console.log(`coach workload regression: ${n} checks passed`)).catch((e)=>{console.error(e);process.exitCode=1;});
