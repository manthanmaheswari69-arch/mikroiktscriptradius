const $ = id => document.getElementById(id);
const value = id => $(id).value.trim();
let generated = '';

const servers = {
    pr3s1: { public: '143.110.244.41', vpn: '192.168.112.1' },
    pr3s2: { public: '64.227.158.172', vpn: '192.168.113.1' },
    pr3s3: { public: '139.59.168.36', vpn: '192.168.116.1' }
};

function toggle() {
    const vpn = value('wanReach') === 'private';
    const selected = value('publicServer');
    const server = servers[selected];

    $('staticFields').classList.toggle('hidden', value('wanMode') !== 'static');
    $('pppoeWanFields').classList.toggle('hidden', value('wanMode') !== 'pppoe');
    $('vpnFields').classList.toggle('hidden', !vpn);
    $('radiusIp').readOnly = !!server;
    $('vpnEndpoint').readOnly = !!server;

    if (server) {
        $('radiusIp').value = vpn ? server.vpn : server.public;
        $('vpnEndpoint').value = server.public;
    } else if (selected !== 'custom') {
        $('radiusIp').value = '';
        $('vpnEndpoint').value = '';
    }

    $('radiusIp').placeholder = selected === 'custom' ? 'Enter RADIUS IP' : 'Select a server';
    $('vpnEndpoint').placeholder = selected === 'custom' ? 'Enter L2TP server IP' : 'Select a server';
    $('bridgeFields').classList.toggle('hidden', value('lanMode') !== 'bridge');
    $('vlanFields').classList.toggle('hidden', value('lanMode') !== 'vlan');
    $('ipsecField').classList.toggle('hidden', value('vpnIpsec') !== 'yes');
}

function togglePppoe() {
    const enabled = $('enablePppoe').checked;
    $('pppoeFields').classList.toggle('hidden', !enabled);
    $('advanced').classList.toggle('hidden', !enabled);
    preview();
}

function toggleHotspot() {
    $('hotspotFields').classList.toggle('hidden', !$('enableHotspot').checked);
    hotspotPreview();
}

['wanMode', 'wanReach', 'lanMode', 'vpnIpsec'].forEach(id => $(id).addEventListener('change', toggle));
$('publicServer').addEventListener('change', () => {
    $('radiusIp').value = '';
    $('vpnEndpoint').value = '';
    toggle();
});
$('enablePppoe').addEventListener('change', togglePppoe);
$('enableHotspot').addEventListener('change', toggleHotspot);
$('lanAddress').addEventListener('input', preview);
$('hotspotSubnet').addEventListener('input', hotspotPreview);

function fail(message) { throw Error(message) }

function ip(address) {
    const parts = address.split('.');
    if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || +part > 255)) fail('Invalid IPv4 address: ' + address);
    return parts.reduce((number, part) => (number * 256 + Number(part)) >>> 0, 0);
}

function fmt(number) { return [24, 16, 8, 0].map(bit => (number >>> bit) & 255).join('.') }

function cidr(input) {
    const match = /^([^/]+)\/(\d{1,2})$/.exec(input);
    if (!match) fail('Use IP/CIDR format: ' + input);
    const bits = +match[2];
    if (bits < 16 || bits > 30) fail('Customer pools need a prefix from /16 to /30.');
    const address = ip(match[1]);
    const size = 2 ** (32 - bits);
    const net = Math.floor(address / size) * size;
    return { addr: address, net, size, bits, last: net + size - 1 };
}

function privateRange(net, size) {
    const end = net + size - 1;
    return (net >= ip('10.0.0.0') && end <= ip('10.255.255.255')) ||
        (net >= ip('172.16.0.0') && end <= ip('172.31.255.255')) ||
        (net >= ip('192.168.0.0') && end <= ip('192.168.255.255'));
}

function overlap(first, second) { return first.net < second.net + second.size && second.net < first.net + first.size }

