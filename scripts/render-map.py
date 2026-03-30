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
import os
import sys

from qgis.core import (
    Qgis,
    QgsApplication,
    QgsCoordinateReferenceSystem,
    QgsCoordinateTransform,
    QgsLabelObstacleSettings,
    QgsLayout,
    QgsLayoutExporter,
    QgsLayoutItemLabel,
    QgsLayoutItemMap,
    QgsLayoutItemPage,
    QgsLayoutPoint,
    QgsLayoutSize,
    QgsLineSymbol,
    QgsMarkerSymbol,
    QgsPalLayerSettings,
    QgsProject,
    QgsRasterLayer,
    QgsRectangle,
    QgsSingleSymbolRenderer,
    QgsTextBufferSettings,
    QgsTextFormat,
    QgsVectorLayer,
    QgsVectorLayerSimpleLabeling,
)
from qgis.PyQt.QtCore import Qt
from qgis.PyQt.QtGui import QColor, QFont


def create_basemap() -> QgsRasterLayer:
    """Create an XYZ tile layer for OpenStreetMap."""
    uri = (
        "type=xyz&"
        "url=https://tile.openstreetmap.org/%7Bz%7D/%7Bx%7D/%7By%7D.png&"
        "referer=https://caara.net/&"
        "zmin=0&zmax=19"
    )
    layer = QgsRasterLayer(uri, "Basemap", "wms")
    if not layer.isValid():
        print("ERROR: Failed to create basemap layer", file=sys.stderr)
        sys.exit(1)
    return layer


def load_line_layer(gpx_path: str, name: str) -> QgsVectorLayer:
    """Load a GPX file as a line layer (tracks)."""
    uri = f"{gpx_path}|layername=tracks"
    layer = QgsVectorLayer(uri, name, "ogr")
    if not layer.isValid():
        print(f"ERROR: Failed to load tracks from: {gpx_path}", file=sys.stderr)
        sys.exit(1)

    symbol = QgsLineSymbol.createSimple(
        {
            "color": "0,102,204,220",
            "width": "0.8",
            "capstyle": "round",
            "joinstyle": "round",
        }
    )
    layer.setRenderer(QgsSingleSymbolRenderer(symbol))

    # Mark as obstacle for label placement
    obstacle_settings = QgsLabelObstacleSettings()
    obstacle_settings.setIsObstacle(True)
    obstacle_settings.setFactor(1.0)

    pal = QgsPalLayerSettings()
    pal.setObstacleSettings(obstacle_settings)
    pal.drawLabels = False

    layer.setLabeling(QgsVectorLayerSimpleLabeling(pal))
    layer.setLabelsEnabled(True)

    return layer


def load_point_layer(gpx_path: str, name: str) -> list[QgsVectorLayer]:
    """Load a GPX file as point layers (waypoints), split into start, finish, and checkpoints."""
    uri = f"{gpx_path}|layername=waypoints"

    start_layer = QgsVectorLayer(uri, f"{name} - Start", "ogr")
    start_layer.setSubsetString("\"name\" = 'START'")
    if not start_layer.isValid():
        print(f"ERROR: Failed to load waypoints from: {gpx_path}", file=sys.stderr)
        sys.exit(1)

    finish_layer = QgsVectorLayer(uri, f"{name} - Finish", "ogr")
    finish_layer.setSubsetString("\"name\" = 'FINISH'")
    if not finish_layer.isValid():
        print(f"ERROR: Failed to load waypoints from: {gpx_path}", file=sys.stderr)
        sys.exit(1)

    cp_layer = QgsVectorLayer(uri, f"{name} - Checkpoints", "ogr")
    cp_layer.setSubsetString("\"name\" NOT IN ('START', 'FINISH')")
    if not cp_layer.isValid():
        print(f"ERROR: Failed to load waypoints from: {gpx_path}", file=sys.stderr)
        sys.exit(1)

    # Green square for start
    start_symbol = QgsMarkerSymbol.createSimple(
        {
            "name": "square",
            "color": "34,170,34,255",
            "outline_color": "255,255,255,255",
            "outline_width": "0.4",
            "size": "3.5",
        }
    )
    start_layer.setRenderer(QgsSingleSymbolRenderer(start_symbol))

    # Red square for finish
    finish_symbol = QgsMarkerSymbol.createSimple(
        {
            "name": "square",
            "color": "204,0,0,255",
            "outline_color": "255,255,255,255",
            "outline_width": "0.4",
            "size": "3.5",
        }
    )
    finish_layer.setRenderer(QgsSingleSymbolRenderer(finish_symbol))

    # Orange circle for checkpoints
    cp_symbol = QgsMarkerSymbol.createSimple(
        {
            "name": "circle",
            "color": "238,136,0,255",
            "outline_color": "255,255,255,255",
            "outline_width": "0.4",
            "size": "3.5",
        }
    )
    cp_layer.setRenderer(QgsSingleSymbolRenderer(cp_symbol))

    # Configure labels for all
    for layer in (start_layer, finish_layer, cp_layer):
        text_format = QgsTextFormat()
        text_format.setFont(QFont("Arial", 9))
        text_format.setSize(9)
        text_format.setColor(QColor(0, 0, 0))

        buffer_settings = QgsTextBufferSettings()
        buffer_settings.setEnabled(True)
        buffer_settings.setSize(1.5)
        buffer_settings.setColor(QColor(255, 255, 255))
        buffer_settings.setOpacity(0.9)
        text_format.setBuffer(buffer_settings)

        label_settings = QgsPalLayerSettings()
        label_settings.fieldName = "name"
        label_settings.setFormat(text_format)
        label_settings.placement = QgsPalLayerSettings.Placement.AroundPoint
        label_settings.dist = 3.0

        labeling = QgsVectorLayerSimpleLabeling(label_settings)
        layer.setLabeling(labeling)
        layer.setLabelsEnabled(True)

    return [start_layer, finish_layer, cp_layer]


