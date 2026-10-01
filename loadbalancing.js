const identifier = /^[A-Za-z0-9_.-]{1,48}$/;
const gateway = /^[A-Za-z0-9.-]+$/;

function validate(wans) {
    const errors = [];
    if (wans.length < 2) errors.push('Add at least two WANs for load balancing.');
    wans.forEach((wan, index) => {
        const name = `WAN${index + 1}`;
        if (!identifier.test(wan.table)) errors.push(`${name} routing table must use only letters, numbers, dots, underscores, or hyphens.`);
        if (!identifier.test(wan.list)) errors.push(`${name} source address list must use only letters, numbers, dots, underscores, or hyphens.`);
        if (!gateway.test(wan.gateway)) errors.push(`Enter a valid ${name} gateway.`);
        const distance = Number(wan.distance);
        if (!Number.isInteger(distance) || distance < 1 || distance > 255) errors.push(`${name} main route distance must be from 1 to 255.`);
    });
    if (new Set(wans.map(wan => wan.table)).size !== wans.length) errors.push('Every routing table name must be different.');
    if (new Set(wans.map(wan => wan.list)).size !== wans.length) errors.push('Every source address list name must be different.');
    return errors;
}

function script(wans) {
    const policyRoutes = wans.map(wan => `add disabled=no distance=1 dst-address=0.0.0.0/0 gateway=${wan.gateway} routing-table=${wan.table} scope=30 target-scope=10`);
    const mainRoutes = [...wans].sort((a, b) => Number(b.distance) - Number(a.distance)).map(wan => `add disabled=no distance=${wan.distance} dst-address=0.0.0.0/0 gateway=${wan.gateway} routing-table=main scope=30 target-scope=10`);
    return ['/routing table', ...wans.map(wan => `add disabled=no fib name=${wan.table}`), '/ip firewall mangle', ...wans.map(wan => `add action=mark-routing chain=prerouting dst-address-type=!local new-routing-mark=${wan.table} src-address-list=${wan.list}`), '/ip route', ...policyRoutes, ...mainRoutes].join('\n');
}

function init() {
    const $ = id => document.getElementById(id);
    const fields = [['table', 'Routing table', 'WAN'], ['list', 'Source address list', 'WAN'], ['gateway', 'Gateway', 'Enter WAN GW'], ['distance', 'Main route distance', '1']];
    let nextWan = 1;
    let generated = '';

    function addWan(values = {}) {
        const number = nextWan++;
        const row = document.createElement('div');
        row.className = 'repeatable-row wan-row';
        row.style.setProperty('--fields', fields.length);
        row.innerHTML = fields.map(([key, label, fallback]) => `<div><label>${label}</label><input data-wan-field="${key}" ${key === 'distance' ? 'type="number" min="1" max="255"' : ''} value="${values[key] || (key === 'table' || key === 'list' ? `WAN${number}` : key === 'distance' ? number : '')}" placeholder="${key === 'gateway' ? fallback : ''}" autocomplete="off"></div>`).join('') + '<button type="button" class="remove-row" aria-label="Remove WAN" title="Remove WAN">×</button>';
        row.querySelector('.remove-row').addEventListener('click', () => { row.remove(); updateRemoveButtons(); });
        $('wanRows').append(row);
        updateRemoveButtons();
    }

    function updateRemoveButtons() {
        const disabled = $('wanRows').children.length <= 2;
        $('wanRows').querySelectorAll('.remove-row').forEach(button => { button.disabled = disabled; });
    }

    function wans() {
        return [...$('wanRows').querySelectorAll('.wan-row')].map(row => Object.fromEntries([...row.querySelectorAll('[data-wan-field]')].map(input => [input.dataset.wanField, input.value.trim()])));
    }

    function clearScript() {
        generated = '';
        $('error').textContent = '';
        $('output').textContent = 'Your routing configuration will appear here.';
        $('output').classList.add('is-empty');
        $('copy').textContent = 'Copy';
        $('clear').disabled = $('copy').disabled = $('download').disabled = true;
    }

    function toggleLoadBalancing() {
        const enabled = $('enableLoadBalancing').checked;
        $('loadBalancingFields').classList.toggle('is-collapsed', !enabled);
        $('loadBalancingOutput').classList.toggle('hidden', !enabled);
        $('loadBalancingStatus').textContent = enabled ? 'Enabled' : 'Disabled';
        $('loadBalancingStatus').classList.toggle('is-disabled', !enabled);
        if (!enabled) clearScript();
    }

    function generate() {
        const configuredWans = wans();
        const errors = validate(configuredWans);
        $('error').textContent = errors.join('\n');
        if (errors.length) return;
        generated = script(configuredWans);
        $('output').textContent = generated;
        $('output').classList.remove('is-empty');
        $('clear').disabled = $('copy').disabled = $('download').disabled = false;
    }

    addWan();
    addWan();
    $('addWan').addEventListener('click', () => addWan());
    $('generate').addEventListener('click', generate);
    $('enableLoadBalancing').addEventListener('change', toggleLoadBalancing);
    $('clear').addEventListener('click', clearScript);
    $('copy').addEventListener('click', async () => {
        await navigator.clipboard.writeText(generated);
        $('copy').textContent = 'Copied';
        setTimeout(() => { $('copy').textContent = 'Copy'; }, 1300);
    });
    $('download').addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([generated], { type: 'text/plain' }));
        link.download = 'load-balancing.rsc';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    toggleLoadBalancing();
}

if (typeof document !== 'undefined') init();