function calcPools(subnet) {
    const active = cidr(subnet);
    if (!privateRange(active.net, active.size)) fail('Active subnet must be private');
    const start = active.net + 2;
    if (start >= active.last) fail('Subnet too small for a pool starting at network + 2');
    active.addr = active.net + 1;

    const anchor = ip('1.1.1.0');
    const net = Math.floor(anchor / active.size) * active.size;
    const expired = { net, size: active.size, bits: active.bits, last: net + active.size - 1 };
    if (overlap(active, expired)) fail('Active subnet overlaps the fixed expired range');

    return { active, expired, start, expStart: expired.net + 2, expEnd: expired.last - 1 };
}

function calcHotspotSubnet(subnet) {
    const active = cidr(subnet);
    const start = active.net + 2;
    const end = active.last - 1;
    if (start > end) fail('Hotspot subnet must have at least one usable DHCP address after the gateway.');
    active.addr = active.net + 1;
    return { active, start, end };
}

function rows(id, min, max) {
    return value(id).split(/\r?\n/).map(row => row.trim()).filter(Boolean).map((line, index) => {
        const parts = line.split(',').map(part => part.trim());
        if (parts.length < min || parts.length > max || parts.slice(0, min).some(part => !part)) fail(id + ' line ' + (index + 1) + ': expected ' + min + (max !== min ? '–' + max : '') + ' comma-separated fields');
        return parts;
    });
}

function ident(input, name) {
    if (!/^[A-Za-z0-9_.-]{1,48}$/.test(input)) fail(name + ' must contain only letters, digits, _, . or -');
    return input;
}