def render_pdf(
    output_path: str,
    title: str,
    date_str: str,
    basemap: QgsRasterLayer,
    line_layers: list[QgsVectorLayer],
    point_layers: list[QgsVectorLayer],
) -> None:
    """Create a print layout and export to PDF."""
    project = QgsProject.instance()
    crs = QgsCoordinateReferenceSystem("EPSG:3857")
    project.setCrs(crs)

    all_layers = [basemap] + line_layers + point_layers
    for layer in all_layers:
        project.addMapLayer(layer)

    # Letter size in mm: 215.9 x 279.4
    page_width = 215.9
    page_height = 279.4
    margin = 12.7
    header_height = 15.0

    layout = QgsLayout(project)
    layout.initializeDefaults()

    # Set page size to US Letter portrait
    page = layout.pageCollection().page(0)
    page.setPageSize(QgsLayoutSize(page_width, page_height))

    # Header font (shared by title and date)
    header_fmt = QgsTextFormat()
    header_fmt.setFont(QFont("Helvetica"))
    header_fmt.setSize(14)

    # Title label (left-justified)
    title_label = QgsLayoutItemLabel(layout)
    title_label.setText(title)
    title_label.setTextFormat(header_fmt)
    title_label.setHAlign(Qt.AlignmentFlag.AlignLeft)
    title_label.attemptMove(QgsLayoutPoint(margin, margin))
    title_label.attemptResize(QgsLayoutSize(page_width - 2 * margin, 10))
    layout.addLayoutItem(title_label)

    # Date label (right-justified, same line)
    date_label = QgsLayoutItemLabel(layout)
    date_label.setText(date_str)
    date_label.setTextFormat(header_fmt)
    date_label.setHAlign(Qt.AlignmentFlag.AlignRight)
    date_label.attemptMove(QgsLayoutPoint(margin, margin))
    date_label.attemptResize(QgsLayoutSize(page_width - 2 * margin, 10))
    layout.addLayoutItem(date_label)

    # Map item
    map_item = QgsLayoutItemMap(layout)
    map_x = margin
    map_y = margin + header_height
    map_w = page_width - 2 * margin
    map_h = page_height - map_y - margin
    map_item.attemptMove(QgsLayoutPoint(map_x, map_y))
    map_item.attemptResize(QgsLayoutSize(map_w, map_h))

    # Compute extent from all vector layers
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
        transform = QgsCoordinateTransform(source_crs, crs, project)
        extent = transform.transformBoundingBox(extent)

    extent.grow(max(extent.width(), extent.height()) * 0.05)

    # Expand extent to match the map item's aspect ratio so the map fills the page
    map_aspect = map_w / map_h
    extent_aspect = extent.width() / extent.height() if extent.height() > 0 else 1.0
    if extent_aspect > map_aspect:
        # Extent is wider than map area — expand height
        new_height = extent.width() / map_aspect
        center_y = extent.center().y()
        extent.setYMinimum(center_y - new_height / 2)
        extent.setYMaximum(center_y + new_height / 2)
    else:
        # Extent is taller than map area — expand width
        new_width = extent.height() * map_aspect
        center_x = extent.center().x()
        extent.setXMinimum(center_x - new_width / 2)
        extent.setXMaximum(center_x + new_width / 2)

    map_item.setExtent(extent)
    map_item.setCrs(crs)

    # Layer order: points on top, then lines, then basemap
    render_order = (
        list(reversed(point_layers)) + list(reversed(line_layers)) + [basemap]
    )
    map_item.setLayers(render_order)
    layout.addLayoutItem(map_item)

    # Export to PDF
    exporter = QgsLayoutExporter(layout)
    settings = QgsLayoutExporter.PdfExportSettings()
    settings.dpi = 150
    result = exporter.exportToPdf(output_path, settings)
    if result != QgsLayoutExporter.ExportResult.Success:
        print(f"ERROR: PDF export failed with code {result}", file=sys.stderr)
        sys.exit(1)


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
    parser.add_argument("--title", required=True, help="Race title")
    parser.add_argument("--date", required=True, help="Formatted date string")
    parser.add_argument("--output", "-o", required=True, help="Output PDF path")
    args = parser.parse_args()

    if not args.lines and not args.points:
        parser.error("At least one --lines or --points file is required")

    # Initialize QGIS in headless mode
    os.environ["QT_QPA_PLATFORM"] = "offscreen"
    app = QgsApplication([], False)
    app.initQgis()

    try:
        basemap = create_basemap()

        line_layers = []
        for i, gpx_path in enumerate(args.lines):
            line_layers.append(load_line_layer(gpx_path, f"Lines {i + 1}"))

        point_layers = []
        for i, gpx_path in enumerate(args.points):
            point_layers.extend(load_point_layer(gpx_path, f"Points {i + 1}"))

        render_pdf(
            args.output, args.title, args.date, basemap, line_layers, point_layers
        )
    finally:
        app.exitQgis()


if __name__ == "__main__":
    main()
