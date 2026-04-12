#!/usr/bin/env python3
# pyright: reportUninitializedInstanceVariable=false,reportUnusedCallResult=false
"""Render a race map to PDF using QGIS.

Usage:
    python3 scripts/render-map.py \
        --lines path/to/course.gpx \
        --points path/to/checkpoints.gpx \
        --title "Race Title" \
        --date "Saturday, March 28, 2026" \
        --output path/to/output.pdf

Both --lines and --points can be specified multiple times.
"""

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

from qgis.core import (
    Qgis,
    QgsApplication,
    QgsCoordinateReferenceSystem,
    QgsCoordinateTransform,
    QgsFeature,
    QgsLayout,
    QgsLayoutExporter,
    QgsLayoutItemLabel,
    QgsLayoutItemMap,
    QgsLayoutItemPage,
    QgsLayoutPoint,
    QgsLayoutSize,
    QgsLineSymbol,
    QgsMapBoxGlStyleConversionContext,
    QgsMapBoxGlStyleConverter,
    QgsMapLayer,
    QgsMarkerSymbol,
    QgsPalLayerSettings,
    QgsProject,
    QgsRectangle,
    QgsSingleSymbolRenderer,
    QgsTextBufferSettings,
    QgsTextFormat,
    QgsVectorLayer,
    QgsVectorLayerSimpleLabeling,
    QgsVectorTileLayer,
)
from qgis.PyQt.QtCore import Qt
from qgis.PyQt.QtGui import QColor, QFont

# --- Style constants ---
LINE_COLOR = "0,102,204,220"
LINE_WIDTH = "0.8"

START_COLOR = "34,170,34,255"
FINISH_COLOR = "204,0,0,255"
CHECKPOINT_COLOR = "238,136,0,255"
MARKER_OUTLINE_COLOR = "255,255,255,255"
MARKER_OUTLINE_WIDTH = "0.4"
MARKER_SIZE = "3.5"

MILE_MARKER_COLOR = "0,0,0,255"
MILE_MARKER_SIZE = "1.8"
MILE_LABEL_FONT_SIZE = 7
MILE_LABEL_DISTANCE = 2.0
MILE_METERS = 1609.344

LABEL_FONT_FAMILY = "Arial"
LABEL_FONT_SIZE = 9
LABEL_BUFFER_SIZE = 1.5
LABEL_BUFFER_OPACITY = 0.9
LABEL_DISTANCE = 3.0

EXTENT_PADDING = 0.05
EXPORT_DPI = 300

MAPTILER_STYLES = [
    "aquarelle",
    "backdrop",
    "basic-v2",
    "bright-v2",
    "dataviz",
    "hybrid",
    "ocean",
    "openstreetmap",
    "outdoor-v2",
    "satellite",
    "streets",
    "streets-v2",
    "streets-v2-dark",
    "streets-v2-light",
    "streets-v2-pastel",
    "topo-v2",
    "winter-v2",
]


def _simplify_gl_text_field(value):
    """Simplify a Mapbox GL text-field expression for the QGIS converter.

    The QGIS converter can handle simple templates like ``"{name:en}"`` but
    not array expressions like ``["coalesce", ["get", "name:en"], ["get", "name"]]``.
    This extracts the first ``get`` target and returns it as a template string.
    """
    if not isinstance(value, list) or not value:
        return value
    op = value[0]
    if op == "coalesce":
        for arg in reversed(value[1:]):
            if isinstance(arg, list) and len(arg) == 2 and arg[0] == "get":
                return "{" + arg[1] + "}"
    if op == "concat":
        parts = []
        for arg in value[1:]:
            if isinstance(arg, str):
                parts.append(arg)
            elif isinstance(arg, list) and len(arg) == 2 and arg[0] == "get":
                parts.append("{" + arg[1] + "}")
            else:
                return value
        if parts:
            return "".join(parts)
    return value


def _extract_numeric_default(expr):
    """Extract a fallback numeric value from a ``case`` or ``match`` expression."""
    if isinstance(expr, (int, float)):
        return expr
    if isinstance(expr, list) and len(expr) >= 2:
        if expr[0] in ("case", "match"):
            return _extract_numeric_default(expr[-1])
    return None


