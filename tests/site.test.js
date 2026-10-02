const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'loadbalancing.html', 'vpn.html', 'guide.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html'];
for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<meta name="description"/);
    assert.match(html, /<link rel="canonical"/);
    assert.match(html, /class="site-footer"/);
    const footer = html.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0] || '';
    for (const link of ['guide.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html']) {
        assert.match(footer, new RegExp('href="' + link + '"'), `${page} footer links to ${link}`);
    }
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const target = match[1];
        if (/^(?:https?:|mailto:|#)/.test(target)) continue;
        assert.ok(fs.existsSync(path.join(root, target)), `${page} links to missing ${target}`);
    }
}

const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
for (const page of pages) assert.match(sitemap, new RegExp(page === 'index.html' ? 'mikroiktscriptradius/' : page));
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.match(styles, /\.mobile-progress\s*\{\s*display:\s*none/);
assert.match(fs.readFileSync(path.join(root, 'contact.html'), 'utf8'), /href="mailto:manthanmaheswari69@gmail\.com"/);
assert.ok(!fs.existsSync(path.join(root, 'adsense.js')));
assert.ok(!fs.existsSync(path.join(root, 'adsense-config.js')));
assert.ok(!fs.existsSync(path.join(root, 'ads.txt.template')));
console.log('Site checks passed: public pages, local links, sitemap, and no advertising code.');
