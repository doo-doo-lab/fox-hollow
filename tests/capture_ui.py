"""Capture deterministic review screenshots with a disposable test village."""
import json
from browser_test import BrowserTests, ROOT


def seed_demo(test):
    test.prepare_game()
    test.page.evaluate("""() => {
      logs.length = 0;
      for (const i of [0, 3, 7]) {
        Math.random = () => (i + 0.1) / REMNANT_LOGS.length;
        tryRemnant();
      }
      Math.random = () => 0.99;
      tryWorldEcho();
      G.res.berry.v = 1280; G.res.wood.v = 80; G.res.stone.v = 134;
      sendExpedition('oldRuin', 1);
      sendExpedition('cloudRidge', 2);
    }""")
    test.tab('营火').click()
    test.page.clock.run_for(14000)


def capture():
    target = ROOT / 'test-results'
    target.mkdir(exist_ok=True)
    metrics = {}
    BrowserTests.setUpClass()
    test = BrowserTests()
    test.setUp()
    try:
        seed_demo(test)
        columns = ['#left-panel', '#center-panel', '#log-panel']
        before = [test.doc_box(selector) for selector in columns]
        test.page.screenshot(path=str(target / 'desktop-expanded.png'), full_page=True, animations='disabled')
        test.page.locator('#fold-res').click()
        test.tab('营火').click()
        after = [test.doc_box(selector) for selector in columns]
        test.page.screenshot(path=str(target / 'desktop-collapsed.png'), full_page=True, animations='disabled')
        metrics['desktop_1440'] = {'before': before, 'after': after}

        test.open_game(390, 844, touch=True)
        seed_demo(test)
        before = test.doc_box('#log-panel')['y']
        test.page.screenshot(path=str(target / 'mobile-expanded.png'), animations='disabled')
        test.page.locator('#fold-res').tap()
        middle = test.doc_box('#log-panel')['y']
        test.tab('营火').tap()
        after = test.doc_box('#log-panel')['y']
        test.page.evaluate('scrollTo(0, 0)')
        test.page.screenshot(path=str(target / 'mobile-collapsed.png'), animations='disabled')
        metrics['mobile_390'] = {
            'log_top_expanded': before,
            'log_top_resources_folded': middle,
            'log_top_resources_and_tab_folded': after,
            'collapsed_center_height': test.doc_box('#center-panel')['height'],
            'viewport_width': 390,
            'document_width': test.page.evaluate('document.documentElement.scrollWidth'),
        }
        (target / 'layout-metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(metrics, ensure_ascii=False, indent=2))
    finally:
        test.tearDown()
        BrowserTests.tearDownClass()


if __name__ == '__main__':
    capture()
