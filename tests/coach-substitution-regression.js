const suite=require("./coach-work-suite"); suite.substitution().then((n)=>console.log(`coach substitution regression: ${n} checks passed`)).catch((e)=>{console.error(e);process.exitCode=1;});
