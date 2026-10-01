# RouterForge: MikroTik PPPoE, RADIUS, and Hotspot generator

Open `index.html` in a browser. The generator runs locally and exports a RouterOS 7 `.rsc` script. The UI, styles, and generator logic live in separate files: `index.html`, `styles.css`, and `app.js`.

Open `loadbalancing.html` for the separate multi-WAN tool. PCC and source-address tagging each have their own toggle and WAN configuration card. Enable one method at a time: PCC uses `masquerade_pool` to create mangle rules in the matching bandwidth ratio, while tagging marks each WAN address list directly. Both produce routing tables, policy routes, and main routes for every WAN.

The output toolbar includes **Clear script**, which removes the generated output without changing the form. Preconfigured PR3S addresses are kept out of the visible server selector and address fields; address entry is shown only when **Custom server IP** is selected. The required address is still included in the generated RouterOS script.

PPPoE, login Hotspot, and IP-based/MAC access are independent sections. Enable any one of them or combine them. At least one customer service must be enabled. RADIUS authentication is off by default; enable it to reveal the RADIUS server and L2TP settings.

## WAN and failover

Set the primary WAN route distance from `1` to `255`; a lower distance is preferred. The primary WAN and every backup WAN support DHCP, static IP, or PPPoE. Add backup WANs one per line:

```text
ether5,dhcp,2
ether6,static,3,203.0.113.2/30,203.0.113.1
ether7,pppoe,4,pppoe-backup,user,password
```

The formats are `interface,dhcp,distance`, `interface,static,distance,address/CIDR,gateway`, and `interface,pppoe,distance,client-name,username,password,service`. Each route receives its own distance. WAN interfaces and PPPoE client names must be unique and cannot be reused by customer services. When backup WANs are present, the generator creates the `wan-uplinks` interface list and keeps exactly one `srcnat` masquerade rule using `out-interface-list=wan-uplinks`.

## Login Hotspot

Login Hotspot is off by default. When enabled, it gives clients DHCP addresses and uses cookie, HTTP CHAP, or HTTP PAP login.

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
| Router upstream DNS | `8.8.8.8,8.8.4.4` |

The gateway is subnet + 1. DHCP leases start at subnet + 2 and end at the last usable address. The generated IP address, DHCP server, and Hotspot server all use the same selected interface. The DHCP network advertises the gateway as both gateway and DNS server, and the Hotspot profile uses that same gateway as its `hotspot-address`.

## IP-based / MAC RADIUS

IP-based access has its own independently enabled UI section. It expects static client addresses and authenticates automatically with the client MAC as both RADIUS username and password.

| Setting | Default |
| --- | --- |
| Interface | `ether4` |
| Subnet | `192.168.110.0/24` |
| Profile | `ipbased_profile` |
| Server | `ipbased_server` |
| Static RADIUS pool | `static` |
| Router upstream DNS | `8.8.8.8,8.8.4.4` |

IP-based access creates the `192.168.110.2–192.168.110.254` static pool by default, sets `login-by=mac`, uses `mac-auth-mode=mac-as-username-and-password`, sets `addresses-per-mac=unlimited`, and can add a `type=regular` IP binding for the full subnet scoped to its generated server. It does not create a DHCP server. Its gateway, static pool, IP binding, and NAT rule are all calculated from the same subnet.

Router DNS remote requests are enabled when either Hotspot section is generated; keep DNS access restricted to trusted LANs in the router's input firewall. If both sections are enabled, their upstream DNS server lists are merged.

Neither access subnet may overlap the other access section, the main or additional PPPoE subnets, the fixed expired-user subnet, or a static WAN subnet. Each section rejects the physical WAN interface, WAN VLAN interface, PPPoE WAN client, and bridge member ports. When both access sections are enabled, they must also use different interfaces, profile names, server names, and pool names.

When RADIUS is enabled, its entry uses `service=hotspot` when either Hotspot section is enabled without PPPoE, `service=ppp` for PPPoE-only output, and `service=ppp,hotspot` only when PPPoE and either Hotspot section are enabled. It retains `require-message-auth=no` and the selected PR3S public/private address mapping. For a private RADIUS path, enter the L2TP credentials for your deployment in the UI. No VPN username or password from an example configuration is embedded in the generator. When RADIUS is disabled, the generator emits no `/radius` or L2TP commands and Hotspot profiles use local authentication (`use-radius=no`).

Active PPPoE, Login Hotspot, and IP-based client subnets are added to the `masquerade_pool` firewall address list. Exactly one `srcnat` masquerade rule matches that list, so the fixed expired pool is not NATed. With one WAN it matches that WAN interface; with multiple WANs it matches the `wan-uplinks` interface list. The expired-user forward drop rule remains available.

## PPPoE

PPPoE is off by default. When disabled, PPPoE interfaces, pools, profiles, servers, AAA, NAT, and the expired-user block are omitted from the generated script. WAN modes (DHCP, static, and PPPoE), WAN VLAN, physical/bridge/VLAN customer interfaces, multiple PPPoE profiles and servers, PR3S mapping, L2TP transport, RADIUS compatibility, expired pool, and expired-user block are retained when PPPoE is enabled.

Before import, review interface names, current router configuration, address ranges, and firewall ordering. Use RouterOS Safe Mode for remote changes and keep a router backup.

## Verification

Run the browser-side generation checks with Node.js:

```sh
node tests/generator.test.js
node tests/loadbalancing.test.js
```

The tests cover single and multi-WAN output with route distances, exactly one NAT rule, PPPoE-only, independently enabled login Hotspot and IP-based MAC-RADIUS access, RADIUS on/off behavior, public RADIUS, PR3S RADIUS over L2TP, DHCP/static pool boundaries, cross-service/PPPoE/expired/WAN overlap rejection, WAN and bridge-member rejection, and rejection when every customer service is disabled.
