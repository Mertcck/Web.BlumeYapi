const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.platform === 'win32' && process.env.USERPROFILE) {
  const userBrowserCache = path.join(process.env.USERPROFILE, 'AppData', 'Local', 'ms-playwright');
  if (fs.existsSync(userBrowserCache)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = userBrowserCache;
  }
}

const { chromium } = require('playwright');

const pages = ['index.html', 'seramik.html', 'fayans.html', 'banyo.html', 'hakkimizda.html', 'iletisim.html', 'showroom.html'];
const viewports = [
  { width: 1440, height: 900 },
  { width: 1920, height: 900 },
  { width: 1280, height: 900 },
  { width: 1024, height: 900 },
  { width: 820, height: 900 },
  { width: 768, height: 900 },
  { width: 430, height: 900 },
  { width: 390, height: 900 },
  { width: 375, height: 667 },
  { width: 360, height: 760 },
  { width: 320, height: 640 },
];
const seenTitles = new Map();
const seenDescriptions = new Map();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const year = String(new Date().getFullYear());

  try {
    const sitemapXml = fs.readFileSync(path.resolve('sitemap.xml'), 'utf8');
    const sitemapPage = await browser.newPage();
    const sitemapCheck = await sitemapPage.evaluate(xml => {
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      return {
        hasParseError: document.querySelector('parsererror') !== null,
        urls: [...document.querySelectorAll('url loc')].map(node => node.textContent.trim()),
      };
    }, sitemapXml);
    await sitemapPage.close();
    assert.equal(sitemapCheck.hasParseError, false, 'sitemap XML parses');
    assert.equal(sitemapCheck.urls.length, pages.length, 'sitemap lists all site pages');
    assert.equal(new Set(sitemapCheck.urls).size, pages.length, 'sitemap URLs are unique');
    assert.ok(sitemapCheck.urls.every(url => url.startsWith('https://www.blumeyapi.com/')), 'sitemap uses the declared HTTPS host');
    assert.match(fs.readFileSync(path.resolve('robots.txt'), 'utf8'), /Sitemap: https:\/\/www\.blumeyapi\.com\/sitemap\.xml/, 'robots.txt references the sitemap');

    for (const file of pages) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: 'domcontentloaded' });
        await page.locator('.loader').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

        const seo = await page.evaluate(() => ({
          title: document.title.trim(),
          description: document.querySelector('meta[name="description"]')?.content.trim() || '',
          canonical: document.querySelector('link[rel="canonical"]')?.href || '',
          ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
          lang: document.documentElement.lang,
          viewport: document.querySelector('meta[name="viewport"]')?.content || '',
          h1Count: document.querySelectorAll('h1').length,
          images: [...document.images].map(image => ({
            alt: image.hasAttribute('alt'),
            width: image.hasAttribute('width'),
            height: image.hasAttribute('height'),
          })),
          social: {
            ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
            ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
            twitterTitle: document.querySelector('meta[name="twitter:title"]')?.content || '',
          },
          jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(script => script.textContent),
        }));

        assert.ok(seo.title, `${file}: title exists`);
        assert.ok(seo.description.length >= 100, `${file}: useful meta description exists`);
        assert.ok(seo.canonical.startsWith('https://www.blumeyapi.com/'), `${file}: canonical uses the declared HTTPS host`);
        assert.equal(new URL(seo.canonical).pathname, file === 'index.html' ? '/' : `/${file}`, `${file}: canonical points to this page`);
        assert.equal(seo.ogUrl, seo.canonical, `${file}: Open Graph URL matches canonical`);
        assert.equal(seo.lang, 'tr', `${file}: document language is Turkish`);
        assert.match(seo.viewport, /width=device-width/, `${file}: responsive viewport metadata exists`);
        assert.equal(seo.h1Count, 1, `${file}: exactly one H1 exists`);
        assert.ok(seo.images.every(image => image.alt), `${file}: every image has an alt attribute`);
        assert.ok(seo.images.every(image => image.width && image.height), `${file}: images reserve intrinsic dimensions`);
        assert.equal(seo.social.ogTitle, seo.title, `${file}: Open Graph title matches page title`);
        assert.equal(seo.social.ogDescription, seo.description, `${file}: Open Graph description matches page description`);
        assert.equal(seo.social.twitterTitle, seo.title, `${file}: Twitter title matches page title`);
        for (const rawSchema of seo.jsonLd) assert.doesNotThrow(() => JSON.parse(rawSchema), `${file}: JSON-LD parses`);
        assert.ok(seo.jsonLd.length, `${file}: structured data exists`);
        const schemas = seo.jsonLd.map(rawSchema => JSON.parse(rawSchema));
        if (file === 'index.html') {
          const types = schemas[0]['@graph'].map(item => item['@type']);
          assert.ok(types.includes('Organization') && types.includes('WebSite'), 'homepage includes Organization and WebSite schema');
        } else {
          assert.ok(schemas.some(schema => schema['@type'] === 'BreadcrumbList'), `${file}: breadcrumb schema exists`);
        }

        if (seenTitles.has(seo.title)) assert.equal(seenTitles.get(seo.title), file, `${file}: title is unique`);
        else seenTitles.set(seo.title, file);
        if (seenDescriptions.has(seo.description)) assert.equal(seenDescriptions.get(seo.description), file, `${file}: description is unique`);
        else seenDescriptions.set(seo.description, file);

        assert.equal(await page.locator('.copyright-year').textContent(), year, `${file}: current year at ${viewport.width}px`);
        assert.equal(await page.locator('.footer').count(), 1, `${file}: footer exists`);
        assert.ok(await page.locator('.footer').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${file}: footer has no horizontal overflow at ${viewport.width}px`);
        const email = page.locator('.footer a[href^="mailto:"]');
        if (await email.count()) {
          assert.equal(await email.evaluate(el => el.getClientRects().length), 1, `${file}: footer email stays on one line at ${viewport.width}px`);
        }
        assert.deepEqual(errors, [], `${file}: no page errors`);

        if (file === 'iletisim.html') {
          const contactGrid = page.locator('.contact-page .contact-grid');
          const contactPanel = page.locator('.contact-page .contact-info');
          const panelWidths = await contactGrid.evaluate((grid, panel) => {
            const gridRect = grid.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            return { grid: gridRect.width, panel: panelRect.width, left: panelRect.left, right: panelRect.right };
          }, await contactPanel.elementHandle());
          assert.ok(Math.abs(panelWidths.grid - panelWidths.panel) <= 1, `contact panel uses the full content width at ${viewport.width}px`);
          assert.ok(panelWidths.left >= -1 && panelWidths.right <= viewport.width + 1, `contact panel stays within the viewport at ${viewport.width}px`);
          assert.ok(await page.locator('.contact-info .contact-item').evaluateAll(items => items.every(el => el.scrollWidth <= el.clientWidth + 1)), `contact information items have no overflow at ${viewport.width}px`);

          const contactColumns = await contactPanel.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
          assert.equal(contactColumns, viewport.width <= 640 ? 1 : 2, `contact cards use the appropriate column count at ${viewport.width}px`);
          assert.ok(await contactPanel.locator('.contact-item').evaluateAll(items => {
            const widths = items.map(el => el.getBoundingClientRect().width);
            return Math.max(...widths) - Math.min(...widths) <= 1;
          }), `contact cards have consistent widths at ${viewport.width}px`);

          if (viewport.width <= 1024) {
            assert.ok(await page.locator('.contact-page .section-header').first().evaluate(el => parseFloat(getComputedStyle(el).marginBottom) <= 48), `contact page section spacing is balanced at ${viewport.width}px`);
          }

          assert.ok(await page.locator('.contact-directions-link').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), `directions link stays within the viewport at ${viewport.width}px`);
          if (viewport.width <= 768) {
            assert.equal(await page.locator('.contact-page .whatsapp-float').evaluate(el => getComputedStyle(el).display), 'none', `redundant floating WhatsApp button does not cover contact information at ${viewport.width}px`);
          }
        }

        if (viewport.width <= 768) {
          const toggle = page.locator('.menu-toggle');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true', `${file}: menu reports open state`);

          const links = page.locator('.nav-menu .nav-link');
          assert.ok(await links.first().isVisible(), `${file}: menu links visible`);
          const gaps = await links.evaluateAll(items => items.slice(1).map((item, i) => {
            const previous = items[i].getBoundingClientRect();
            return item.getBoundingClientRect().top - previous.bottom;
          }));
          if (gaps.length) {
            assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1.5, `${file}: menu vertical gaps are consistent (${gaps})`);
          }

          const ctaStyle = await page.locator('.nav-menu .nav-cta').evaluate(el => ({
            background: getComputedStyle(el).backgroundColor,
            radius: getComputedStyle(el).borderRadius,
            shadow: getComputedStyle(el).boxShadow,
          }));
          assert.equal(ctaStyle.background, 'rgba(0, 0, 0, 0)', `${file}: mobile contact link background removed`);
          assert.equal(ctaStyle.radius, '0px', `${file}: mobile contact link rounded border removed`);
          assert.equal(ctaStyle.shadow, 'none', `${file}: mobile contact link shadow removed`);
        }

        await page.close();
      }
    }

    console.log(`PASS: sitemap/robots plus ${pages.length * viewports.length} page/viewport checks; SEO metadata/schema, contact-page layout, footer email, copyright year and mobile menu verified.`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
