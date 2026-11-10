/** Uncaught PHP errors must not poison the next request or leave SQL open. */
import assert from "node:assert/strict";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {resolve, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createStudioServer} from "../../scripts/serve-studio.mjs";

const root = resolve(fileURLToPath(new URL("../../",import.meta.url)));
const dist = resolve(process.env.ALWIS_PARITY_RUNTIME_DIST ||
    join(root,"build-work/bridge/.native-build/engine/wasm/runtime-dist"));
const pw = await import(pathToFileURL(join(root,"build-work/php/node_modules/playwright/index.mjs")).href);
const source = await readFile(join(root,"fixtures/compatibility/native-error-recovery.php"),"utf8");
const server = createStudioServer({engineDist:dist});
await new Promise(ok => server.listen(0,"127.0.0.1",ok));
const receipt = [];
try {
    const origin = "http://127.0.0.1:" + server.address().port;
    for (const browserName of (process.argv[2] || "chromium,firefox").split(",")) {
        const browser = await pw[browserName].launch({headless:true,
          ...(browserName==="chromium"?{args:["--no-sandbox"]}:{})});
        try {
            const page = await browser.newPage();
            await page.goto(origin+"/");
            const proof = await page.evaluate(async ({source,origin}) => {
                const {NativeRuntime} = await import("/packages/runtime/src/native-runtime.mjs");
                const rt = await NativeRuntime.create({moduleURL:origin+"/engine/pbl-runtime.mjs"});
                const decoder = new TextDecoder();
                const outcomes = [];
                try {
                    await rt.write("/workspace/recovery.php",source);
                    for (const name of ["init","throw","check","check"]) {
                        const response = await rt.request({
                            script:"/workspace/recovery.php",
                            url:origin+"/recovery.php?case="+name,
                            method:name==="check"?"POST":"GET",
                            headers:name==="check"?[["Content-Type","application/x-www-form-urlencoded"]]:[],
                            body:name==="check"?"value=recovered":undefined,
                        });
                        const output = decoder.decode(response.body);
                        const stderr = decoder.decode(response.stderr || new Uint8Array());
                        outcomes.push({name,status:response.status,exitCode:response.exitCode,
                            output:output.slice(0,600),stderr:stderr.slice(0,300)});
                        if (name==="throw") {
                            if (response.exitCode===0 && response.status<500)
                                throw Error("Fatal PHP exception incorrectly accepted");
                            if (!(stderr+output).includes("ALWIS_INDEPENDENT_EXPECTED_THROW"))
                                throw Error("Expected PHP diagnostic disappeared");
                        } else {
                            if (response.exitCode!==0) throw Error(name+": "+stderr);
                            const data=JSON.parse(output);
                            if (name==="init" && data.status!=="initialized") throw Error("Setup failed");
                            if (name==="check" && (data.count!==1 || data.post!=="recovered" ||
                                data.method!=="POST")) throw Error("SQL rollback and POST leaked: "+output);
                        }
                        const state=await rt.state();
                        if (state.sqlConnections!==0 || state.nativeStatements!==0)
                            throw Error("SQL owner leaked after "+name);
                    }
                    return {passed:true,outcomes};
                } finally {rt.close();}
            },{source,origin});
            assert.equal(proof.passed,true);
            receipt.push({browser:browserName,...proof});
            console.log(browserName,"native PHP error, rollback and subsequent POST: PASS");
        } finally {await browser.close();}
    }
} finally {
    server.closeAllConnections();
    await new Promise(ok=>server.close(ok));
}
const output=resolve(root,"build-work/native-recovery");
await mkdir(output,{recursive:true});
await writeFile(join(output,"browser.json"),JSON.stringify(receipt,null,2)+"\n");
