const identifier = /^[A-Za-z0-9_.-]{1,48}$/;
const gateway = /^[A-Za-z0-9.-]+$/;

function validate(wans, mode = 'pcc') {
    const errors = [];
    if (wans.length < 2) errors.push('Add at least two WANs for load balancing.');
    wans.forEach((wan, index) => {
        const name = `WAN${index + 1}`;
        if (!identifier.test(wan.table)) errors.push(`${name} routing table must use only letters, numbers, dots, underscores, or hyphens.`);
        if (!gateway.test(wan.gateway)) errors.push(`Enter a valid ${name} gateway.`);
        if (mode === 'pcc') {
            const bandwidth = Number(wan.bandwidth);
            if (!Number.isInteger(bandwidth) || bandwidth < 1) errors.push(`${name} bandwidth must be a whole number in Mbps.`);
        }
        if (mode === 'tagging' && !identifier.test(wan.list)) errors.push(`${name} source address list must use only letters, numbers, dots, underscores, or hyphens.`);
        const distance = Number(wan.distance);
        if (!Number.isInteger(distance) || distance < 1 || distance > 255) errors.push(`${name} main route distance must be from 1 to 255.`);
    });
    if (new Set(wans.map(wan => wan.table)).size !== wans.length) errors.push('Every routing table name must be different.');
    if (mode === 'tagging' && new Set(wans.map(wan => wan.list)).size !== wans.length) errors.push('Every source address list name must be different.');
    return errors;
}

function gcd(left, right) {
    while (right) [left, right] = [right, left % right];
    return left;
}

function script(wans, mode = 'pcc') {
    const policyRoutes = wans.map(wan => `add disabled=no distance=1 dst-address=0.0.0.0/0 gateway=${wan.gateway} routing-table=${wan.table} scope=30 target-scope=10`);
    const mainRoutes = [...wans].sort((a, b) => Number(b.distance) - Number(a.distance)).map(wan => `add disabled=no distance=${wan.distance} dst-address=0.0.0.0/0 gateway=${wan.gateway} routing-table=main scope=30 target-scope=10`);
    const mangleRules = mode === 'tagging'
        ? wans.map(wan => `add action=mark-routing chain=prerouting dst-address-type=!local new-routing-mark=${wan.table} src-address-list=${wan.list}`)
        : (() => {
            const divisor = wans.map(wan => Number(wan.bandwidth)).reduce(gcd);
            const weights = wans.map(wan => Number(wan.bandwidth) / divisor);
            const pccDivisor = weights.reduce((total, weight) => total + weight, 0);
            let pccRemainder = 0;
            return wans.flatMap((wan, index) => Array.from({ length: weights[index] }, () => `add action=mark-routing chain=prerouting dst-address-type=!local new-routing-mark=${wan.table} per-connection-classifier=both-addresses-and-ports:${pccDivisor}/${pccRemainder++} src-address-list=masquerade_pool`));
        })();
    return ['/routing table', ...wans.map(wan => `add disabled=no fib name=${wan.table}`), '/ip firewall mangle', ...mangleRules, '/ip route', ...policyRoutes, ...mainRoutes].join('\n');
}

function init() {
    const $ = id => document.getElementById(id);
    const methods = {
        pcc: { rows: 'pccWanRows', content: 'pccFields', toggle: 'enablePcc', status: 'pccStatus', fields: [['table', 'Routing table', 'WAN'], ['bandwidth', 'Bandwidth (Mbps)', 'Enter WAN speed'], ['gateway', 'Gateway', 'Enter WAN GW'], ['distance', 'Main route distance', '1']] },
        tagging: { rows: 'taggingWanRows', content: 'taggingFields', toggle: 'enableTagging', status: 'taggingStatus', fields: [['table', 'Routing table', 'WAN'], ['list', 'Source address list', 'WAN'], ['gateway', 'Gateway', 'Enter WAN GW'], ['distance', 'Main route distance', '1']] }
    };
    const nextWan = { pcc: 1, tagging: 1 };
    let generated = '';

    function addWan(method, values = {}) {
        const config = methods[method];
        const number = nextWan[method]++;
        const row = document.createElement('div');
        row.className = 'repeatable-row wan-row';
        row.style.setProperty('--fields', config.fields.length);
        row.innerHTML = config.fields.map(([key, label, fallback]) => `<div><label>${label}</label><input data-wan-field="${key}" ${key === 'distance' || key === 'bandwidth' ? 'type="number" min="1" step="1"' : ''} value="${values[key] || (key === 'table' || key === 'list' ? `WAN${number}` : key === 'distance' ? number : '')}" placeholder="${key === 'gateway' || key === 'bandwidth' ? fallback : ''}" autocomplete="off"></div>`).join('') + '<button type="button" class="remove-row" aria-label="Remove WAN" title="Remove WAN">×</button>';
        row.querySelector('.remove-row').addEventListener('click', () => { row.remove(); updateRemoveButtons(method); });
        $(config.rows).append(row);
        updateRemoveButtons(method);
    }

    function updateRemoveButtons(method) {
        const rows = $(methods[method].rows);
        const disabled = rows.children.length <= 2;
        rows.querySelectorAll('.remove-row').forEach(button => { button.disabled = disabled; });
    }

    function wans(method) {
        return [...$(methods[method].rows).querySelectorAll('.wan-row')].map(row => Object.fromEntries([...row.querySelectorAll('[data-wan-field]')].map(input => [input.dataset.wanField, input.value.trim()])));
    }

    function clearScript() {
        generated = '';
        $('error').textContent = '';
        $('output').textContent = 'Your routing configuration will appear here.';
        $('output').classList.add('is-empty');
        $('copy').textContent = 'Copy';
        $('clear').disabled = $('copy').disabled = $('download').disabled = true;
    }

    function updateMethods(changed) {
        if (changed && $(methods[changed].toggle).checked) Object.entries(methods).forEach(([method, config]) => { if (method !== changed) $(config.toggle).checked = false; });
        Object.values(methods).forEach(config => {
            const enabled = $(config.toggle).checked;
            $(config.content).classList.toggle('is-collapsed', !enabled);
            $(config.status).textContent = enabled ? 'Enabled' : 'Disabled';
            $(config.status).classList.toggle('is-disabled', !enabled);
        });
        clearScript();
    }

    function generate() {
        const method = Object.keys(methods).find(name => $(methods[name].toggle).checked);
        if (!method) {
            $('error').textContent = 'Enable PCC load balancing or source-address tagging.';
            return;
        }
        const configuredWans = wans(method);
        const errors = validate(configuredWans, method);
        $('error').textContent = errors.join('\n');
        if (errors.length) return;
        generated = script(configuredWans, method);
        $('output').textContent = generated;
        $('output').classList.remove('is-empty');
        $('clear').disabled = $('copy').disabled = $('download').disabled = false;
    }

    addWan('pcc');
    addWan('pcc');
    addWan('tagging');
    addWan('tagging');
    $('addPccWan').addEventListener('click', () => addWan('pcc'));
    $('addTaggingWan').addEventListener('click', () => addWan('tagging'));
    $('generate').addEventListener('click', generate);
    Object.entries(methods).forEach(([method, config]) => $(config.toggle).addEventListener('change', () => updateMethods(method)));
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
    updateMethods();
}

if (typeof document !== 'undefined') init();
