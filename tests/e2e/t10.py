exec(open('/tmp/lib.py').read())
FR = "document.querySelector('#pvFrames iframe')"
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1280,'height':720})
    h, g = both(ctx); g.wait_for_timeout(800)
    for pg in (h, g):
        pg.click('button:has-text("Aperçu")'); pg.wait_for_timeout(1500)
    print('pv open: host', h.evaluate("!!"+FR), 'guest', g.evaluate("!!"+FR))
    h.wait_for_timeout(2500)
    print('guest mirror srcdoc has title:', g.evaluate("(()=>{const f="+FR+"; return !!f && (f.srcdoc||'').includes('Bonjour ALWIS')})()"), '| sandbox:', g.evaluate("("+FR+").getAttribute('sandbox')"))
    h.screenshot(path='/tmp/d_host_pv.png'); g.screenshot(path='/tmp/d_guest_pv.png')
    # mouse: host moves over preview, guest should see pointer and it must keep following
    box = h.evaluate("(()=>{const r=document.querySelector('#pvFrames').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()")
    xs=[]
    for i in range(8):
        h.mouse.move(box[0]+60+i*40, box[1]+80+i*10); h.wait_for_timeout(130)
        xs.append(g.evaluate("(()=>{const m=document.querySelector('.cb-mouse');return m? m.style.left : null})()"))
    print('host pointer seen on guest (should change):', xs)
    # guest pointer over the sandboxed mirror (inside iframe), host must see it move
    gb = g.evaluate("(()=>{const r=document.querySelector('#pvFrames').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()")
    ys=[]
    for i in range(8):
        g.mouse.move(gb[0]+100+i*30, gb[1]+120+i*8); g.wait_for_timeout(130)
        ys.append(h.evaluate("(()=>{const m=document.querySelector('.cb-mouse');return m? m.style.left : null})()"))
    print('guest pointer over mirror seen on host:', ys)
    # click replication: guest clicks +1 inside mirror
    for _ in range(2):
        pos = g.evaluate("(()=>{const f=document.querySelector('#pvFrames iframe'); const b=f.contentDocument.querySelector('#inc').getBoundingClientRect(); const r=f.getBoundingClientRect(); return [r.left+b.left+b.width/2, r.top+b.top+b.height/2]})()")
        g.mouse.click(pos[0], pos[1]); g.wait_for_timeout(300)
    h.wait_for_timeout(1800); g.wait_for_timeout(500)
    cnt = lambda pg: pg.evaluate("document.querySelector('#pvFrames iframe').contentDocument.querySelector('#n').textContent")
    print('counter host:', cnt(h), 'guest mirror:', cnt(g))
    # typing in guest mirror input
    pos = g.evaluate("(()=>{const f=document.querySelector('#pvFrames iframe'); const b=f.contentDocument.querySelector('#nm').getBoundingClientRect(); const r=f.getBoundingClientRect(); return [r.left+b.left+20, r.top+b.top+8]})()")
    g.mouse.click(pos[0], pos[1]); g.keyboard.type('Camille', delay=40); g.wait_for_timeout(1800)
    val = lambda pg: pg.evaluate("document.querySelector('#pvFrames iframe').contentDocument.querySelector('#nm').value")
    print('input host:', repr(val(h)), 'guest:', repr(val(g)))
    print('errors', h.errors[:3], g.errors[:3])
    b.close()
