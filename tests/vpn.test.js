const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'vpn.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'vpn.js'), 'utf8');
assert.match(html, /id="enableWireGuard" type="checkbox"/);
assert.match(html, /id="wireGuardPeerRows"/);
assert.match(html, /id="wireGuardNat" type="checkbox" checked/);
assert.doesNotMatch(html, /wireGuardNatOut/);
assert.match(html, /src="vpn\.js" defer/);

const { validate, script } = vm.runInNewContext(`${source}\n({ validate, script });`);
const config = {
    name: 'wireguard1', port: '13231', address: '192.168.100.1/24', mtu: '1420', addFirewall: true, addNat: true,
    peers: [{ publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', allowedAddress: '192.168.100.2/32,192.168.100.3/32' }]
};
assert.equal(validate(config).length, 0);
const output = script(config);
assert.match(output, /\/interface wireguard\nadd disabled=no name=wireguard1 listen-port=13231 mtu=1420/);
assert.match(output, /add interface=wireguard1 public-key="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" allowed-address=192\.168\.100\.2\/32,192\.168\.100\.3\/32/);
assert.match(output, /dst-port=13231 protocol=udp place-before=1/);
assert.match(output, /src-address=192\.168\.100\.0\/24/);
assert.match(output, /add action=masquerade chain=srcnat src-address=192\.168\.100\.0\/24 comment="WireGuard peer NAT"/);
assert.match(validate({ ...config, peers: [{ ...config.peers[0], allowedAddress: '10.0.0.2/32' }] }).join('\n'), /inside the tunnel subnet/);
assert.match(validate({ ...config, peers: [config.peers[0], config.peers[0]] }).join('\n'), /allowed addresses overlap/);

console.log('WireGuard checks passed.');
