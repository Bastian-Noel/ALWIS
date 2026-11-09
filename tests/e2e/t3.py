exec(open('/tmp/harness.py').read())
def host_start(ctx, name='Noël'):
    h = new_page(ctx); h.goto(BASE + '/'); h.wait_for_timeout(1500)
    h.evaluate(OPEN_PROJECT); h.wait_for_timeout(500)
    h.click('.cb-trigger'); h.fill('#cbName', name); h.click('.cb-pop .btn.pri'); h.wait_for_timeout(1500)
    h.click('.cb-trigger'); h.wait_for_timeout(300)
    room = h.evaluate("document.querySelector('.cb-url')?.value.split('collab=')[1]")
    h.keyboard.press('Escape')
    return h, room
def guest_join(ctx, room, name='Léa'):
    g = new_page(ctx); g.goto(BASE + '/?collab=' + room); g.wait_for_timeout(1200)
    g.fill('#cbJoinName', name); g.click('.cb-modal .btn.pri'); g.wait_for_timeout(2500)
    return g
if __name__ == '__main__' or True:
  with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1280,'height':720})
    h, room = host_start(ctx); print('room', room)
    h.screenshot(path='/tmp/b_host_live.png')
    g = guest_join(ctx, room)
    print('guest files', g.evaluate("[...document.querySelectorAll('#tree [data-path]')].map(e=>e.dataset.path)"))
    print('guest badges', g.evaluate("[...document.querySelectorAll('#tree .cb-badges')].map(e=>e.closest('[data-path]').dataset.path+':'+e.textContent)"))
    print('host badges', h.evaluate("[...document.querySelectorAll('#tree .cb-badges')].map(e=>e.closest('[data-path]').dataset.path+':'+e.textContent)"))
    g.screenshot(path='/tmp/b_guest.png'); h.screenshot(path='/tmp/b_host.png')
    print('errors host', h.errors[:4], 'guest', g.errors[:4])
    b.close()
