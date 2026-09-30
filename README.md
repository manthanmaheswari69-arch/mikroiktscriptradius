# RouterForge: MikroTik PPPoE, RADIUS, and optional Hotspot generator

Open `index.html` in a browser. The generator runs locally in the browser and exports a RouterOS 7 `.rsc` script. The UI, styles, and generator logic live in separate files: `index.html`, `styles.css`, and `app.js`.

PPPoE and Hotspot are independent options. Enable PPPoE only, Hotspot only, or both. At least one customer service must be enabled.

## Hotspot

Hotspot is off by default. Enable it to add a Hotspot server and DHCP service on the selected interface. Editable defaults are:

| Setting | Default |
| --- | --- |
| Interface | `ether3` |
| Subnet | `192.168.100.0/24` |
| DNS name | `phpradius.net` |
| HTML directory | `flash/hotspot` |
| Hotspot profile | `hotspot_profile` |
| Hotspot server | `hotspot_server` |
| DHCP pool | `hotspot_dhcp_pool` |
| DHCP server | `hotspot_dhcp` |

The gateway is subnet + 1. DHCP leases start at subnet + 2 and end at the last usable address. The generated IP address, DHCP server, and Hotspot server all use the same selected interface. The DHCP network advertises the gateway as both gateway and DNS server. Router DNS remote requests are enabled when Hotspot is generated; keep DNS access restricted to trusted LANs in the router's input firewall.

The Hotspot subnet must not overlap the main or additional PPPoE subnets, the fixed expired-user subnet, or a static WAN subnet. The generator rejects the physical WAN interface, WAN VLAN interface, PPPoE WAN client, and bridge member ports as the Hotspot interface. Select the bridge itself when using a bridge.

When enabled, the Hotspot profile uses `login-by=cookie,http-chap,http-pap` and `use-radius=yes`. The RADIUS entry uses `service=hotspot` for Hotspot-only output and `service=ppp,hotspot` when both services are enabled. It retains `require-message-auth=no` and the selected PR3S public/private address mapping. For a private RADIUS path, enter the L2TP credentials for your deployment in the UI. No VPN username or password is embedded in the generator.

Hotspot adds a separate `srcnat` rule scoped to its subnet. PPPoE NAT rules stay scoped to the active PPPoE subnets, and the fixed expired pool is not NATed. The expired-user forward drop rule remains available.

## PPPoE

PPPoE remains enabled by default and can now be turned off. When disabled, PPPoE interfaces, pools, profiles, servers, AAA, NAT, and the expired-user block are omitted from the generated script. Existing WAN modes (DHCP, static, and PPPoE), WAN VLAN, physical/bridge/VLAN customer interfaces, multiple PPPoE profiles and servers, PR3S mapping, L2TP transport, RADIUS compatibility, expired pool, and expired-user block are retained when PPPoE is enabled.

Before import, review interface names, current router configuration, address ranges, and firewall ordering. Use RouterOS Safe Mode for remote changes and keep a router backup.

## Verification

Run the browser-side generation checks with Node.js:

```sh
node tests/generator.test.js
```

The tests cover PPPoE-only, Hotspot-only, combined public RADIUS, combined PR3S RADIUS over L2TP, DHCP pool boundaries, PPPoE/expired/WAN overlap rejection, WAN interface rejection, bridge-member rejection, and rejection when both customer services are disabled.
