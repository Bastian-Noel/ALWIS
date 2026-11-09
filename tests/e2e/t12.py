exec(open('/tmp/lib.py').read())
def go(pg, view, table=None, dmode=None):
    pg.evaluate("async()=>{const {A,S,ctx}=await "+ST+"; await A.nav('"+view+"'); "+(f"await A.selectTable('{table}');" if table else "")+(f"S.dmode='{dmode}'; ctx.draw();" if dmode else "")+"}")
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1280,'height':720})
    h, g = both(ctx); g.wait_for_timeout(800)
    go(h,'data','users'); go(g,'data','users'); h.wait_for_timeout(1200)
    print('grid rows host', h.evaluate("document.querySelectorAll('td[data-r]').length"), 'guest', g.evaluate("document.querySelectorAll('td[data-r]').length"))
    # guest selects/edits a cell
    g.click('td[data-r="1"][data-c="1"]'); g.wait_for_timeout(500)
    print('host sees focus mark:', h.evaluate("[...document.querySelectorAll('td[data-cb-focus]')].map(e=>e.dataset.cbName+'@'+e.dataset.r+','+e.dataset.c)"))
    g.dblclick('td[data-r="1"][data-c="1"]'); g.wait_for_timeout(300)
    g.keyboard.press('Control+A'); g.keyboard.type('Grace H.', delay=50); g.wait_for_timeout(500)
    print('host live value:', h.evaluate("[...document.querySelectorAll('.cb-live-value')].map(e=>e.dataset.who+':'+e.textContent)"), '| guest input.ce:', g.evaluate("!!document.querySelector('input.ce')"))
    h.screenshot(path='/tmp/e_host_cell.png')
    g.keyboard.press('Escape'); g.wait_for_timeout(300)
    # ghost row
    gi = g.query_selector('tr.ghost input[data-g="name"]')
    print('ghost input present on guest:', bool(gi))
    if gi:
        gi.click(); g.keyboard.type('Margaret', delay=40); g.wait_for_timeout(500)
        print('host ghost line:', h.evaluate("[...document.querySelectorAll('tr.cb-ghostline')].map(e=>e.innerText.replace(/\\s+/g,' '))"))
        h.screenshot(path='/tmp/e_host_ghost.png')
    # structure: new column
    go(h,'data','users','struct'); go(g,'data','users','struct'); g.wait_for_timeout(800)
    btn = g.query_selector('[data-act="colAddForm"], button:has-text("Ajouter une colonne"), button:has-text("Nouvelle colonne")')
    print('add-column button:', bool(btn))
    if btn:
        btn.click(); g.wait_for_timeout(400)
        if g.query_selector('#ncName'):
            g.fill('#ncName', 'bio'); g.wait_for_timeout(500)
            print('host new-column line:', h.evaluate("[...document.querySelectorAll('tr.cb-ncol')].map(e=>e.innerText)"))
            h.screenshot(path='/tmp/e_host_struct.png')
    # schema viewport
    go(h,'schema'); go(g,'schema'); h.wait_for_timeout(1200)
    vp = lambda pg: pg.evaluate("async()=>{const {S}=await "+ST+"; return [Math.round(S.zoom*100)/100, S.pan.map(Math.round)]}")
    print('schema before: host', vp(h), 'guest', vp(g))
    box = h.evaluate("(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
    h.mouse.move(box[0], box[1]); h.mouse.wheel(0, -400); h.wait_for_timeout(900)
    print('after host wheel-zoom: host', vp(h), 'guest', vp(g))
    h.mouse.down(); h.mouse.move(box[0]+140, box[1]+60, steps=8); h.mouse.up(); h.wait_for_timeout(900)
    print('after host pan: host', vp(h), 'guest', vp(g))
    g.screenshot(path='/tmp/e_guest_schema.png')
    print('errors', h.errors[:3], g.errors[:3])
    b.close()
