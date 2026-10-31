#!/usr/bin/env python3
import json, pathlib, platform, shutil, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
commands=['node','npm','python3','git','curl','make','cmake','ninja','cc','clang','emcc','emcmake','php','bison','re2c','autoconf','pkg-config']
report={'platform':platform.platform(),'tools':{c:shutil.which(c) for c in commands},
        'status':'PREPARATION_ONLY_NO_WASM_BUILD',
        'required_emscripten':'6.0.6 per bridge native/upstream-versions.json',
        'note':'Node tests need no npm install; native build still needs compiler, SDK and dependencies.'}
(root/'provenance/environment.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
