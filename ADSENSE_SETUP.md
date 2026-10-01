# AdSense activation checklist

Ads are disabled by `adsense-config.js`. Do not enable them until Google has approved this site and the site owner has supplied a real AdSense publisher ID.

## Required before serving Google ads

1. Set the final production URL in every canonical tag, `robots.txt`, and `sitemap.xml`. The repository-derived GitHub Pages URL currently used is provisional.
2. In AdSense, add and verify the final site, then obtain the real `ca-pub-...` publisher ID.
3. Configure a Google-certified CMP through AdSense Privacy & messaging (or another certified TCF CMP) for EEA, UK, and Switzerland traffic. Connect its consent API to `window.RouterForgeConsent.hasAdvertisingConsent()` before setting `enabled: true`.
4. Update the privacy policy with the selected CMP, advertising partners, cookies/local storage, data uses, choices, and a real privacy contact.
5. Create `/ads.txt` from `ads.txt.template` using the real `pub-...` ID. Do not publish the template or a placeholder ID.
6. Recheck the current Google Publisher Policies and AdSense Program policies before switching on ads.

## Placement plan

Use manual, in-content display units only after an introductory or completed guide section and near the bottom of an informational page. Keep ads out of the generator forms, script-output panels, navigation, footer links, and the Generate, Copy, Download, and Clear controls. Label any ad area “Advertisement” and preserve whitespace around interactive controls. Do not use an ad format that overlays content or encourages accidental clicks.

## Policy status

There is no published Google rule requiring a fixed number of articles, pages, or visitors for approval. Useful original content, clear navigation, policy compliance, and a site that is ready for visitors are prudent review-readiness measures, not approval guarantees.

Official references: [Google Publisher Policies](https://support.google.com/publisherpolicies/answer/10437795), [AdSense Program policies](https://support.google.com/adsense/answer/48182), [EEA/UK/Swiss consent requirements](https://support.google.com/adsense/answer/13554116), and [ads.txt guidance](https://support.google.com/adsense/answer/9785052).
