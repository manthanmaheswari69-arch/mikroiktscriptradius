const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'loadbalancing.html', 'vpn.html', 'guide.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html'];
for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<meta name="description"/);
    assert.match(html, /<link rel="canonical"/);
    assert.match(html, /class="site-footer"/);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const target = match[1];
        if (/^(?:https?:|#)/.test(target)) continue;
        assert.ok(fs.existsSync(path.join(root, target)), `${page} links to missing ${target}`);
    }
}

const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
for (const page of pages) assert.match(sitemap, new RegExp(page === 'index.html' ? 'mikroiktscriptradius/' : page));
assert.ok(!fs.existsSync(path.join(root, 'ads.txt')));
assert.match(fs.readFileSync(path.join(root, 'ads.txt.template'), 'utf8'), /pub-0000000000000000/);

const context = { window: { RouterForgeAds: { enabled: false, publisherId: '' } }, document: { createElement() { throw new Error('Disabled ads must not create a script'); }, head: { append() { throw new Error('Disabled ads must not append a script'); } } } };
vm.runInNewContext(fs.readFileSync(path.join(root, 'adsense.js'), 'utf8'), context);
console.log('Site checks passed: public pages, local links, sitemap, and disabled advertising.');
