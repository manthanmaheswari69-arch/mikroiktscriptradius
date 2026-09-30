const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.match(html, /href="styles\.css"/);
assert.match(html, /src="app\.js" defer/);
assert.match(html, /id="clear"/);
assert.doesNotMatch(html, /PR3S1\s*[·-]\s*143\.110\.244\.41/);

function createGenerator() {
    const elements = new Map();
    for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
        const classes = new Set();
        elements.set(id, {
            value: '', checked: false, textContent: '', disabled: false, readOnly: false, placeholder: '', validationMessage: '',
            setCustomValidity(message) { this.validationMessage = message; },
            classList: {
                toggle(name, force) {
                    const add = force === undefined ? !classes.has(name) : force;
                    if (add) classes.add(name); else classes.delete(name);
                },
                contains(name) { return classes.has(name); }
            },
            addEventListener() {}
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
        hotspotServerName: 'hotspot_server', hotspotPoolName: 'hotspot_dhcp_pool', hotspotDhcpName: 'hotspot_dhcp',
        hotspotDnsServers: '8.8.8.8,8.8.4.4', ipBasedInterface: 'ether4',
        ipBasedSubnet: '192.168.110.0/24', ipBasedProfileName: 'ipbased_profile',
        ipBasedServerName: 'ipbased_server', ipBasedPoolName: 'static', ipBasedDnsServers: '8.8.8.8,8.8.4.4'
    };
    for (const [id, value] of Object.entries(defaults)) elements.get(id).value = value;
    elements.get('enablePppoe').checked = true;
    elements.get('blockExpired').checked = true;
    elements.get('ipBasedBinding').checked = true;

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
        if (['enablePppoe', 'enableHotspot', 'enableIpBased', 'blockExpired', 'bindIp', 'ipBasedBinding'].includes(id)) app.elements.get(id).checked = value;
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
assert.match(pppoeOnly, /add list=masquerade_pool address=192\.168\.2\.0\/24 comment="active pppoe_profile"/);
assert.match(pppoeOnly, /add chain=srcnat src-address-list=masquerade_pool out-interface=ether1 action=masquerade/);
assert.equal((pppoeOnly.match(/add chain=srcnat/g) || []).length, 1);
assert.match(pppoeOnly, /comment="expired PPPoE users"/);
assert.doesNotMatch(pppoeOnly, /\/ip hotspot|\/ip dhcp-server|service=ppp,hotspot/);
assert.doesNotMatch(pppoeOnly, /chain=srcnat[^\n]*1\.1\.1\./);

const publicHotspot = generate({ enableHotspot: true });
assert.match(publicHotspot, /add address=192\.168\.100\.1\/24 network=192\.168\.100\.0 interface=ether3/);
assert.match(publicHotspot, /add name=hotspot_dhcp interface=ether3 address-pool=hotspot_dhcp_pool disabled=no/);
assert.match(publicHotspot, /add name=hotspot_server interface=ether3 profile=hotspot_profile disabled=no/);
assert.match(publicHotspot, /add name=hotspot_dhcp_pool ranges=192\.168\.100\.2-192\.168\.100\.254/);
assert.match(publicHotspot, /add address=192\.168\.100\.0\/24 gateway=192\.168\.100\.1 dns-server=192\.168\.100\.1/);
assert.match(publicHotspot, /add name=hotspot_profile hotspot-address=192\.168\.100\.1 dns-name=phpradius\.net/);
assert.match(publicHotspot, /login-by=cookie,http-chap,http-pap use-radius=yes/);
assert.match(publicHotspot, /set allow-remote-requests=yes/);
assert.match(publicHotspot, /add service=ppp,hotspot address=143\.110\.244\.41 .*require-message-auth=no/);
assert.match(publicHotspot, /add list=masquerade_pool address=192\.168\.100\.0\/24 comment="Hotspot clients"/);
assert.match(publicHotspot, /chain=srcnat src-address-list=masquerade_pool out-interface=ether1 action=masquerade/);
assert.doesNotMatch(publicHotspot, /chain=srcnat[^\n]*1\.1\.1\./);

const hotspotOnly = generate({ enablePppoe: false, enableHotspot: true, lanInterface: '', lanAddress: '', service: '', extraProfiles: 'ignored-invalid-data' });
assert.match(hotspotOnly, /add service=hotspot address=143\.110\.244\.41 .*require-message-auth=no/);
assert.match(hotspotOnly, /add name=hotspot_server interface=ether3 profile=hotspot_profile disabled=no/);
assert.doesNotMatch(hotspotOnly, /\/ppp aaa|\/ppp profile|\/interface pppoe-server|pppoe_pool|expired_pool|expired PPPoE users|service=ppp/);
assert.equal((hotspotOnly.match(/add chain=srcnat/g) || []).length, 1);

const ipBasedOnly = generate({
    enablePppoe: false, enableIpBased: true,
    wanMode: 'static', wanAddress: '10.10.20.46/24', wanGateway: '10.10.20.1',
    wanReach: 'private', publicServer: 'pr3s2', vpnUser: 'entered_vpn_user', vpnPass: 'entered_vpn_password'
});
assert.match(ipBasedOnly, /add name=l2tp-radius connect-to=64\.227\.158\.172 user="entered_vpn_user" password="entered_vpn_password"/);
assert.match(ipBasedOnly, /add address=192\.168\.110\.1\/24 network=192\.168\.110\.0 interface=ether4/);
assert.match(ipBasedOnly, /add name=static ranges=192\.168\.110\.2-192\.168\.110\.254/);
assert.match(ipBasedOnly, /login-by=mac mac-auth-mode=mac-as-username-and-password use-radius=yes/);
assert.match(ipBasedOnly, /add addresses-per-mac=unlimited name=ipbased_server interface=ether4 profile=ipbased_profile disabled=no/);
assert.match(ipBasedOnly, /add address=192\.168\.110\.0\/24 server=ipbased_server type=regular/);
assert.match(ipBasedOnly, /set allow-remote-requests=yes servers=8\.8\.8\.8,8\.8\.4\.4/);
assert.match(ipBasedOnly, /add service=hotspot address=192\.168\.113\.1 .*require-message-auth=no/);
assert.doesNotMatch(ipBasedOnly, /add service=ppp/);
assert.match(ipBasedOnly, /add list=masquerade_pool address=192\.168\.110\.0\/24 comment="IP-based clients"/);
assert.match(ipBasedOnly, /src-address-list=masquerade_pool out-interface=ether1 action=masquerade/);
assert.doesNotMatch(ipBasedOnly, /\/ip dhcp-server|192\.168\.100\.0\/24/);

const allServices = generate({ enableHotspot: true, enableIpBased: true });
assert.match(allServices, /add name=hotspot_server interface=ether3 profile=hotspot_profile disabled=no/);
assert.match(allServices, /add addresses-per-mac=unlimited name=ipbased_server interface=ether4 profile=ipbased_profile disabled=no/);
assert.match(allServices, /add service=ppp,hotspot address=143\.110\.244\.41/);
assert.equal((allServices.match(/add service=ppp,hotspot/g) || []).length, 1);
assert.match(allServices, /add list=masquerade_pool address=192\.168\.2\.0\/24 comment="active pppoe_profile"/);
assert.match(allServices, /add list=masquerade_pool address=192\.168\.100\.0\/24 comment="Hotspot clients"/);
assert.match(allServices, /add list=masquerade_pool address=192\.168\.110\.0\/24 comment="IP-based clients"/);
assert.equal((allServices.match(/add chain=srcnat/g) || []).length, 1);

const l2tpHotspot = generate({ enableHotspot: true, wanReach: 'private', publicServer: 'pr3s2', vpnUser: 'test_vpn_user', vpnPass: 'test_vpn_password' });
assert.match(l2tpHotspot, /add name=l2tp-radius connect-to=64\.227\.158\.172 user="test_vpn_user" password="test_vpn_password"/);
assert.match(l2tpHotspot, /add dst-address=192\.168\.113\.1\/32 gateway=l2tp-radius/);
assert.match(l2tpHotspot, /add service=ppp,hotspot address=192\.168\.113\.1 .*require-message-auth=no/);
assert.match(l2tpHotspot, /add name=hotspot_dhcp interface=ether3/);
assert.throws(() => generate({ wanReach: 'private' }), /Enter the L2TP username to connect to private RADIUS through L2TP\./);
assert.throws(() => generate({ wanReach: 'private', vpnUser: 'valid_user' }), /Enter the L2TP password to connect to private RADIUS through L2TP\./);
assert.throws(() => generate({ wanReach: 'private', vpnUser: 'bad"user', vpnPass: 'valid_password' }), /L2TP username cannot include quotes, backslashes, or new lines\./);
assert.throws(() => generate({ radiusSecret: '' }), /RADIUS secret is required\. Enter a value and try again\./);
assert.throws(() => generate({ lanInterface: '' }), /Customer interface is required\. Enter a name and try again\./);
assert.throws(() => generate({ wanMode: 'static', wanAddress: 'not-an-address', wanGateway: '203.0.113.1' }), /Enter the WAN address in IP\/CIDR format/);
assert.throws(() => generate({ lanMode: 'vlan', vlanId: '0' }), /VLAN ID from 1 to 4094\. VLAN IDs 0 and 4095 are reserved/);
assert.throws(() => generate({ wanVlanId: '4095' }), /WAN VLAN ID from 1 to 4094\. VLAN IDs 0 and 4095 are reserved/);

assert.throws(() => generate({ enableHotspot: true, hotspotSubnet: '192.168.2.0/24' }), /Hotspot subnet overlaps PPPoE profile subnet/);
assert.throws(() => generate({ enableHotspot: true, hotspotSubnet: '1.1.1.0/24' }), /Hotspot subnet overlaps the reserved expired-user subnet/);
assert.throws(() => generate({ enableHotspot: true, wanMode: 'static', wanAddress: '192.168.100.2/24', wanGateway: '192.168.100.1' }), /Hotspot subnet overlaps the static WAN subnet/);
assert.throws(() => generate({ enableHotspot: true, hotspotInterface: 'ether1' }), /Hotspot interface cannot be the WAN interface/);
assert.throws(() => generate({ enableIpBased: true, ipBasedInterface: 'ether1' }), /IP-based access interface cannot be the WAN interface/);
assert.throws(() => generate({ enableIpBased: true, ipBasedSubnet: '192.168.2.0/24' }), /IP-based access subnet overlaps PPPoE profile subnet/);
assert.throws(() => generate({ enableHotspot: true, lanMode: 'bridge', bridgeExtra: 'ether3', hotspotInterface: 'ether3' }), /Hotspot cannot run on a bridge member port/);
assert.throws(() => generate({ enableHotspot: true, enableIpBased: true, ipBasedInterface: 'ether3' }), /must use different interfaces/);
assert.throws(() => generate({ enableHotspot: true, enableIpBased: true, ipBasedSubnet: '192.168.100.128/25' }), /subnets overlap/);
assert.throws(() => generate({ enablePppoe: false, enableHotspot: false, enableIpBased: false }), /Enable PPPoE, Hotspot, IP-based access/);
const hotspot30 = generate({ enableHotspot: true, hotspotSubnet: '192.168.101.0/30' });
assert.match(hotspot30, /add name=hotspot_dhcp_pool ranges=192\.168\.101\.2-192\.168\.101\.2/);

const clearState = createGenerator();
assert.equal(clearState.elements.get('radiusField').classList.contains('hidden'), true);
assert.equal(clearState.elements.get('vpnEndpointField').classList.contains('hidden'), true);
clearState.context.generate();
assert.notEqual(clearState.elements.get('output').textContent, 'Your configuration will appear here.');
clearState.elements.get('clear').onclick();
assert.equal(clearState.elements.get('output').textContent, 'Your configuration will appear here.');
assert.equal(clearState.elements.get('copy').disabled, true);
assert.equal(clearState.elements.get('download').disabled, true);

const customServerState = createGenerator();
customServerState.elements.get('publicServer').value = 'custom';
customServerState.context.toggle();
assert.equal(customServerState.elements.get('radiusField').classList.contains('hidden'), false);
assert.equal(customServerState.elements.get('vpnEndpointField').classList.contains('hidden'), false);

const vlanFieldState = createGenerator();
vlanFieldState.elements.get('wanVlanId').value = '4095';
vlanFieldState.context.validateVlanId('wanVlanId', 'WAN VLAN ID');
assert.match(vlanFieldState.elements.get('wanVlanIdError').textContent, /must be from 1 to 4094/);
assert.equal(vlanFieldState.elements.get('wanVlanId').classList.contains('input-error'), true);
vlanFieldState.elements.get('wanVlanId').value = '100';
vlanFieldState.context.validateVlanId('wanVlanId', 'WAN VLAN ID');
assert.equal(vlanFieldState.elements.get('wanVlanIdError').textContent, '');
assert.equal(vlanFieldState.elements.get('wanVlanId').classList.contains('input-error'), false);

console.log('Passed: PPPoE-only, independent login Hotspot and IP-based MAC-RADIUS, PPP service selection, clear-script control, hidden preset labels, public/L2TP RADIUS, pool boundaries, subnet overlaps, interface checks, and empty-service rejection.');