def _simplify_gl_text_size(value):
    """Simplify a Mapbox GL text-size expression for the QGIS converter.

    The converter handles plain numbers and ``{"stops": [...]}`` objects but
    not ``["interpolate", ...]`` expressions whose values contain nested
    ``case`` or ``match`` sub-expressions.  This flattens them into a simple
    stops object by extracting the fallback value at each zoom level.
    """
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, dict) and "stops" in value:
        return value
    if not isinstance(value, list) or value[0] != "interpolate":
        return value
    pairs = value[3:]
    stops = []
    for i in range(0, len(pairs), 2):
        zoom = pairs[i]
        size = pairs[i + 1]
        if isinstance(size, (int, float)):
            stops.append([zoom, size])
        else:
            num = _extract_numeric_default(size)
            if num is not None:
                stops.append([zoom, num])
    if stops:
        return {"stops": stops}
    return value


# Source layers whose labels are not useful on a race course map.
_LABEL_LAYERS_TO_REMOVE = {"poi", "housenumber", "aeroway"}


def _simplify_gl_style(style_dict: dict) -> dict:
    """Pre-process a Mapbox GL style to work around QGIS converter limitations.

    ``QgsMapBoxGlStyleConverter`` cannot parse ``coalesce`` expressions in
    ``text-field`` or ``interpolate`` expressions with nested ``case``/``match``
    in ``text-size``.  This rewrites those constructs into simpler forms that
    the converter handles correctly.

    Labels from POI, housenumber, and aeroway layers are also stripped since
    they add clutter without helping runners navigate the course.
    """
    for layer in style_dict.get("layers", []):
        layout = layer.get("layout", {})
        if "text-field" in layout:
            if layer.get("source-layer") in _LABEL_LAYERS_TO_REMOVE:
                del layout["text-field"]
                continue
            layout["text-field"] = _simplify_gl_text_field(layout["text-field"])
        if "text-size" in layout:
            layout["text-size"] = _simplify_gl_text_size(layout["text-size"])
    return style_dict


def create_basemap(style: str = "outdoor-v2") -> QgsVectorTileLayer:
    """Create a MapTiler vector tile layer with the given style."""
    api_key = os.environ.get("MAPTILER_API_KEY")
    if not api_key:
        raise RuntimeError("MAPTILER_API_KEY environment variable is not set")

    uri = (
        "type=xyz&"
        f"url=https://api.maptiler.com/tiles/v3/%7Bz%7D/%7Bx%7D/%7By%7D.pbf?key={api_key}&"
        "zmin=14&zmax=14"
    )
    layer = QgsVectorTileLayer(uri, "Basemap")
    if not layer.isValid():
        raise RuntimeError("Failed to create basemap vector tile layer")

    style_url = f"https://api.maptiler.com/maps/{style}/style.json?key={api_key}"
    try:
        with urllib.request.urlopen(style_url) as response:
            style_dict = json.loads(response.read().decode())
    except Exception as e:
        raise RuntimeError(f"Failed to fetch MapTiler style: {e}") from e

    _simplify_gl_style(style_dict)

    converter = QgsMapBoxGlStyleConverter()
    context = QgsMapBoxGlStyleConversionContext()
    # Convert pixel-based GL sizes to millimeters so they scale correctly at
    # any output DPI (screen or print).  This matches what QGIS and the
    # MapTiler plugin do internally — without it, sizes stay in pixels and
    # become microscopic at print DPI.
    context.setTargetUnit(Qgis.RenderUnit.Millimeters)
    context.setPixelSizeConversionFactor(25.4 / 96.0)
    result = converter.convert(style_dict, context)
    if result != QgsMapBoxGlStyleConverter.Success:
        raise RuntimeError(
            f"Failed to convert MapTiler style: {converter.errorMessage()}"
        )

    layer.setRenderer(converter.renderer())
    layer.setLabeling(converter.labeling())
    layer.setLabelsEnabled(True)

    return layer


def load_line_layer(gpx_path: str, name: str) -> QgsVectorLayer:
    """Load a GPX file as a line layer (tracks)."""
    uri = f"{gpx_path}|layername=tracks"
    layer = QgsVectorLayer(uri, name, "ogr")
    if not layer.isValid():
        raise RuntimeError(f"Failed to load tracks from: {gpx_path}")

    symbol = QgsLineSymbol.createSimple(
        {
            "color": LINE_COLOR,
            "width": LINE_WIDTH,
            "capstyle": "round",
            "joinstyle": "round",
        }
    )
    layer.setRenderer(QgsSingleSymbolRenderer(symbol))

    layer.setLabelsEnabled(False)

    return layer


