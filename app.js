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
    $('radiusField').classList.toggle('hidden', selected !== 'custom');
    $('vpnEndpointField').classList.toggle('hidden', selected !== 'custom');
    $('radiusIp').readOnly = !!server;
    $('vpnEndpoint').readOnly = !!server;
    $('vpnAutofill').classList.toggle('hidden', !server);

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
    updateChoiceControls();
    updateLiveSummary();
}

function togglePppoe() {
    const enabled = $('enablePppoe').checked;
    $('pppoeFields').classList.toggle('is-collapsed', !enabled);
    $('advanced').classList.toggle('is-collapsed', !enabled);
    updateServiceStatus('pppoeStatus', enabled);
    preview();
    updateLiveSummary();
}

function toggleHotspot() {
    const enabled = $('enableHotspot').checked;
    $('hotspotFields').classList.toggle('is-collapsed', !enabled);
    updateServiceStatus('hotspotStatus', enabled);
    hotspotPreview();
    updateLiveSummary();
}

function toggleIpBased() {
    const enabled = $('enableIpBased').checked;
    $('ipBasedFields').classList.toggle('is-collapsed', !enabled);
    updateServiceStatus('ipBasedStatus', enabled);
    ipBasedPreview();
    updateLiveSummary();
}

function toggleRouterUser() {
    const enabled = $('enableRouterUser').checked;
    $('routerUserFields').classList.toggle('is-collapsed', !enabled);
    updateServiceStatus('routerUserStatus', enabled);
}

function toggleRadius() {
    const enabled = $('enableRadius').checked;
    $('radiusConfig').classList.toggle('is-collapsed', !enabled);
    $('wanReachField').classList.toggle('hidden', !enabled);
    updateServiceStatus('radiusStatus', enabled);
    updateLiveSummary();
}

['wanMode', 'wanReach', 'lanMode', 'vpnIpsec'].forEach(id => $(id).addEventListener('change', toggle));
$('publicServer').addEventListener('change', () => {
    $('radiusIp').value = '';
    $('vpnEndpoint').value = '';
    toggle();
});
$('enablePppoe').addEventListener('change', togglePppoe);
$('enableHotspot').addEventListener('change', toggleHotspot);
$('enableIpBased').addEventListener('change', toggleIpBased);
$('enableRouterUser').addEventListener('change', toggleRouterUser);
$('enableRadius').addEventListener('change', toggleRadius);
$('lanAddress').addEventListener('input', preview);
$('hotspotSubnet').addEventListener('input', hotspotPreview);
$('ipBasedSubnet').addEventListener('input', ipBasedPreview);

function validateVlanId(id, label) {
    const input = $(id);
    const entered = input.value.trim();
    const message = entered && (!/^\d+$/.test(entered) || +entered < 1 || +entered > 4094)
        ? label + ' must be from 1 to 4094. VLAN IDs 0 and 4095 are reserved.'
        : '';
    input.setCustomValidity(message);
    input.classList.toggle('input-error', Boolean(message));
    $(id + 'Error').textContent = message;
}

[['wanVlanId', 'WAN VLAN ID'], ['vlanId', 'VLAN ID']].forEach(([id, label]) => {
    $(id).addEventListener('input', () => validateVlanId(id, label));
});

function updateServiceStatus(id, enabled) {
    const badge = $(id);
    badge.textContent = enabled ? 'Enabled' : 'Disabled';
    badge.classList.toggle('is-disabled', !enabled);
}

function safeRange(subnet, kind) {
    try {
        const range = kind === 'pppoe' ? calcPools(subnet) : calcHotspotSubnet(subnet);
        return kind === 'pppoe'
            ? fmt(range.active.addr) + ' | ' + fmt(range.start) + '-' + fmt(range.active.last - 1)
            : fmt(range.active.addr) + ' | ' + fmt(range.start) + '-' + fmt(range.end);
    } catch {
        return 'Check subnet';
    }
}

function updateLiveSummary() {
    const wanModes = { dhcp: 'DHCP', static: 'Static IP', pppoe: 'PPPoE client' };
    const selected = value('publicServer');
    const server = servers[selected];
    const wanVlan = value('wanVlanId') ? ' via ' + value('wanVlanName') : '';
    const enabledServices = [
        $('enablePppoe').checked ? 'PPPoE' : '',
        $('enableHotspot').checked ? 'Hotspot' : '',
        $('enableIpBased').checked ? 'Static IP + MAC' : ''
    ].filter(Boolean).join(', ') || 'None enabled';
    const pppoe = $('enablePppoe').checked ? safeRange(value('lanAddress'), 'pppoe') : 'Disabled';
    const hotspot = $('enableHotspot').checked ? safeRange(value('hotspotSubnet'), 'hotspot') : 'Disabled';
    const ipBased = $('enableIpBased').checked ? safeRange(value('ipBasedSubnet'), 'hotspot') : 'Disabled';
    const reach = value('wanReach') === 'private' ? 'VPN / L2TP' : 'Public IP';
    const radius = value('radiusIp') || 'Select a server';

    const extraWanCount = value('extraWans').split(/\r?\n/).filter(Boolean).length;
    $('summaryWan').textContent = (wanModes[value('wanMode')] || 'WAN') + ' on ' + value('wanInterface') + wanVlan + (extraWanCount ? ' + ' + extraWanCount + ' failover WAN' + (extraWanCount > 1 ? 's' : '') : '');
    $('summaryServices').textContent = enabledServices;
    $('summaryPppoe').textContent = pppoe;
    $('summaryHotspot').textContent = hotspot;
    $('summaryIpBased').textContent = ipBased;
    $('summaryRadius').textContent = $('enableRadius').checked
        ? (server ? selected.toUpperCase() : selected === 'custom' ? 'Custom' : 'No server') + ' | ' + reach + ' | ' + radius
        : 'Disabled';
    $('ipQuickGateway').textContent = safeRange(value('ipBasedSubnet'), 'hotspot').split(' | ')[0];
    $('ipQuickRange').textContent = safeRange(value('ipBasedSubnet'), 'hotspot').split(' | ')[1] || 'Check subnet';
    $('ipQuickInterface').textContent = value('ipBasedInterface') || 'Not configured';
    $('ipQuickPool').textContent = value('ipBasedPoolName') || 'Not configured';
}

