import json, sys, time
from playwright.sync_api import sync_playwright
FAKE = open('/tmp/fake-services.mjs').read()
BASE = 'http://127.0.0.1:8101'

def new_page(ctx, name=None):
    pg = ctx.new_page()
    pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)[:300]))
    pg.on('console', lambda m: pg.errors.append('console.error: ' + m.text[:200]) if m.type == 'error' and 'favicon' not in m.text else None)
    pg.route('**/apps/studio/workbench/services.mjs', lambda r: r.fulfill(body=FAKE, content_type='text/javascript'))
    return pg

OPEN_PROJECT = """async () => {
  const st = await import('/apps/studio/workbench/state.mjs');
  const ex = await import('/apps/studio/workbench/views/explorer.mjs');
  Object.assign(st.S, { project: 'demo', mode: 'work', view: 'code', db: 'test', pvSessions: ['s1'] });
  await ex.refreshFiles();
  st.ctx.draw();
  await st.A.openFile('/index.php');
  return st.S.files.map(f => f.path);
}"""