def _configure_point_labels(layer: QgsVectorLayer) -> None:
    """Configure name labels with a white buffer for a point layer."""
    text_format = QgsTextFormat()
    text_format.setFont(QFont(LABEL_FONT_FAMILY, LABEL_FONT_SIZE))
    text_format.setSize(LABEL_FONT_SIZE)
    text_format.setColor(QColor(0, 0, 0))

    buffer_settings = QgsTextBufferSettings()
    buffer_settings.setEnabled(True)
    buffer_settings.setSize(LABEL_BUFFER_SIZE)
    buffer_settings.setColor(QColor(255, 255, 255))
    buffer_settings.setOpacity(LABEL_BUFFER_OPACITY)
    text_format.setBuffer(buffer_settings)

    label_settings = QgsPalLayerSettings()
    label_settings.fieldName = "name"
    label_settings.setFormat(text_format)
    label_settings.placement = QgsPalLayerSettings.Placement.AroundPoint
    label_settings.dist = LABEL_DISTANCE

    layer.setLabeling(QgsVectorLayerSimpleLabeling(label_settings))
    layer.setLabelsEnabled(True)


def _create_marker_layer(
    uri: str,
    layer_name: str,
    subset: str,
    shape: str,
    color: str,
) -> QgsVectorLayer:
    """Create a styled and labeled marker layer from a waypoints URI."""
    layer = QgsVectorLayer(uri, layer_name, "ogr")
    layer.setSubsetString(subset)
    if not layer.isValid():
        raise RuntimeError(f"Failed to load waypoints for layer: {layer_name}")

    symbol = QgsMarkerSymbol.createSimple(
        {
            "name": shape,
            "color": color,
            "outline_color": MARKER_OUTLINE_COLOR,
            "outline_width": MARKER_OUTLINE_WIDTH,
            "size": MARKER_SIZE,
        }
    )
    layer.setRenderer(QgsSingleSymbolRenderer(symbol))
    _configure_point_labels(layer)
    return layer


def load_point_layers(gpx_path: str, name: str) -> list[QgsVectorLayer]:
    """Load a GPX file as point layers (waypoints), split into start, finish, and checkpoints."""
    uri = f"{gpx_path}|layername=waypoints"

    start_layer = _create_marker_layer(
        uri, f"{name} - Start", "\"name\" = 'START'", "square", START_COLOR
    )
    finish_layer = _create_marker_layer(
        uri, f"{name} - Finish", "\"name\" = 'FINISH'", "square", FINISH_COLOR
    )
    cp_layer = _create_marker_layer(
        uri,
        f"{name} - Checkpoints",
        "\"name\" NOT IN ('START', 'FINISH')",
        "circle",
        CHECKPOINT_COLOR,
    )

    return [start_layer, finish_layer, cp_layer]


def generate_mile_markers(line_layer: QgsVectorLayer) -> QgsVectorLayer:
    """Generate mile marker points at one-mile intervals along a course line."""
    utm_crs = QgsCoordinateReferenceSystem("EPSG:32619")
    transform = QgsCoordinateTransform(line_layer.crs(), utm_crs, QgsProject.instance())

    layer = QgsVectorLayer(
        "Point?crs=EPSG:32619&field=mile:integer",
        f"{line_layer.name()} - Mile Markers",
        "memory",
    )
    provider = layer.dataProvider()

    for feature in line_layer.getFeatures():
        geom = feature.geometry()
        geom.transform(transform)
        total_length = geom.length()

        mile = 1
        while mile * MILE_METERS <= total_length:
            point = geom.interpolate(mile * MILE_METERS)
            feat = QgsFeature()
            feat.setGeometry(point)
            feat.setAttributes([mile])
            provider.addFeature(feat)
            mile += 1

    layer.updateExtents()

    symbol = QgsMarkerSymbol.createSimple(
        {
            "name": "circle",
            "color": MILE_MARKER_COLOR,
            "outline_color": MARKER_OUTLINE_COLOR,
            "outline_width": MARKER_OUTLINE_WIDTH,
            "size": MILE_MARKER_SIZE,
        }
    )
    layer.setRenderer(QgsSingleSymbolRenderer(symbol))

    text_format = QgsTextFormat()
    text_format.setFont(QFont(LABEL_FONT_FAMILY, MILE_LABEL_FONT_SIZE))
    text_format.setSize(MILE_LABEL_FONT_SIZE)
    text_format.setColor(QColor(0, 0, 0))

    buffer_settings = QgsTextBufferSettings()
    buffer_settings.setEnabled(True)
    buffer_settings.setSize(LABEL_BUFFER_SIZE)
    buffer_settings.setColor(QColor(255, 255, 255))
    buffer_settings.setOpacity(LABEL_BUFFER_OPACITY)
    text_format.setBuffer(buffer_settings)

    label_settings = QgsPalLayerSettings()
    label_settings.fieldName = "mile"
    label_settings.setFormat(text_format)
    label_settings.placement = QgsPalLayerSettings.Placement.AroundPoint
    label_settings.dist = MILE_LABEL_DISTANCE

    layer.setLabeling(QgsVectorLayerSimpleLabeling(label_settings))
    layer.setLabelsEnabled(True)

    return layer


