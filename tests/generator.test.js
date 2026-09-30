const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.match(html, /href="styles\.css"/);
assert.match(html, /src="app\.js" defer/);

function createGenerator() {
    const elements = new Map();
    for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
        elements.set(id, {
            value: '', checked: false, textContent: '', disabled: false, readOnly: false, placeholder: '',
            classList: { toggle() {} }, addEventListener() {}
        });
    }

    const defaults = {
        wanInterface: 'ether1', wanMode: 'dhcp', wanReach: 'public', wanVlanName: 'vlan-wan',
        wanPppoeName: 'pppoe-wan', lanMode: 'physical', lanInterface: 'ether2', lanAddress: '192.168.2.0/24',
        service: 'service1', bridgeName: 'bridge-pppoe', vlanName: 'vlan-pppoe', vpnIpsec: 'no',
        publicServer: 'pr3s1', radiusIp: '', radiusSecret: 'phpmkradius', authPort: '1812', acctPort: '1813',
        extraVlans: '', extraProfiles: '', extraServers: '', bridgeExtra: '',
        hotspotInterface: 'ether3', hotspotSubnet: '192.168.100.0/24', hotspotDnsName: 'phpradius.net',
        hotspotHtmlDirectory: 'flash/hotspot', hotspotProfileName: 'hotspot_profile',
        hotspotServerName: 'hotspot_server', hotspotPoolName: 'hotspot_dhcp_pool', hotspotDhcpName: 'hotspot_dhcp'
    };
    for (const [id, value] of Object.entries(defaults)) elements.get(id).value = value;
    elements.get('enablePppoe').checked = true;
    elements.get('blockExpired').checked = true;

    const context = {
        document: { getElementById: id => elements.get(id), createElement: () => ({ click() {} }) },
        navigator: { clipboard: { writeText: async () => {} } },
        URL, Blob, setTimeout, console
    };
    vm.runInNewContext(source, context, { filename: 'app.js' });
    return { context, elements };
}

function generate(overrides = {}) {
    const app = createGenerator();
    for (const [id, value] of Object.entries(overrides)) {
        if (id === 'enablePppoe' || id === 'enableHotspot' || id === 'blockExpired' || id === 'bindIp') app.elements.get(id).checked = value;
        else app.elements.get(id).value = value;
    }
    app.context.toggle();
    app.context.generate();
    return app.elements.get('output').textContent;
}

const pppoeOnly = generate();
assert.match(pppoeOnly, /add service=ppp address=143\.110\.244\.41 .*require-message-auth=no/);
assert.match(pppoeOnly, /# NAT only active customers/);
assert.match(pppoeOnly, /# \/radius monitor \[find where service=ppp\]/);
assert.match(pppoeOnly, /add chain=srcnat src-address=192\.168\.2\.0\/24 out-interface=ether1 action=masquerade/);
assert.match(pppoeOnly, /comment="expired PPPoE users"/);
assert.doesNotMatch(pppoeOnly, /\/ip hotspot|\/ip dhcp-server|service=ppp,hotspot/);
assert.doesNotMatch(pppoeOnly, /chain=srcnat[^\n]*1\.1\.1\./);

const publicHotspot = generate({ enableHotspot: true });
assert.match(publicHotspot, /add address=192\.168\.100\.1\/24 network=192\.168\.100\.0 interface=ether3/);
assert.match(publicHotspot, /add name=hotspot_dhcp interface=ether3 address-pool=hotspot_dhcp_pool disabled=no/);
assert.match(publicHotspot, /add name=hotspot_server interface=ether3 profile=hotspot_profile disabled=no/);
assert.match(publicHotspot, /add name=hotspot_dhcp_pool ranges=192\.168\.100\.2-192\.168\.100\.254/);
assert.match(publicHotspot, /add address=192\.168\.100\.0\/24 gateway=192\.168\.100\.1 dns-server=192\.168\.100\.1/);
assert.match(publicHotspot, /login-by=cookie,http-chap,http-pap use-radius=yes/);
assert.match(publicHotspot, /set allow-remote-requests=yes/);
assert.match(publicHotspot, /add service=ppp,hotspot address=143\.110\.244\.41 .*require-message-auth=no/);
assert.match(publicHotspot, /chain=srcnat src-address=192\.168\.100\.0\/24 out-interface=ether1 action=masquerade comment="Hotspot clients"/);
assert.doesNotMatch(publicHotspot, /chain=srcnat[^\n]*1\.1\.1\./);

const hotspotOnly = generate({ enablePppoe: false, enableHotspot: true, lanInterface: '', lanAddress: '', service: '', extraProfiles: 'ignored-invalid-data' });
assert.match(hotspotOnly, /add service=hotspot address=143\.110\.244\.41 .*require-message-auth=no/);
assert.match(hotspotOnly, /add name=hotspot_server interface=ether3 profile=hotspot_profile disabled=no/);
assert.doesNotMatch(hotspotOnly, /\/ppp aaa|\/ppp profile|\/interface pppoe-server|pppoe_pool|expired_pool|expired PPPoE users|service=ppp/);
assert.equal((hotspotOnly.match(/add chain=srcnat/g) || []).length, 1);

const l2tpHotspot = generate({ enableHotspot: true, wanReach: 'private', publicServer: 'pr3s2', vpnUser: 'test_vpn_user', vpnPass: 'test_vpn_password' });
assert.match(l2tpHotspot, /add name=l2tp-radius connect-to=64\.227\.158\.172 user="test_vpn_user" password="test_vpn_password"/);
assert.match(l2tpHotspot, /add dst-address=192\.168\.113\.1\/32 gateway=l2tp-radius/);
assert.match(l2tpHotspot, /add service=ppp,hotspot address=192\.168\.113\.1 .*require-message-auth=no/);
assert.match(l2tpHotspot, /add name=hotspot_dhcp interface=ether3/);

assert.throws(() => generate({ enableHotspot: true, hotspotSubnet: '192.168.2.0/24' }), /Hotspot subnet overlaps PPPoE profile subnet/);
assert.throws(() => generate({ enableHotspot: true, hotspotSubnet: '1.1.1.0/24' }), /Hotspot subnet overlaps the reserved expired-user subnet/);
assert.throws(() => generate({ enableHotspot: true, wanMode: 'static', wanAddress: '192.168.100.2/24', wanGateway: '192.168.100.1' }), /Hotspot subnet overlaps the static WAN subnet/);
assert.throws(() => generate({ enableHotspot: true, hotspotInterface: 'ether1' }), /Hotspot interface cannot be the WAN interface/);
assert.throws(() => generate({ enableHotspot: true, lanMode: 'bridge', bridgeExtra: 'ether3', hotspotInterface: 'ether3' }), /Hotspot cannot run on a bridge member port/);
assert.throws(() => generate({ enablePppoe: false, enableHotspot: false }), /Enable PPPoE, Hotspot, or both/);
const hotspot30 = generate({ enableHotspot: true, hotspotSubnet: '192.168.101.0/30' });
assert.match(hotspot30, /add name=hotspot_dhcp_pool ranges=192\.168\.101\.2-192\.168\.101\.2/);

console.log('Passed: PPPoE-only, Hotspot-only, combined public RADIUS, combined L2TP RADIUS, pool boundaries, subnet overlaps, interface checks, and empty-service rejection.');
