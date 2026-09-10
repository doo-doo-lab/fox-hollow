"""Real Chromium regression tests. Only the test runner needs Playwright."""
import functools
import http.server
import os
from pathlib import Path
import re
import shutil
import threading
import unittest
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(
            ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.playwright = sync_playwright().start()
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
        cls.browser = cls.playwright.chromium.launch(headless=True, executable_path=executable)
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/'

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.errors = []
        self.context = None
        self.open_game()

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [], 'Browser JavaScript/HTTP errors')

    def open_game(self, width=1440, height=900, touch=False):
        if self.context:
            self.context.close()
        self.context = self.browser.new_context(viewport={'width': width, 'height': height}, has_touch=touch)
        self.page = self.context.new_page()
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('response', lambda response: self.errors.append(f'HTTP {response.status}: {response.url}') if response.status >= 400 else None)
        # Install before navigation, so every game interval is controlled.
        instant = datetime(2026, 9, 10, tzinfo=timezone.utc)
        self.page.clock.install(time=instant)
        self.page.clock.pause_at(instant + timedelta(seconds=1))
        self.page.goto(self.url)

    def prepare_game(self):
        self.page.evaluate("""() => {
          Math.random = () => 0.99;
          resetG(); initState();
          for (const s of Object.values(G.bld)) { s.c = 3; s.on = true; }
          G.bld.berryPatch.c = 50;
          for (const s of Object.values(G.upg)) { s.done = 1; s.on = 1; }
          for (const s of Object.values(G.job)) s.on = true;
          calcMx();
          for (const s of Object.values(G.res)) { s.on = true; s.v = s.mx > 0 ? s.mx : 0; }
          G.foxes = 12; G.freeFox = 10; G.job.scout.c = 2;
          fold.res = false; fold.log = false; fold.tab = {};
          curTab = 'w'; resetClock(); applyFold(); rAll();
        }""")

    def tab(self, name):
        return self.page.locator('#tabs .tab').filter(has_text=re.compile('^' + name))

    def test_new_game_and_destination_tips(self):
        self.assertEqual(self.page.title(), '小狐大世界')
        self.assertEqual(self.page.locator('#tabs .tab').count(), 4)
        self.assertTrue(self.page.locator('#expeditions-panel').is_hidden())
        self.prepare_game()
        self.assertEqual(self.page.locator('#tabs .tab').count(), 5)
        tips = self.page.locator('#tc .hp-tip').all_text_contents()
        self.assertIn('有的门还开着，像在等谁回来吃饭。', tips)
        self.assertIn('从那上面看，村子小得像一个念头。', tips)
        self.assertEqual(self.page.evaluate('EXD.oldRuin.tip.length + EXD.cloudRidge.tip.length'), 2)

    def test_progress_continues_on_every_tab_without_rebuilding_bar(self):
        self.prepare_game()
        self.page.evaluate("sendExpedition('oldRuin', 1)")
        self.page.evaluate("window.testBar = document.querySelector('.exp-bar-fill')")
        previous = self.page.evaluate('G.expeditions[0].ticksLeft')
        for name in ['营火', '村落', '工坊', '研究', '山外']:
            self.tab(name).click()
            self.page.clock.run_for(1200)
            # CSS transitions use compositor time, not the virtual JS clock;
            # the progress container and its state are the stable assertions.
            self.assertEqual(self.page.locator('[role=progressbar]:visible').count(), 1, name)
            remaining = self.page.evaluate('G.expeditions[0].ticksLeft')
            self.assertLess(remaining, previous, name)
            previous = remaining
            self.assertTrue(self.page.evaluate("testBar === document.querySelector('.exp-bar-fill')"))
            self.assertGreater(float(self.page.locator('[role=progressbar]').get_attribute('aria-valuenow')), 0)

    def test_return_on_another_tab_is_settled_once(self):
        self.prepare_game()
        self.page.evaluate("sendExpedition('oldRuin', 1); G.expeditions[0].ticksLeft = 5")
        self.tab('村落').click()
        self.page.clock.run_for(1200)
        self.assertEqual(self.page.evaluate('G.expDone.oldRuin'), 1)
        self.assertEqual(self.page.evaluate('G.foxAway'), 0)
        self.assertEqual(self.page.locator('.exp-bar-fill').count(), 0)
        self.assertTrue(self.page.locator('#expeditions-panel').is_hidden())
        self.tab('山外').click()
        self.page.clock.run_for(1200)
        self.assertEqual(self.page.evaluate('G.expDone.oldRuin'), 1)

    def test_folded_center_does_not_pause_the_expedition(self):
        self.prepare_game()
        self.page.evaluate("sendExpedition('oldRuin', 1)")
        before = self.page.evaluate('G.expeditions[0].ticksLeft')
        self.tab('山外').click()
        self.assertTrue(self.page.locator('#center-body').is_hidden())
        self.page.clock.run_for(2000)
        self.assertLess(self.page.evaluate('G.expeditions[0].ticksLeft'), before)
        self.tab('山外').click()
        self.assertTrue(self.page.locator('[role=progressbar]').is_visible())

    def test_throttled_browser_timer_and_visibility_restore(self):
        self.prepare_game()
        self.page.evaluate("sendExpedition('oldRuin', 1)")
        self.page.evaluate("Object.defineProperty(document, 'hidden', {configurable:true, value:true})")
        before = self.page.evaluate('G.tick')
        self.page.clock.fast_forward(6000)
        self.assertEqual(self.page.evaluate('G.tick') - before, 30)
        self.page.evaluate("""() => {
          Object.defineProperty(document, 'hidden', {configurable:true, value:false});
          document.dispatchEvent(new Event('visibilitychange'));
        }""")
        self.assertEqual(self.page.evaluate('G.tick') - before, 30)
        self.assertGreater(float(self.page.locator('[role=progressbar]').get_attribute('aria-valuenow')), 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