function updateChoiceControls() {
    if (!document.querySelectorAll) return;
    document.querySelectorAll('[data-reach]').forEach(button => {
        const selected = button.dataset.reach === value('wanReach');
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-server]').forEach(button => {
        const selected = button.dataset.server === value('publicServer');
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
}

const liveSummaryInputs = [
    'wanInterface', 'wanMode', 'wanVlanId', 'wanVlanName', 'lanAddress', 'hotspotSubnet', 'ipBasedSubnet',
    'ipBasedInterface', 'ipBasedPoolName', 'publicServer', 'radiusIp', 'wanReach', 'extraWans'
];
liveSummaryInputs.forEach(id => $(id).addEventListener('input', updateLiveSummary));

function clearInputError(input) {
    if (!input || !input.parentElement) return;
    input.removeAttribute('aria-invalid');
    input.classList.remove('input-error');
    const message = input.parentElement.querySelector('.input-validation-error');
    if (message) message.remove();
}

function clearAllInputErrors() {
    if (!document.querySelectorAll) return;
    document.querySelectorAll('[aria-invalid="true"]').forEach(clearInputError);
}

function errorField(message) {
    const mappings = [
        [/L2TP username/i, 'vpnUser'], [/L2TP password/i, 'vpnPass'], [/IPsec secret/i, 'ipsecSecret'],
        [/L2TP endpoint/i, 'vpnEndpoint'], [/RADIUS secret/i, 'radiusSecret'], [/RADIUS.*port/i, 'authPort'],
        [/RouterOS user name/i, 'routerUserName'], [/RouterOS user password/i, 'routerUserPassword'], [/RouterOS user group/i, 'routerUserGroup'],
        [/WAN addressing/i, 'wanMode'], [/Additional WAN/i, 'extraWans'], [/WAN distance/i, 'wanDistance'], [/RADIUS path/i, 'wanReach'], [/WAN VLAN/i, 'wanVlanId'], [/VLAN ID/i, 'vlanId'], [/WAN address|WAN gateway/i, 'wanAddress'],
        [/Hotspot.*interface/i, 'hotspotInterface'], [/Hotspot.*subnet|Hotspot subnet/i, 'hotspotSubnet'],
        [/IP-based.*interface|different interfaces/i, 'ipBasedInterface'], [/IP-based.*subnet|IP-based subnet/i, 'ipBasedSubnet'],
        [/Customer interface/i, 'lanInterface'], [/PPPoE.*subnet|Active subnet|expired-user/i, 'lanAddress'],
        [/profile/i, 'extraProfiles'], [/PPPoE server/i, 'extraServers'], [/VLAN/i, 'extraVlans'],
        [/RADIUS address|IPv4 address/i, 'radiusIp']
    ];
    const match = mappings.find(([pattern]) => pattern.test(message));
    return match && match[1];
}

function errorFields(message) {
    if (/cannot both use interface/i.test(message)) return ['hotspotInterface', 'ipBasedInterface'];
    const field = errorField(message);
    return field ? [field] : [];
}

function showInputError(id, message, focus = true) {
    const input = $(id);
    if (!input || !input.parentElement || !document.createElement) return;
    clearInputError(input);
    input.setAttribute('aria-invalid', 'true');
    input.classList.add('input-error');
    const detail = document.createElement('small');
    detail.className = 'input-validation-error';
    detail.textContent = message;
    input.parentElement.append(detail);
    if (focus && typeof input.scrollIntoView === 'function') input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (focus && typeof input.focus === 'function') input.focus({ preventScroll: true });
}

function clearEditedInputError(event) {
    clearInputError(event.target);
    updateLiveSummary();
}

if (document.querySelectorAll) {
    document.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('input', clearEditedInputError);
        input.addEventListener('change', clearEditedInputError);
    });
}

function fail(message) { throw Error(message) }

function ip(address) {
    const parts = address.split('.');
    if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || +part > 255)) fail('Enter a valid IPv4 address, such as 192.168.1.1.');
    return parts.reduce((number, part) => (number * 256 + Number(part)) >>> 0, 0);
}

function fmt(number) { return [24, 16, 8, 0].map(bit => (number >>> bit) & 255).join('.') }

function cidr(input) {
    const match = /^([^/]+)\/(\d{1,2})$/.exec(input);
    if (!match) fail('Enter a customer subnet in IP/CIDR format, such as 192.168.10.0/24.');
    const bits = +match[2];
    if (bits < 16 || bits > 30) fail('Use a customer subnet prefix from /16 to /30.');
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
    if (!privateRange(active.net, active.size)) fail('Choose a private PPPoE subnet, for example 192.168.2.0/24.');
    const start = active.net + 2;
    if (start >= active.last) fail('This PPPoE subnet is too small. Use a larger subnet with room for the router and at least one client.');
    active.addr = active.net + 1;

    const anchor = ip('1.1.1.0');
    const net = Math.floor(anchor / active.size) * active.size;
    const expired = { net, size: active.size, bits: active.bits, last: net + active.size - 1 };
    if (overlap(active, expired)) fail('Choose a PPPoE subnet outside the reserved expired-user range.');

    return { active, expired, start, expStart: expired.net + 2, expEnd: expired.last - 1 };
}