def _setup_project(
    basemap: QgsMapLayer,
    line_layers: list[QgsVectorLayer],
    point_layers: list[QgsVectorLayer],
    mile_layers: list[QgsVectorLayer],
) -> tuple[QgsProject, QgsCoordinateReferenceSystem]:
    """Create a QGIS project, set its CRS, and register all map layers."""
    project = QgsProject.instance()
    if project is None:
        raise RuntimeError("failed to create QGIS project")

    crs = QgsCoordinateReferenceSystem("EPSG:3857")
    project.setCrs(crs)

    for layer in [basemap] + line_layers + mile_layers + point_layers:
        project.addMapLayer(layer)

    return project, crs


def _add_header_labels(
    layout: QgsLayout,
    title: str,
    date_str: str,
    page_width: float,
    margin: float,
) -> None:
    """Add left-aligned title and right-aligned date labels to the layout."""
    header_fmt = QgsTextFormat()
    header_fmt.setFont(QFont("Helvetica"))
    header_fmt.setSize(14)

    title_label = QgsLayoutItemLabel(layout)
    title_label.setText(title)
    title_label.setTextFormat(header_fmt)
    title_label.setHAlign(Qt.AlignmentFlag.AlignLeft)
    title_label.attemptMove(QgsLayoutPoint(margin, margin))
    title_label.attemptResize(QgsLayoutSize(page_width - 2 * margin, 10))
    layout.addLayoutItem(title_label)

    date_label = QgsLayoutItemLabel(layout)
    date_label.setText(date_str)
    date_label.setTextFormat(header_fmt)
    date_label.setHAlign(Qt.AlignmentFlag.AlignRight)
    date_label.attemptMove(QgsLayoutPoint(margin, margin))
    date_label.attemptResize(QgsLayoutSize(page_width - 2 * margin, 10))
    layout.addLayoutItem(date_label)


def _compute_extent(
    line_layers: list[QgsVectorLayer],
    point_layers: list[QgsVectorLayer],
    target_crs: QgsCoordinateReferenceSystem,
    project: QgsProject,
    map_width: float,
    map_height: float,
) -> QgsRectangle:
    """Compute the map extent from vector layers, padded and aspect-ratio adjusted."""
    extent = QgsRectangle()
    source_crs = None
    for layer in line_layers + point_layers:
        if layer.featureCount() > 0:
            if extent.isEmpty():
                extent = layer.extent()
            else:
                extent.combineExtentWith(layer.extent())
            if source_crs is None:
                source_crs = layer.crs()

    if source_crs is not None:
        transform = QgsCoordinateTransform(source_crs, target_crs, project)
        extent = transform.transformBoundingBox(extent)

    extent.grow(max(extent.width(), extent.height()) * EXTENT_PADDING)

    # Expand extent to match the map item's aspect ratio so the map fills the page
    map_aspect = map_width / map_height
    extent_aspect = extent.width() / extent.height() if extent.height() > 0 else 1.0
    if extent_aspect > map_aspect:
        new_height = extent.width() / map_aspect
        center_y = extent.center().y()
        extent.setYMinimum(center_y - new_height / 2)
        extent.setYMaximum(center_y + new_height / 2)
    else:
        new_width = extent.height() * map_aspect
        center_x = extent.center().x()
        extent.setXMinimum(center_x - new_width / 2)
        extent.setXMaximum(center_x + new_width / 2)

    return extent


def _add_map_item(
    layout: QgsLayout,
    extent: QgsRectangle,
    crs: QgsCoordinateReferenceSystem,
    basemap: QgsMapLayer,
    line_layers: list[QgsVectorLayer],
    point_layers: list[QgsVectorLayer],
    mile_layers: list[QgsVectorLayer],
    map_x: float,
    map_y: float,
    map_width: float,
    map_height: float,
) -> None:
    """Create, configure, and add the map item to the layout."""
    map_item = QgsLayoutItemMap(layout)
    map_item.attemptMove(QgsLayoutPoint(map_x, map_y))
    map_item.attemptResize(QgsLayoutSize(map_width, map_height))
    map_item.setExtent(extent)
    map_item.setCrs(crs)

    render_order = (
        list(reversed(point_layers))
        + list(reversed(mile_layers))
        + list(reversed(line_layers))
        + [basemap]
    )
    map_item.setLayers(render_order)
    layout.addLayoutItem(map_item)


