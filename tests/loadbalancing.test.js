const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'loadbalancing.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'loadbalancing.js'), 'utf8');
assert.match(html, /id="wanRows"/);
assert.match(html, /id="addWan"/);
assert.match(html, /id="enableLoadBalancing" type="checkbox"/);
assert.doesNotMatch(html, /id="enableLoadBalancing" type="checkbox" checked/);
assert.match(html, /id="loadBalancingOutput" class="output-card hidden"/);
assert.match(html, /id="clear"/);
assert.match(html, /id="download"/);
assert.match(source, /placeholder="\$\{key === 'gateway' \? fallback : ''\}"/);
assert.match(source, /link\.download = 'load-balancing\.rsc'/);

const { validate, script } = vm.runInNewContext(`${source}\n({ validate, script });`);
const wans = [
    { table: 'WAN1', list: 'WAN1', gateway: '10.10.20.1', distance: '1' },
    { table: 'WAN2', list: 'WAN2', gateway: '192.168.6.1', distance: '2' },
    { table: 'WAN3', list: 'WAN3', gateway: '172.16.0.1', distance: '3' }
];
assert.equal(validate(wans).length, 0);
const output = script(wans);
assert.match(output, /^\/routing table\nadd disabled=no fib name=WAN1\nadd disabled=no fib name=WAN2\nadd disabled=no fib name=WAN3/m);
assert.match(output, /new-routing-mark=WAN3 src-address-list=WAN3/);
assert.match(output, /gateway=172\.16\.0\.1 routing-table=WAN3/);
assert.match(output, /distance=3 dst-address=0\.0\.0\.0\/0 gateway=172\.16\.0\.1 routing-table=main/);
assert.doesNotMatch(output, /\/ip firewall nat|per-connection-classifier/);
assert.match(validate([{ ...wans[0], gateway: '' }]).join('\n'), /Add at least two WANs[\s\S]*Enter a valid WAN1 gateway/);
assert.match(validate([{ ...wans[0] }, { ...wans[1], table: 'WAN1' }]).join('\n'), /Every routing table name must be different/);

console.log('Load balancing checks passed.');