function calcHotspotSubnet(subnet) {
    const active = cidr(subnet);
    const start = active.net + 2;
    const end = active.last - 1;
    if (start > end) fail('This Hotspot subnet is too small. Use a larger subnet with room for the gateway and at least one client.');
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

const editorConfigs = {
    extraWans: {
        fields: [
            { label: 'Interface', placeholder: 'ether5' },
            { label: 'Method', options: ['dhcp', 'static', 'pppoe'] },
            { label: 'Route distance', placeholder: '2' },
            { label: 'Static IP / CIDR', placeholder: '203.0.113.2/30', showFor: 'static' },
            { label: 'Static gateway', placeholder: '203.0.113.1', showFor: 'static' },
            { label: 'PPPoE client name', placeholder: 'pppoe-backup', showFor: 'pppoe' },
            { label: 'PPPoE username', placeholder: 'ISP username', showFor: 'pppoe' },
            { label: 'PPPoE password', type: 'password', placeholder: 'ISP password', showFor: 'pppoe' },
            { label: 'PPPoE service', placeholder: 'Any service', showFor: 'pppoe' }
        ]
    },
    extraVlans: {
        labels: ['VLAN name', 'VLAN ID', 'Parent interface'],
        placeholders: ['vlan-pppoe-200', '200', 'ether2']
    },
    extraProfiles: {
        labels: ['Profile name', 'Subnet / CIDR'],
        placeholders: ['business', '192.168.10.0/24']
    },
    extraServers: {
        labels: ['Interface', 'Profile name', 'Service name'],
        placeholders: ['vlan-pppoe-200', 'business', 'service200']
    }
};

function editorRows(id) {
    return value(id).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
        const parts = line.split(',').map(part => part.trim());
        return id === 'extraWans' && parts[1]?.toLowerCase() === 'pppoe' && parts.length <= 7
            ? [...parts.slice(0, 3), '', '', ...parts.slice(3)]
            : parts;
    });
}

function syncEditor(id) {
    const container = $(id + 'Rows');
    const values = [...container.querySelectorAll('.repeatable-row')]
        .map(row => [...row.querySelectorAll('[data-editor-field]')].map(input => input.value.trim()))
        .filter(parts => parts.some(Boolean));
    $(id).value = values.map(parts => parts.join(',')).join('\n');
}

function updateEditorRow(id, row) {
    if (id !== 'extraWans') return;
    const fields = [...row.querySelectorAll('[data-editor-field]')];
    const mode = fields[1].value;
    row.classList.toggle('is-pppoe', mode === 'pppoe');
    const visible = [...row.querySelectorAll('[data-show-for]')].filter(field => {
        const show = field.dataset.showFor === mode;
        field.classList.toggle('hidden', !show);
        return show;
    }).length + 3;
    row.style.setProperty('--fields', mode === 'pppoe' ? 3 : visible);
}