function literal(input, name) {
    if (!input || /[\r\n"\\]/.test(input)) fail(name + ' is required and cannot include a quote, backslash or newline');
    return '"' + input + '"';
}

function host(input, name) {
    if (!input || !/^[-a-zA-Z0-9.]+$/.test(input)) fail('Invalid ' + name);
    return input;
}

function preview() {
    if (!$('enablePppoe').checked) {
        $('poolPreview').textContent = '';
        return;
    }
    try {
        const { active, expired, start, expStart, expEnd } = calcPools(value('lanAddress'));
        $('poolPreview').textContent = 'PPPoE local: ' + fmt(active.addr) + ' | Active: ' + fmt(active.net) + '/' + active.bits + ' → ' + fmt(start) + '–' + fmt(active.last - 1) + ' | Expired: ' + fmt(expired.net) + '/' + expired.bits + ' → ' + fmt(expStart) + '–' + fmt(expEnd);
    } catch (error) {
        $('poolPreview').textContent = error.message;
    }
}

function hotspotPreview() {
    if (!$('enableHotspot').checked) {
        $('hotspotPreview').textContent = '';
        return;
    }
    try {
        const { active, start, end } = calcHotspotSubnet(value('hotspotSubnet'));
        $('hotspotPreview').textContent = 'Gateway: ' + fmt(active.addr) + ' | DHCP pool: ' + fmt(start) + '–' + fmt(end);
    } catch (error) {
        $('hotspotPreview').textContent = error.message;
    }
}

function generate() {
    const pppoeEnabled = $('enablePppoe').checked;
    const hotspotEnabled = $('enableHotspot').checked;
    if (!pppoeEnabled && !hotspotEnabled) fail('Enable PPPoE, Hotspot, or both.');

    const lines = [
        '# RouterOS 7 - review names, addressing, RADIUS route and firewall ordering before import',
        '# Use Safe Mode for remote changes. Export and back up the router first.'
    ];
    let wanInterface = ident(value('wanInterface'), 'WAN interface');
    const physicalWan = wanInterface;
    let wanOut = wanInterface;
    const wanClientName = value('wanMode') === 'pppoe' ? ident(value('wanPppoeName'), 'PPPoE WAN name') : '';
    const wanVlan = value('wanVlanId') ? ident(value('wanVlanName'), 'WAN VLAN name') : '';
    const selected = value('publicServer');
    if (!selected) fail('Select PR3S1, PR3S2, PR3S3, or Custom');
    const radius = fmt(ip(value('radiusIp')));
    const secret = literal(value('radiusSecret'), 'RADIUS secret');

    let customer = '';
    let lanInterface = '';
    let mode = '';
    let basePool = null;
    let profiles = [];
    let serversList = [];

    if (pppoeEnabled) {
        lanInterface = ident(value('lanInterface'), 'Customer interface');
        if (physicalWan === lanInterface) fail('WAN and customer interfaces must differ');
        mode = value('lanMode');
        customer = lanInterface;
        basePool = calcPools(value('lanAddress'));

        if (wanClientName && [physicalWan, lanInterface, wanVlan].includes(wanClientName)) fail('PPPoE WAN name conflicts with another interface');
        if (wanVlan && [physicalWan, lanInterface].includes(wanVlan)) fail('WAN VLAN name conflicts with another interface');

        if (mode === 'bridge') {
            customer = ident(value('bridgeName'), 'Bridge name');
            const extra = value('bridgeExtra') ? value('bridgeExtra').split(',').map(port => ident(port.trim(), 'Bridge port')) : [];
            const ports = [lanInterface, ...extra];
            if (new Set(ports).size !== ports.length) fail('Bridge ports must be unique');
            if (ports.includes(physicalWan) || ports.includes(wanVlan) || ports.includes(wanClientName)) fail('WAN interface cannot be a customer bridge port');
            if ([physicalWan, wanClientName, wanVlan].includes(customer) || ports.includes(customer)) fail('Bridge name conflicts with another interface');
            lines.push('/interface bridge', 'add name=' + customer, '/interface bridge port', ...ports.map(port => 'add bridge=' + customer + ' interface=' + port));
        }

        if (mode === 'vlan') {
            customer = ident(value('vlanName'), 'VLAN name');
            const vlanId = +value('vlanId');
            if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) fail('VLAN ID must be 1–4094');
            if ([lanInterface, physicalWan, wanClientName, wanVlan].includes(customer)) fail('VLAN name conflicts with another interface');
            lines.push('/interface vlan', 'add name=' + customer + ' interface=' + lanInterface + ' vlan-id=' + vlanId);
        }

        if (customer === wanClientName) fail('PPPoE WAN name must differ from customer interface');
        const extraVlans = rows('extraVlans', 3, 3).map(([name, id, parent]) => ({ name: ident(name, 'VLAN name'), id: Number(id), parent: ident(parent, 'VLAN parent') }));
        const createdNames = [customer, physicalWan, lanInterface, wanVlan, wanClientName].filter(Boolean);
        if (mode === 'bridge' && value('bridgeExtra')) createdNames.push(...value('bridgeExtra').split(',').map(port => port.trim()));
        for (const vlan of extraVlans) {
            if (!Number.isInteger(vlan.id) || vlan.id < 1 || vlan.id > 4094) fail('VLAN ID must be 1–4094');
            if (createdNames.includes(vlan.name)) fail('Duplicate interface name: ' + vlan.name);
            if ([physicalWan, wanVlan, wanClientName].includes(vlan.parent) || vlan.name === vlan.parent) fail('Customer VLAN cannot use WAN as parent');
            if (mode === 'bridge' && (vlan.parent === lanInterface || value('bridgeExtra').split(',').map(port => port.trim()).includes(vlan.parent))) fail('Use the new bridge name as VLAN parent, since customer ports become bridge members');
            if (mode === 'vlan' && vlan.parent === lanInterface && vlan.id === Number(value('vlanId'))) fail('Duplicate VLAN ID on the same parent');
            if (extraVlans.some(other => other !== vlan && other.name === vlan.parent)) fail('Additional VLAN parent must be an existing interface');
            if (extraVlans.some(other => other !== vlan && other.parent === vlan.parent && other.id === vlan.id)) fail('Duplicate VLAN ID on the same parent');
            createdNames.push(vlan.name);
            lines.push('/interface vlan', 'add name=' + vlan.name + ' interface=' + vlan.parent + ' vlan-id=' + vlan.id);
        }

        profiles = [{ name: 'pppoe_profile', pool: basePool, activePool: 'pppoe_pool' }];
        for (let [name, local] of rows('extraProfiles', 2, 2)) {
            name = ident(name, 'Profile name');
            if (profiles.some(profile => profile.name === name)) fail('Duplicate profile name: ' + name);
            const pool = calcPools(local);
            for (const existing of profiles) if (overlap(pool.active, existing.pool.active)) fail('Active profile subnets overlap: ' + name + ' and ' + existing.name);
            if (overlap(pool.active, basePool.expired)) fail('Active profile overlaps shared expired pool');
            profiles.push({ name, pool, activePool: 'pool_' + name });
        }

        const service = literal(value('service'), 'Service name');
        serversList = [{ interface: customer, profile: 'pppoe_profile', service }];
        for (let [iface, profile, serviceName] of rows('extraServers', 3, 3)) {
            iface = ident(iface, 'PPPoE server interface');
            profile = ident(profile, 'PPPoE profile');
            if (!profiles.some(item => item.name === profile)) fail('Unknown profile: ' + profile);
            if ([physicalWan, wanVlan, wanClientName].includes(iface)) fail('PPPoE server cannot use WAN interface');
            if (mode === 'bridge' && iface === lanInterface) fail('Use bridge name for the customer port in bridge mode');
            if (serversList.some(server => server.interface === iface && server.service === serviceName)) fail('Duplicate PPPoE server interface and service');
            serversList.push({ interface: iface, profile, service: literal(serviceName, 'PPPoE service') });
        }
    } else {
        if (wanClientName && (wanClientName === physicalWan || wanClientName === wanVlan)) fail('PPPoE WAN name conflicts with another interface');
        if (wanVlan && wanVlan === physicalWan) fail('WAN VLAN name conflicts with another interface');
    }

    if (wanVlan) {
        const vlanId = Number(value('wanVlanId'));
        if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) fail('WAN VLAN ID must be 1–4094');
        lines.push('# WAN VLAN', '/interface vlan', 'add name=' + wanVlan + ' interface=' + wanInterface + ' vlan-id=' + vlanId);
        wanInterface = wanVlan;
    }

    lines.push('# WAN');
    if (value('wanMode') === 'dhcp') {
        lines.push('/ip dhcp-client', 'add interface=' + wanInterface + ' disabled=no use-peer-dns=no');
    } else if (value('wanMode') === 'pppoe') {
        wanOut = wanClientName;
        const user = literal(value('wanPppoeUser'), 'PPPoE WAN username');
        const password = literal(value('wanPppoePass'), 'PPPoE WAN password');
        let command = 'add name=' + wanOut + ' interface=' + wanInterface + ' user=' + user + ' password=' + password + ' add-default-route=yes use-peer-dns=no disabled=no';
        if (value('wanPppoeService')) command += ' service-name=' + literal(value('wanPppoeService'), 'PPPoE WAN service');
        lines.push('/interface pppoe-client', command);
    } else {
        const match = value('wanAddress').match(/^([^/]+)\/(\d{1,2})$/);
        if (!match || +match[2] > 32) fail('Enter a valid WAN address/CIDR');
        const address = fmt(ip(match[1]));
        const gateway = fmt(ip(value('wanGateway')));
        lines.push('/ip address', 'add address=' + address + '/' + match[2] + ' interface=' + wanInterface, '/ip route', 'add dst-address=0.0.0.0/0 gateway=' + gateway);
    }

    if (value('wanReach') === 'private') {
        const endpoint = host(value('vpnEndpoint'), 'L2TP endpoint');
        const user = literal(value('vpnUser'), 'L2TP username');
        const password = literal(value('vpnPass'), 'L2TP password');
        let command = 'add name=l2tp-radius connect-to=' + endpoint + ' user=' + user + ' password=' + password + ' add-default-route=no disabled=no';
        if (value('vpnIpsec') === 'yes') command += ' use-ipsec=yes ipsec-secret=' + literal(value('ipsecSecret'), 'IPsec secret');
        lines.push('# RADIUS transport via L2TP', '/interface l2tp-client', command, '/ip route', 'add dst-address=' + radius + '/32 gateway=l2tp-radius comment="RADIUS through VPN"');
    }

    let hotspot = null;
    if (hotspotEnabled) {
        const iface = ident(value('hotspotInterface'), 'Hotspot interface');
        if ([physicalWan, wanVlan, wanClientName, wanInterface].filter(Boolean).includes(iface)) fail('Hotspot interface cannot be the WAN interface');
        if (pppoeEnabled && mode === 'bridge') {
            const bridgePorts = [lanInterface, ...(value('bridgeExtra') ? value('bridgeExtra').split(',').map(port => port.trim()) : [])];
            if (bridgePorts.includes(iface)) fail('Hotspot cannot run on a bridge member port; select the bridge interface instead');
        }
        const pool = calcHotspotSubnet(value('hotspotSubnet'));
        for (const profile of profiles) if (overlap(pool.active, profile.pool.active)) fail('Hotspot subnet overlaps PPPoE profile subnet: ' + profile.name);
        if (basePool && overlap(pool.active, basePool.expired)) fail('Hotspot subnet overlaps the reserved expired-user subnet');
        if (value('wanMode') === 'static') {
            const match = value('wanAddress').match(/^([^/]+)\/(\d{1,2})$/);
            if (match && +match[2] <= 32) {
                const bits = +match[2];
                const size = 2 ** (32 - bits);
                const address = ip(match[1]);
                if (overlap(pool.active, { net: Math.floor(address / size) * size, size })) fail('Hotspot subnet overlaps the static WAN subnet');
            }
        }
        hotspot = {
            iface,
            pool,
            dnsName: host(value('hotspotDnsName'), 'Hotspot DNS name'),
            htmlDirectory: literal(value('hotspotHtmlDirectory'), 'Hotspot HTML directory'),
            profile: ident(value('hotspotProfileName'), 'Hotspot profile name'),
            server: ident(value('hotspotServerName'), 'Hotspot server name'),
            dhcpPool: ident(value('hotspotPoolName'), 'DHCP pool name'),
            dhcp: ident(value('hotspotDhcpName'), 'DHCP server name')
        };
    }

    if (pppoeEnabled) {
        lines.push('# PPPoE - RADIUS may override profile addresses with its own attributes', '/ip pool');
        for (const profile of profiles) lines.push('add name=' + profile.activePool + ' ranges=' + fmt(profile.pool.start) + '-' + fmt(profile.pool.active.last - 1));
        lines.push('add name=expired_pool ranges=' + fmt(basePool.expStart) + '-' + fmt(basePool.expEnd), '/ppp profile');
        for (const profile of profiles) lines.push('add name=' + profile.name + ' local-address=' + fmt(profile.pool.active.addr) + ' remote-address=' + profile.activePool);
        lines.push('/interface pppoe-server server');
        for (const server of serversList) lines.push('add interface=' + server.interface + ' service-name=' + server.service + ' default-profile=' + server.profile + ' authentication=pap max-mtu=1480 max-mru=1480 disabled=no');
        if ($('bindIp').checked) lines.push('/ip address', 'add address=' + fmt(basePool.active.addr) + '/' + basePool.active.bits + ' interface=' + customer);
    }

    if (hotspot) {
        const gateway = fmt(hotspot.pool.active.addr);
        const network = fmt(hotspot.pool.active.net) + '/' + hotspot.pool.active.bits;
        lines.push(
            '# Hotspot - IP address, DHCP and Hotspot server share one interface',
            '/ip address',
            'add address=' + gateway + '/' + hotspot.pool.active.bits + ' network=' + fmt(hotspot.pool.active.net) + ' interface=' + hotspot.iface,
            '/ip pool',
            'add name=' + hotspot.dhcpPool + ' ranges=' + fmt(hotspot.pool.start) + '-' + fmt(hotspot.pool.end),
            '/ip dhcp-server',
            'add name=' + hotspot.dhcp + ' interface=' + hotspot.iface + ' address-pool=' + hotspot.dhcpPool + ' disabled=no',
            '/ip dhcp-server network',
            'add address=' + network + ' gateway=' + gateway + ' dns-server=' + gateway,
            '# Restrict router DNS access to trusted LANs in the input firewall',
            '/ip dns',
            'set allow-remote-requests=yes',
            '/ip hotspot profile',
            'add name=' + hotspot.profile + ' dns-name=' + hotspot.dnsName + ' html-directory=' + hotspot.htmlDirectory + ' login-by=cookie,http-chap,http-pap use-radius=yes',
            '/ip hotspot',
            'add name=' + hotspot.server + ' interface=' + hotspot.iface + ' profile=' + hotspot.profile + ' disabled=no'
        );
    }

    const authPort = +value('authPort');
    const acctPort = +value('acctPort');
    if (!Number.isInteger(authPort) || authPort < 1 || authPort > 65535 || !Number.isInteger(acctPort) || acctPort < 1 || acctPort > 65535) fail('RADIUS ports must be 1–65535');
    const radiusServices = [pppoeEnabled ? 'ppp' : '', hotspotEnabled ? 'hotspot' : ''].filter(Boolean).join(',');
    lines.push('# RADIUS');
    if (pppoeEnabled) lines.push('/ppp aaa', 'set use-radius=yes accounting=yes');
    lines.push('/radius', 'add service=' + radiusServices + ' address=' + radius + ' secret=' + secret + ' require-message-auth=no authentication-port=' + authPort + ' accounting-port=' + acctPort + ' timeout=3s');
    if ($('coa').checked) lines.push('# Restrict UDP 1700 from the RADIUS source in input firewall before enabling', '/radius incoming', 'set accept=yes');

    lines.push(hotspotEnabled ? '# NAT only enabled customer services' : '# NAT only active customers', '/ip firewall nat');
    for (const profile of profiles) lines.push('add chain=srcnat src-address=' + fmt(profile.pool.active.net) + '/' + profile.pool.active.bits + ' out-interface=' + wanOut + ' action=masquerade comment="active ' + profile.name + '"');
    if (hotspot) lines.push('add chain=srcnat src-address=' + fmt(hotspot.pool.active.net) + '/' + hotspot.pool.active.bits + ' out-interface=' + wanOut + ' action=masquerade comment="Hotspot clients"');
    if (pppoeEnabled && $('blockExpired').checked) lines.push('# Place this ahead of any broad forward accept rules', '/ip firewall filter', 'add chain=forward src-address=' + fmt(basePool.expired.net) + '/' + basePool.expired.bits + ' action=drop comment="expired PPPoE users"');

    lines.push('# Verification (run separately after import)');
    if (pppoeEnabled) lines.push('# /interface pppoe-server server print detail', '# /ppp active print detail');
    if (hotspotEnabled) lines.push('# /ip hotspot print detail', '# /ip dhcp-server lease print');
    if (pppoeEnabled && !hotspotEnabled) lines.push('# /radius monitor [find where service=ppp]');
    else lines.push('# /radius print detail (verify service=' + radiusServices + ')');
    lines.push('# /ip route print detail where dst-address=' + radius + '/32', '# /ip pool used print');

    const summary = [];
    if (pppoeEnabled) {
        summary.push(...profiles.map(profile => profile.name + ': active ' + fmt(profile.pool.start) + '–' + fmt(profile.pool.active.last - 1)));
        summary.push('Shared expired: ' + fmt(basePool.expStart) + '–' + fmt(basePool.expEnd) + ' (' + fmt(basePool.expired.net) + '/' + basePool.expired.bits + ')');
        summary.push(serversList.length + ' PPPoE server(s)');
    }
    if (hotspot) summary.push('Hotspot: ' + fmt(hotspot.pool.active.addr) + '/' + hotspot.pool.active.bits + ' on ' + hotspot.iface + '; DHCP ' + fmt(hotspot.pool.start) + '–' + fmt(hotspot.pool.end));
    summary.push('RADIUS path: ' + (value('wanReach') === 'private' ? 'L2TP' : 'direct'));

    generated = lines.join('\n') + '\n';
    $('output').textContent = generated;
    $('summary').textContent = summary.join('\n');
    $('error').textContent = '';
    $('copy').disabled = $('download').disabled = false;
}

$('generate').onclick = () => {
    try {
        generate();
    } catch (error) {
        generated = '';
        $('error').textContent = error.message;
        $('output').textContent = 'Fix the highlighted issue and generate again.';
        $('summary').textContent = '';
        $('copy').disabled = $('download').disabled = true;
    }
};

$('copy').onclick = async () => {
    await navigator.clipboard.writeText(generated);
    $('copy').textContent = 'Copied';
    setTimeout(() => $('copy').textContent = 'Copy', 1500);
};

$('download').onclick = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([generated], { type: 'text/plain' }));
    link.download = 'pppoe-radius.rsc';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

toggle();
togglePppoe();
toggleHotspot();