def _export_layout(layout: QgsLayout, output_path: str) -> None:
    """Export a print layout to PDF."""
    exporter = QgsLayoutExporter(layout)
    settings = QgsLayoutExporter.PdfExportSettings()
    settings.dpi = EXPORT_DPI
    result = exporter.exportToPdf(output_path, settings)
    if result != QgsLayoutExporter.ExportResult.Success:
        raise RuntimeError(f"PDF export failed with code {result}")


def render_pdf(
    output_path: str,
    title: str,
    date_str: str,
    basemap: QgsMapLayer,
    line_layers: list[QgsVectorLayer],
    point_layers: list[QgsVectorLayer],
    mile_layers: list[QgsVectorLayer],
) -> None:
    """Create a print layout and export to PDF."""
    project, crs = _setup_project(basemap, line_layers, point_layers, mile_layers)

    margin = 12.7
    header_height = 15.0

    layout = QgsLayout(project)
    layout.initializeDefaults()

    page = layout.pageCollection().page(0)
    page.setPageSize("Letter", QgsLayoutItemPage.Portrait)
    page_width = page.pageSize().width()
    page_height = page.pageSize().height()

    _add_header_labels(layout, title, date_str, page_width, margin)

    map_x = margin
    map_y = margin + header_height
    map_w = page_width - 2 * margin
    map_h = page_height - map_y - margin

    extent = _compute_extent(line_layers, point_layers, crs, project, map_w, map_h)
    _add_map_item(
        layout,
        extent,
        crs,
        basemap,
        line_layers,
        point_layers,
        mile_layers,
        map_x,
        map_y,
        map_w,
        map_h,
    )

    _export_layout(layout, output_path)


class Args:
    lines: list[str]
    points: list[str]
    title: str | None
    date: str | None
    output: str | None
    style: str
    list_styles: bool


def main() -> None:
    parser = argparse.ArgumentParser(description="Render a race map to PDF using QGIS")
    parser.add_argument(
        "--lines",
        action="append",
        default=[],
        help="GPX file to load as lines (tracks); can be specified multiple times",
    )
    parser.add_argument(
        "--points",
        action="append",
        default=[],
        help="GPX file to load as points (waypoints); can be specified multiple times",
    )
    parser.add_argument("--title", help="Race title")
    parser.add_argument("--date", help="Formatted date string")
    parser.add_argument("--output", "-o", help="Output PDF path")
    parser.add_argument(
        "--style",
        default="dataviz",
        metavar="STYLE_ID",
        help="MapTiler style ID (default: outdoor-v2)",
    )
    parser.add_argument(
        "--list-styles",
        action="store_true",
        help="Print available MapTiler style IDs and exit",
    )
    args = parser.parse_args(namespace=Args)

    if args.list_styles:
        for style in MAPTILER_STYLES:
            print(style)
        return

    missing = [
        name
        for name, val in [
            ("--title", args.title),
            ("--date", args.date),
            ("--output", args.output),
        ]
        if val is None
    ]
    if missing:
        parser.error(f"the following arguments are required: {', '.join(missing)}")

    if not args.lines and not args.points:
        parser.error("At least one --lines or --points file is required")

    # Initialize QGIS in headless mode
    os.environ["QT_QPA_PLATFORM"] = "offscreen"
    app = QgsApplication([], False)
    app.initQgis()

    try:
        basemap = create_basemap(args.style)

        line_layers = []
        for gpx_path in args.lines:
            name = Path(gpx_path).stem
            line_layers.append(load_line_layer(gpx_path, name))

        mile_layers = []
        for line_layer in line_layers:
            mile_layers.append(generate_mile_markers(line_layer))

        point_layers = []
        for gpx_path in args.points:
            name = Path(gpx_path).stem
            point_layers.extend(load_point_layers(gpx_path, name))

        render_pdf(
            args.output,
            args.title,
            args.date,
            basemap,
            line_layers,
            point_layers,
            mile_layers,
        )
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        app.exitQgis()


if __name__ == "__main__":
    main()