function addEditorRow(id, values = []) {
    const config = editorConfigs[id];
    const container = $(id + 'Rows');
    const row = document.createElement('div');
    const fields = config.fields || config.labels.map((label, index) => ({ label, placeholder: config.placeholders[index] }));
    row.className = 'repeatable-row';
    row.style.setProperty('--fields', fields.length);
    fields.forEach((definition, index) => {
        const field = document.createElement('div');
        const fieldLabel = document.createElement('label');
        const input = document.createElement(definition.options ? 'select' : 'input');
        fieldLabel.textContent = definition.label;
        if (definition.options) definition.options.forEach(optionValue => {
            const option = document.createElement('option');
            option.value = option.textContent = optionValue;
            input.append(option);
        });
        else {
            input.type = definition.type || 'text';
            input.placeholder = definition.placeholder;
        }
        input.value = values[index] || (definition.options ? definition.options[0] : '');
        input.dataset.editorField = String(index);
        field.dataset.editorIndex = String(index);
        if (definition.showFor) field.dataset.showFor = definition.showFor;
        input.addEventListener('input', () => {
            updateEditorRow(id, row);
            syncEditor(id);
        });
        input.addEventListener('change', () => {
            updateEditorRow(id, row);
            syncEditor(id);
        });
        field.append(fieldLabel, input);
        row.append(field);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-row';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Remove row');
    remove.title = 'Remove row';
    remove.addEventListener('click', () => {
        row.remove();
        syncEditor(id);
    });
    row.append(remove);
    container.append(row);
    updateEditorRow(id, row);
}

function renderEditor(id) {
    const container = $(id + 'Rows');
    container.textContent = '';
    const values = editorRows(id);
    (values.length ? values : [[]]).forEach(parts => addEditorRow(id, parts));
}

function initEditors() {
    if (!document.querySelectorAll) return;
    Object.keys(editorConfigs).forEach(id => {
        renderEditor(id);
        $(id).addEventListener('input', () => renderEditor(id));
    });
    document.querySelectorAll('[data-add-row]').forEach(button => {
        button.addEventListener('click', () => addEditorRow(button.dataset.addRow));
    });
}

function ident(input, name) {
    if (!input) fail(name + ' is required. Enter a name and try again.');
    if (!/^[A-Za-z0-9_.-]{1,48}$/.test(input)) fail(name + ' can use only letters, numbers, periods, hyphens, and underscores.');
    return input;
}

function routeDistance(input, name) {
    if (!/^\d+$/.test(input) || +input < 1 || +input > 255) fail(name + ' must be a whole number from 1 to 255.');
    return +input;
}

function staticWan(addressInput, gatewayInput, label) {
    const match = addressInput.match(/^([^/]+)\/(\d{1,2})$/);
    if (!match || +match[2] > 32) fail('Enter the ' + label + ' address in IP/CIDR format, such as 203.0.113.2/30.');
    const addressNumber = ip(match[1]);
    const bits = +match[2];
    const size = 2 ** (32 - bits);
    return {
        address: fmt(addressNumber),
        bits,
        gateway: fmt(ip(gatewayInput)),
        network: { net: Math.floor(addressNumber / size) * size, size }
    };
}

function additionalWans() {
    return value('extraWans').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
        const parts = line.split(',').map(part => part.trim());
        if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) fail('Additional WAN line ' + (index + 1) + ' needs an interface, method, and route distance.');
        const iface = ident(parts[0], 'Additional WAN interface');
        const mode = parts[1].toLowerCase();
        const distance = routeDistance(parts[2], 'Additional WAN distance');
        if (mode === 'dhcp') return { iface, mode, distance, out: iface };
        if (mode === 'static') {
            if (!parts[3] || !parts[4]) fail('Additional WAN static IP and gateway are required.');
            return { iface, mode, distance, out: iface, static: staticWan(parts[3], parts[4], 'Additional WAN') };
        }
        if (mode === 'pppoe') {
            const packed = parts.length <= 7;
            const [name, user, password, service] = packed ? parts.slice(3, 7) : parts.slice(5, 9);
            return {
                iface,
                mode,
                distance,
                out: ident(name || 'pppoe-' + iface, 'Additional WAN PPPoE client name'),
                user: literal(user, 'Additional WAN PPPoE username'),
                password: literal(password, 'Additional WAN PPPoE password'),
                service: service ? literal(service, 'Additional WAN PPPoE service') : ''
            };
        }
        fail('Additional WAN method must be DHCP, Static, or PPPoE.');
    });
}

