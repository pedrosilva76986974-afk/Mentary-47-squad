import { spawnSync } from "node:child_process";
const kind=process.argv[2];
const files={postgres:"test/postgres.integration.test.ts",ocr:"test/ocr-corpus.integration.test.ts"};
if(!Object.hasOwn(files,kind??"")){console.error("Use postgres ou ocr.");process.exitCode=1;}
else {
 if(kind==="postgres"){
   if(!process.env.DATABASE_URL){try{process.loadEnvFile("../../.env");}catch{console.error("Configure DATABASE_URL ou o arquivo .env antes do teste PostgreSQL.");process.exit(1);}}
   process.env.MENTARY_POSTGRES_TEST="1";
 }else{delete process.env.DATABASE_URL;process.env.MENTARY_OCR_TEST="1";}
 const result=spawnSync(process.execPath,["--import","tsx","--test",files[kind]],{stdio:"inherit",env:process.env});
 if(result.error)console.error(result.error.message);
 process.exitCode=result.status??1;
}
