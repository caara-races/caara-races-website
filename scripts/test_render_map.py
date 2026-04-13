"""Tests for GL style pre-processing helpers in render-map.py."""

import importlib.util
from pathlib import Path

# The filename contains a hyphen, so use importlib to load it as a module.
_SCRIPT = Path(__file__).with_name("render-map.py")
_spec = importlib.util.spec_from_file_location("render_map", _SCRIPT)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

_simplify_gl_text_field = _mod._simplify_gl_text_field
_extract_numeric_default = _mod._extract_numeric_default
_simplify_gl_text_size = _mod._simplify_gl_text_size
_simplify_gl_style = _mod._simplify_gl_style
_utm_epsg_code = _mod._utm_epsg_code


# --- _utm_epsg_code ---


class TestUtmEpsgCode:
    def test_cape_ann(self):
        assert _utm_epsg_code(-70.6, 42.6) == 32619

    def test_los_angeles(self):
        assert _utm_epsg_code(-118.2, 34.0) == 32611

    def test_london(self):
        assert _utm_epsg_code(-0.1, 51.5) == 32630

    def test_southern_hemisphere(self):
        assert _utm_epsg_code(151.2, -33.9) == 32756

    def test_zone_boundary(self):
        assert _utm_epsg_code(-180.0, 45.0) == 32601


# --- _simplify_gl_text_field ---


class TestSimplifyGlTextField:
    def test_string_passthrough(self):
        assert _simplify_gl_text_field("{name}") == "{name}"

    def test_non_list_passthrough(self):
        assert _simplify_gl_text_field(42) == 42

    def test_empty_list_passthrough(self):
        assert _simplify_gl_text_field([]) == []

    def test_coalesce_uses_last_field(self):
        expr = ["coalesce", ["get", "name:en"], ["get", "name"]]
        assert _simplify_gl_text_field(expr) == "{name}"

    def test_coalesce_single_get(self):
        expr = ["coalesce", ["get", "name:latin"]]
        assert _simplify_gl_text_field(expr) == "{name:latin}"

    def test_coalesce_three_fields(self):
        expr = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]
        assert _simplify_gl_text_field(expr) == "{name}"

    def test_concat_simple(self):
        expr = ["concat", ["get", "ref"], " ", ["get", "name"]]
        assert _simplify_gl_text_field(expr) == "{ref} {name}"

    def test_concat_with_complex_arg_returns_original(self):
        expr = ["concat", ["get", "ref"], ["case", True, "x", "y"]]
        assert _simplify_gl_text_field(expr) == expr

    def test_unknown_op_passthrough(self):
        expr = ["step", ["zoom"], "a", 5, "b"]
        assert _simplify_gl_text_field(expr) == expr


# --- _extract_numeric_default ---


class TestExtractNumericDefault:
    def test_plain_number(self):
        assert _extract_numeric_default(10) == 10

    def test_float(self):
        assert _extract_numeric_default(3.5) == 3.5

    def test_case_expr(self):
        expr = ["case", ["<=", ["get", "rank"], 12], 11, 10]
        assert _extract_numeric_default(expr) == 10

    def test_match_expr(self):
        expr = ["match", ["get", "class"], ["ocean"], 14, 10]
        assert _extract_numeric_default(expr) == 10

    def test_nested_case_in_match(self):
        expr = ["match", ["get", "class"], "x", 5, ["case", True, 3, 7]]
        assert _extract_numeric_default(expr) == 7

    def test_non_numeric_returns_none(self):
        assert _extract_numeric_default("foo") is None

    def test_unknown_list_returns_none(self):
        assert _extract_numeric_default(["get", "x"]) is None


# --- _simplify_gl_text_size ---


class TestSimplifyGlTextSize:
    def test_plain_number_passthrough(self):
        assert _simplify_gl_text_size(14) == 14

    def test_stops_dict_passthrough(self):
        val = {"stops": [[10, 13], [14, 16]]}
        assert _simplify_gl_text_size(val) == val

    def test_simple_interpolate_passthrough(self):
        val = ["interpolate", ["linear", 1], ["zoom"], 3, 11, 8, 13]
        result = _simplify_gl_text_size(val)
        assert result == {"stops": [[3, 11], [8, 13]]}

    def test_interpolate_with_case_extracts_defaults(self):
        val = [
            "interpolate",
            ["linear", 1],
            ["zoom"],
            6,
            ["case", ["<=", ["get", "rank"], 12], 11, 10],
            9,
            ["case", ["<=", ["get", "rank"], 15], 13, 12],
            16,
            ["case", ["<=", ["get", "rank"], 15], 22, 20],
        ]
        result = _simplify_gl_text_size(val)
        assert result == {"stops": [[6, 10], [9, 12], [16, 20]]}

    def test_interpolate_with_match_extracts_defaults(self):
        val = [
            "interpolate",
            ["linear", 1],
            ["zoom"],
            1,
            ["match", ["get", "class"], ["ocean"], 14, 10],
            3,
            ["match", ["get", "class"], ["ocean"], 18, 14],
        ]
        result = _simplify_gl_text_size(val)
        assert result == {"stops": [[1, 10], [3, 14]]}

    def test_non_interpolate_list_passthrough(self):
        val = ["step", ["zoom"], 10, 5, 14]
        assert _simplify_gl_text_size(val) == val


# --- _simplify_gl_style ---


class TestSimplifyGlStyle:
    def test_modifies_text_field_and_text_size(self):
        style = {
            "layers": [
                {
                    "id": "road-labels",
                    "source-layer": "transportation_name",
                    "layout": {
                        "text-field": [
                            "coalesce",
                            ["get", "name:en"],
                            ["get", "name"],
                        ],
                        "text-size": [
                            "interpolate",
                            ["linear", 1],
                            ["zoom"],
                            6,
                            ["case", ["<=", ["get", "rank"], 2], 14, 12],
                            16,
                            ["case", ["<=", ["get", "rank"], 2], 32, 26],
                        ],
                    },
                }
            ]
        }
        _simplify_gl_style(style)
        layout = style["layers"][0]["layout"]
        assert layout["text-field"] == "{name}"
        assert layout["text-size"] == {"stops": [[6, 12], [16, 26]]}

    def test_leaves_simple_values_alone(self):
        style = {
            "layers": [
                {
                    "id": "simple",
                    "layout": {
                        "text-field": "{ref}",
                        "text-size": 10,
                    },
                }
            ]
        }
        _simplify_gl_style(style)
        layout = style["layers"][0]["layout"]
        assert layout["text-field"] == "{ref}"
        assert layout["text-size"] == 10

    def test_removes_poi_labels(self):
        style = {
            "layers": [
                {
                    "id": "food",
                    "source-layer": "poi",
                    "layout": {"text-field": "{name}", "text-size": 10},
                },
                {
                    "id": "road-labels",
                    "source-layer": "transportation_name",
                    "layout": {"text-field": "{name}", "text-size": 10},
                },
            ]
        }
        _simplify_gl_style(style)
        assert "text-field" not in style["layers"][0]["layout"]
        assert style["layers"][1]["layout"]["text-field"] == "{name}"

    def test_removes_housenumber_labels(self):
        style = {
            "layers": [
                {
                    "id": "housenumber",
                    "source-layer": "housenumber",
                    "layout": {"text-field": "{housenumber}"},
                }
            ]
        }
        _simplify_gl_style(style)
        assert "text-field" not in style["layers"][0]["layout"]

    def test_layers_without_layout(self):
        style = {"layers": [{"id": "fill", "type": "fill"}]}
        _simplify_gl_style(style)  # should not raise
