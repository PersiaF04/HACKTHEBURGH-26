# Web assets

## `scotland.ts`

Scotland coastline (mainland, Orkney, Shetland and the larger islands) as one SVG path, pre-projected
to the Waste Map's 520×640 viewBox so it lines up with the farm dots.

- **Source:** [Natural Earth](https://www.naturalearthdata.com/) 1:10m Cultural Vectors, *Admin 0 – Details – map subunits*
  (`ne_10m_admin_0_map_subunits`, feature `SU_A3 = SCT`), downloaded from
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_map_subunits.geojson`.
- **Licence:** public domain. See <https://www.naturalearthdata.com/about/terms-of-use/>.
- **Processing:** `web/scripts/build-coastline.mjs` projects with the same box and formula as `project()` in
  `web/src/screens/WasteMap.tsx`, simplifies each ring (Douglas–Peucker, 0.45 px) and drops islets under 2 px².

To regenerate (for example after changing the map box), download the GeoJSON outside the repo and run:

```sh
node web/scripts/build-coastline.mjs /path/to/ne_10m_admin_0_map_subunits.geojson
```
