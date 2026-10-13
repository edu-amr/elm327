# Third-party notices

elm327 is MIT licensed (see [LICENSE](LICENSE)). The web dashboard in `web/` includes the following third-party
work. Vendored components are copied into `web/src/components` with their original license, and are excluded from
this project's lint and formatting rules.

## UI components (source copied via the shadcn CLI)

| Source                                                   | What is used                                                        | License                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [shadcn/ui](https://ui.shadcn.com)                       | Button, Alert dialog, Table, Tooltip, Scroll area, Toaster (Sonner) | MIT                                                                     |
| [EvilCharts](https://evilcharts.com) (legions-developer) | Area, Bar, Pie and Radial charts on Recharts                        | MIT                                                                     |
| [Arc library](https://uiarc.dev) (kuratlielia)           | Gauge, Metric card, Segmented control, Sparkline, Animated counter  | MIT                                                                     |
| [Cult UI](https://www.cult-ui.com) (nolly-studio)        | Halo badge, Rolling number                                          | MIT                                                                     |
| [AffectUI](https://www.affectui.com) (flohoeller)        | Number ticker, Grid background                                      | MIT                                                                     |
| [React Bits](https://reactbits.dev) (David Haz)          | Electric border, Glare hover                                        | MIT with Commons Clause: free to use in an app, may not be resold alone |

## Icons

- [Solar Icons](https://github.com/480-Design/Solar-Icon-Set) by 480 Design, used through
  [`@solar-icons/react`](https://github.com/saoudi-h/solar-icons). The icons are licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); this notice is the attribution.

## Fonts (bundled, no network access at runtime)

- [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) by Cadson Demak, SIL Open Font License 1.1
- [Oxanium](https://fonts.google.com/specimen/Oxanium) by Severin Meyer, SIL Open Font License 1.1

## Libraries

React, Recharts, Motion, Base UI, Sonner, next-themes, Tailwind CSS, class-variance-authority, clsx and
tailwind-merge are MIT licensed. Lucide icons (pulled in by shadcn/ui) are ISC licensed.
