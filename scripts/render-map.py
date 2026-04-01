#!/usr/bin/env python3
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
from pathlib import Path

import pikepdf
from qgis.core import (
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

# --- Style constants ---
LINE_COLOR = "0,102,204,220"
LINE_WIDTH = "0.8"

START_COLOR = "34,170,34,255"
FINISH_COLOR = "204,0,0,255"
CHECKPOINT_COLOR = "238,136,0,255"
MARKER_OUTLINE_COLOR = "255,255,255,255"
MARKER_OUTLINE_WIDTH = "0.4"
MARKER_SIZE = "3.5"

LABEL_FONT_FAMILY = "Arial"
LABEL_FONT_SIZE = 9
LABEL_BUFFER_SIZE = 1.5
LABEL_BUFFER_OPACITY = 0.9
LABEL_DISTANCE = 3.0

EXTENT_PADDING = 0.05
EXPORT_DPI = 150


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
        raise RuntimeError("Failed to create basemap layer")
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
    if project is None:
        raise RuntimeError("failed to create QGIS project")

    crs = QgsCoordinateReferenceSystem("EPSG:3857")
    project.setCrs(crs)

    all_layers = [basemap] + line_layers + point_layers
    for layer in all_layers:
        project.addMapLayer(layer)

    margin = 12.7
    header_height = 15.0

    layout = QgsLayout(project)
    layout.initializeDefaults()

    page = layout.pageCollection().page(0)
    page.setPageSize("Letter", QgsLayoutItemPage.Portrait)
    page_width = page.pageSize().width()
    page_height = page.pageSize().height()

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

    extent.grow(max(extent.width(), extent.height()) * EXTENT_PADDING)

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
    settings.dpi = EXPORT_DPI
    result = exporter.exportToPdf(output_path, settings)
    if result != QgsLayoutExporter.ExportResult.Success:
        raise RuntimeError(f"PDF export failed with code {result}")

    # Strip timestamps and metadata for deterministic output
    with pikepdf.open(output_path, allow_overwriting_input=True) as pdf:
        for key in list(pdf.docinfo.keys()):
            del pdf.docinfo[key]
        if "/Metadata" in pdf.Root:
            del pdf.Root["/Metadata"]
        pdf.save(output_path, deterministic_id=True)


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
        for gpx_path in args.lines:
            name = Path(gpx_path).stem
            line_layers.append(load_line_layer(gpx_path, name))

        point_layers = []
        for gpx_path in args.points:
            name = Path(gpx_path).stem
            point_layers.extend(load_point_layers(gpx_path, name))

        render_pdf(
            args.output, args.title, args.date, basemap, line_layers, point_layers
        )
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        app.exitQgis()


if __name__ == "__main__":
    main()