function literal(input, name) {
    if (!input) fail(name + ' is required. Enter a value and try again.');
    if (/[\r\n"\\]/.test(input)) fail(name + ' cannot include quotes, backslashes, or line breaks.');
    return '"' + input + '"';
}

function l2tpCredential(input, name) {
    if (!input) fail('Enter the ' + name + ' to connect to private RADIUS through L2TP.');
    if (/[\r\n"\\]/.test(input)) fail(name + ' cannot include quotes, backslashes, or new lines.');
    return '"' + input + '"';
}

function host(input, name) {
    if (!input) fail(name + ' is required. Enter an IP address or hostname.');
    if (!/^[-a-zA-Z0-9.]+$/.test(input)) fail(name + ' must be an IP address or hostname without spaces.');
    return input;
}

function dnsServerList(input) {
    const addresses = input.split(',').map(address => address.trim()).filter(Boolean);
    if (!addresses.length || addresses.length > 4) fail('Enter one to four comma-separated router DNS servers.');
    return addresses.map(address => fmt(ip(address))).join(',');
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

function ipBasedPreview() {
    if (!$('enableIpBased').checked) {
        $('ipBasedPreview').textContent = '';
        return;
    }
    try {
        const { active, start, end } = calcHotspotSubnet(value('ipBasedSubnet'));
        $('ipBasedPreview').textContent = 'Gateway: ' + fmt(active.addr) + ' | Static range: ' + fmt(start) + '–' + fmt(end) + ' | MAC RADIUS login';
    } catch (error) {
        $('ipBasedPreview').textContent = error.message;
    }
}

function generate() {
    const pppoeEnabled = $('enablePppoe').checked;
    const hotspotEnabled = $('enableHotspot').checked;
    const ipBasedEnabled = $('enableIpBased').checked;
    const radiusEnabled = $('enableRadius').checked;
    const radiusSetting = radiusEnabled ? 'yes' : 'no';
    if (!pppoeEnabled && !hotspotEnabled && !ipBasedEnabled) fail('Enable PPPoE, Hotspot, IP-based access, or a combination.');
    if (!['dhcp', 'static', 'pppoe'].includes(value('wanMode'))) fail('Select a WAN addressing method before generating the script.');
    if (radiusEnabled && !['public', 'private'].includes(value('wanReach'))) fail('Select the Public IP or VPN / L2TP RADIUS path before generating the script.');

    const lines = [
        '# RouterOS 7 - review names, addressing, RADIUS route and firewall ordering before import',
        '# Use Safe Mode for remote changes. Export and back up the router first.'
    ];
    let wanInterface = ident(value('wanInterface'), 'WAN interface');
    const physicalWan = wanInterface;
    let wanOut = wanInterface;
    const wanDistance = routeDistance(value('wanDistance'), 'Primary WAN distance');
    const extraWans = additionalWans();
    const physicalWans = [physicalWan, ...extraWans.map(wan => wan.iface)];
    if (new Set(physicalWans).size !== physicalWans.length) fail('Each WAN interface must be unique.');
    const wanClientName = value('wanMode') === 'pppoe' ? ident(value('wanPppoeName'), 'PPPoE WAN name') : '';
    const wanVlan = value('wanVlanId') ? ident(value('wanVlanName'), 'WAN VLAN name') : '';
    const wanNames = [...physicalWans, wanClientName, wanVlan, ...extraWans.filter(wan => wan.mode === 'pppoe').map(wan => wan.out)].filter(Boolean);
    if (new Set(wanNames).size !== wanNames.length) fail('WAN interface and PPPoE client names must be unique.');
    const staticWanNetworks = extraWans.filter(wan => wan.mode === 'static').map(wan => wan.static.network);
    const selected = value('publicServer');
    if (radiusEnabled && !selected) fail('Select PR3S1, PR3S2, PR3S3, or Custom');
    const radius = radiusEnabled ? fmt(ip(value('radiusIp'))) : '';
    const secret = radiusEnabled ? literal(value('radiusSecret'), 'RADIUS secret') : '';

    let customer = '';
    let lanInterface = '';
    let mode = '';
    let basePool = null;
    let profiles = [];
    let serversList = [];

    if (pppoeEnabled) {
        lanInterface = ident(value('lanInterface'), 'Customer interface');
        if (wanNames.includes(lanInterface)) fail('WAN and customer interfaces must differ');
        mode = value('lanMode');
        customer = lanInterface;
        basePool = calcPools(value('lanAddress'));

        if (mode === 'bridge') {
            customer = ident(value('bridgeName'), 'Bridge name');
            const extra = value('bridgeExtra') ? value('bridgeExtra').split(',').map(port => ident(port.trim(), 'Bridge port')) : [];
            const ports = [lanInterface, ...extra];
            if (new Set(ports).size !== ports.length) fail('Bridge ports must be unique');
            if (ports.some(port => wanNames.includes(port))) fail('WAN interface cannot be a customer bridge port');
            if (wanNames.includes(customer) || ports.includes(customer)) fail('Bridge name conflicts with another interface');
            lines.push('/interface bridge', 'add name=' + customer, '/interface bridge port', ...ports.map(port => 'add bridge=' + customer + ' interface=' + port));
        }

        if (mode === 'vlan') {
            customer = ident(value('vlanName'), 'VLAN name');
            const vlanId = +value('vlanId');
            if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) fail('Use a VLAN ID from 1 to 4094. VLAN IDs 0 and 4095 are reserved.');
            if ([lanInterface, ...wanNames].includes(customer)) fail('VLAN name conflicts with another interface');
            lines.push('/interface vlan', 'add name=' + customer + ' interface=' + lanInterface + ' vlan-id=' + vlanId);
        }

        if (customer === wanClientName) fail('PPPoE WAN name must differ from customer interface');
        const extraVlans = rows('extraVlans', 3, 3).map(([name, id, parent]) => ({ name: ident(name, 'VLAN name'), id: Number(id), parent: ident(parent, 'VLAN parent') }));
        const createdNames = [customer, ...wanNames, lanInterface].filter(Boolean);
        if (mode === 'bridge' && value('bridgeExtra')) createdNames.push(...value('bridgeExtra').split(',').map(port => port.trim()));
        for (const vlan of extraVlans) {
            if (!Number.isInteger(vlan.id) || vlan.id < 1 || vlan.id > 4094) fail('Use a VLAN ID from 1 to 4094. VLAN IDs 0 and 4095 are reserved.');
            if (createdNames.includes(vlan.name)) fail('Duplicate interface name: ' + vlan.name);
            if (wanNames.includes(vlan.parent) || vlan.name === vlan.parent) fail('Customer VLAN cannot use WAN as parent');
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
            if (wanNames.includes(iface)) fail('PPPoE server cannot use WAN interface');
            if (mode === 'bridge' && iface === lanInterface) fail('Use bridge name for the customer port in bridge mode');
            if (serversList.some(server => server.interface === iface && server.service === serviceName)) fail('Duplicate PPPoE server interface and service');
            serversList.push({ interface: iface, profile, service: literal(serviceName, 'PPPoE service') });
        }
    }

    if (wanVlan) {
        const vlanId = Number(value('wanVlanId'));
        if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) fail('Use a WAN VLAN ID from 1 to 4094. VLAN IDs 0 and 4095 are reserved.');
        lines.push('# WAN VLAN', '/interface vlan', 'add name=' + wanVlan + ' interface=' + wanInterface + ' vlan-id=' + vlanId);
        wanInterface = wanVlan;
    }

    lines.push('# WAN');
    if (value('wanMode') === 'dhcp') {
        lines.push('/ip dhcp-client', 'add interface=' + wanInterface + ' disabled=no use-peer-dns=no add-default-route=yes default-route-distance=' + wanDistance);
    } else if (value('wanMode') === 'pppoe') {
        wanOut = wanClientName;
        const user = literal(value('wanPppoeUser'), 'PPPoE WAN username');
        const password = literal(value('wanPppoePass'), 'PPPoE WAN password');
        let command = 'add name=' + wanOut + ' interface=' + wanInterface + ' user=' + user + ' password=' + password + ' add-default-route=yes default-route-distance=' + wanDistance + ' use-peer-dns=no disabled=no';
        if (value('wanPppoeService')) command += ' service-name=' + literal(value('wanPppoeService'), 'PPPoE WAN service');
        lines.push('/interface pppoe-client', command);
    } else {
        const configuredWan = staticWan(value('wanAddress'), value('wanGateway'), 'WAN');
        staticWanNetworks.push(configuredWan.network);
        lines.push('/ip address', 'add address=' + configuredWan.address + '/' + configuredWan.bits + ' interface=' + wanInterface, '/ip route', 'add dst-address=0.0.0.0/0 gateway=' + configuredWan.gateway + ' distance=' + wanDistance);
    }

    if (extraWans.length) {
        lines.push('# Additional WAN failover');
        for (const wan of extraWans) {
            if (wan.mode === 'dhcp') lines.push('/ip dhcp-client', 'add interface=' + wan.iface + ' disabled=no use-peer-dns=no add-default-route=yes default-route-distance=' + wan.distance);
            if (wan.mode === 'static') lines.push('/ip address', 'add address=' + wan.static.address + '/' + wan.static.bits + ' interface=' + wan.iface, '/ip route', 'add dst-address=0.0.0.0/0 gateway=' + wan.static.gateway + ' distance=' + wan.distance);
            if (wan.mode === 'pppoe') {
                let command = 'add name=' + wan.out + ' interface=' + wan.iface + ' user=' + wan.user + ' password=' + wan.password + ' add-default-route=yes default-route-distance=' + wan.distance + ' use-peer-dns=no disabled=no';
                if (wan.service) command += ' service-name=' + wan.service;
                lines.push('/interface pppoe-client', command);
            }
        }
    }

    if (radiusEnabled && value('wanReach') === 'private') {
        const endpoint = host(value('vpnEndpoint'), 'L2TP endpoint');
        const user = l2tpCredential(value('vpnUser'), 'L2TP username');
        const password = l2tpCredential(value('vpnPass'), 'L2TP password');
        let command = 'add name=l2tp-radius connect-to=' + endpoint + ' user=' + user + ' password=' + password + ' add-default-route=no disabled=no';
        if (value('vpnIpsec') === 'yes') command += ' use-ipsec=yes ipsec-secret=' + literal(value('ipsecSecret'), 'IPsec secret');
        lines.push('# RADIUS transport via L2TP', '/interface l2tp-client', command, '/ip route', 'add dst-address=' + radius + '/32 gateway=l2tp-radius comment="RADIUS through VPN"');
    }

    function validateAccessNetwork(label, iface, pool) {
        if (wanNames.includes(iface) || wanInterface === iface) fail(label + ' interface cannot be the WAN interface');
        if (pppoeEnabled && mode === 'bridge') {
            const bridgePorts = [lanInterface, ...(value('bridgeExtra') ? value('bridgeExtra').split(',').map(port => port.trim()) : [])];
            if (bridgePorts.includes(iface)) fail(label + ' cannot run on a bridge member port; select the bridge interface instead');
        }
        for (const profile of profiles) if (overlap(pool.active, profile.pool.active)) fail(label + ' subnet overlaps PPPoE profile subnet: ' + profile.name);
        if (basePool && overlap(pool.active, basePool.expired)) fail(label + ' subnet overlaps the reserved expired-user subnet');
        for (const network of staticWanNetworks) if (overlap(pool.active, network)) fail(label + ' subnet overlaps the static WAN subnet');
    }

    let hotspot = null;
    if (hotspotEnabled) {
        const iface = ident(value('hotspotInterface'), 'Hotspot interface');
        const pool = calcHotspotSubnet(value('hotspotSubnet'));
        validateAccessNetwork('Hotspot', iface, pool);
        hotspot = {
            iface,
            pool,
            dnsName: host(value('hotspotDnsName'), 'Hotspot DNS name'),
            htmlDirectory: literal(value('hotspotHtmlDirectory'), 'Hotspot HTML directory'),
            dnsServers: dnsServerList(value('hotspotDnsServers')),
            profile: ident(value('hotspotProfileName'), 'Hotspot profile name'),
            server: ident(value('hotspotServerName'), 'Hotspot server name'),
            poolName: ident(value('hotspotPoolName'), 'DHCP pool name'),
            dhcp: ident(value('hotspotDhcpName'), 'DHCP server name')
        };
    }

    let ipBased = null;
    if (ipBasedEnabled) {
        const iface = ident(value('ipBasedInterface'), 'IP-based interface');
        const pool = calcHotspotSubnet(value('ipBasedSubnet'));
        validateAccessNetwork('IP-based access', iface, pool);
        ipBased = {
            iface,
            pool,
            dnsServers: dnsServerList(value('ipBasedDnsServers')),
            profile: ident(value('ipBasedProfileName'), 'IP-based profile name'),
            server: ident(value('ipBasedServerName'), 'IP-based server name'),
            poolName: ident(value('ipBasedPoolName'), 'Static RADIUS pool name'),
            addBinding: $('ipBasedBinding').checked
        };
    }

    if (hotspot && ipBased) {
        if (hotspot.iface === ipBased.iface) fail('Hotspot and IP-based access cannot both use interface ' + hotspot.iface + '. Use a VLAN interface for either Hotspot or IP-based access, or select separate physical interfaces.');
        if (overlap(hotspot.pool.active, ipBased.pool.active)) fail('Login Hotspot and IP-based subnets overlap');
        if (hotspot.profile === ipBased.profile) fail('Login Hotspot and IP-based profile names must differ');
        if (hotspot.server === ipBased.server) fail('Login Hotspot and IP-based server names must differ');
        if (hotspot.poolName === ipBased.poolName) fail('Login Hotspot and IP-based pool names must differ');
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
            '# Login Hotspot - IP address, DHCP and Hotspot server share one interface',
            '/ip address',
            'add address=' + gateway + '/' + hotspot.pool.active.bits + ' network=' + fmt(hotspot.pool.active.net) + ' interface=' + hotspot.iface,
            '/ip pool',
            'add name=' + hotspot.poolName + ' ranges=' + fmt(hotspot.pool.start) + '-' + fmt(hotspot.pool.end),
            '/ip dhcp-server',
            'add name=' + hotspot.dhcp + ' interface=' + hotspot.iface + ' address-pool=' + hotspot.poolName + ' disabled=no',
            '/ip dhcp-server network',
            'add address=' + network + ' gateway=' + gateway + ' dns-server=' + gateway,
            '/ip hotspot profile',
            'add name=' + hotspot.profile + ' hotspot-address=' + gateway + ' dns-name=' + hotspot.dnsName + ' html-directory=' + hotspot.htmlDirectory + ' login-by=cookie,http-chap,http-pap use-radius=' + radiusSetting,
            '/ip hotspot',
            'add name=' + hotspot.server + ' interface=' + hotspot.iface + ' profile=' + hotspot.profile + ' disabled=no'
        );
    }

    if (ipBased) {
        const gateway = fmt(ipBased.pool.active.addr);
        const network = fmt(ipBased.pool.active.net) + '/' + ipBased.pool.active.bits;
        lines.push(
            '# IP-based access - static clients authenticate by MAC through RADIUS',
            '/ip address',
            'add address=' + gateway + '/' + ipBased.pool.active.bits + ' network=' + fmt(ipBased.pool.active.net) + ' interface=' + ipBased.iface,
            '/ip pool',
            'add name=' + ipBased.poolName + ' ranges=' + fmt(ipBased.pool.start) + '-' + fmt(ipBased.pool.end),
            '/ip hotspot profile',
            'add name=' + ipBased.profile + ' login-by=mac mac-auth-mode=mac-as-username-and-password use-radius=' + radiusSetting,
            '/ip hotspot',
            'add addresses-per-mac=unlimited name=' + ipBased.server + ' interface=' + ipBased.iface + ' profile=' + ipBased.profile + ' disabled=no'
        );
        if (ipBased.addBinding) lines.push('/ip hotspot ip-binding', 'add address=' + network + ' server=' + ipBased.server + ' type=regular');
    }

    if (hotspot || ipBased) {
        const dnsServers = [...new Set([hotspot?.dnsServers, ipBased?.dnsServers].filter(Boolean).flatMap(item => item.split(',')))].join(',');
        lines.push('# Restrict router DNS access to trusted LANs in the input firewall', '/ip dns', 'set allow-remote-requests=yes servers=' + dnsServers);
    }

    let radiusServices = '';
    if (radiusEnabled) {
        const authPort = +value('authPort');
        const acctPort = +value('acctPort');
        if (!Number.isInteger(authPort) || authPort < 1 || authPort > 65535 || !Number.isInteger(acctPort) || acctPort < 1 || acctPort > 65535) fail('RADIUS ports must be 1–65535');
        radiusServices = [pppoeEnabled ? 'ppp' : '', (hotspotEnabled || ipBasedEnabled) ? 'hotspot' : ''].filter(Boolean).join(',');
        lines.push('# RADIUS');
        if (pppoeEnabled) lines.push('/ppp aaa', 'set use-radius=yes accounting=yes');
        lines.push('/radius', 'add service=' + radiusServices + ' address=' + radius + ' secret=' + secret + ' require-message-auth=no authentication-port=' + authPort + ' accounting-port=' + acctPort + ' timeout=3s');
        if ($('coa').checked) lines.push('# Restrict UDP 1700 from the RADIUS source in input firewall before enabling', '/radius incoming', 'set accept=yes');
    }

    if ($('enableRouterUser').checked) {
        const name = ident(value('routerUserName'), 'RouterOS user name');
        const password = literal(value('routerUserPassword'), 'RouterOS user password');
        const group = ident(value('routerUserGroup'), 'RouterOS user group');
        const comment = value('routerUserComment') ? ' comment=' + literal(value('routerUserComment'), 'RouterOS user comment') : '';
        lines.push('# RouterOS access user', '/user add name=' + name + ' password=' + password + ' group=' + group + comment);
    }

    const masqueradeNetworks = [
        ...profiles.map(profile => ({ network: profile.pool.active, comment: 'active ' + profile.name })),
        ...(hotspot ? [{ network: hotspot.pool.active, comment: 'Hotspot clients' }] : []),
        ...(ipBased ? [{ network: ipBased.pool.active, comment: 'IP-based clients' }] : [])
    ];
    lines.push((hotspotEnabled || ipBasedEnabled) ? '# NAT only enabled customer services' : '# NAT only active customers', '/ip firewall address-list');
    for (const entry of masqueradeNetworks) lines.push('add list=masquerade_pool address=' + fmt(entry.network.net) + '/' + entry.network.bits + ' comment="' + entry.comment + '"');
    if (extraWans.length) lines.push('/interface list', 'add name=wan-uplinks comment="Generated WAN uplinks"', '/interface list member', ...[wanOut, ...extraWans.map(wan => wan.out)].map(iface => 'add list=wan-uplinks interface=' + iface));
    lines.push('/ip firewall nat', 'add chain=srcnat src-address-list=masquerade_pool ' + (extraWans.length ? 'out-interface-list=wan-uplinks' : 'out-interface=' + wanOut) + ' action=masquerade comment="customer masquerade"');
    if (pppoeEnabled && $('blockExpired').checked) lines.push('# Place this ahead of any broad forward accept rules', '/ip firewall filter', 'add chain=forward src-address=' + fmt(basePool.expired.net) + '/' + basePool.expired.bits + ' action=drop comment="expired PPPoE users"');

    lines.push('# Verification (run separately after import)');
    if (pppoeEnabled) lines.push('# /interface pppoe-server server print detail', '# /ppp active print detail');
    if (hotspotEnabled) {
        lines.push('# /ip hotspot print detail', '# /ip dhcp-server lease print');
    }
    if (ipBasedEnabled) lines.push('# /ip hotspot active print detail', '# /ip hotspot ip-binding print detail');
    if (radiusEnabled) {
        if (pppoeEnabled && !hotspotEnabled && !ipBasedEnabled) lines.push('# /radius monitor [find where service=ppp]');
        else lines.push('# /radius print detail (verify service=' + radiusServices + ')');
        lines.push('# /ip route print detail where dst-address=' + radius + '/32');
    }
    lines.push('# /ip pool used print');

    const summary = [];
    if (pppoeEnabled) {
        summary.push(...profiles.map(profile => profile.name + ': active ' + fmt(profile.pool.start) + '–' + fmt(profile.pool.active.last - 1)));
        summary.push('Shared expired: ' + fmt(basePool.expStart) + '–' + fmt(basePool.expEnd) + ' (' + fmt(basePool.expired.net) + '/' + basePool.expired.bits + ')');
        summary.push(serversList.length + ' PPPoE server(s)');
    }
    if (hotspot) summary.push('Login Hotspot: ' + fmt(hotspot.pool.active.addr) + '/' + hotspot.pool.active.bits + ' on ' + hotspot.iface + '; DHCP range ' + fmt(hotspot.pool.start) + '–' + fmt(hotspot.pool.end));
    if (ipBased) summary.push('IP-based access: ' + fmt(ipBased.pool.active.addr) + '/' + ipBased.pool.active.bits + ' on ' + ipBased.iface + '; static range ' + fmt(ipBased.pool.start) + '–' + fmt(ipBased.pool.end));
    summary.push(radiusEnabled ? 'RADIUS path: ' + (value('wanReach') === 'private' ? 'L2TP' : 'direct') : 'RADIUS: disabled');

    generated = lines.join('\n') + '\n';
    renderScript(generated);
    $('summary').textContent = summary.join('\n');
    $('error').textContent = '';
    $('clear').disabled = $('copy').disabled = $('download').disabled = false;
}

function initChoiceCards() {
    if (!document.querySelectorAll) return;
    document.querySelectorAll('[data-reach]').forEach(button => {
        button.addEventListener('click', () => {
            $('wanReach').value = button.dataset.reach;
            toggle();
        });
    });
    document.querySelectorAll('[data-server]').forEach(button => {
        button.addEventListener('click', () => {
            $('publicServer').value = button.dataset.server;
            $('radiusIp').value = '';
            $('vpnEndpoint').value = '';
            toggle();
        });
    });
}

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function highlightLine(line) {
    if (line.startsWith('#')) return '<span class="syntax-comment">' + escapeHtml(line) + '</span>';
    const path = line.match(/^(\/[^\s]+)/);
    const rest = escapeHtml(path ? line.slice(path[0].length) : line)
        .replace(/\b([A-Za-z][\w-]*)=/g, '<span class="syntax-key">$1</span>=');
    return (path ? '<span class="syntax-path">' + escapeHtml(path[0]) + '</span>' : '') + rest;
}

function renderScript(script) {
    const output = $('output');
    const empty = !script;
    output.classList.toggle('is-empty', empty);
    output.textContent = empty ? 'Your configuration will appear here.' : script;
    $('scriptState').textContent = empty ? 'Not generated' : script.trimEnd().split('\n').length + ' lines';
    if ('innerHTML' in output && !empty) {
        output.innerHTML = script.trimEnd().split('\n').map((line, index) => '<span class="code-line"><span class="line-number">' + (index + 1) + '</span>' + highlightLine(line || ' ') + '</span>').join('\n');
    }
}

function initNavigation() {
    if (!document.querySelectorAll || typeof IntersectionObserver === 'undefined') return;
    const sections = [...document.querySelectorAll('main section[id]')];
    const setActive = id => {
        const order = sections.map(section => section.id);
        const activeIndex = order.indexOf(id);
        document.querySelectorAll('[data-section]').forEach(link => {
            const index = order.indexOf(link.dataset.section);
            link.classList.toggle('is-active', link.dataset.section === id);
            link.classList.toggle('is-complete', index >= 0 && index < activeIndex);
        });
    };
    const observer = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting).sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
    }, { rootMargin: '-18% 0px -70% 0px', threshold: [0.05, 0.35] });
    sections.forEach(section => observer.observe(section));
    setActive(sections[0]?.id);
}

$('generate').onclick = () => {
    clearAllInputErrors();
    try {
        generate();
    } catch (error) {
        generated = '';
        $('error').textContent = error.message;
        errorFields(error.message).forEach((field, index) => showInputError(field, error.message, index === 0));
        renderScript('');
        $('summary').textContent = '';
        $('clear').disabled = false;
        $('copy').disabled = $('download').disabled = true;
    }
};

$('clear').onclick = () => {
    generated = '';
    clearAllInputErrors();
    $('error').textContent = '';
    $('summary').textContent = '';
    renderScript('');
    $('copy').textContent = 'Copy';
    $('clear').disabled = $('copy').disabled = $('download').disabled = true;
};

$('copy').onclick = async () => {
    await navigator.clipboard.writeText(generated);
    $('copy').textContent = 'Copied ✓';
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
toggleIpBased();
toggleRouterUser();
toggleRadius();
initChoiceCards();
initEditors();
initNavigation();
