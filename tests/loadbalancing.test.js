const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'loadbalancing.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'loadbalancing.js'), 'utf8');
assert.match(html, /id="enablePcc" type="checkbox"/);
assert.match(html, /id="pccWanRows"/);
assert.match(html, /id="addPccWan"/);
assert.match(html, /id="enableTagging" type="checkbox"/);
assert.match(html, /id="taggingWanRows"/);
assert.match(html, /id="addTaggingWan"/);
assert.doesNotMatch(html, /enableLoadBalancing|loadBalancingOutput/);
assert.match(html, /id="clear"/);
assert.match(html, /id="download"/);
assert.match(source, /Bandwidth \(Mbps\)/);
assert.match(source, /placeholder="\$\{key === 'gateway' \|\| key === 'bandwidth' \? fallback : ''\}"/);
assert.match(source, /link\.download = 'load-balancing\.rsc'/);

const { validate, script } = vm.runInNewContext(`${source}\n({ validate, script });`);
const wans = [
    { table: 'WAN1', list: 'WAN1', bandwidth: '100', gateway: '10.10.20.1', distance: '1' },
    { table: 'WAN2', list: 'WAN2', bandwidth: '100', gateway: '192.168.6.1', distance: '2' },
    { table: 'WAN3', list: 'WAN3', bandwidth: '100', gateway: '172.16.0.1', distance: '3' }
];
assert.equal(validate(wans).length, 0);
const output = script(wans);
assert.match(output, /^\/routing table\nadd disabled=no fib name=WAN1\nadd disabled=no fib name=WAN2\nadd disabled=no fib name=WAN3/m);
assert.match(output, /new-routing-mark=WAN1 per-connection-classifier=both-addresses-and-ports:3\/0 src-address-list=masquerade_pool/);
assert.match(output, /new-routing-mark=WAN3 per-connection-classifier=both-addresses-and-ports:3\/2 src-address-list=masquerade_pool/);
assert.match(output, /gateway=172\.16\.0\.1 routing-table=WAN3/);
assert.match(output, /distance=3 dst-address=0\.0\.0\.0\/0 gateway=172\.16\.0\.1 routing-table=main/);
assert.doesNotMatch(output, /\/ip firewall nat|src-address-list=WAN3/);
const twoWanOutput = script(wans.slice(0, 2));
assert.match(twoWanOutput, /new-routing-mark=WAN1 per-connection-classifier=both-addresses-and-ports:2\/0 src-address-list=masquerade_pool/);
assert.match(twoWanOutput, /new-routing-mark=WAN2 per-connection-classifier=both-addresses-and-ports:2\/1 src-address-list=masquerade_pool/);
const weightedOutput = script([{ ...wans[0], bandwidth: '300' }, wans[1]]);
assert.match(weightedOutput, /new-routing-mark=WAN1 per-connection-classifier=both-addresses-and-ports:4\/0 src-address-list=masquerade_pool/);
assert.match(weightedOutput, /new-routing-mark=WAN1 per-connection-classifier=both-addresses-and-ports:4\/2 src-address-list=masquerade_pool/);
assert.match(weightedOutput, /new-routing-mark=WAN2 per-connection-classifier=both-addresses-and-ports:4\/3 src-address-list=masquerade_pool/);
const taggingOutput = script(wans.slice(0, 2), 'tagging');
assert.match(taggingOutput, /new-routing-mark=WAN1 src-address-list=WAN1/);
assert.match(taggingOutput, /new-routing-mark=WAN2 src-address-list=WAN2/);
assert.doesNotMatch(taggingOutput, /per-connection-classifier/);
assert.equal(validate(wans.map(wan => ({ ...wan, bandwidth: '' })), 'tagging').length, 0);
assert.match(validate([{ ...wans[0], gateway: '' }]).join('\n'), /Add at least two WANs[\s\S]*Enter a valid WAN1 gateway/);
assert.match(validate([{ ...wans[0] }, { ...wans[1], table: 'WAN1' }]).join('\n'), /Every routing table name must be different/);

console.log('Load balancing checks passed.');
