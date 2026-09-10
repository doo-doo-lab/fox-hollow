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

    def doc_box(self, selector):
        return self.page.locator(selector).evaluate("""el => {
          const r = el.getBoundingClientRect();
          return {x:r.x, y:r.y + scrollY, width:r.width, height:r.height};
        }""")

    def assert_no_horizontal_overflow(self):
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))

    def test_keyboard_controls_and_focus_survive_periodic_rendering(self):
        self.prepare_game()
        resource = self.page.locator('#fold-res')
        self.assertEqual(resource.evaluate('e => e.tagName'), 'BUTTON')
        resource.focus()
        resource.press('Space')
        self.assertTrue(self.page.locator('#left-body').is_hidden())
        self.assertEqual(resource.get_attribute('aria-expanded'), 'false')
        self.page.clock.run_for(2200)
        self.assertEqual(self.page.evaluate('document.activeElement.id'), 'fold-res')
        resource.press('Enter')
        self.assertTrue(self.page.locator('#left-body').is_visible())
        self.assertEqual(resource.get_attribute('aria-expanded'), 'true')

        log_button = self.page.locator('#fold-log')
        log_button.focus()
        log_button.press('Enter')
        self.page.evaluate("log('折叠期间仍记录这条见闻。', 'important')")
        self.assertTrue(self.page.locator('#log-list').is_hidden())
        log_button.press('Space')
        self.assertIn('折叠期间仍记录这条见闻。', self.page.locator('#log-list').inner_text())

        for ident, name in [('b', '营火'), ('v', '村落'), ('c', '工坊'), ('r', '研究'), ('w', '山外')]:
            if self.page.evaluate('curTab') != ident:
                self.tab(name).click()
            button = self.tab(name)
            button.focus()
            button.press('Space')
            self.assertTrue(self.page.locator('#center-body').is_hidden(), name)
            self.assertEqual(button.get_attribute('aria-expanded'), 'false')
            self.page.clock.run_for(1200)
            self.assertEqual(self.page.evaluate('document.activeElement.id'), 'tab-' + ident)
            button.press('Enter')
            self.assertTrue(self.page.locator('#center-body').is_visible(), name)
            self.assertEqual(button.get_attribute('aria-expanded'), 'true')

    def test_independent_fold_preferences_reload_and_legacy_import(self):
        self.prepare_game()
        original_save = self.page.evaluate('save(); localStorage.getItem("fhSave")')
        self.page.locator('#fold-res').click()
        self.page.locator('#fold-log').click()
        self.tab('营火').click()
        self.tab('营火').click()
        self.tab('工坊').click()
        self.tab('工坊').click()
        self.tab('山外').click()
        self.tab('山外').click()
        self.tab('村落').click()
        self.tab('营火').click()
        self.assertTrue(self.page.locator('#center-body').is_hidden())
        self.assertEqual(self.page.evaluate('localStorage.getItem("fhSave")'), original_save)
        expected = self.page.evaluate('JSON.stringify(fold)')
        self.page.reload()
        self.assertEqual(self.page.evaluate('JSON.stringify(fold)'), expected)
        for selector in ['#left-body', '#center-body', '#log-list']:
            self.assertTrue(self.page.locator(selector).is_hidden())

        self.tab('山外').click()
        self.assertTrue(self.page.locator('#center-body').is_hidden())
        code = self.page.evaluate("""() => {
          const old = JSON.parse(JSON.stringify(G));
          old.upg.beyondValley.done = 0;
          delete old.expeditions; delete old.foxAway; delete old.pendingNarr;
          delete old.narratives; delete old.choiceBuffs; delete old.choicesDone;
          return btoa(unescape(encodeURIComponent(JSON.stringify(old))));
        }""")
        self.page.evaluate('showCodeImport()')
        self.page.locator('#code-in').fill(code)
        self.page.get_by_text('恢复存档', exact=True).click()
        self.assertEqual(self.page.locator('#import-msg').inner_text(), '恢复成功！')
        self.page.evaluate('closeModal()')
        self.assertEqual(self.page.evaluate('curTab'), 'b')
        self.assertEqual(self.page.evaluate('JSON.stringify(fold)'), expected)
        self.assertEqual(self.page.evaluate('G.expeditions.length'), 0)
        self.assertEqual(self.page.locator('#tabs .tab').count(), 4)

    def test_malformed_preferences_fall_back_without_breaking_game(self):
        cases = [
            '{broken', 'null', '[]', 'true',
            '{"res":"false","log":[],"tab":{"b":"false","v":true,"unknown":true}}',
            '{"res":false,"log":false,"tab":[]}',
        ]
        for value in cases:
            self.page.evaluate('(v) => localStorage.setItem("fhFold", v)', value)
            self.page.reload()
            self.assertTrue(self.page.locator('#left-body').is_visible(), value)
            self.assertTrue(self.page.locator('#center-body').is_visible(), value)
            self.assertTrue(self.page.locator('#log-list').is_visible(), value)
            self.assertTrue(self.page.evaluate('Object.keys(fold.tab).every(k => TABS.some(t => t.id === k))'))
            self.assertEqual(self.page.locator('#tabs .tab').count(), 4)

    def test_blocked_local_storage_keeps_controls_and_simulation_working(self):
        self.context.add_init_script("""Object.defineProperty(window, 'localStorage', {
          get() { throw new Error('test: storage disabled'); }
        });""")
        self.page.reload()
        self.page.evaluate('Math.random = () => 0.99')
        self.page.locator('#fold-res').click()
        self.assertTrue(self.page.locator('#left-body').is_hidden())
        self.tab('营火').click()
        self.assertTrue(self.page.locator('#center-body').is_hidden())
        self.page.clock.run_for(61000)
        self.assertGreaterEqual(self.page.evaluate('G.tick'), 300)
        self.assertEqual(self.page.evaluate("logs.filter(l => l.m.includes('自动存档失败')).length"), 1)
        self.tab('营火').click()
        self.page.get_by_text('采集野莓', exact=True).click()
        self.assertGreater(self.page.evaluate('G.res.berry.v'), 0)

    def test_mobile_natural_flow_touch_targets_and_reflow(self):
        for width in [320, 390, 768, 860]:
            self.open_game(width, 844, touch=True)
            self.prepare_game()
            self.page.evaluate("sendExpedition('oldRuin', 1); tryRemnant()")
            before = self.doc_box('#log-panel')['y']
            self.assert_no_horizontal_overflow()
            self.assertEqual(self.page.locator('#left-panel').evaluate('e => getComputedStyle(e).maxHeight'), 'none')
            self.assertEqual(self.page.locator('#log-panel').evaluate('e => getComputedStyle(e).maxHeight'), 'none')
            for selector in ['#fold-res', '#fold-log', '#tabs .tab']:
                heights = self.page.locator(selector).evaluate_all('els => els.map(e => e.getBoundingClientRect().height)')
                self.assertTrue(all(h >= 44 for h in heights), (width, selector, heights))
            self.page.locator('#fold-res').tap()
            middle = self.doc_box('#log-panel')['y']
            self.assertLess(middle, before - 100)
            self.tab('山外').tap()
            after = self.doc_box('#log-panel')['y']
            self.assertLess(after, middle - 150)
            self.assertLess(after, 350)
            center = self.doc_box('#center-panel')
            self.assertAlmostEqual(after, center['y'] + center['height'], delta=1)
            self.assertLess(center['height'], 110)
            self.assert_no_horizontal_overflow()
            before_ticks = self.page.evaluate('G.expeditions[0].ticksLeft')
            self.page.clock.run_for(1200)
            self.tab('山外').tap()
            self.assertLess(self.page.evaluate('G.expeditions[0].ticksLeft'), before_ticks)
            self.assertTrue(self.page.locator('[role=progressbar]').is_visible())
            for name in ['营火', '村落', '工坊', '研究']:
                self.tab(name).tap()
                self.assert_no_horizontal_overflow()

    def test_desktop_column_positions_and_widths_stay_fixed(self):
        for width in [861, 1280, 1440]:
            self.open_game(width, 900)
            self.prepare_game()
            self.page.evaluate("sendExpedition('oldRuin', 1)")
            selectors = ['#left-panel', '#center-panel', '#log-panel']
            before = [self.doc_box(selector) for selector in selectors]
            self.assert_no_horizontal_overflow()
            self.page.locator('#fold-res').click()
            self.tab('山外').click()
            self.page.locator('#fold-log').click()
            after = [self.doc_box(selector) for selector in selectors]
            for initial, collapsed in zip(before, after):
                self.assertAlmostEqual(initial['x'], collapsed['x'], delta=0.5)
                self.assertAlmostEqual(initial['width'], collapsed['width'], delta=0.5)
                self.assertAlmostEqual(initial['y'], collapsed['y'], delta=0.5)
            self.assertEqual(after[0]['width'], 200)
            self.assertEqual(after[2]['width'], 230)
            self.assert_no_horizontal_overflow()

    def test_collapsed_panels_keep_production_crafting_logs_and_autosave(self):
        self.prepare_game()
        self.page.evaluate("""() => {
          G.res.berry.v = 500; G.res.plank.v = 0;
          G.autoCraft.plank = true;
          sendExpedition('oldRuin', 1); G.expeditions[0].ticksLeft = 20;
        }""")
        berry_before = self.page.evaluate('G.res.berry.v')
        self.page.locator('#fold-res').click()
        self.page.locator('#fold-log').click()
        self.tab('山外').click()
        self.page.clock.run_for(31000)
        self.assertGreater(self.page.evaluate('G.res.berry.v'), berry_before)
        self.assertGreater(self.page.evaluate('G.res.plank.v'), 0)
        self.assertEqual(self.page.evaluate('G.expDone.oldRuin'), 1)
        self.assertEqual(self.page.evaluate('G.foxAway'), 0)
        saved = self.page.evaluate('JSON.parse(localStorage.getItem("fhSave"))')
        self.assertGreaterEqual(saved['tick'], 145)
        self.assertEqual(saved['expDone']['oldRuin'], 1)
        self.page.locator('#fold-log').click()
        self.assertIn('带回了', self.page.locator('#log-list').inner_text())
        self.page.locator('#fold-res').click()
        self.assertTrue(self.page.locator('#res-list').is_visible())

    def test_every_remnant_source_renders_the_same_color_and_safe_legacy_text(self):
        self.prepare_game()
        self.page.evaluate("""() => {
          logs.length = 0;
          for (let i = 0; i < REMNANT_LOGS.length; i++) {
            Math.random = () => (i + 0.1) / REMNANT_LOGS.length;
            tryRemnant();
          }
          const events = ED.filter(e => e.e?.remnant);
          ED.splice(0, ED.length, events[0]); tryEvent();
          ED.splice(0, ED.length, events[1]); tryRewardEvent();
          Math.random = () => 0;
          G.job.scout.c = 0; G.upg.longJourney.done = 0;
          sendExpedition('oldRuin', 1); resolveExpedition(0, false);
          sendExpedition('oldRuin', 1); resolveExpedition(0, true);
          save(); load(); announceReturn(0);
          log('只是讲到遗光的故事，不是奖励。', 'echo');
          rAll();
        }""")
        reward_rows = self.page.locator('#log-list .log').filter(has_text='遗光 +')
        self.assertEqual(reward_rows.count(), 12)
        colors = reward_rows.evaluate_all('els => els.map(e => getComputedStyle(e).color)')
        resource_color = self.page.locator('.rn-remnant').evaluate('e => getComputedStyle(e).color')
        self.assertEqual(set(colors), {resource_color})
        self.assertEqual(resource_color, 'rgb(154, 123, 79)')
        self.assertTrue(all(text.endswith('遗光 +1）') for text in reward_rows.all_text_contents()))
        self.assertNotEqual(self.page.get_by_text('只是讲到遗光的故事，不是奖励。', exact=True).evaluate('e => getComputedStyle(e).color'), resource_color)
        before = self.page.evaluate('G.res.remnant.v')
        self.page.evaluate("""() => {
          G.pendingNarr = ['旧存档队伍返回了。（遗光 +1）',
            {m:'<img src=x onerror="window.testInjected=true">', c:'echo'}];
          announceReturn(0);
        }""")
        self.assertEqual(self.page.locator('#log-list img').count(), 0)
        self.assertTrue(self.page.evaluate('window.testInjected !== true'))
        self.assertEqual(self.page.evaluate('G.res.remnant.v'), before)
        legacy = self.page.get_by_text('旧存档队伍返回了。（遗光 +1）', exact=True)
        self.assertEqual(legacy.evaluate('e => getComputedStyle(e).color'), resource_color)


if __name__ == '__main__':
    unittest.main(verbosity=2)
