"""OSGB36 National Grid (easting, northing) to WGS84 (lat, lon).

Ordnance Survey's published transverse Mercator inverse plus a 7-parameter Helmert
transform. Accurate to a few metres, which is plenty for a map of wind farms.
"""

from __future__ import annotations

from math import atan, atan2, cos, degrees, radians, sin, sqrt, tan

# Airy 1830 ellipsoid and National Grid projection constants.
_A, _B = 6377563.396, 6356256.909
_F0 = 0.9996012717
_LAT0, _LON0 = radians(49), radians(-2)
_N0, _E0 = -100000, 400000
_E2 = 1 - (_B * _B) / (_A * _A)
_N = (_A - _B) / (_A + _B)


def _meridional_arc(lat: float) -> float:
    n, n2, n3 = _N, _N * _N, _N ** 3
    return _B * _F0 * (
        (1 + n + 5 / 4 * n2 + 5 / 4 * n3) * (lat - _LAT0)
        - (3 * n + 3 * n2 + 21 / 8 * n3) * sin(lat - _LAT0) * cos(lat + _LAT0)
        + (15 / 8 * n2 + 15 / 8 * n3) * sin(2 * (lat - _LAT0)) * cos(2 * (lat + _LAT0))
        - 35 / 24 * n3 * sin(3 * (lat - _LAT0)) * cos(3 * (lat + _LAT0))
    )


def _osgb36_latlon(easting: float, northing: float) -> tuple[float, float]:
    lat = _LAT0
    m = 0.0
    while True:
        lat = (northing - _N0 - m) / (_A * _F0) + lat
        m = _meridional_arc(lat)
        if abs(northing - _N0 - m) < 0.00001:
            break
    s = sin(lat)
    nu = _A * _F0 / sqrt(1 - _E2 * s * s)
    rho = _A * _F0 * (1 - _E2) / (1 - _E2 * s * s) ** 1.5
    eta2 = nu / rho - 1
    t = tan(lat)
    sec = 1 / cos(lat)
    vii = t / (2 * rho * nu)
    viii = t / (24 * rho * nu ** 3) * (5 + 3 * t * t + eta2 - 9 * t * t * eta2)
    ix = t / (720 * rho * nu ** 5) * (61 + 90 * t * t + 45 * t ** 4)
    x = sec / nu
    xi = sec / (6 * nu ** 3) * (nu / rho + 2 * t * t)
    xii = sec / (120 * nu ** 5) * (5 + 28 * t * t + 24 * t ** 4)
    xiia = sec / (5040 * nu ** 7) * (61 + 662 * t * t + 1320 * t ** 4 + 720 * t ** 6)
    de = easting - _E0
    lat_out = lat - vii * de ** 2 + viii * de ** 4 - ix * de ** 6
    lon_out = _LON0 + x * de - xi * de ** 3 + xii * de ** 5 - xiia * de ** 7
    return lat_out, lon_out


def _helmert_osgb36_to_wgs84(lat: float, lon: float) -> tuple[float, float]:
    # OSGB36 (Airy) -> cartesian
    nu = _A / sqrt(1 - _E2 * sin(lat) ** 2)
    x1 = nu * cos(lat) * cos(lon)
    y1 = nu * cos(lat) * sin(lon)
    z1 = (1 - _E2) * nu * sin(lat)
    # Helmert OSGB36 -> WGS84
    tx, ty, tz = 446.448, -125.157, 542.060
    s = -20.4894e-6
    rx, ry, rz = (radians(v / 3600) for v in (0.1502, 0.2470, 0.8421))
    x2 = tx + (1 + s) * x1 - rz * y1 + ry * z1
    y2 = ty + rz * x1 + (1 + s) * y1 - rx * z1
    z2 = tz - ry * x1 + rx * y1 + (1 + s) * z1
    # cartesian -> WGS84 lat/lon
    a, b = 6378137.000, 6356752.3141
    e2 = 1 - (b * b) / (a * a)
    p = sqrt(x2 * x2 + y2 * y2)
    lat2 = atan2(z2, p * (1 - e2))
    for _ in range(10):
        nu2 = a / sqrt(1 - e2 * sin(lat2) ** 2)
        lat2 = atan2(z2 + e2 * nu2 * sin(lat2), p)
    return lat2, atan(y2 / x2) if x2 > 0 else atan2(y2, x2)


def osgb_to_wgs84(easting: float, northing: float) -> tuple[float, float]:
    lat, lon = _helmert_osgb36_to_wgs84(*_osgb36_latlon(easting, northing))
    return round(degrees(lat), 5), round(degrees(lon), 5)
