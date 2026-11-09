exec(open('/tmp/t3.py').read().split("if __name__")[0])
ST = "import('/apps/studio/workbench/state.mjs')"
def S(pg, expr):  # evaluate expression with S, A, ctx available
    return pg.evaluate("async()=>{const {S,A,ctx}=await "+ST+"; return ("+expr+")}")
def both(ctx, name_h='Noël', name_g='Léa'):
    h, room = host_start(ctx, name_h)
    g = guest_join(ctx, room, name_g)
    g.wait_for_function("document.querySelectorAll('#tree [data-path]').length>0", timeout=15000)
    return h, g
def badges(pg):
    return pg.evaluate("[...document.querySelectorAll('#tree .cb-badges')].map(e=>e.closest('[data-path]').dataset.path+':'+e.textContent)")
