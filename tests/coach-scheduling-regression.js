const suite=require("./coach-work-suite"); suite.scheduling().then((n)=>console.log(`coach scheduling regression: ${n} checks passed`)).catch((e)=>{console.error(e);process.exitCode=1;});
