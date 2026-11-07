"""Public, keyless data sources used by lane A. All checked live on 2026-11-07."""

ELEXON = "https://data.elexon.co.uk/bmrs/api/v1"
NESO_CKAN = "https://api.neso.energy/api/3/action"

# NESO resources archived as whole-file snapshots whenever their last_modified changes.
# (snapshot name, CKAN package id, resource id)
NESO_SNAPSHOT_RESOURCES = [
    ("constraint_flows", "day-ahead-constraint-flows-and-limits", "38a18ec1-9e40-465d-93fb-301e80fd1352"),
    ("dfs_requirement", "demand-flexibility", None),   # resolved by name: "DFS Service Requirement"
    ("dfs_utilisation", "demand-flexibility", None),   # resolved by name: "DFS Utilisation Report"
    ("wind_bmu_forecast", "day-ahead-wind-forecast", "90e581e9-2d7f-4eaa-8fe0-6e323ee0f5f7"),
]

# Resource names used when the id is not pinned (NESO adds yearly archive resources next to the live one).
NESO_RESOURCE_NAMES = {
    "dfs_requirement": "DFS Service Requirement",
    "dfs_utilisation": "DFS Utilisation Report",
}
