const identifier = /^[A-Za-z0-9_.-]{1,48}$/;
const wireGuardKey = /^[A-Za-z0-9+/]{43}=$/;

function parseCidr(value) {
    const match = value.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
    if (!match) return null;
    const octets = match[1].split('.').map(Number);
    if (octets.some(octet => octet > 255)) return null;
    const bits = Number(match[2]);
    const address = octets.reduce((number, octet) => (number * 256) + octet, 0) >>> 0;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    const network = (address & mask) >>> 0;
    return { value: value.trim(), address, bits, mask, network, broadcast: (network | (~mask >>> 0)) >>> 0 };
}

function ip(number) {
    return [24, 16, 8, 0].map(shift => (number >>> shift) & 255).join('.');
}

function validate(config) {
    const errors = [];
    if (!identifier.test(config.name)) errors.push('WireGuard interface name must use only letters, numbers, dots, underscores, or hyphens.');
    const port = Number(config.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('WireGuard listen port must be from 1 to 65535.');
    const mtu = Number(config.mtu);
    if (!Number.isInteger(mtu) || mtu < 0 || mtu > 65536) errors.push('WireGuard MTU must be from 0 to 65536.');
    const server = parseCidr(config.address);
    if (!server || server.bits === 32) errors.push('Tunnel address must be a valid IPv4 subnet with room for peers, such as 192.168.100.1/24.');
    if (!config.peers.length) errors.push('Add at least one WireGuard peer.');
    const peerNetworks = [];
    config.peers.forEach((peer, index) => {
        const name = `Peer ${index + 1}`;
        if (!wireGuardKey.test(peer.publicKey)) errors.push(`${name} public key must be a valid WireGuard public key.`);
        const allowedAddresses = peer.allowedAddress.split(',').map(address => address.trim());
        if (!allowedAddresses.length || allowedAddresses.some(address => !address)) errors.push(`${name} allowed addresses must be comma-separated IPv4/CIDR values.`);
        allowedAddresses.filter(Boolean).forEach(address => {
            const allowed = parseCidr(address);
            if (!allowed) errors.push(`${name} allowed address must be IPv4/CIDR, such as 192.168.100.2/32.`);
            else {
                peerNetworks.push({ ...allowed, name });
                if (server && ((allowed.address & server.mask) >>> 0) !== server.network) errors.push(`${name} allowed address must be inside the tunnel subnet.`);
            }
        });
    });
    peerNetworks.forEach((first, index) => peerNetworks.slice(index + 1).forEach(second => {
        if (first.network <= second.broadcast && second.network <= first.broadcast) errors.push(`${first.name} and ${second.name} allowed addresses overlap.`);
    }));
    return errors;
}

function script(config) {
    const server = parseCidr(config.address);
    const lines = ['/interface wireguard', `add disabled=no name=${config.name} listen-port=${config.port} mtu=${config.mtu}`, '/ip address', `add address=${server.value} interface=${config.name}`, '/interface wireguard peers'];
    config.peers.forEach(peer => lines.push(`add interface=${config.name} public-key="${peer.publicKey}" allowed-address=${peer.allowedAddress.split(',').map(address => address.trim()).join(',')}`));
    if (config.addFirewall) lines.push('/ip firewall filter', `add action=accept chain=input comment="allow WireGuard" dst-port=${config.port} protocol=udp place-before=1`, `add action=accept chain=input comment="allow WireGuard traffic" src-address=${ip(server.network)}/${server.bits} place-before=1`);
    if (config.addNat) lines.push('/ip firewall nat', `add action=masquerade chain=srcnat src-address=${ip(server.network)}/${server.bits} comment="WireGuard peer NAT"`);
    return lines.join('\n');
}

function init() {
    const $ = id => document.getElementById(id);
    let generated = '';
    let peerNumber = 1;

    function addPeer() {
        const row = document.createElement('div');
        row.className = 'repeatable-row wireguard-peer';
        row.style.setProperty('--fields', 2);
        row.innerHTML = '<div><label>Peer public key</label><input data-peer-field="publicKey" placeholder="Paste peer public key" autocomplete="off"></div><div><label>Allowed addresses</label><input data-peer-field="allowedAddress" placeholder="192.168.100.' + (peerNumber + 1) + '/32,192.168.100.10/32" autocomplete="off"></div><button type="button" class="remove-row" aria-label="Remove peer" title="Remove peer">×</button>';
        peerNumber += 1;
        row.querySelector('.remove-row').addEventListener('click', () => row.remove());
        $('wireGuardPeerRows').append(row);
    }

    function config() {
        return {
            name: $('wireGuardName').value.trim(), port: $('wireGuardPort').value.trim(), address: $('wireGuardAddress').value.trim(), mtu: $('wireGuardMtu').value.trim(), addFirewall: $('wireGuardFirewall').checked, addNat: $('wireGuardNat').checked,
            peers: [...$('wireGuardPeerRows').querySelectorAll('.wireguard-peer')].map(row => Object.fromEntries([...row.querySelectorAll('[data-peer-field]')].map(input => [input.dataset.peerField, input.value.trim()])))
        };
    }

    function clearScript() {
        generated = '';
        $('error').textContent = '';
        $('output').textContent = 'Your WireGuard configuration will appear here.';
        $('output').classList.add('is-empty');
        $('copy').textContent = 'Copy';
        $('clear').disabled = $('copy').disabled = $('download').disabled = true;
    }

    function toggleWireGuard() {
        const enabled = $('enableWireGuard').checked;
        $('wireGuardFields').classList.toggle('is-collapsed', !enabled);
        $('wireGuardOutput').classList.toggle('hidden', !enabled);
        $('wireGuardStatus').textContent = enabled ? 'Enabled' : 'Disabled';
        $('wireGuardStatus').classList.toggle('is-disabled', !enabled);
        if (!enabled) clearScript();
    }

    function generate() {
        const settings = config();
        const errors = validate(settings);
        $('error').textContent = errors.join('\n');
        if (errors.length) return;
        generated = script(settings);
        $('output').textContent = generated;
        $('output').classList.remove('is-empty');
        $('clear').disabled = $('copy').disabled = $('download').disabled = false;
    }

    addPeer();
    $('enableWireGuard').addEventListener('change', toggleWireGuard);
    $('addWireGuardPeer').addEventListener('click', addPeer);
    $('generate').addEventListener('click', generate);
    $('clear').addEventListener('click', clearScript);
    $('copy').addEventListener('click', async () => {
        await navigator.clipboard.writeText(generated);
        $('copy').textContent = 'Copied';
        setTimeout(() => { $('copy').textContent = 'Copy'; }, 1300);
    });
    $('download').addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([generated], { type: 'text/plain' }));
        link.download = 'wireguard.rsc';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    toggleWireGuard();
}

if (typeof document !== 'undefined') init();
